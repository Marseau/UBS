/**
 * CALCULAR MÉTRICAS CORRETAS COM TODOS OS DADOS
 * Conversas = registros com conversation_outcome
 * Incluindo minutos, custos, confidence_score
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function calculateCorrectMetrics() {
    console.log('📊 MÉTRICAS COMPLETAS COM DADOS CORRETOS');
    console.log('='.repeat(60));
    
    const startJuly = '2025-07-01';
    const endJuly = '2025-07-31';
    
    try {
        // =====================================================
        // 1. BUSCAR CONVERSAS REAIS (com conversation_outcome)
        // =====================================================
        
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                tenant_id, 
                conversation_outcome, 
                confidence_score, 
                api_cost_usd, 
                processing_cost_usd, 
                conversation_context, 
                created_at,
                tokens_used
            `)
            .not('conversation_outcome', 'is', null)
            .gte('created_at', startJuly)
            .lte('created_at', endJuly);
            
        if (error) {
            console.error('❌ Erro:', error);
            return;
        }
        
        console.log(`💬 CONVERSAS REAIS (com outcome): ${conversations?.length || 0}`);
        
        // =====================================================
        // 2. CALCULAR MÉTRICAS AGREGADAS
        // =====================================================
        
        let totalMinutes = 0;
        let totalCostUsd = 0;
        let validConversations = 0;
        let spamConversations = 0;
        let totalTokens = 0;
        
        const tenantConversations = {};
        const outcomes = {};
        
        conversations?.forEach(conv => {
            // Extrair minutos do conversation_context
            let minutes = 5; // default
            if (conv.conversation_context) {
                try {
                    const context = typeof conv.conversation_context === 'string' 
                        ? JSON.parse(conv.conversation_context) 
                        : conv.conversation_context;
                    minutes = context.duration_minutes || 
                             context.chat_duration || 
                             context.minutes || 5;
                } catch (e) {
                    minutes = 5;
                }
            }
            
            totalMinutes += minutes;
            
            // Custo total (API + processing)
            const apiCost = conv.api_cost_usd || 0;
            const procCost = conv.processing_cost_usd || 0;
            totalCostUsd += (apiCost + procCost);
            
            // Tokens
            totalTokens += conv.tokens_used || 0;
            
            // Qualidade da conversa
            if (conv.confidence_score >= 0.7) {
                validConversations++;
            } else {
                spamConversations++;
            }
            
            // Outcomes
            if (conv.conversation_outcome) {
                outcomes[conv.conversation_outcome] = (outcomes[conv.conversation_outcome] || 0) + 1;
            }
            
            // Agrupar por tenant
            if (!tenantConversations[conv.tenant_id]) {
                tenantConversations[conv.tenant_id] = {
                    count: 0,
                    minutes: 0,
                    cost: 0,
                    tokens: 0,
                    valid: 0,
                    spam: 0
                };
            }
            
            const tenant = tenantConversations[conv.tenant_id];
            tenant.count++;
            tenant.minutes += minutes;
            tenant.cost += (apiCost + procCost);
            tenant.tokens += (conv.tokens_used || 0);
            
            if (conv.confidence_score >= 0.7) {
                tenant.valid++;
            } else {
                tenant.spam++;
            }
        });
        
        console.log('');
        console.log('📊 MÉTRICAS AGREGADAS:');
        console.log('='.repeat(40));
        console.log(`⏱️ Total minutos: ${totalMinutes.toFixed(1)}`);
        console.log(`💰 Custo total: $${totalCostUsd.toFixed(4)}`);
        console.log(`🎯 Total tokens: ${totalTokens.toLocaleString()}`);
        console.log(`✅ Conversas válidas: ${validConversations}`);
        console.log(`🚫 Conversas spam: ${spamConversations}`);
        console.log(`📊 Taxa spam: ${((spamConversations / conversations.length) * 100).toFixed(1)}%`);
        console.log(`⏱️ Duração média: ${(totalMinutes / conversations.length).toFixed(1)} min/conversa`);
        console.log(`💰 Custo médio: $${(totalCostUsd / conversations.length).toFixed(4)}/conversa`);
        console.log(`🎯 Tokens médios: ${Math.round(totalTokens / conversations.length)}/conversa`);
        
        // =====================================================
        // 3. OUTCOMES DAS CONVERSAS
        // =====================================================
        
        console.log('');
        console.log('🎯 OUTCOMES DAS CONVERSAS:');
        console.log('-'.repeat(40));
        Object.entries(outcomes).forEach(([outcome, count]) => {
            const percentage = ((count / conversations.length) * 100).toFixed(1);
            console.log(`${outcome}: ${count} (${percentage}%)`);
        });
        
        // =====================================================
        // 4. BUSCAR NOMES DOS TENANTS
        // =====================================================
        
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active');
            
        const tenantNames = {};
        tenants?.forEach(t => {
            tenantNames[t.id] = t.business_name;
        });
        
        // =====================================================
        // 5. CALCULAR MRR BASEADO EM CONVERSAS REAIS
        // =====================================================
        
        console.log('');
        console.log('💰 MRR POR TENANT (BASEADO EM CONVERSAS REAIS):');
        console.log('='.repeat(60));
        
        let totalMRR = 0;
        const planDistribution = {};
        
        Object.entries(tenantConversations).forEach(([tenantId, data]) => {
            const conversas = data.count;
            let price = 0;
            let plan = '';
            
            // Aplicar tabela de preços da landing
            if (conversas <= 200) {
                price = 58;
                plan = 'Básico';
            } else if (conversas <= 400) {
                price = 116;
                plan = 'Profissional';
            } else if (conversas <= 1250) {
                price = 290;
                plan = 'Enterprise';
            } else {
                const excedentes = conversas - 1250;
                price = 290 + (excedentes * 0.25);
                plan = `Enterprise+ (${excedentes} exc.)`;
            }
            
            totalMRR += price;
            planDistribution[plan] = (planDistribution[plan] || 0) + 1;
            
            const tenantName = tenantNames[tenantId] || 'Tenant desconhecido';
            const qualityPct = data.count > 0 ? ((data.valid / data.count) * 100).toFixed(1) : '0';
            
            console.log(`${tenantName}:`);
            console.log(`   💬 ${conversas} conversas → ${plan} → R$ ${price.toFixed(2)}`);
            console.log(`   ⏱️ ${data.minutes.toFixed(1)} min total (${(data.minutes/data.count).toFixed(1)} min/conversa)`);
            console.log(`   💰 $${data.cost.toFixed(4)} custo ($${(data.cost/data.count).toFixed(4)}/conversa)`);
            console.log(`   ✅ ${qualityPct}% qualidade (${data.valid}/${data.count})`);
            console.log('');
        });
        
        // =====================================================
        // 6. RESUMO FINAL E COMPARAÇÃO
        // =====================================================
        
        console.log('🎯 RESUMO FINAL:');
        console.log('='.repeat(60));
        console.log(`💰 MRR REAL DA PLATAFORMA: R$ ${totalMRR.toFixed(2)}`);
        console.log(`💬 Total conversas julho: ${conversations.length}`);
        console.log(`⏱️ Total minutos julho: ${totalMinutes.toFixed(1)}`);
        console.log(`💰 Custo total julho: $${totalCostUsd.toFixed(4)}`);
        console.log(`📊 Tenants ativos: ${Object.keys(tenantConversations).length}`);
        
        console.log('');
        console.log('📊 DISTRIBUIÇÃO POR PLANO:');
        Object.entries(planDistribution).forEach(([plan, count]) => {
            console.log(`   ${plan}: ${count} tenants`);
        });
        
        // Comparar com sistema atual
        try {
            const response = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (response.ok) {
                const apiData = await response.json();
                const currentMRR = apiData.data?.kpis?.mrrPlatform?.value;
                
                console.log('');
                console.log('🔍 COMPARAÇÃO COM SISTEMA:');
                console.log(`API atual: R$ ${currentMRR?.toFixed(2) || 'N/A'}`);
                console.log(`MRR real: R$ ${totalMRR.toFixed(2)}`);
                
                if (currentMRR) {
                    const diff = Math.abs(currentMRR - totalMRR);
                    if (diff > 50) {
                        console.log(`❌ Diferença: R$ ${diff.toFixed(2)} - SISTEMA INCORRETO`);
                    } else {
                        console.log(`✅ Diferença: R$ ${diff.toFixed(2)} - Sistema correto`);
                    }
                }
            }
        } catch (e) {
            console.log('⚠️ Não foi possível comparar com API');
        }
        
        console.log('');
        console.log('✅ MÉTRICAS COMPLETAS CALCULADAS COM DADOS CORRETOS!');
        
        return {
            totalMRR,
            totalConversations: conversations.length,
            totalMinutes,
            totalCostUsd,
            validConversations,
            spamConversations,
            tenantConversations,
            outcomes
        };
        
    } catch (error) {
        console.error('💥 Erro no cálculo:', error);
    }
}

calculateCorrectMetrics().catch(console.error);