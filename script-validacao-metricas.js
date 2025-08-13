/**
 * SCRIPT DE VALIDAÇÃO DE MÉTRICAS
 * Compara métricas calculadas diretamente no BD vs APIs do dashboard
 * Tolerância: ±5% para detectar divergências
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config();

// Configuração do Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Configuração da API
const API_BASE = 'http://localhost:3000';
const TOLERANCIA_PERCENTUAL = 5; // ±5%

/**
 * CÁLCULOS DIRETOS NO BANCO
 */
async function calcularMetricasDireto(periodDays = 30) {
    console.log(`🔍 Calculando métricas direto do BD (${periodDays} dias)...`);
    
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - periodDays);
    const dataInicioStr = dataInicio.toISOString().split('T')[0];
    
    try {
        // 1. TOTAL DE TENANTS ATIVOS
        const { data: tenantsAtivos, error: tenantsError } = await supabase
            .from('tenants')
            .select('id')
            .eq('status', 'active');
            
        if (tenantsError) throw tenantsError;
        
        // 2. TOTAL DE APPOINTMENTS (período)
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('id, status, created_at')
            .gte('created_at', dataInicioStr);
            
        if (appointmentsError) throw appointmentsError;
        
        // 3. TOTAL DE CONVERSAS (período)
        const { data: conversas, error: conversasError } = await supabase
            .from('conversation_history')
            .select('id, confidence_score, created_at')
            .gte('created_at', dataInicioStr);
            
        if (conversasError) throw conversasError;
        
        // 4. TOTAL DE AI INTERACTIONS (período) - corrigido para filtrar nulls
        const { data: aiInteractions, error: aiError } = await supabase
            .from('conversation_history')
            .select('id, confidence_score')
            .gte('created_at', dataInicioStr)
            .not('confidence_score', 'is', null)
            .gte('confidence_score', 0.7); // Considerando apenas interações válidas
            
        if (aiError) throw aiError;
        
        // 5. CALCULAR REVENUES (simulado - sem tabela real de revenue)
        // Assumindo R$ 100 de receita média por tenant ativo
        const totalRevenue = tenantsAtivos.length * 100;
        
        // 6. CALCULAR CHAT MINUTES (simulado - sem dados reais)
        // Assumindo 5 minutos médios por conversa
        const totalChatMinutes = conversas.length * 5;
        
        // 7. CALCULAR SPAM RATE - corrigido para tratar nulls
        const conversasValidas = conversas.filter(c => c.confidence_score !== null && c.confidence_score >= 0.7).length;
        const conversasSpam = conversas.filter(c => c.confidence_score !== null && c.confidence_score < 0.7).length;
        const conversasComScore = conversasValidas + conversasSpam;
        const spamRate = conversasComScore > 0 ? (conversasSpam / conversasComScore) * 100 : 0;
        
        // 8. CALCULAR OPERATIONAL EFFICIENCY
        const operationalEfficiency = conversas.length > 0 ? (appointments.length / conversas.length) * 100 : 0;
        
        // 9. CALCULAR CANCELLATION RATE - corrigido status
        const appointmentsCancelados = appointments.filter(a => a.status === 'cancelled').length;
        const appointmentsNoShow = appointments.filter(a => a.status === 'no_show').length;
        // Não existe 'rescheduled' no BD, usando 'no_show' como equivalente
        const cancellationRate = appointments.length > 0 ? 
            ((appointmentsCancelados + appointmentsNoShow) / appointments.length) * 100 : 0;
        
        // 10. CALCULAR MRR (Monthly Recurring Revenue)
        const mrr = totalRevenue; // Simplificado
        
        // 11. CALCULAR RECEITA/USO RATIO
        const receitaUsoRatio = totalChatMinutes > 0 ? totalRevenue / totalChatMinutes : 0;
        
        const metricas = {
            activeTenants: tenantsAtivos.length,
            totalAppointments: appointments.length,
            totalConversations: conversas.length,
            aiInteractions: aiInteractions.length,
            totalRevenue: totalRevenue,
            totalChatMinutes: totalChatMinutes,
            spamRate: spamRate,
            operationalEfficiency: operationalEfficiency,
            cancellationRate: cancellationRate,
            mrrPlatform: mrr,
            receitaUsoRatio: receitaUsoRatio
        };
        
        console.log('✅ Métricas calculadas direto do BD:', metricas);
        return metricas;
        
    } catch (error) {
        console.error('❌ Erro ao calcular métricas direto:', error);
        throw error;
    }
}

