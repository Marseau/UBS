/**
 * INVESTIGAR RECEITA CENTRO EDUCACIONAL
 * De onde veio o valor de R$ 4,110.78?
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function investigarReceitaCentroEducacional() {
    console.log('🔍 INVESTIGANDO RECEITA CENTRO EDUCACIONAL:');
    console.log('='.repeat(50));
    
    // 1. Buscar Centro Educacional
    const { data: centroEducacional } = await supabase
        .from('tenants')
        .select('id, name')
        .ilike('name', '%Centro Educacional%');
    
    if (!centroEducacional || centroEducacional.length === 0) {
        console.log('❌ Centro Educacional não encontrado');
        return;
    }
    
    const tenantId = centroEducacional[0].id;
    console.log(`📋 Centro Educacional ID: ${tenantId}`);
    
    // 2. Appointments completed deste tenant
    const { data: appointmentsCompleted } = await supabase
        .from('appointments')
        .select(`
            id,
            status,
            service_id,
            created_at,
            services (
                name,
                base_price
            )
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .not('services.base_price', 'is', null);
    
    console.log(`📅 Appointments completed: ${appointmentsCompleted?.length || 0}`);
    
    if (appointmentsCompleted && appointmentsCompleted.length > 0) {
        let totalReceita = 0;
        const servicosConta = {};
        
        console.log('\n💰 DETALHAMENTO DA RECEITA:');
        appointmentsCompleted.forEach((apt, i) => {
            const price = parseFloat(apt.services?.base_price) || 0;
            const serviceName = apt.services?.name || 'Sem nome';
            
            totalReceita += price;
            servicosConta[serviceName] = (servicosConta[serviceName] || 0) + 1;
            
            if (i < 10) { // Primeiros 10
                console.log(`${i+1}. ${serviceName}: R$ ${price} (${apt.created_at?.substring(0, 10)})`);
            }
        });
        
        console.log(`\n📊 TOTAL CALCULADO: R$ ${totalReceita.toFixed(2)}`);
        console.log('\n📋 SERVIÇOS MAIS UTILIZADOS:');
        Object.entries(servicosConta)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([servico, count]) => {
                console.log(`   ${servico}: ${count} appointments`);
            });
    }
    
    // 3. Verificar preços dos serviços deste tenant
    const { data: servicesEducacao } = await supabase
        .from('services')
        .select('name, base_price, created_at')
        .eq('tenant_id', tenantId)
        .not('base_price', 'is', null)
        .order('base_price', { ascending: false });
    
    console.log('\n🛠️ SERVIÇOS E PREÇOS (Centro Educacional):');
    servicesEducacao?.forEach((svc, i) => {
        console.log(`${i+1}. ${svc.name}: R$ ${svc.base_price}`);
    });
    
    // 4. Comparar com outros tenants
    console.log('\n📊 COMPARAÇÃO COM OUTROS TENANTS:');
    const { data: receitaComparacao } = await supabase
        .from('appointments')
        .select(`
            tenant_id,
            services (
                base_price
            ),
            tenants (
                name
            )
        `)
        .eq('status', 'completed')
        .not('services.base_price', 'is', null);
    
    const receitaPorTenant = {};
    receitaComparacao?.forEach(apt => {
        const tId = apt.tenant_id;
        const tenantName = apt.tenants?.name;
        const price = parseFloat(apt.services?.base_price) || 0;
        
        if (!receitaPorTenant[tId]) {
            receitaPorTenant[tId] = { name: tenantName, receita: 0, appointments: 0 };
        }
        receitaPorTenant[tId].receita += price;
        receitaPorTenant[tId].appointments++;
    });
    
    Object.entries(receitaPorTenant)
        .sort((a, b) => b[1].receita - a[1].receita)
        .slice(0, 8)
        .forEach(([id, data], i) => {
            console.log(`${i+1}. ${data.name}: R$ ${data.receita.toFixed(2)} (${data.appointments} appointments)`);
        });
    
    // 5. Verificar se há alguma discrepância nos preços
    console.log('\n🔍 ANÁLISE DE DISCREPÂNCIAS:');
    const { data: appointmentsSemPrice } = await supabase
        .from('appointments')
        .select('id, service_id, services (name, base_price)')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .is('services.base_price', null);
    
    console.log(`❌ Appointments completed sem preço: ${appointmentsSemPrice?.length || 0}`);
    
    // 6. Verificar total de appointments deste tenant
    const { count: totalAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
    
    const { count: completedAppointments } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'completed');
    
    console.log(`📊 Total appointments: ${totalAppointments}`);
    console.log(`✅ Completed appointments: ${completedAppointments}`);
    console.log(`📈 Taxa completed: ${((completedAppointments / totalAppointments) * 100).toFixed(1)}%`);
}

investigarReceitaCentroEducacional().catch(console.error);