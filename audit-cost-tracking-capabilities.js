/**
 * AUDITORIA: Capacidade de rastreamento de custos e usage-based metrics
 * Verifica se BD e frontend podem capturar métricas de custo vs receita
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditCostTrackingCapabilities() {
    console.log('🔍 AUDITORIA: Capacidade de rastreamento de custos\n');
    
    try {
        console.log('📊 MÉTRICAS CRÍTICAS NECESSÁRIAS:');
        console.log('1. 💰 Custo de IA por tenant (tokens, requests)');
        console.log('2. 📱 Custo de WhatsApp por tenant (mensagens)');
        console.log('3. 📈 Margem real: Receita - Custos');
        console.log('4. 🚨 Tenants em prejuízo (custo > receita)');
        console.log('5. 📊 Cost per conversation/interaction');
        
        console.log('\n🔍 VERIFICANDO TABELAS DO BANCO...\n');
        
        // 1. Verificar conversation_history para dados de IA
        console.log('1. 🤖 DADOS DE IA (conversation_history):');
        
        const { data: conversationSample, error: convError } = await supabase
            .from('conversation_history')
            .select('*')
            .limit(3);
            
        if (convError) {
            console.log('   ❌ Erro ao acessar conversation_history:', convError.message);
        } else if (conversationSample?.length > 0) {
            console.log('   ✅ Tabela acessível');
            console.log('   📋 Campos disponíveis:');
            Object.keys(conversationSample[0]).forEach(field => {
                console.log(`      - ${field}`);
            });
            
            // Verificar se tem campos de custo
            const costFields = ['tokens_used', 'cost', 'api_cost', 'token_count', 'usage_cost'];
            const hasCostTracking = costFields.some(field => 
                Object.keys(conversationSample[0]).includes(field)
            );
            
            console.log(`   💰 Rastreamento de custo: ${hasCostTracking ? '✅ DISPONÍVEL' : '❌ FALTANDO'}`);
            
            if (!hasCostTracking) {
                console.log('   💡 Campos necessários para adicionar:');
                console.log('      - tokens_used (INTEGER)');
                console.log('      - api_cost_usd (DECIMAL)');
                console.log('      - model_used (VARCHAR)');
            }
        } else {
            console.log('   ⚠️ Tabela vazia');
        }
        
        // 2. Verificar se há rastreamento de WhatsApp
        console.log('\n2. 📱 DADOS DE WHATSAPP:');
        
        const { data: whatsappSample, error: whatsappError } = await supabase
            .from('whatsapp_media')
            .select('*')
            .limit(3);
            
        if (whatsappError) {
            console.log('   ❌ Tabela whatsapp_media não encontrada');
        } else {
            console.log('   ✅ Tabela whatsapp_media encontrada');
            if (whatsappSample?.length > 0) {
                console.log('   📋 Campos disponíveis:');
                Object.keys(whatsappSample[0]).forEach(field => {
                    console.log(`      - ${field}`);
                });
            }
        }
        
        // Verificar se conversation_history tem origem WhatsApp
        if (conversationSample?.length > 0) {
            const hasWhatsAppTracking = Object.keys(conversationSample[0]).includes('source') ||
                                      Object.keys(conversationSample[0]).includes('channel') ||
                                      Object.keys(conversationSample[0]).includes('platform');
            console.log(`   📱 Rastreamento origem WhatsApp: ${hasWhatsAppTracking ? '✅ DISPONÍVEL' : '❌ FALTANDO'}`);
        }
        
        // 3. Verificar dados de cobrança/pricing
        console.log('\n3. 💳 DADOS DE COBRANÇA (tenants):');
        
        const { data: tenantsSample, error: tenantsError } = await supabase
            .from('tenants')
            .select('*')
            .limit(3);
            
        if (tenantsError) {
            console.log('   ❌ Erro ao acessar tenants:', tenantsError.message);
        } else if (tenantsSample?.length > 0) {
            console.log('   ✅ Tabela acessível');
            
            const pricingFields = ['monthly_fee', 'subscription_amount', 'plan_price', 'billing_amount'];
            const hasPricingData = pricingFields.some(field => 
                Object.keys(tenantsSample[0]).includes(field)
            );
            
            console.log(`   💰 Dados de preço: ${hasPricingData ? '✅ DISPONÍVEL' : '❌ FALTANDO'}`);
            
            console.log('   📋 Campos de tenant:');
            Object.keys(tenantsSample[0]).slice(0, 10).forEach(field => {
                console.log(`      - ${field}`);
            });
            
            if (!hasPricingData) {
                console.log('   💡 Campos necessários para adicionar:');
                console.log('      - monthly_subscription_fee (DECIMAL)');
                console.log('      - plan_type (VARCHAR)');
                console.log('      - billing_date (DATE)');
            }
        }
        
        // 4. Verificar se existe tabela de custos
        console.log('\n4. 📊 TABELA DE CUSTOS ESPECÍFICA:');
        
        const { data: costsSample, error: costsError } = await supabase
            .from('usage_costs')
            .select('*')
            .limit(3);
            
        if (costsError) {
            console.log('   ❌ Tabela usage_costs não encontrada');
            console.log('   💡 Precisaria criar tabela para rastreamento de custos');
        } else {
            console.log('   ✅ Tabela usage_costs encontrada');
        }
        
        // 5. Análise do frontend
        console.log('\n5. 🌐 CAPACIDADE DO FRONTEND...');
        
        console.log('   📊 Dashboard atual:');
        console.log('      ✅ Pode mostrar receita por tenant');
        console.log('      ❌ Não mostra custos por tenant');
        console.log('      ❌ Não calcula margem real');
        console.log('      ❌ Não identifica tenants em prejuízo');
        
        console.log('\n📋 RESUMO DA AUDITORIA:\n');
        
        // Estrutura do relatório
        const auditResults = {
            conversationData: {
                available: !convError && conversationSample?.length > 0,
                hasCostTracking: false,
                needsEnhancement: true
            },
            whatsappData: {
                available: !whatsappError,
                hasUsageTracking: false,
                needsEnhancement: true
            },
            pricingData: {
                available: !tenantsError && tenantsSample?.length > 0,
                hasPricingFields: false,
                needsEnhancement: true
            },
            costTable: {
                available: !costsError,
                needsCreation: !!costsError
            }
        };
        
        console.log('🔍 STATUS ATUAL:');
        Object.entries(auditResults).forEach(([category, status]) => {
            const categoryName = {
                conversationData: 'Dados de Conversação/IA',
                whatsappData: 'Dados de WhatsApp',
                pricingData: 'Dados de Preços',
                costTable: 'Tabela de Custos'
            }[category];
            
            console.log(`   ${status.available ? '✅' : '❌'} ${categoryName}`);
        });
        
        console.log('\n💡 RECOMENDAÇÕES:\n');
        
        console.log('1. 🏗️ ESTRUTURA DE DADOS NECESSÁRIA:');
        console.log('   - Adicionar campos de custo em conversation_history');
        console.log('   - Criar tabela usage_costs para rastreamento detalhado');
        console.log('   - Adicionar campos de preço em tenants');
        console.log('   - Rastrear origem das mensagens (WhatsApp vs outras)');
        
        console.log('\n2. 📊 MÉTRICAS A IMPLEMENTAR:');
        console.log('   - Cost per tenant (IA + WhatsApp + infra)');
        console.log('   - Margem real (receita - custos)');
        console.log('   - ROI por tenant');
        console.log('   - Alertas de tenants em prejuízo');
        
        console.log('\n3. 🌐 FRONTEND ENHANCEMENTS:');
        console.log('   - Widget de "Tenants em Prejuízo"');
        console.log('   - Gráfico "Custo vs Receita" por tenant');
        console.log('   - Dashboard de "Sustainability Metrics"');
        console.log('   - Alertas de usage spikes');
        
        console.log('\n🚀 PRÓXIMOS PASSOS:');
        console.log('1. Criar estrutura de rastreamento de custos');
        console.log('2. Implementar logging de custos de IA');
        console.log('3. Adicionar métricas de margem nas funções');
        console.log('4. Criar dashboard de sustentabilidade');
        
    } catch (error) {
        console.error('❌ Erro na auditoria:', error);
    }
}

auditCostTrackingCapabilities().catch(console.error);