/**
 * BUSCAR MÉTRICAS DA API
 */
async function buscarMetricasAPI(periodDays = 30) {
    console.log(`🌐 Buscando métricas da API (${periodDays} dias)...`);
    
    try {
        const response = await fetch(`${API_BASE}/api/super-admin/kpis?period=${periodDays}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API retornou ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.success || !result.data || !result.data.kpis) {
            throw new Error('Estrutura de resposta da API inválida');
        }
        
        const kpis = result.data.kpis;
        
        // Extrair valores numéricos dos KPIs
        const metricas = {
            activeTenants: parseFloat(kpis.activeTenants.value) || 0,
            totalAppointments: parseFloat(kpis.totalAppointments.value) || 0,
            aiInteractions: parseFloat(kpis.aiInteractions.value) || 0,
            spamRate: parseFloat(kpis.spamRate.value) || 0,
            operationalEfficiency: parseFloat(kpis.operationalEfficiency.value) || 0,
            cancellationRate: parseFloat(kpis.cancellationRate.value) || 0,
            mrrPlatform: parseFloat(kpis.mrrPlatform.value) || 0,
            receitaUsoRatio: parseFloat(kpis.receitaUsoRatio.value) || 0
        };
        
        console.log('✅ Métricas obtidas da API:', metricas);
        return metricas;
        
    } catch (error) {
        console.error('❌ Erro ao buscar métricas da API:', error);
        throw error;
    }
}

/**
 * COMPARAR MÉTRICAS COM TOLERÂNCIA
 */
function compararMetricas(metricasBD, metricasAPI) {
    console.log(`📊 Comparando métricas com tolerância de ±${TOLERANCIA_PERCENTUAL}%...`);
    
    const comparacao = [];
    const metricasComuns = Object.keys(metricasBD).filter(key => 
        metricasAPI.hasOwnProperty(key)
    );
    
    for (const metrica of metricasComuns) {
        const valorBD = metricasBD[metrica];
        const valorAPI = metricasAPI[metrica];
        
        // Calcular diferença percentual
        let diferencaPercentual = 0;
        if (valorBD !== 0) {
            diferencaPercentual = Math.abs((valorAPI - valorBD) / valorBD) * 100;
        } else if (valorAPI !== 0) {
            diferencaPercentual = 100; // Se BD é 0 mas API não é
        }
        
        const dentroTolerancia = diferencaPercentual <= TOLERANCIA_PERCENTUAL;
        
        const resultado = {
            metrica,
            valorBD,
            valorAPI,
            diferenca: valorAPI - valorBD,
            diferencaPercentual: diferencaPercentual.toFixed(2),
            dentroTolerancia,
            status: dentroTolerancia ? '✅ OK' : '❌ DIVERGÊNCIA'
        };
        
        comparacao.push(resultado);
        
        if (!dentroTolerancia) {
            console.log(`⚠️ DIVERGÊNCIA em ${metrica}:`);
            console.log(`   BD: ${valorBD} | API: ${valorAPI} | Diff: ${diferencaPercentual.toFixed(2)}%`);
        }
    }
    
    return comparacao;
}

/**
 * GERAR RELATÓRIO DE VALIDAÇÃO
 */
function gerarRelatorio(comparacao, periodDays) {
    console.log(`\n📋 ===== RELATÓRIO DE VALIDAÇÃO DE MÉTRICAS =====`);
    console.log(`🕐 Data/Hora: ${new Date().toLocaleString('pt-BR')}`);
    console.log(`📅 Período: ${periodDays} dias`);
    console.log(`🎯 Tolerância: ±${TOLERANCIA_PERCENTUAL}%`);
    console.log(`📊 Métricas analisadas: ${comparacao.length}`);
    
    const divergencias = comparacao.filter(c => !c.dentroTolerancia);
    const conformidade = comparacao.filter(c => c.dentroTolerancia);
    
    console.log(`✅ Conformes: ${conformidade.length}`);
    console.log(`❌ Divergências: ${divergencias.length}`);
    console.log(`📈 Taxa de conformidade: ${((conformidade.length / comparacao.length) * 100).toFixed(1)}%`);
    
    console.log(`\n📊 ===== DETALHAMENTO POR MÉTRICA =====`);
    console.log('MÉTRICA'.padEnd(25) + 'BD'.padStart(12) + 'API'.padStart(12) + 'DIFF%'.padStart(8) + 'STATUS'.padStart(12));
    console.log('-'.repeat(70));
    
    for (const comp of comparacao) {
        const metrica = comp.metrica.padEnd(25);
        const bd = comp.valorBD.toString().padStart(12);
        const api = comp.valorAPI.toString().padStart(12);
        const diff = `${comp.diferencaPercentual}%`.padStart(8);
        const status = comp.status.padStart(12);
        
        console.log(`${metrica}${bd}${api}${diff}${status}`);
    }
    
    if (divergencias.length > 0) {
        console.log(`\n⚠️ ===== DIVERGÊNCIAS CRÍTICAS =====`);
        for (const div of divergencias) {
            console.log(`❌ ${div.metrica}:`);
            console.log(`   Banco: ${div.valorBD}`);
            console.log(`   API: ${div.valorAPI}`);
            console.log(`   Diferença: ${div.diferenca} (${div.diferencaPercentual}%)`);
            console.log(`   Ação: Investigar lógica de cálculo\n`);
        }
    }
    
    console.log(`\n🎯 ===== RECOMENDAÇÕES =====`);
    if (divergencias.length === 0) {
        console.log(`✅ Todas as métricas estão dentro da tolerância`);
        console.log(`✅ Dashboard apresenta dados consistentes com o BD`);
        console.log(`✅ Nenhuma ação corretiva necessária`);
    } else {
        console.log(`❌ ${divergencias.length} métricas com divergências detectadas`);
        console.log(`🔍 Verificar lógica de cálculo nos endpoints da API`);
        console.log(`🔍 Comparar queries do BD com função calculate_enhanced_platform_metrics`);
        console.log(`🔍 Revisar mapeamento de dados no frontend`);
    }
    
    console.log(`\n================================================`);
    
    return {
        totalMetricas: comparacao.length,
        conformes: conformidade.length,
        divergencias: divergencias.length,
        taxaConformidade: (conformidade.length / comparacao.length) * 100,
        detalhes: comparacao
    };
}

/**
 * EXECUTAR VALIDAÇÃO COMPLETA
 */
async function executarValidacao(periodDays = 30) {
    console.log(`🚀 Iniciando validação de métricas...`);
    
    try {
        // 1. Calcular métricas direto do BD
        const metricasBD = await calcularMetricasDireto(periodDays);
        
        // 2. Buscar métricas da API
        const metricasAPI = await buscarMetricasAPI(periodDays);
        
        // 3. Comparar com tolerância
        const comparacao = compararMetricas(metricasBD, metricasAPI);
        
        // 4. Gerar relatório
        const relatorio = gerarRelatorio(comparacao, periodDays);
        
        return relatorio;
        
    } catch (error) {
        console.error('❌ Erro na validação:', error);
        throw error;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const period = process.argv[2] ? parseInt(process.argv[2]) : 30;
    
    executarValidacao(period)
        .then(relatorio => {
            process.exit(relatorio.divergencias > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('💥 Falha na validação:', error);
            process.exit(1);
        });
}

module.exports = {
    executarValidacao,
    calcularMetricasDireto,
    buscarMetricasAPI,
    compararMetricas
};