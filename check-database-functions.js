const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function checkDatabaseFunctions() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🔍 Verificando funções do banco de dados...\n');
    
    // List of functions the system is trying to call
    const functionsToCheck = [
        'get_tenant_metrics_for_period',
        'get_platform_totals', 
        'get_domain_distribution',
        'calculate_platform_health_score',
        'calculate_business_health_score',
        'get_tenant_metrics',
        'store_tenant_metric',
        'get_tenant_metric'
    ];
    
    try {
        // Get all functions from the database
        const { data: functions, error } = await supabase
            .from('information_schema.routines')
            .select('routine_name, routine_type')
            .eq('routine_schema', 'public')
            .eq('routine_type', 'FUNCTION');
            
        if (error) {
            console.error('❌ Erro ao buscar funções:', error);
            
            // Alternative approach - try to get functions via RPC
            console.log('\n🔄 Tentando abordagem alternativa...');
            
            for (const funcName of functionsToCheck) {
                try {
                    console.log(`\n🧪 Testando função: ${funcName}`);
                    
                    // Try different parameter combinations
                    let testResult = null;
                    
                    if (funcName === 'get_tenant_metrics_for_period') {
                        const { data, error } = await supabase.rpc(funcName, {
                            tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
                            start_date: '2025-07-31',
                            end_date: '2025-08-07'
                        });
                        testResult = { data, error };
                    }
                    else if (funcName === 'get_platform_totals') {
                        const { data, error } = await supabase.rpc(funcName, {
                            start_date: '2025-07-31',
                            end_date: '2025-08-07'
                        });
                        testResult = { data, error };
                    }
                    else if (funcName === 'calculate_business_health_score') {
                        const { data, error } = await supabase.rpc(funcName, {
                            p_tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
                            p_period_type: '7d'
                        });
                        testResult = { data, error };
                    }
                    else if (funcName === 'get_tenant_metric') {
                        const { data, error } = await supabase.rpc(funcName, {
                            p_tenant_id: '33b8c488-5aa9-4891-b335-701d10296681',
                            p_metric_type: 'comprehensive',
                            p_period: '7d'
                        });
                        testResult = { data, error };
                    }
                    else {
                        // Try calling with no parameters
                        const { data, error } = await supabase.rpc(funcName);
                        testResult = { data, error };
                    }
                    
                    if (testResult.error) {
                        console.log(`  ❌ ${funcName}: ${testResult.error.message}`);
                        if (testResult.error.hint) {
                            console.log(`     💡 Dica: ${testResult.error.hint}`);
                        }
                    } else {
                        console.log(`  ✅ ${funcName}: FUNCIONA`);
                        console.log(`     📊 Retorno:`, testResult.data);
                    }
                    
                } catch (error) {
                    console.log(`  💥 ${funcName}: ERRO - ${error.message}`);
                }
            }
            
            return;
        }
        
        if (!functions || functions.length === 0) {
            console.log('⚠️ Nenhuma função encontrada no schema público');
            return;
        }

        console.log(`📊 Total de funções encontradas: ${functions.length}\n`);
        
        // Check which required functions exist
        console.log('🔍 Verificando funções necessárias:');
        functionsToCheck.forEach(funcName => {
            const exists = functions.some(f => f.routine_name === funcName);
            console.log(`  ${exists ? '✅' : '❌'} ${funcName}`);
        });
        
        // Show all available functions
        console.log('\n📋 Todas as funções disponíveis:');
        functions.forEach(func => {
            console.log(`  • ${func.routine_name} (${func.routine_type})`);
        });
        
    } catch (error) {
        console.error('❌ Erro durante verificação:', error);
    }
}

checkDatabaseFunctions();