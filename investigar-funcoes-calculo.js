/**
 * INVESTIGAR FUNÇÕES DE CÁLCULO NO BANCO
 * Para entender qual função está sendo usada e por que os dados estão incorretos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigateCalculationFunctions() {
    console.log('🔍 INVESTIGANDO FUNÇÕES DE CÁLCULO:');
    console.log('='.repeat(50));
    
    try {
        // Testar cada função individualmente com parâmetros
        const functions = [
            { name: 'calculate_enhanced_platform_metrics', params: {} },
            { name: 'calculate_new_metrics_system', params: { p_calculation_date: '2025-07-31', p_period_days: 30, p_tenant_id: null } }
        ];
        
        for (const func of functions) {
            console.log(`\n🧪 TESTANDO: ${func.name}`);
            console.log('-'.repeat(40));
            
            try {
                const start = Date.now();
                const { data, error } = await supabase.rpc(func.name, func.params);
                const duration = Date.now() - start;
                
                if (error) {
                    console.log(`❌ Erro: ${error.message}`);
                    console.log(`   Código: ${error.code || 'N/A'}`);
                    console.log(`   Detalhes: ${error.details || 'N/A'}`);
                } else {
                    console.log(`✅ Sucesso - Executou em ${duration}ms`);
                    console.log(`📊 Resultado:`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
                }
            } catch (err) {
                console.log(`💥 Exceção: ${err.message}`);
            }
        }
        
        // Verificar se há dados em outras tabelas de métricas
        console.log('\n📋 VERIFICANDO DADOS CALCULADOS:');
        console.log('-'.repeat(40));
        
        // Verificar tenant_metrics recentes
        const { data: tenantMetrics, error: tmError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at, metric_data')
            .order('calculated_at', { ascending: false })
            .limit(3);
            
        if (!tmError && tenantMetrics?.length > 0) {
            console.log(`📊 tenant_metrics recentes (${tenantMetrics.length}):`);
            tenantMetrics.forEach((tm, i) => {
                console.log(`   ${i + 1}. Tenant: ${tm.tenant_id.substr(0, 8)}...`);
                console.log(`      Tipo: ${tm.metric_type}, Período: ${tm.period}`);
                console.log(`      Calculado: ${tm.calculated_at}`);
                
                // Mostrar amostra dos dados de métrica
                if (tm.metric_data) {
                    const data = tm.metric_data;
                    console.log(`      Revenue: R$ ${data.revenue?.participation_value || 'N/A'}`);
                    console.log(`      Appointments: ${data.appointments?.count || 'N/A'}`);
                    console.log(`      AI Interactions: ${data.ai_interactions?.count || 'N/A'}`);
                }
            });
        } else {
            console.log('❌ Erro ao buscar tenant_metrics:', tmError?.message);
        }
        
        // Calcular métricas manualmente para comparar
        console.log('\n🧮 CÁLCULO MANUAL PARA COMPARAÇÃO:');
        console.log('-'.repeat(40));
        
        // Total de appointments (últimos 30 dias)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const { count: realAppointments } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startDate.toISOString());
            
        const { count: realMessages } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startDate.toISOString());
            
        // MRR real dos tenants
        const { data: tenants } = await supabase
            .from('tenants')
            .select('subscription_plan')
            .eq('status', 'active');
            
        const planPrices = {
            'basic': 89.90,
            'basico': 89.90,
            'professional': 179.90,
            'profissional': 179.90,
            'enterprise': 349.90,
            'premium': 249.90,
            'free': 0
        };
        
        let realMRR = 0;
        tenants?.forEach(t => {
            const plan = t.subscription_plan?.toLowerCase() || 'basic';
            realMRR += planPrices[plan] || 89.90;
        });
        
        console.log('📊 MÉTRICAS CALCULADAS MANUALMENTE:');
        console.log(`   MRR Real: R$ ${realMRR.toFixed(2)}`);
        console.log(`   Appointments (30d): ${realAppointments || 'N/A'}`);
        console.log(`   Messages (30d): ${realMessages || 'N/A'}`);
        console.log(`   Tenants Ativos: ${tenants?.length || 'N/A'}`);
        
        console.log('\n📊 COMPARAÇÃO COM PLATFORM_METRICS:');
        console.log(`   Platform_metrics MRR: R$ 190646.37 (INCORRETO)`);
        console.log(`   Platform_metrics Appointments: 1513 (INCORRETO)`);
        console.log(`   Platform_metrics AI Interactions: 1495 (INCORRETO)`);
        
    } catch (error) {
        console.error('💥 Erro na investigação:', error);
    }
}

investigateCalculationFunctions().catch(console.error);