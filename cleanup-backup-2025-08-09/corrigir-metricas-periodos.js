const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function corrigirMetricasPeriodos() {
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

    console.log('🔧 Corrigindo métricas para períodos 7d e 90d...');
    
    const periodos = [7, 90];
    const dataAtual = new Date().toISOString().split('T')[0];
    
    // Buscar dados base do período de 30 dias para usar como referência
    const { data: baseData } = await supabase
        .from('platform_metrics')
        .select('*')
        .eq('period_days', 30)
        .single();
        
    if (!baseData) {
        console.log('❌ Não foi possível encontrar dados base de 30 dias');
        return;
    }
    
    console.log('📊 Usando como base:', baseData.calculation_date, '- 30 dias');
    
    for (const periodo of periodos) {
        console.log(`\n🔄 Processando período: ${periodo} dias`);
        
        try {
            // Verificar se já existe
            const { data: existing } = await supabase
                .from('platform_metrics')
                .select('id')
                .eq('period_days', periodo)
                .eq('calculation_date', dataAtual)
                .single();
                
            if (existing) {
                console.log(`   ✅ Já existe registro para ${periodo} dias`);
                continue;
            }
            
            // Calcular proporcionalmente com base nos dados de 30 dias
            const fator = periodo / 30;
            
            const metricas = {
                calculation_date: dataAtual,
                period_days: periodo,
                data_source: 'calculated_proportional',
                total_revenue: Math.floor(baseData.total_revenue * fator),
                total_appointments: Math.floor(baseData.total_appointments * fator),
                total_customers: Math.floor(baseData.total_customers * fator),
                total_ai_interactions: Math.floor(baseData.total_ai_interactions * fator),
                active_tenants: baseData.active_tenants, // Sempre o mesmo
                platform_mrr: baseData.platform_mrr, // MRR não varia
                total_chat_minutes: Math.floor(baseData.total_chat_minutes * fator),
                total_conversations: Math.floor(baseData.total_conversations * fator),
                total_valid_conversations: Math.floor(baseData.total_valid_conversations * fator),
                total_spam_conversations: Math.floor(baseData.total_spam_conversations * fator),
                receita_uso_ratio: baseData.receita_uso_ratio, // Mantém a mesma proporção
                operational_efficiency_pct: baseData.operational_efficiency_pct,
                spam_rate_pct: baseData.spam_rate_pct,
                cancellation_rate_pct: baseData.cancellation_rate_pct,
                revenue_usage_distortion_index: baseData.revenue_usage_distortion_index,
                platform_health_score: baseData.platform_health_score,
                tenants_above_usage: baseData.tenants_above_usage,
                tenants_below_usage: baseData.tenants_below_usage,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            const { data, error } = await supabase
                .from('platform_metrics')
                .insert([metricas])
                .select();
                
            if (error) {
                console.log(`   ❌ Erro ao inserir ${periodo} dias:`, error.message);
            } else {
                console.log(`   ✅ Criado registro para ${periodo} dias:`, data[0].id);
                console.log(`      - Appointments: ${data[0].total_appointments}`);
                console.log(`      - Revenue: ${data[0].total_revenue}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Erro ao processar ${periodo} dias:`, error.message);
        }
    }
    
    console.log('\n🎯 Verificando todos os registros...');
    
    const { data: allMetrics } = await supabase
        .from('platform_metrics')
        .select('period_days, calculation_date, total_appointments, total_revenue')
        .order('period_days');
        
    if (allMetrics) {
        allMetrics.forEach(metric => {
            console.log(`   - ${metric.period_days} dias: ${metric.total_appointments} appointments, ${metric.total_revenue} revenue`);
        });
    }
    
    console.log('\n✅ Correção de métricas concluída!');
}

corrigirMetricasPeriodos().catch(console.error);