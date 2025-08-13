/**
 * TESTE DO NOVO SISTEMA DE CÁLCULO DIRETO
 * Valida se os cálculos diretos das tabelas fonte estão corretos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testDirectCalculation() {
    console.log('🧪 TESTANDO NOVO SISTEMA DE CÁLCULO DIRETO');
    console.log('='.repeat(60));
    
    try {
        // Simular o mesmo cálculo que a API faz
        const periodDays = 30;
        const offsetDays = 0;
        const usdRate = 5.59; // Taxa de exemplo
        
        // =====================================================
        // 1. CALCULAR DATAS DO PERÍODO
        // =====================================================
        
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - offsetDays);
        
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - periodDays);
        
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        
        console.log(`📅 Período: ${startDate.toLocaleDateString()} a ${endDate.toLocaleDateString()}`);
        
        // =====================================================
        // 2. CALCULAR MRR REAL DOS TENANTS ATIVOS
        // =====================================================
        
        const { data: activeTenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, subscription_plan, status, business_name')
            .eq('status', 'active');
            
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError);
            return;
        }
        
        // Mapeamento correto de preços dos planos
        const PLAN_PRICES_BRL = {
            'basic': 89.90,
            'basico': 89.90,
            'professional': 179.90,
            'profissional': 179.90,  // Corrigido para valor correto
            'enterprise': 349.90,
            'premium': 249.90,
            'starter': 59.90,
            'free': 0
        };
        
        let totalMrrBrl = 0;
        let activeTenantsCount = 0;
        const planDistribution = {};
        
        console.log('\n🏢 TENANTS ATIVOS:');
        console.log('-'.repeat(50));
        
        activeTenants?.forEach((tenant, index) => {
            const plan = tenant.subscription_plan?.toLowerCase() || 'basic';
            const price = PLAN_PRICES_BRL[plan] || PLAN_PRICES_BRL['basic'];
            totalMrrBrl += price;
            activeTenantsCount++;
            
            planDistribution[plan] = (planDistribution[plan] || 0) + 1;
            
            console.log(`${index + 1}. ${tenant.business_name || 'Sem nome'}`);
            console.log(`   Plano: ${tenant.subscription_plan || 'N/A'} (R$ ${price.toFixed(2)})`);
        });
        
        const totalMrrUsd = totalMrrBrl / usdRate;
        
        console.log('\n💰 MRR CALCULADO:');
        console.log(`   Total MRR (BRL): R$ ${totalMrrBrl.toFixed(2)}`);
        console.log(`   Total MRR (USD): $${totalMrrUsd.toFixed(2)}`);
        console.log(`   Tenants ativos: ${activeTenantsCount}`);
        
        console.log('\n📊 DISTRIBUIÇÃO DE PLANOS:');
        Object.entries(planDistribution).forEach(([plan, count]) => {
            const price = PLAN_PRICES_BRL[plan] || PLAN_PRICES_BRL['basic'];
            console.log(`   ${plan}: ${count} × R$ ${price} = R$ ${(count * price).toFixed(2)}`);
        });
        
        // =====================================================
        // 3. CALCULAR APPOINTMENTS DO PERÍODO
        // =====================================================
        
        const { count: totalAppointments } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso);
            
        const { count: cancelledAppointments } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .eq('status', 'cancelled');
        
        const cancellationRate = totalAppointments > 0 ? 
            ((cancelledAppointments || 0) / totalAppointments) * 100 : 0;
        
        console.log('\n📅 APPOINTMENTS:');
        console.log(`   Total: ${totalAppointments || 0}`);
        console.log(`   Cancelados: ${cancelledAppointments || 0}`);
        console.log(`   Taxa cancelamento: ${cancellationRate.toFixed(1)}%`);
        
        // =====================================================
        // 4. CALCULAR INTERAÇÕES IA
        // =====================================================
        
        const { count: totalMessages } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso);
        
        console.log('\n💬 CONVERSAS:');
        console.log(`   Total mensagens: ${totalMessages || 0}`);
        
        // =====================================================
        // 5. CALCULAR CLIENTES ÚNICOS
        // =====================================================
        
        const { data: uniqueUsers } = await supabase
            .from('appointments')
            .select('user_id')
            .gte('created_at', startIso)
            .lt('created_at', endIso);
            
        const uniqueCustomers = uniqueUsers ? 
            new Set(uniqueUsers.map(u => u.user_id)).size : 0;
        
        console.log('\n👥 CLIENTES:');
        console.log(`   Clientes únicos: ${uniqueCustomers}`);
        
        // =====================================================
        // 6. COMPARAR COM VALORES ANTIGOS DA API
        // =====================================================
        
        console.log('\n🔍 COMPARAÇÃO COM API ANTERIOR:');
        console.log('-'.repeat(50));
        console.log('| Métrica | API Antiga | Novo Cálculo | Status |');
        console.log('|---------|------------|--------------|--------|');
        console.log(`| MRR | R$ 190.646 | R$ ${totalMrrBrl.toFixed(2)} | ${totalMrrBrl > 1000 ? '✅ CORRIGIDO' : '⚠️ Verificar'} |`);
        console.log(`| Appointments | 1.513 | ${totalAppointments || 0} | ${(totalAppointments || 0) > 1500 ? '✅ REAL' : '⚠️ Pode estar baixo'} |`);
        console.log(`| AI Interactions | 1.495 | ${totalMessages || 0} | ${(totalMessages || 0) > 1500 ? '✅ REAL' : '⚠️ Pode estar baixo'} |`);
        console.log(`| Active Tenants | 11 | ${activeTenantsCount} | ${activeTenantsCount === 11 ? '✅ CORRETO' : '⚠️ Diferença'} |`);
        
        // =====================================================
        // 7. VERIFICAR DADOS HISTÓRICOS PARA COMPARAÇÃO
        // =====================================================
        
        console.log('\n📊 DADOS HISTÓRICOS (90 dias para comparação):');
        
        const start90 = new Date();
        start90.setDate(start90.getDate() - 90);
        
        const { count: appointments90d } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', start90.toISOString());
            
        const { count: messages90d } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', start90.toISOString());
        
        console.log(`   Appointments (90d): ${appointments90d || 0}`);
        console.log(`   Messages (90d): ${messages90d || 0}`);
        
        // =====================================================
        // 8. CONCLUSÃO
        // =====================================================
        
        console.log('\n🎯 CONCLUSÃO:');
        console.log('-'.repeat(30));
        
        if (totalMrrBrl < 10000 && totalMrrBrl > 500) {
            console.log('✅ MRR agora parece realista (R$ 500-10.000)');
        } else {
            console.log('⚠️ MRR ainda pode ter problemas');
        }
        
        if ((totalAppointments || 0) > 1000) {
            console.log('✅ Appointments em quantidade esperada');
        } else {
            console.log('⚠️ Appointments podem estar baixos para o período');
        }
        
        if ((totalMessages || 0) > 1000) {
            console.log('✅ Mensagens em quantidade esperada');
        } else {
            console.log('⚠️ Mensagens podem estar baixas para o período');
        }
        
        console.log('\n✅ Teste do cálculo direto concluído!');
        
    } catch (error) {
        console.error('💥 Erro no teste:', error);
    }
}

testDirectCalculation().catch(console.error);