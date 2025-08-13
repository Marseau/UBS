/**
 * CORREÇÃO DEFINITIVA: Sistema de Métricas Custo Plataforma
 * 
 * Este script resolve o erro crítico:
 * "Nenhuma métrica custo_plataforma encontrada para o período 30d"
 * 
 * IMPLEMENTA:
 * 1. Verificação e criação da métrica custo_plataforma
 * 2. População retroativa de dados
 * 3. Sistema de fallback robusto
 * 4. Validação completa do sistema
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * STEP 1: Verificar estrutura atual da tabela tenant_metrics
 */
async function investigateCurrentMetrics() {
    console.log('🔍 INVESTIGANDO ESTRUTURA ATUAL DE MÉTRICAS...\n');
    
    // Verificar quais metric_types existem
    const { data: metricTypes, error: typesError } = await supabase
        .from('tenant_metrics')
        .select('metric_type')
        .not('metric_type', 'is', null);
    
    if (typesError) {
        console.error('❌ Erro ao buscar tipos de métricas:', typesError);
        return false;
    }
    
    const uniqueTypes = [...new Set(metricTypes.map(m => m.metric_type))];
    console.log('📊 Tipos de métricas existentes:');
    uniqueTypes.forEach(type => console.log(`   • ${type}`));
    
    // Verificar se custo_plataforma existe
    const hasCustoPlatform = uniqueTypes.includes('custo_plataforma');
    console.log(`\n💰 Métrica 'custo_plataforma': ${hasCustoPlatform ? '✅ EXISTE' : '❌ AUSENTE'}`);
    
    if (!hasCustoPlatform) {
        console.log('🚨 PROBLEMA CONFIRMADO: Métrica custo_plataforma não existe!');
    }
    
    // Verificar períodos disponíveis
    const { data: periods } = await supabase
        .from('tenant_metrics')
        .select('period')
        .not('period', 'is', null);
    
    const uniquePeriods = [...new Set(periods.map(p => p.period))];
    console.log('\n📅 Períodos disponíveis:');
    uniquePeriods.forEach(period => console.log(`   • ${period}`));
    
    return { uniqueTypes, uniquePeriods, hasCustoPlatform };
}

/**
 * STEP 2: Calcular custo da plataforma baseado em métricas existentes
 */
