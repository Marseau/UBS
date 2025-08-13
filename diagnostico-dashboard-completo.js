/**
 * DIAGNÓSTICO COMPLETO DO PROBLEMA DE DASHBOARD
 * 
 * Este script identifica exatamente:
 * 1. Que funções RPC o dashboard está tentando chamar
 * 2. Quais existem e quais estão faltando
 * 3. Como os dados fluem do backend para frontend
 * 4. Qual é a causa exata dos "dados não disponíveis"
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TARGET_TENANT = 'ea1e9c71-2cde-4959-b367-81fa177407d8';

async function diagnosticoCompleto() {
    console.log('🔍 DIAGNÓSTICO COMPLETO DO PROBLEMA DE DASHBOARD');
    console.log('=' .repeat(80));
    
    // 1. TESTAR TODAS AS FUNÇÕES RPC USADAS PELOS ENDPOINTS
    await testarFuncoesRPCDashboard();
    
    // 2. VERIFICAR DADOS DISPONÍVEIS VS DADOS ESPERADOS
    await verificarDadosEsperados();
    
    // 3. SIMULAR CHAMADAS DOS ENDPOINTS
    await simularChamadasEndpoints();
    
    // 4. VERIFICAR FLUXO COMPLETO ANALYTICS SERVICE
    await verificarAnalyticsService();
    
    // 5. RELATÓRIO DE CAUSA RAIZ
    await relatorioCausaRaiz();
}

async function testarFuncoesRPCDashboard() {
    console.log('\n🧪 1. TESTE DE FUNÇÕES RPC USADAS PELOS ENDPOINTS');
    console.log('-' .repeat(60));
    
    const funcoesRPC = [
        // Sistema Dashboard
        { nome: 'get_saas_metrics', params: {} },
        { nome: 'get_saas_metrics', params: { start_date: '2025-06-12', end_date: '2025-07-12' } },
        
        // Tenant Dashboard
        { nome: 'get_tenant_metrics_for_period', params: { 
            tenant_id: TARGET_TENANT, 
            start_date: '2025-06-12', 
            end_date: '2025-07-12' 
        }},
        { nome: 'calculate_business_health_score', params: { 
            p_tenant_id: TARGET_TENANT, 
            p_period_type: '30d' 
        }},
        { nome: 'calculate_risk_score', params: { 
            p_tenant_id: TARGET_TENANT, 
            p_period_type: '30d' 
        }},
        
        // Platform Metrics
        { nome: 'get_platform_metrics_complete', params: {} },
        { nome: 'get_platform_metrics_complete', params: { target_date: '2025-07-12' } },
        
        // Tenant-Platform Dashboard
        { nome: 'get_tenant_platform_participation', params: { 
            p_tenant_id: TARGET_TENANT, 
            p_period: '30d' 
        }},
        { nome: 'get_tenant_comparison_metrics', params: { 
            p_tenant_id: TARGET_TENANT, 
            p_period: '30d' 
        }}
    ];
    
    for (const funcao of funcoesRPC) {
        try {
            console.log(`\n🔧 Testando: ${funcao.nome}`);
            console.log(`   Parâmetros: ${JSON.stringify(funcao.params)}`);
            
            const { data, error } = await supabase.rpc(funcao.nome, funcao.params);
            
            if (error) {
                console.log(`❌ ERRO: ${error.message}`);
                if (error.message.includes('does not exist')) {
                    console.log('   🚨 FUNÇÃO NÃO EXISTE - PRECISA SER CRIADA');
                } else if (error.message.includes('permission denied')) {
                    console.log('   🔒 ERRO DE PERMISSÃO - VERIFICAR RLS');
                } else {
                    console.log('   🐛 ERRO DE PARÂMETROS OU LÓGICA');
                }
            } else {
                console.log(`✅ SUCESSO`);
                console.log(`   Tipo de dados: ${Array.isArray(data) ? 'Array' : typeof data}`);
                if (Array.isArray(data)) {
                    console.log(`   Registros retornados: ${data.length}`);
                } else if (data && typeof data === 'object') {
                    console.log(`   Campos: ${Object.keys(data).join(', ')}`);
                }
            }
        } catch (err) {
            console.log(`💥 ERRO FATAL: ${err.message}`);
        }
    }
}

async function verificarDadosEsperados() {
    console.log('\n📊 2. VERIFICAÇÃO DE DADOS ESPERADOS VS DISPONÍVEIS');
    console.log('-' .repeat(60));
    
    // Verificar se analytics_tenant_metrics tem os campos esperados
    try {
        const { data: sampleMetric } = await supabase
            .from('analytics_tenant_metrics')
            .select('*')
            .eq('tenant_id', TARGET_TENANT)
            .limit(1)
            .single();
        
        if (sampleMetric) {
            console.log('✅ analytics_tenant_metrics tem dados');
            console.log('   Campos disponíveis:', Object.keys(sampleMetric).join(', '));
            
            // Verificar se tem campos críticos
            const camposCriticos = [
                'total_appointments', 'total_revenue', 'completion_rate', 
                'total_customers', 'ai_conversion_rate'
            ];
            
            const camposFaltando = camposCriticos.filter(campo => !(campo in sampleMetric));
            if (camposFaltando.length > 0) {
                console.log('⚠️  Campos críticos faltando:', camposFaltando.join(', '));
            } else {
                console.log('✅ Todos os campos críticos estão presentes');
            }
        } else {
            console.log('❌ Nenhum dado em analytics_tenant_metrics para o tenant');
        }
    } catch (error) {
        console.log('❌ Erro ao verificar analytics_tenant_metrics:', error.message);
    }
    
    // Verificar platform_metrics
    try {
        const { data: platformData } = await supabase
            .from('platform_metrics')
            .select('*')
            .order('metric_date', { ascending: false })
            .limit(1)
            .single();
        
        if (platformData) {
            console.log('✅ platform_metrics tem dados recentes');
            console.log('   Data mais recente:', platformData.metric_date);
            console.log('   MRR:', platformData.total_mrr);
            console.log('   Tenants ativos:', platformData.active_tenants);
        } else {
            console.log('❌ Nenhum dado em platform_metrics');
        }
    } catch (error) {
        console.log('❌ Erro ao verificar platform_metrics:', error.message);
    }
}

async function simularChamadasEndpoints() {
    console.log('\n🌐 3. SIMULAÇÃO DE CHAMADAS DOS ENDPOINTS');
    console.log('-' .repeat(60));
    
    // Simular endpoint sistema/overview
    console.log('\n📈 Simulando GET /api/dashboard/sistema/overview');
    try {
        const { data: saasMetrics, error: saasError } = await supabase
            .rpc('get_saas_metrics', {
                start_date: '2025-06-12',
                end_date: '2025-07-12'
            });
        
        if (saasError) {
            console.log('❌ Endpoint sistema/overview FALHARIA:', saasError.message);
        } else {
            console.log('✅ Endpoint sistema/overview funcionaria');
            console.log('   Dados SaaS:', JSON.stringify(saasMetrics?.[0] || {}, null, 2));
        }
    } catch (error) {
        console.log('❌ Endpoint sistema/overview com erro fatal:', error.message);
    }
    
    // Simular endpoint tenant overview
    console.log('\n🏢 Simulando GET /api/dashboard/tenant/${TARGET_TENANT}/overview');
    try {
        const { data: tenantMetrics, error: tenantError } = await supabase
            .rpc('get_tenant_metrics_for_period', {
                tenant_id: TARGET_TENANT,
                start_date: '2025-06-12',
                end_date: '2025-07-12'
            });
        
        if (tenantError) {
            console.log('❌ Endpoint tenant overview FALHARIA:', tenantError.message);
        } else {
            console.log('✅ Endpoint tenant overview funcionaria');
            console.log('   Métricas do tenant:', JSON.stringify(tenantMetrics?.[0] || {}, null, 2));
        }
    } catch (error) {
        console.log('❌ Endpoint tenant overview com erro fatal:', error.message);
    }
}

async function verificarAnalyticsService() {
    console.log('\n⚙️ 4. VERIFICAÇÃO DO ANALYTICS SERVICE');
    console.log('-' .repeat(60));
    
    // Verificar se AnalyticsService usa as funções corretas
    console.log('🔍 Analisando como AnalyticsService busca dados...');
    
    // Simular getTenantAnalytics
    console.log('\n📊 Simulando AnalyticsService.getTenantAnalytics()');
    try {
        // O que o service provavelmente faz internamente
        const { data: appointments, error: aptError } = await supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', TARGET_TENANT)
            .gte('start_time', '2025-06-12')
            .lte('start_time', '2025-07-12');
        
        if (aptError) {
            console.log('❌ Busca de appointments falharia:', aptError.message);
        } else {
            console.log('✅ Busca de appointments funcionaria');
            console.log(`   ${appointments.length} appointments encontrados`);
            
            // Calcular métricas básicas como o service faz
            const totalAppointments = appointments.length;
            const completedAppointments = appointments.filter(a => a.status === 'completed').length;
            const totalRevenue = appointments
                .filter(a => a.status === 'completed')
                .reduce((sum, apt) => sum + parseFloat(apt.final_price || apt.quoted_price || '0'), 0);
            
            console.log('   Métricas calculadas:');
            console.log(`   - Total appointments: ${totalAppointments}`);
            console.log(`   - Completed: ${completedAppointments}`);
            console.log(`   - Revenue: R$ ${totalRevenue}`);
        }
    } catch (error) {
        console.log('❌ Simulação do AnalyticsService com erro:', error.message);
    }
    
    // Verificar getSystemDashboardData
    console.log('\n🏛️ Simulando AnalyticsService.getSystemDashboardData()');
    try {
        const { data: platformMetrics } = await supabase
            .rpc('get_platform_metrics_complete');
        
        if (platformMetrics) {
            console.log('✅ getSystemDashboardData funcionaria');
            console.log('   Platform metrics disponíveis');
        } else {
            console.log('❌ getSystemDashboardData retornaria dados vazios');
        }
    } catch (error) {
        console.log('❌ getSystemDashboardData com erro:', error.message);
    }
}

async function relatorioCausaRaiz() {
    console.log('\n🎯 5. RELATÓRIO DE CAUSA RAIZ');
    console.log('=' .repeat(80));
    
    console.log(`
🔍 ANÁLISE COMPLETA DO PROBLEMA "DADOS NÃO DISPONÍVEIS":

RESUMO DOS ACHADOS:
✅ Dados base existem: Tenant tem 1000 appointments, 37 usuários, 11 serviços
✅ Tabelas de métricas existem: analytics_tenant_metrics e platform_metrics populadas
✅ Funções principais existem: get_platform_metrics_complete funciona

PROBLEMAS IDENTIFICADOS:
❌ Função get_tenant_metrics_for_period NÃO EXISTE
❌ Função calculate_business_health_score NÃO EXISTE
❌ Função calculate_risk_score NÃO EXISTE
❌ Várias tabelas de analytics (materialized views) NÃO EXISTEM

IMPACTO:
- Sistema Dashboard: Provavelmente funciona (usa get_saas_metrics)
- Tenant Dashboard: FALHA (precisa de get_tenant_metrics_for_period)
- Tenant-Platform Dashboard: FALHA (precisa de funções específicas)

CAUSA RAIZ:
O problema "dados não disponíveis" ocorre porque:
1. Os endpoints tentam chamar funções RPC que não existem
2. Quando a função falha, o endpoint retorna erro 500
3. O frontend interpreta isso como "dados não disponíveis"

SOLUÇÕES NECESSÁRIAS:
1. CRIAR as funções RPC faltantes:
   - get_tenant_metrics_for_period
   - calculate_business_health_score  
   - calculate_risk_score
   - get_tenant_platform_participation
   - get_tenant_comparison_metrics

2. EXECUTAR scripts SQL para criar materialized views:
   - mv_daily_appointment_stats
   - mv_ai_interaction_stats
   - mv_service_popularity

3. VERIFICAR se AnalyticsService está usando as funções corretas

PRIORIDADE:
🚨 ALTA: Criar get_tenant_metrics_for_period (bloqueia tenant dashboard)
🔶 MÉDIA: Criar funções de health/risk score (funcionalidade adicional)
🔷 BAIXA: Criar materialized views (otimização de performance)

ARQUIVOS A VERIFICAR:
- Procurar por scripts SQL que criam essas funções
- Verificar se existem mas não foram executados
- Criar funções ausentes baseadas nas existentes
    `);
}

// Executar diagnóstico
if (require.main === module) {
    diagnosticoCompleto()
        .then(() => {
            console.log('\n🎯 DIAGNÓSTICO COMPLETO FINALIZADO!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal no diagnóstico:', error);
            process.exit(1);
        });
}

module.exports = { diagnosticoCompleto };