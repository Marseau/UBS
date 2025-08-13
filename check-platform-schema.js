#!/usr/bin/env node
/**
 * Check platform_metrics table schema and fix cron job issues
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkPlatformSchema() {
    console.log('🔍 Verificando schema da tabela platform_metrics...\n');
    
    try {
        // Tentar inserir um registro de teste para descobrir a estrutura
        console.log('1. Testando inserção para descobrir estrutura...');
        
        const testRecord = {
            id: 'test-' + Date.now(),
            period: '7d',
            metric_data: {
                total_revenue: 1000,
                active_tenants: 5,
                platform_mrr: 500,
                total_conversations: 100,
                total_appointments: 50
            },
            calculated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        
        const { data: insertData, error: insertError } = await supabase
            .from('platform_metrics')
            .insert(testRecord)
            .select();
            
        if (insertError) {
            console.log('❌ Erro na inserção:', insertError.message);
            console.log('   Code:', insertError.code);
            console.log('   Details:', insertError.details);
            
            // Tentar com estrutura mais simples
            console.log('\n2. Tentando estrutura simplificada...');
            
            const simpleRecord = {
                period: '7d',
                metric_data: { test: 'value' },
                calculated_at: new Date().toISOString()
            };
            
            const { data: simpleData, error: simpleError } = await supabase
                .from('platform_metrics')
                .insert(simpleRecord)
                .select();
                
            if (simpleError) {
                console.log('❌ Erro na inserção simplificada:', simpleError.message);
                
                // Listar possíveis colunas baseado no erro
                if (simpleError.message.includes('column') && simpleError.message.includes('does not exist')) {
                    console.log('\n3. Analisando erro de coluna...');
                    console.log('   Parece que a estrutura da tabela é diferente do esperado');
                }
            } else {
                console.log('✅ Inserção simplificada funcionou!');
                if (simpleData && simpleData.length > 0) {
                    console.log('   Colunas da tabela:', Object.keys(simpleData[0]));
                    
                    // Limpar registro de teste
                    await supabase
                        .from('platform_metrics')
                        .delete()
                        .eq('id', simpleData[0].id);
                }
            }
        } else {
            console.log('✅ Inserção de teste funcionou!');
            if (insertData && insertData.length > 0) {
                console.log('   Colunas da tabela:', Object.keys(insertData[0]));
                
                // Limpar registro de teste
                await supabase
                    .from('platform_metrics')
                    .delete()
                    .eq('id', insertData[0].id);
            }
        }
        
        // Verificar se o cron de platform aggregation está populando dados
        console.log('\n4. Executando platform aggregation para popular dados...');
        
        // Importar e executar o serviço diretamente
        try {
            const { unifiedCronService } = require('./dist/services/unified-cron.service.js');
            
            console.log('   Executando triggerPlatformAggregation...');
            const result = await unifiedCronService.triggerPlatformAggregation();
            
            console.log('   Resultado:', result.success ? '✅ SUCESSO' : '❌ FALHOU');
            console.log('   Tempo de execução:', result.executionTimeMs + 'ms');
            
            if (result.success) {
                // Verificar se dados foram inseridos
                const { data: newData, error: checkError } = await supabase
                    .from('platform_metrics')
                    .select('*')
                    .limit(5);
                    
                if (!checkError && newData && newData.length > 0) {
                    console.log(`✅ Dados populados: ${newData.length} registros`);
                    console.log('   Colunas reais:', Object.keys(newData[0]));
                    
                    newData.forEach((record, i) => {
                        console.log(`\n   Registro ${i + 1}:`);
                        Object.entries(record).forEach(([key, value]) => {
                            if (typeof value === 'object' && value !== null) {
                                console.log(`     ${key}: ${JSON.stringify(value).substring(0, 200)}${JSON.stringify(value).length > 200 ? '...' : ''}`);
                            } else {
                                console.log(`     ${key}: ${value}`);
                            }
                        });
                    });
                } else {
                    console.log('⚠️ Aggregation executou mas nenhum dado foi inserido');
                    if (checkError) {
                        console.log('   Erro ao verificar:', checkError.message);
                    }
                }
            }
            
        } catch (cronError) {
            console.log('❌ Erro ao executar cron:', cronError.message);
        }
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
    }
}

checkPlatformSchema();