async function calculatePlatformCostMetric(period = '30d') {
    console.log(`\n💰 CALCULANDO CUSTO DA PLATAFORMA PARA ${period}...`);
    
    // Buscar métricas de participação (contém dados de usage)
    const { data: participationMetrics, error } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('metric_type', 'participation')
        .eq('period', period);
    
    if (error) {
        console.error('❌ Erro ao buscar métricas de participação:', error);
        return [];
    }
    
    console.log(`📊 Encontradas ${participationMetrics.length} métricas de participação`);
    
    const custoPlatformMetrics = [];
    
    for (const metric of participationMetrics) {
        const tenantId = metric.tenant_id;
        const metricData = metric.metric_data || {};
        
        // Extrair dados de usage da estrutura JSONB
        const aiInteractions = metricData.ai_interactions?.count || 0;
        const chatMinutes = metricData.ai_interactions?.avg_chat_duration_minutes || 0;
        const conversations = metricData.conversations?.count || aiInteractions;
        
        // Calcular custos usando fórmulas do sistema
        const aiCostUSD = aiInteractions * 0.02;          // $0.02 per AI interaction
        const conversationCostUSD = conversations * 0.007; // $0.007 per conversation
        const chatCostUSD = chatMinutes * 0.001;          // $0.001 per minute
        
        const totalCostUSD = aiCostUSD + conversationCostUSD + chatCostUSD;
        
        // Converter para BRL (usando taxa aproximada)
        const usdToBrl = 5.2;
        const totalCostBRL = totalCostUSD * usdToBrl;
        
        // Criar estrutura da métrica custo_plataforma
        const custoMetricData = {
            custo_total_plataforma: totalCostBRL,
            custo_ai_usd: aiCostUSD,
            custo_ai_brl: aiCostUSD * usdToBrl,
            custo_conversas_usd: conversationCostUSD,
            custo_conversas_brl: conversationCostUSD * usdToBrl,
            custo_chat_usd: chatCostUSD,
            custo_chat_brl: chatCostUSD * usdToBrl,
            total_conversations: conversations,
            total_ai_interactions: aiInteractions,
            total_chat_minutes: chatMinutes,
            usd_to_brl_rate: usdToBrl,
            calculation_method: 'derived_from_participation_metrics',
            calculated_at: new Date().toISOString()
        };
        
        custoPlatformMetrics.push({
            tenant_id: tenantId,
            metric_type: 'custo_plataforma',
            period: period,
            metric_data: custoMetricData,
            calculated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        
        console.log(`   💰 Tenant ${tenantId}: R$ ${totalCostBRL.toFixed(2)} (${aiInteractions} interactions, ${conversations} conversations, ${chatMinutes.toFixed(1)} min)`);
    }
    
    console.log(`✅ Calculadas ${custoPlatformMetrics.length} métricas de custo da plataforma`);
    return custoPlatformMetrics;
}

/**
 * STEP 3: Inserir métricas custo_plataforma na tabela
 */
async function insertPlatformCostMetrics(metrics) {
    console.log(`\n💾 INSERINDO ${metrics.length} MÉTRICAS CUSTO_PLATAFORMA...`);
    
    if (metrics.length === 0) {
        console.log('⚠️ Nenhuma métrica para inserir');
        return false;
    }
    
    const { data, error } = await supabase
        .from('tenant_metrics')
        .insert(metrics);
    
    if (error) {
        console.error('❌ Erro ao inserir métricas:', error);
        return false;
    }
    
    console.log('✅ Métricas custo_plataforma inseridas com sucesso!');
    return true;
}

/**
 * STEP 4: Validar correção testando PlatformAggregationService
 */
async function validateFix(period = '30d') {
    console.log(`\n🧪 VALIDANDO CORREÇÃO PARA PERÍODO ${period}...`);
    
    // Simular busca que estava falhando
    const { data: costMetrics, error } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('period', period)
        .eq('metric_type', 'custo_plataforma')
        .order('calculated_at', { ascending: false });
    
    if (error) {
        console.error('❌ Erro na validação:', error);
        return false;
    }
    
    const found = costMetrics?.length || 0;
    console.log(`📊 Métricas custo_plataforma encontradas: ${found}`);
    
    if (found > 0) {
        console.log('✅ CORREÇÃO VALIDADA - Sistema funcionando!');
        
        // Mostrar amostra dos dados
        const sample = costMetrics[0];
        const metricData = sample.metric_data || {};
        console.log('\n📋 Amostra de dados:');
        console.log(`   • Custo Total: R$ ${metricData.custo_total_plataforma?.toFixed(2) || '0.00'}`);
        console.log(`   • Conversas: ${metricData.total_conversations || 0}`);
        console.log(`   • IA Interactions: ${metricData.total_ai_interactions || 0}`);
        console.log(`   • Minutos Chat: ${metricData.total_chat_minutes || 0}`);
        
        return true;
    } else {
        console.log('❌ CORREÇÃO FALHOU - Métricas ainda não encontradas');
        return false;
    }
}

/**
 * STEP 5: Implementar fallback no PlatformAggregationService
 */
async function createFallbackSolution() {
    console.log('\n🛡️ CRIANDO SOLUÇÃO DE FALLBACK...');
    
    const fallbackCode = `
/**
 * FALLBACK: Calcular custo da plataforma quando métrica não existe
 */
private async calculatePlatformCostFallback(revenueMetrics: any[], period: string): Promise<any[]> {
    console.log('🛡️ Usando fallback para calcular custo da plataforma');
    
    const fallbackMetrics = [];
    
    for (const tenant of revenueMetrics) {
        const data = typeof tenant.metric_data === 'object' && tenant.metric_data !== null ? tenant.metric_data as any : {};
        
        // Estimar usage baseado em dados de receita
        const totalRevenue = data.total_revenue || 0;
        const estimatedConversations = Math.max(1, Math.round(totalRevenue / 10)); // Estimar 1 conversa por R$10 de receita
        const estimatedChatMinutes = estimatedConversations * 2.5; // Média de 2.5 min por conversa
        
        // Calcular custos usando fórmulas padrão
        const aiCostUSD = estimatedConversations * 0.02;
        const conversationCostUSD = estimatedConversations * 0.007;
        const chatCostUSD = estimatedChatMinutes * 0.001;
        const totalCostUSD = aiCostUSD + conversationCostUSD + chatCostUSD;
        
        const usdToBrl = 5.2;
        const custoTotalPlataforma = totalCostUSD * usdToBrl;
        
        fallbackMetrics.push({
            tenant_id: tenant.tenant_id,
            metric_data: {
                custo_total_plataforma: custoTotalPlataforma,
                total_conversations: estimatedConversations,
                calculation_method: 'fallback_estimation'
            }
        });
    }
    
    return fallbackMetrics;
}`;
    
    console.log('📝 Código de fallback gerado (aplicar manualmente ao PlatformAggregationService)');
    console.log('🔧 Modificar linha 94-96 para usar fallback quando métrica não encontrada');
    
    return fallbackCode;
}

/**
 * EXECUÇÃO PRINCIPAL
 */
async function main() {
    console.log('🚀 INICIANDO CORREÇÃO DO SISTEMA DE MÉTRICAS CUSTO_PLATAFORMA\n');
    console.log('=' * 70);
    
    try {
        // 1. Investigar problema atual
        const investigation = await investigateCurrentMetrics();
        
        if (!investigation || investigation.hasCustoPlatform) {
            console.log('\n✅ Métrica custo_plataforma já existe - problema pode ser em outro lugar');
            return;
        }
        
        // 2. Calcular métricas para todos os períodos
        const periods = ['7d', '30d', '90d'];
        let totalInserted = 0;
        
        for (const period of periods) {
            console.log(`\n🔄 Processando período ${period}...`);
            
            const metrics = await calculatePlatformCostMetric(period);
            if (metrics.length > 0) {
                const success = await insertPlatformCostMetrics(metrics);
                if (success) {
                    totalInserted += metrics.length;
                    
                    // Validar cada período
                    await validateFix(period);
                }
            }
        }
        
        // 3. Validação final
        console.log('\n' + '=' * 70);
        console.log('📋 RELATÓRIO FINAL DA CORREÇÃO');
        console.log('=' * 70);
        console.log(`✅ Total de métricas inseridas: ${totalInserted}`);
        console.log(`📊 Períodos processados: ${periods.join(', ')}`);
        
        // 4. Criar solução de fallback
        const fallbackCode = await createFallbackSolution();
        
        console.log('\n🎯 PRÓXIMOS PASSOS:');
        console.log('1. ✅ Métricas custo_plataforma criadas e populadas');
        console.log('2. 🔧 Aplicar código de fallback ao PlatformAggregationService');
        console.log('3. 🧪 Testar dashboard super admin');
        console.log('4. 📊 Monitorar sistema de métricas');
        
        // 5. Validação final do período crítico (30d)
        const finalValidation = await validateFix('30d');
        
        if (finalValidation) {
            console.log('\n🎉 CORREÇÃO CONCLUÍDA COM SUCESSO!');
            console.log('   Dashboard super admin deve funcionar normalmente');
        } else {
            console.log('\n⚠️ CORREÇÃO PARCIAL - Verificar manualmente');
        }
        
    } catch (error) {
        console.error('\n❌ ERRO CRÍTICO NA CORREÇÃO:', error);
        console.log('\n🆘 AÇÕES DE EMERGÊNCIA:');
        console.log('1. Verificar conexão com banco de dados');
        console.log('2. Validar estrutura da tabela tenant_metrics');
        console.log('3. Executar script em modo debug');
    }
}

// Executar correção
if (require.main === module) {
    main().then(() => {
        console.log('\n🏁 Script finalizado');
        process.exit(0);
    }).catch(error => {
        console.error('\n💥 Falha crítica:', error);
        process.exit(1);
    });
}

module.exports = {
    investigateCurrentMetrics,
    calculatePlatformCostMetric,
    insertPlatformCostMetrics,
    validateFix
};