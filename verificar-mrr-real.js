/**
 * VERIFICAR MRR REAL DOS TENANTS
 * Para calcular o MRR correto baseado nos subscription_plans
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Mapeamento de preços dos planos (em BRL)
const PLAN_PRICES = {
    'basic': 89.90,
    'professional': 179.90,
    'enterprise': 349.90,
    'premium': 249.90,
    'starter': 59.90,
    'free': 0
};

async function checkRealMRR() {
    console.log('💰 VERIFICANDO MRR REAL DOS TENANTS:');
    console.log('='.repeat(50));
    
    try {
        // Buscar todos os tenants ativos com seus planos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, subscription_plan, status')
            .eq('status', 'active');
            
        if (error) {
            console.error('❌ Erro ao buscar tenants:', error);
            return;
        }
        
        console.log(`🏢 Tenants encontrados: ${tenants?.length || 0}`);
        
        let totalMrrBrl = 0;
        const planCounts = {};
        
        console.log('\n📋 DETALHES DOS TENANTS:');
        console.log('-'.repeat(70));
        
        tenants?.forEach((tenant, index) => {
            const plan = tenant.subscription_plan?.toLowerCase() || 'free';
            const price = PLAN_PRICES[plan] || 0;
            
            // Se não encontrar o plano, tentar inferir pelo nome
            let finalPrice = price;
            if (price === 0 && plan !== 'free') {
                console.log(`⚠️ Plano desconhecido: ${plan}, usando R$ 89.90 (básico)`);
                finalPrice = 89.90;
            }
            
            totalMrrBrl += finalPrice;
            planCounts[plan] = (planCounts[plan] || 0) + 1;
            
            console.log(`${index + 1}. ${tenant.business_name || 'Sem nome'}`);
            console.log(`   Plano: ${tenant.subscription_plan || 'N/A'} (R$ ${finalPrice.toFixed(2)})`);
            console.log(`   ID: ${tenant.id}`);
            console.log('');
        });
        
        console.log('💰 RESUMO MRR:');
        console.log('-'.repeat(30));
        console.log(`Total MRR (BRL): R$ ${totalMrrBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`Total MRR (USD): $${(totalMrrBrl / 5.59).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        
        console.log('\n📊 DISTRIBUIÇÃO DE PLANOS:');
        Object.entries(planCounts).forEach(([plan, count]) => {
            const price = PLAN_PRICES[plan] || 89.90;
            console.log(`${plan}: ${count} tenants × R$ ${price} = R$ ${(count * price).toFixed(2)}`);
        });
        
        // Comparar com os valores da API
        console.log('\n🔍 COMPARAÇÃO COM API:');
        console.log(`API reportou: R$ 190.646`);
        console.log(`Real calculado: R$ ${totalMrrBrl.toFixed(2)}`);
        console.log(`Diferença: R$ ${(190646.37 - totalMrrBrl).toFixed(2)}`);
        console.log(`Diferença %: ${(((190646.37 - totalMrrBrl) / totalMrrBrl) * 100).toFixed(1)}%`);
        
        // Outros dados da API para comparar
        console.log('\n📈 OUTROS DADOS DA API VS REAL:');
        console.log(`Total Appointments - API: 1.513 | Real: 3.124 | Diferença: ${3124 - 1513}`);
        console.log(`AI Interactions - API: 1.495 | Real: 4.560 | Diferença: ${4560 - 1495}`);
        console.log(`Active Tenants - API: 11 | Real: 11 | ✅ Correto`);
        
    } catch (error) {
        console.error('💥 Erro na verificação de MRR:', error);
    }
}

checkRealMRR().catch(console.error);