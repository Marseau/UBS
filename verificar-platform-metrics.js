/**
 * VERIFICAR TABELA PLATFORM_METRICS
 * Para entender por que a API está usando dados incorretos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkPlatformMetrics() {
    console.log('🔍 VERIFICANDO TABELA PLATFORM_METRICS:');
    console.log('='.repeat(50));
    
    try {
        // 1. Verificar se a tabela existe e tem dados
        const { data: platformData, error: platformError } = await supabase
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (platformError) {
            console.error('❌ Erro ao acessar platform_metrics:', platformError);
            
            // Tentar verificar se a tabela existe
            console.log('\n🔍 Verificando se a tabela existe...');
            const { data: tables, error: tablesError } = await supabase
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public')
                .like('table_name', '%platform%');
                
            if (!tablesError && tables) {
                console.log('📋 Tabelas relacionadas encontradas:', tables.map(t => t.table_name));
            }
        } else {
            console.log(`📊 Platform Metrics encontrados: ${platformData?.length || 0}`);
            
            if (platformData && platformData.length > 0) {
                console.log('\n📋 DADOS RECENTES DA PLATFORM_METRICS:');
                platformData.forEach((metric, index) => {
                    console.log(`\n${index + 1}. Registro:`);
                    console.log(`   Data cálculo: ${metric.calculation_date}`);
                    console.log(`   Período: ${metric.period_days} dias`);
                    console.log(`   MRR Platform: R$ ${metric.platform_mrr || 'N/A'}`);
                    console.log(`   Total Appointments: ${metric.total_appointments || 'N/A'}`);
                    console.log(`   Total AI Interactions: ${metric.total_ai_interactions || 'N/A'}`);
                    console.log(`   Active Tenants: ${metric.active_tenants || 'N/A'}`);
                    console.log(`   Data Source: ${metric.data_source || 'N/A'}`);
                });
            } else {
                console.log('⚠️ Tabela platform_metrics existe mas está vazia!');
            }
        }
        
        // 2. Verificar outras tabelas de métricas
        console.log('\n🔍 VERIFICANDO OUTRAS TABELAS DE MÉTRICAS:');
        
        const metricsTables = ['tenant_metrics', 'tenant_platform_metrics', 'ubs_metric_system'];
        
        for (const tableName of metricsTables) {
            try {
                const { count, error } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact', head: true });
                    
                if (error) {
                    console.log(`❌ ${tableName}: Não existe ou erro (${error.code})`);
                } else {
                    console.log(`✅ ${tableName}: ${count || 0} registros`);
                    
                    if (count > 0) {
                        const { data: sample } = await supabase
                            .from(tableName)
                            .select('*')
                            .limit(1);
                        console.log(`   Amostra:`, Object.keys(sample?.[0] || {}));
                    }
                }
            } catch (err) {
                console.log(`❌ ${tableName}: Erro ao verificar`);
            }
        }
        
        // 3. Verificar se existe função de cálculo
        console.log('\n🔍 VERIFICANDO FUNÇÕES DE CÁLCULO:');
        
        const functions = [
            'calculate_platform_metrics',
            'calculate_enhanced_platform_metrics', 
            'calculate_ubs_metrics',
            'calculate_new_metrics_system'
        ];
        
        for (const funcName of functions) {
            try {
                const { data, error } = await supabase.rpc(funcName, {});
                if (error) {
                    console.log(`❌ ${funcName}: ${error.message}`);
                } else {
                    console.log(`✅ ${funcName}: Executou com sucesso`);
                }
            } catch (err) {
                console.log(`❌ ${funcName}: Não existe ou erro`);
            }
        }
        
    } catch (error) {
        console.error('💥 Erro na verificação:', error);
    }
}

checkPlatformMetrics().catch(console.error);