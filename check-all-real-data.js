require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * VERIFICAÇÃO COMPLETA DE DADOS REAIS NO BANCO
 * Para entender o que temos disponível para teste de produção
 */

async function checkAllRealData() {
    console.log('🔍 VERIFICAÇÃO COMPLETA DE DADOS REAIS NO BANCO');
    console.log('='.repeat(70));
    
    const tables = [
        'tenants',
        'conversation_history', 
        'appointments',
        'conversation_billing',
        'whatsapp_media',
        'users',
        'services',
        'professionals'
    ];
    
    const dataInventory = {};
    
    for (const table of tables) {
        try {
            console.log(`\n📊 VERIFICANDO: ${table}`);
            
            // Contar registros totais
            const { data: totalCount, error: countError } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });
            
            if (countError) {
                console.log(`   ❌ Erro: ${countError.message}`);
                dataInventory[table] = { error: countError.message };
                continue;
            }
            
            const total = totalCount || 0;
            console.log(`   📊 Total registros: ${total}`);
            
            if (total > 0) {
                // Buscar amostra de dados
                const { data: sample, error: sampleError } = await supabase
                    .from(table)
                    .select('*')
                    .limit(3);
                
                if (!sampleError && sample.length > 0) {
                    console.log(`   📋 Colunas: ${Object.keys(sample[0]).join(', ')}`);
                    
                    // Para tabelas específicas, mostrar dados relevantes
                    if (table === 'tenants') {
                        sample.forEach((t, i) => {
                            console.log(`   ${i + 1}. ${t.name || t.business_name} (${t.status})`);
                        });
                    } else if (table === 'conversation_history') {
                        const outcomes = {};
                        sample.forEach(c => {
                            const outcome = c.conversation_outcome || 'null';
                            outcomes[outcome] = (outcomes[outcome] || 0) + 1;
                        });
                        console.log(`   🗨️ Outcomes na amostra:`, outcomes);
                    } else if (table === 'appointments') {
                        const statuses = {};
                        sample.forEach(a => {
                            const status = a.status || 'null';
                            statuses[status] = (statuses[status] || 0) + 1;
                        });
                        console.log(`   📅 Status na amostra:`, statuses);
                    } else if (table === 'conversation_billing') {
                        let totalBilling = 0;
                        sample.forEach(b => {
                            totalBilling += parseFloat(b.total_amount_brl || 0);
                        });
                        console.log(`   💰 Billing na amostra: R$ ${totalBilling.toFixed(2)}`);
                    }
                }
                
                dataInventory[table] = {
                    total: total,
                    has_data: true,
                    sample_size: sample?.length || 0
                };
            } else {
                dataInventory[table] = {
                    total: 0,
                    has_data: false
                };
            }
            
        } catch (err) {
            console.log(`   ❌ Erro ao verificar ${table}: ${err.message}`);
            dataInventory[table] = { error: err.message };
        }
    }
    
    // Verificar dados dos últimos 30 dias especificamente
    console.log('\n📅 DADOS DOS ÚLTIMOS 30 DIAS:');
    console.log('='.repeat(50));
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    try {
        const recentDataChecks = [
            {
                name: 'Conversas (30d)',
                table: 'conversation_history',
                condition: `created_at >= '${thirtyDaysAgo.toISOString()}'`
            },
            {
                name: 'Appointments (30d)', 
                table: 'appointments',
                condition: `created_at >= '${thirtyDaysAgo.toISOString()}'`
            },
            {
                name: 'Billing Agosto 2025',
                table: 'conversation_billing',
                condition: `billing_period_start >= '2025-08-01'`
            }
        ];
        
        for (const check of recentDataChecks) {
            if (dataInventory[check.table]?.has_data) {
                // Fazer query manual para dados recentes
                const { data: recentData, error } = await supabase
                    .from(check.table)
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', thirtyDaysAgo.toISOString());
                
                if (!error) {
                    console.log(`   📊 ${check.name}: ${recentData || 0} registros`);
                } else {
                    console.log(`   ❌ ${check.name}: Erro - ${error.message}`);
                }
            } else {
                console.log(`   📊 ${check.name}: 0 registros (tabela vazia)`);
            }
        }
    } catch (err) {
        console.log(`   ❌ Erro na verificação de dados recentes: ${err.message}`);
    }
    
    // Relatório final
    console.log('\n' + '='.repeat(70));
    console.log('📋 INVENTÁRIO COMPLETO DE DADOS');
    console.log('='.repeat(70));
    
    let hasAnyData = false;
    
    Object.entries(dataInventory).forEach(([table, info]) => {
        if (info.has_data) {
            console.log(`✅ ${table}: ${info.total} registros`);
            hasAnyData = true;
        } else if (info.error) {
            console.log(`❌ ${table}: ${info.error}`);
        } else {
            console.log(`⚪ ${table}: 0 registros`);
        }
    });
    
    console.log('\n🎯 DIAGNÓSTICO:');
    if (hasAnyData) {
        console.log('✅ DADOS REAIS ENCONTRADOS - Possível executar teste de produção');
        console.log('📋 Próximos passos:');
        console.log('   1. Executar cron job de tenant metrics');
        console.log('   2. Executar cron job de platform aggregation');
        console.log('   3. Validar resultados com dados reais');
    } else {
        console.log('❌ NENHUM DADO REAL ENCONTRADO');
        console.log('🚨 BANCO COMPLETAMENTE VAZIO');
        console.log('📋 Ações necessárias:');
        console.log('   1. Popular banco com dados reais de produção');
        console.log('   2. Ou criar dados mínimos para teste');
        console.log('   3. Verificar se houve perda de dados');
    }
    
    return {
        has_data: hasAnyData,
        inventory: dataInventory,
        recommendations: hasAnyData ? 'proceed_with_testing' : 'populate_data_first'
    };
}

checkAllRealData().catch(console.error);