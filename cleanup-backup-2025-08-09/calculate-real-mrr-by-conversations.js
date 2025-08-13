/**
 * CALCULAR MRR REAL BASEADO NO CONSUMO DE CONVERSAS
 * MRR = Soma do que cada tenant paga baseado nas conversas que teve
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function calculateRealMRRByConversations() {
    console.log('💰 CALCULANDO MRR REAL BASEADO EM CONVERSAS');
    console.log('='.repeat(60));
    
    try {
        // =====================================================
        // 1. BUSCAR TENANTS ATIVOS
        // =====================================================
        
        const { data: activeTenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');
            
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        console.log(`🏢 Tenants ativos: ${activeTenants?.length || 0}`);
        
        // =====================================================
        // 2. CALCULAR PERÍODO (ÚLTIMO MÊS)
        // =====================================================
        
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30); // Últimos 30 dias
        
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        
        console.log(`📅 Período: ${startDate.toLocaleDateString()} a ${endDate.toLocaleDateString()}`);
        
        // =====================================================
        // 3. TABELA DE PREÇOS DA LANDING (OFICIAL)
        // =====================================================
        
        function calculatePriceByConversations(conversations) {
            if (conversations <= 200) {
                return { plan: 'Básico', price: 58.00, conversations };
            } else if (conversations <= 400) {
                return { plan: 'Profissional', price: 116.00, conversations };
            } else if (conversations <= 1250) {
                return { plan: 'Enterprise', price: 290.00, conversations };
            } else {
                // Enterprise + excedentes
                const excedentes = conversations - 1250;
                const precoExcedente = excedentes * 0.25;
                return { 
                    plan: 'Enterprise+', 
                    price: 290.00 + precoExcedente, 
                    conversations,
                    excedentes,
                    precoExcedente
                };
            }
        }
        
        // =====================================================
        // 4. CALCULAR CONVERSAS POR TENANT
        // =====================================================
        
        console.log('\\n📊 CALCULANDO CONVERSAS E MRR POR TENANT:');
        console.log('-'.repeat(70));
        
        let totalMRR = 0;
        const tenantResults = [];
        
        for (const tenant of activeTenants) {
            // Buscar conversas do tenant (mensagens recebidas de usuários)
            const { count: conversations, error: conversationsError } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .eq('is_from_user', true)
                .gte('created_at', startIso)
                .lt('created_at', endIso);
                
            if (conversationsError) {
                console.log(`❌ Erro ao buscar conversas do tenant ${tenant.business_name}:`, conversationsError.message);
                continue;
            }
            
            const conversationsCount = conversations || 0;
            const pricing = calculatePriceByConversations(conversationsCount);
            
            totalMRR += pricing.price;
            tenantResults.push({
                tenant: tenant.business_name,
                tenantId: tenant.id,
                conversations: conversationsCount,
                plan: pricing.plan,
                price: pricing.price,
                excedentes: pricing.excedentes || 0,
                precoExcedente: pricing.precoExcedente || 0
            });
            
            console.log(`${tenantResults.length}. ${tenant.business_name}`);
            console.log(`   Conversas: ${conversationsCount}`);
            console.log(`   Plano aplicado: ${pricing.plan}`);
            console.log(`   Valor: R$ ${pricing.price.toFixed(2)}`);
            if (pricing.excedentes) {
                console.log(`   Excedentes: ${pricing.excedentes} × R$ 0,25 = R$ ${pricing.precoExcedente.toFixed(2)}`);
            }
            console.log('');
        }
        
        // =====================================================
        // 5. RESUMO DO MRR REAL
        // =====================================================
        
        console.log('💰 RESUMO MRR REAL DA PLATAFORMA:');
        console.log('='.repeat(60));
        console.log(`📊 Total MRR: R$ ${totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`🏢 Tenants processados: ${tenantResults.length}`);
        console.log(`💬 Total de conversas: ${tenantResults.reduce((sum, t) => sum + t.conversations, 0)}`);
        
        // =====================================================
        // 6. DISTRIBUIÇÃO POR PLANO
        // =====================================================
        
        console.log('\\n📊 DISTRIBUIÇÃO POR PLANO:');
        console.log('-'.repeat(50));
        
        const planSummary = {};
        tenantResults.forEach(result => {
            const planKey = result.plan;
            if (!planSummary[planKey]) {
                planSummary[planKey] = { count: 0, revenue: 0, conversations: 0 };
            }
            planSummary[planKey].count++;
            planSummary[planKey].revenue += result.price;
            planSummary[planKey].conversations += result.conversations;
        });
        
        Object.entries(planSummary).forEach(([plan, data]) => {
            const percentage = ((data.revenue / totalMRR) * 100).toFixed(1);
            console.log(`${plan}:`);
            console.log(`   ${data.count} tenants`);
            console.log(`   ${data.conversations} conversas`);
            console.log(`   R$ ${data.revenue.toFixed(2)} (${percentage}%)`);
            console.log('');
        });
        
        // =====================================================
        // 7. COMPARAR COM MRR ATUAL DO SISTEMA
        // =====================================================
        
        console.log('🔍 COMPARAÇÃO COM SISTEMA ATUAL:');
        console.log('-'.repeat(50));
        
        try {
            const apiResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (apiResponse.ok) {
                const apiData = await apiResponse.json();
                const currentMRR = apiData.data?.kpis?.mrrPlatform?.value;
                
                console.log(`🔌 MRR Sistema Atual: R$ ${currentMRR?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || 'N/A'}`);
                console.log(`💰 MRR Real (por conversas): R$ ${totalMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
                
                if (currentMRR) {
                    const difference = currentMRR - totalMRR;
                    const percentageDiff = ((difference / totalMRR) * 100).toFixed(1);
                    
                    console.log(`📊 Diferença: R$ ${difference.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentageDiff}%)`);
                    
                    if (Math.abs(difference) > 50) {
                        console.log('❌ SISTEMA ESTÁ INCORRETO!');
                        console.log('💡 Deve usar: Conversas reais × Tabela de preços');
                    } else {
                        console.log('✅ Sistema está próximo do correto');
                    }
                }
            }
        } catch (error) {
            console.log('⚠️ Erro ao comparar com API:', error.message);
        }
        
        // =====================================================
        // 8. TENANTS COM MAIOR/MENOR RECEITA
        // =====================================================
        
        console.log('\\n🏆 TOP TENANTS POR RECEITA:');
        console.log('-'.repeat(50));
        
        const sortedByRevenue = [...tenantResults].sort((a, b) => b.price - a.price);
        
        sortedByRevenue.slice(0, 5).forEach((result, index) => {
            console.log(`${index + 1}. ${result.tenant}`);
            console.log(`   R$ ${result.price.toFixed(2)} (${result.conversations} conversas)`);
        });
        
        console.log('\\n📉 TENANTS COM MENOR RECEITA:');
        console.log('-'.repeat(50));
        
        sortedByRevenue.slice(-3).forEach((result, index) => {
            console.log(`${index + 1}. ${result.tenant}`);
            console.log(`   R$ ${result.price.toFixed(2)} (${result.conversations} conversas)`);
        });
        
        // =====================================================
        // 9. INSIGHTS DE NEGÓCIO
        // =====================================================
        
        console.log('\\n💡 INSIGHTS DE NEGÓCIO:');
        console.log('='.repeat(60));
        
        const avgRevenuePerTenant = totalMRR / tenantResults.length;
        const avgConversationsPerTenant = tenantResults.reduce((sum, t) => sum + t.conversations, 0) / tenantResults.length;
        
        console.log(`📊 Receita média por tenant: R$ ${avgRevenuePerTenant.toFixed(2)}`);
        console.log(`💬 Conversas médias por tenant: ${avgConversationsPerTenant.toFixed(0)}`);
        console.log(`💰 Receita por conversa: R$ ${(totalMRR / tenantResults.reduce((sum, t) => sum + t.conversations, 0)).toFixed(2)}`);
        
        const tenantsWithExcess = tenantResults.filter(t => t.excedentes > 0);
        if (tenantsWithExcess.length > 0) {
            console.log(`🚀 Tenants com excedente: ${tenantsWithExcess.length}`);
            console.log(`💸 Receita de excedentes: R$ ${tenantsWithExcess.reduce((sum, t) => sum + t.precoExcedente, 0).toFixed(2)}`);
        }
        
        console.log('\\n🎯 PRÓXIMOS PASSOS:');
        console.log('1. Atualizar sistema para calcular MRR baseado em conversas reais');
        console.log('2. Implementar cobrança automática baseada no consumo');
        console.log('3. Configurar alertas de upgrade automático');
        console.log('4. Validar se subscription_plan reflete o uso real');
        
        return {
            totalMRR,
            tenantResults,
            planSummary
        };
        
    } catch (error) {
        console.error('💥 Erro no cálculo:', error);
    }
}

calculateRealMRRByConversations().catch(console.error);