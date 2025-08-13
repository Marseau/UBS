#!/usr/bin/env node
/**
 * Test platform_metrics with admin client (same as cron jobs)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Usar as mesmas credenciais que o serviço de agregação
const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, // Service role key para contornar RLS
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

async function testAdminPlatformMetrics() {
    console.log('🔍 Testando platform_metrics com Admin Client (mesmas credenciais do cron)...\n');
    
    try {
        // Dados de teste similares ao que o cron job usa
        const testData = {
            calculation_date: new Date().toISOString().split('T')[0],
            period_days: 7,
            data_source: 'tenant_aggregation',
            total_revenue: 1500.50,
            total_appointments: 75,
            total_customers: 35,
            active_tenants: 5,
            total_conversations: 150,
            total_ai_interactions: 150,
            operational_efficiency_pct: 88.5,
            platform_mrr: 1500.50,
            platform_health_score: 87,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        console.log('1. Tentando inserir com Admin Client...');
        
        const { data: insertData, error: insertError } = await adminClient
            .from('platform_metrics')
            .insert(testData)
            .select();
            
        if (insertError) {
            console.log('❌ Erro com Admin Client:', insertError.message);
            console.log('   Code:', insertError.code);
            console.log('   Details:', insertError.details);
        } else {
            console.log('✅ Inserção com Admin Client funcionou!');
            console.log('   ID inserido:', insertData[0].id);
            console.log('   Colunas disponíveis:', Object.keys(insertData[0]));
            
            // Verificar se conseguimos ler os dados
            console.log('\n2. Verificando leitura dos dados...');
            
            const { data: readData, error: readError } = await adminClient
                .from('platform_metrics')
                .select('*')
                .eq('id', insertData[0].id)
                .single();
                
            if (!readError && readData) {
                console.log('✅ Leitura funcionou - dados inseridos:');
                Object.entries(readData).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            } else {
                console.log('❌ Erro na leitura:', readError?.message);
            }
            
            // Agora testar se conseguimos executar o cron job real
            console.log('\n3. Testando execução do cron job real...');
            
            try {
                const { unifiedCronService } = require('./dist/services/unified-cron.service.js');
                
                // Executar apenas platform aggregation
                const cronResult = await unifiedCronService.triggerPlatformAggregation();
                
                console.log('✅ Cron job executado com sucesso!');
                console.log('   Success:', cronResult.success);
                console.log('   Execution time:', cronResult.executionTimeMs + 'ms');
                console.log('   Processed:', cronResult.processed);
                
                if (cronResult.data) {
                    console.log('   Dados processados:', Object.keys(cronResult.data));
                }
                
            } catch (cronError) {
                console.log('❌ Erro no cron job:', cronError.message);
            }
            
            // Verificar se há mais dados na tabela agora
            console.log('\n4. Verificando total de registros na tabela...');
            
            const { data: allData, error: allError } = await adminClient
                .from('platform_metrics')
                .select('id, calculation_date, period_days, total_revenue, active_tenants')
                .order('created_at', { ascending: false })
                .limit(10);
                
            if (!allError && allData) {
                console.log(`✅ Total de registros encontrados: ${allData.length}`);
                
                allData.forEach((record, i) => {
                    console.log(`   ${i + 1}. [${record.calculation_date}] ${record.period_days}d - R$${record.total_revenue} - ${record.active_tenants} tenants`);
                });
            } else {
                console.log('❌ Erro ao listar registros:', allError?.message);
            }
            
            // Limpar dados de teste apenas se explicitamente solicitado
            console.log('\n5. Mantendo dados para análise (não removendo dados de teste)');
        }
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
        console.error('Stack:', error.stack);
    }
}

testAdminPlatformMetrics();