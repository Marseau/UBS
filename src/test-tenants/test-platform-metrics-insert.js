#!/usr/bin/env node
/**
 * Test platform_metrics table with correct schema
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testPlatformMetricsInsert() {
    console.log('🔍 Testando inserção na tabela platform_metrics com schema correto...\n');
    
    try {
        // Usar a estrutura exata do código do serviço
        const testData = {
            calculation_date: new Date().toISOString().split('T')[0],
            period_days: 7, // Para 7d
            data_source: 'tenant_aggregation',
            
            // Métricas principais
            total_revenue: 1000.00,
            total_appointments: 50,
            total_customers: 25,
            active_tenants: 3,
            total_conversations: 100,
            total_ai_interactions: 100,
            
            // Métricas calculadas
            operational_efficiency_pct: 85.5,
            spam_rate_pct: 2.1,
            cancellation_rate_pct: 5.0,
            
            // Métricas específicas da plataforma
            platform_mrr: 1000.00,
            total_chat_minutes: 250.0, // conversations * 2.5
            total_valid_conversations: 100,
            total_spam_conversations: 2,
            receita_uso_ratio: 333.33, // 1000/3 tenants
            revenue_usage_distortion_index: 1.0,
            platform_health_score: 85,
            tenants_above_usage: 1,
            tenants_below_usage: 2,
            
            // Metadados
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        console.log('1. Tentando inserir dados de teste...');
        
        const { data: insertData, error: insertError } = await supabase
            .from('platform_metrics')
            .insert(testData)
            .select();
            
        if (insertError) {
            console.log('❌ Erro na inserção:', insertError.message);
            console.log('   Code:', insertError.code);
            console.log('   Details:', insertError.details);
            
            // Tentar com dados mínimos
            console.log('\n2. Tentando com dados mínimos...');
            
            const minimalData = {
                period_days: 7,
                data_source: 'test',
                total_revenue: 0,
                active_tenants: 0
            };
            
            const { data: minData, error: minError } = await supabase
                .from('platform_metrics')
                .insert(minimalData)
                .select();
                
            if (minError) {
                console.log('❌ Erro com dados mínimos:', minError.message);
            } else {
                console.log('✅ Inserção mínima funcionou!');
                console.log('   Colunas da tabela:', Object.keys(minData[0]));
                
                // Limpar dados de teste
                await supabase
                    .from('platform_metrics')
                    .delete()
                    .eq('id', minData[0].id);
            }
            
        } else {
            console.log('✅ Inserção completa funcionou!');
            console.log('   ID inserido:', insertData[0].id);
            console.log('   Colunas da tabela:', Object.keys(insertData[0]));
            
            // Verificar se dados foram inseridos corretamente
            console.log('\n3. Verificando dados inseridos...');
            
            const { data: verifyData, error: verifyError } = await supabase
                .from('platform_metrics')
                .select('*')
                .eq('id', insertData[0].id)
                .single();
                
            if (!verifyError && verifyData) {
                console.log('✅ Dados verificados com sucesso:');
                Object.entries(verifyData).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });
            }
            
            // Limpar dados de teste
            await supabase
                .from('platform_metrics')
                .delete()
                .eq('id', insertData[0].id);
                
            console.log('\n✅ Dados de teste removidos');
        }
        
        // Verificar dados existentes na tabela
        console.log('\n4. Verificando dados existentes na tabela...');
        
        const { data: existingData, error: existingError } = await supabase
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
            
        if (!existingError && existingData) {
            console.log(`✅ Encontrados ${existingData.length} registros existentes`);
            
            if (existingData.length > 0) {
                console.log('   Último registro:');
                const lastRecord = existingData[0];
                Object.entries(lastRecord).forEach(([key, value]) => {
                    console.log(`     ${key}: ${value}`);
                });
            }
        } else {
            console.log('⚠️ Nenhum dado existente encontrado');
            if (existingError) {
                console.log('   Erro:', existingError.message);
            }
        }
        
    } catch (error) {
        console.error('💥 Erro geral:', error.message);
    }
}

testPlatformMetricsInsert();