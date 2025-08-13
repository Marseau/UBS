require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMetricsTables() {
    console.log('🔍 VERIFICANDO TABELAS DE MÉTRICAS EXISTENTES');
    console.log('='.repeat(60));
    
    const tables = [
        'tenant_metrics',
        'tenant_platform_metrics', 
        'platform_metrics',
        'ubs_metric_system'
    ];
    
    for (const table of tables) {
        try {
            console.log(`\n📊 Verificando tabela: ${table}`);
            
            const { data, error, count } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            
            if (error) {
                console.log(`❌ ${table}: ${error.message}`);
            } else {
                console.log(`✅ ${table}: ${count} registros`);
                
                // Se a tabela existe, mostrar uma amostra
                if (count > 0) {
                    const { data: sample } = await supabase
                        .from(table)
                        .select('*')
                        .limit(1);
                    
                    if (sample && sample.length > 0) {
                        console.log('   Colunas disponíveis:');
                        Object.keys(sample[0]).forEach(col => {
                            console.log(`     • ${col}`);
                        });
                    }
                }
            }
        } catch (err) {
            console.log(`❌ ${table}: ${err.message}`);
        }
    }
    
    // Verificar se temos dados de tenant_metrics para trabalhar
    console.log('\n🔍 VERIFICANDO DADOS DISPONÍVEIS PARA AGREGAÇÃO');
    console.log('='.repeat(60));
    
    try {
        const { data: tenantMetrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .limit(5);
        
        if (!error && tenantMetrics.length > 0) {
            console.log(`✅ Encontrados ${tenantMetrics.length} registros em tenant_metrics`);
            console.log('📊 AMOSTRA DE DADOS:');
            tenantMetrics.forEach((metric, i) => {
                console.log(`   ${i + 1}. Tenant: ${metric.tenant_id}`);
                console.log(`      Tipo: ${metric.metric_type}`);
                console.log(`      Período: ${metric.period}`);
                if (metric.metric_data) {
                    console.log(`      Dados: ${JSON.stringify(metric.metric_data).substring(0, 100)}...`);
                }
            });
        } else {
            console.log('❌ Nenhum dado encontrado em tenant_metrics');
        }
    } catch (err) {
        console.log(`❌ Erro ao verificar tenant_metrics: ${err.message}`);
    }
}

checkMetricsTables().catch(console.error);