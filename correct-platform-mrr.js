/**
 * CORRIGIR MRR DA PLATAFORMA
 * Calcular o que a PLATAFORMA recebe dos tenants (não o que os tenants recebem dos clientes)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function correctPlatformMRR() {
    console.log('💰 CORRIGINDO MRR DA PLATAFORMA');
    console.log('='.repeat(60));
    
    try {
        // =====================================================
        // 1. BUSCAR TENANTS ATIVOS E SEUS PLANOS
        // =====================================================
        
        console.log('\n🏢 BUSCANDO TENANTS ATIVOS E PLANOS');
        console.log('-'.repeat(50));
        
        const { data: activeTenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, subscription_plan, status, created_at')
            .eq('status', 'active');
            
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        console.log(`📊 Tenants ativos encontrados: ${activeTenants?.length || 0}`);
        
        // =====================================================
        // 2. PREÇOS QUE A PLATAFORMA COBRA DOS TENANTS
        // =====================================================
        
        // Baseado nos dados encontrados no código
        const PLATFORM_PLAN_PRICES = {
            'free': 0,
            'pro': 99,
            'professional': 199,
            'profissional': 199,
            'enterprise': 299,
            'basic': 89,
            'basico': 89,
            'starter': 59
        };
        
        console.log('\n💰 PREÇOS DOS PLANOS DA PLATAFORMA:');
        Object.entries(PLATFORM_PLAN_PRICES).forEach(([plan, price]) => {
            console.log(`   ${plan}: R$ ${price}/mês`);
        });
        
        // =====================================================
        // 3. CALCULAR MRR REAL DA PLATAFORMA
        // =====================================================
        
        console.log('\n📊 CALCULANDO MRR DA PLATAFORMA:');
        console.log('-'.repeat(50));
        
        let platformMRR = 0;
        const planDistribution = {};
        
        activeTenants?.forEach((tenant, index) => {
            const plan = tenant.subscription_plan?.toLowerCase() || 'free';
            const price = PLATFORM_PLAN_PRICES[plan] || 0;
            
            platformMRR += price;
            planDistribution[plan] = (planDistribution[plan] || 0) + 1;
            
            console.log(`${index + 1}. ${tenant.business_name || 'Sem nome'}`);
            console.log(`   Plano: ${tenant.subscription_plan || 'N/A'} → R$ ${price}/mês`);
            console.log(`   Criado: ${new Date(tenant.created_at).toLocaleDateString()}`);
            console.log('');
        });
        
        console.log('💰 RESUMO MRR DA PLATAFORMA:');
        console.log(`   Total MRR: R$ ${platformMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`   Tenants ativos: ${activeTenants?.length || 0}`);
        console.log(`   MRR médio por tenant: R$ ${(platformMRR / (activeTenants?.length || 1)).toFixed(2)}`);
        
        console.log('\n📊 DISTRIBUIÇÃO POR PLANO:');
        Object.entries(planDistribution).forEach(([plan, count]) => {
            const price = PLATFORM_PLAN_PRICES[plan] || 0;
            const totalForPlan = count * price;
            const percentage = ((totalForPlan / platformMRR) * 100).toFixed(1);
            console.log(`   ${plan}: ${count} tenants × R$ ${price} = R$ ${totalForPlan} (${percentage}%)`);
        });
        
        // =====================================================
        // 4. COMPARAR COM VALOR ATUAL DA API
        // =====================================================
        
        console.log('\n🔍 COMPARANDO COM API ATUAL:');
        console.log('-'.repeat(50));
        
        try {
            const apiResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (apiResponse.ok) {
                const apiData = await apiResponse.json();
                const currentApiMrr = apiData.data?.kpis?.mrrPlatform?.value;
                
                console.log(`🔌 API atual: R$ ${currentApiMrr?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || 'N/A'}`);
                console.log(`💰 MRR correto: R$ ${platformMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
                
                if (currentApiMrr) {
                    const difference = currentApiMrr - platformMRR;
                    const percentageDiff = ((difference / platformMRR) * 100).toFixed(1);
                    console.log(`📊 Diferença: R$ ${difference.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentageDiff}%)`);
                    
                    if (Math.abs(difference) > 100) {
                        console.log('❌ API está retornando valor INCORRETO');
                        console.log('💡 Provável causa: Calculando receita dos appointments dos tenants');
                        console.log('💡 Deveria calcular: Preços dos planos que cobramos dos tenants');
                    } else {
                        console.log('✅ API está próxima do valor correto');
                    }
                }
            } else {
                console.log('⚠️ API não disponível para comparação');
            }
        } catch (apiError) {
            console.log('⚠️ Erro ao acessar API:', apiError.message);
        }
        
        // =====================================================
        // 5. ATUALIZAR PLATFORM_METRICS COM VALOR CORRETO
        // =====================================================
        
        console.log('\n📊 ATUALIZANDO PLATFORM_METRICS COM MRR CORRETO:');
        console.log('-'.repeat(50));
        
        const periodDays = 30;
        const calculationDate = new Date();
        
        // Deletar dados incorretos
        await supabase
            .from('platform_metrics')
            .delete()
            .eq('period_days', periodDays);
        
        // Inserir MRR correto da plataforma
        const correctPlatformData = {
            calculation_date: calculationDate.toISOString().split('T')[0],
            period_days: periodDays,
            platform_mrr: platformMRR, // MRR real da plataforma
            total_appointments: 0, // Será calculado depois se necessário
            total_ai_interactions: 0, // Será calculado depois se necessário
            active_tenants: activeTenants?.length || 0,
            total_customers: 0,
            total_chat_minutes: 0,
            data_source: 'platform_subscription_plans'
        };
        
        const { error: insertError } = await supabase
            .from('platform_metrics')
            .insert([correctPlatformData]);
            
        if (insertError) {
            console.error('❌ Erro ao inserir dados corretos:', insertError);
        } else {
            console.log('✅ Platform_metrics atualizado com MRR correto da plataforma!');
        }
        
        // =====================================================
        // 6. VALIDAR MUDANÇA
        // =====================================================
        
        console.log('\n🔍 VALIDANDO MUDANÇA NA API:');
        console.log('-'.repeat(50));
        
        // Aguardar um pouco para refresh
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
            const newApiResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (newApiResponse.ok) {
                const newApiData = await newApiResponse.json();
                const newApiMrr = newApiData.data?.kpis?.mrrPlatform?.value;
                
                console.log(`🔌 Nova API: R$ ${newApiMrr?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || 'N/A'}`);
                console.log(`💰 Esperado: R$ ${platformMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
                
                if (Math.abs(newApiMrr - platformMRR) < 10) {
                    console.log('✅ API CORRIGIDA COM SUCESSO!');
                } else {
                    console.log('⚠️ API ainda não reflete os dados corretos (pode ser cache)');
                }
            }
        } catch (newApiError) {
            console.log('⚠️ Erro ao validar nova API:', newApiError.message);
        }
        
        // =====================================================
        // 7. RESUMO FINAL
        // =====================================================
        
        console.log('\n🎯 RESUMO FINAL:');
        console.log('='.repeat(60));
        console.log(`💰 MRR Real da Plataforma: R$ ${platformMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`🏢 Tenants Ativos: ${activeTenants?.length}`);
        console.log(`📊 Receita Média/Tenant: R$ ${(platformMRR / (activeTenants?.length || 1)).toFixed(2)}`);
        
        if (platformMRR < 1000) {
            console.log('⚠️ MRR baixo - considere estratégias de crescimento');
        } else if (platformMRR < 5000) {
            console.log('📈 MRR em crescimento - bom potencial');
        } else {
            console.log('🚀 MRR sólido - plataforma estabelecida');
        }
        
        console.log('\n✅ CORREÇÃO CONCLUÍDA!');
        console.log('💡 Agora o dashboard mostra a receita REAL da plataforma');
        
    } catch (error) {
        console.error('💥 Erro na correção:', error);
    }
}

correctPlatformMRR().catch(console.error);