require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugReceitasPostgreSQLFunction() {
    console.log('🔍 DEBUG: POR QUE AS RECEITAS NÃO ESTÃO SENDO TRANSFERIDAS');
    console.log('='.repeat(80));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Verificar se appointments têm preços
        console.log('💰 TESTE 1: Verificar preços reais nos appointments');
        const { data: appointments } = await client
            .from('appointments')
            .select('tenant_id, quoted_price, currency, status, created_at')
            .not('quoted_price', 'is', null)
            .gt('quoted_price', 0)
            .limit(5);
            
        if (appointments?.length > 0) {
            console.log('✅ Appointments com preços encontrados:');
            let totalReal = 0;
            appointments.forEach((apt, i) => {
                console.log(`   ${i+1}. Tenant: ${apt.tenant_id.substring(0,8)} | R$ ${apt.quoted_price} | ${apt.status}`);
                totalReal += apt.quoted_price || 0;
            });
            console.log(`   💰 Total amostra: R$ ${totalReal}`);
        } else {
            console.log('❌ Nenhum appointment com preço > 0 encontrado!');
        }
        
        // 2. Testar a PostgreSQL function diretamente
        console.log('\n📊 TESTE 2: Testar get_tenant_metrics_for_period diretamente');
        
        const tenantComDados = 'fe2fa876-05da-49b5-b266-8141bcd090fa'; // Clínica Mente Sã
        
        const { data: functionResult, error: functionError } = await client
            .rpc('get_tenant_metrics_for_period', {
                p_tenant_id: tenantComDados,
                p_start_date: '2025-05-09',
                p_end_date: '2025-08-07',
                p_period_type: '90d'
            });
            
        if (functionError) {
            console.log('❌ Erro na function:', functionError);
        } else {
            console.log('✅ Function result:');
            console.log(`   💰 Revenue: R$ ${functionResult.monthly_revenue || 0}`);
            console.log(`   📅 Appointments: ${functionResult.total_appointments || 0}`);
            console.log(`   📊 Success Rate: ${functionResult.appointment_success_rate || 0}%`);
            console.log(`   🎯 Average Value: R$ ${functionResult.average_value || 0}`);
        }
        
        // 3. Verificar query manual de appointments para este tenant
        console.log('\n🔍 TESTE 3: Query manual de appointments para este tenant');
        
        const { data: tenantAppointments } = await client
            .from('appointments')
            .select('quoted_price, status, created_at')
            .eq('tenant_id', tenantComDados)
            .gte('created_at', '2025-05-09')
            .lte('created_at', '2025-08-07')
            .not('quoted_price', 'is', null);
            
        if (tenantAppointments?.length > 0) {
            const totalManual = tenantAppointments.reduce((sum, apt) => sum + (apt.quoted_price || 0), 0);
            const confirmedAppointments = tenantAppointments.filter(a => a.status === 'confirmed');
            const completedAppointments = tenantAppointments.filter(a => a.status === 'completed');
            
            console.log('✅ Query manual:');
            console.log(`   📅 Total appointments: ${tenantAppointments.length}`);
            console.log(`   ✅ Confirmed: ${confirmedAppointments.length}`);
            console.log(`   🎯 Completed: ${completedAppointments.length}`);
            console.log(`   💰 Revenue total: R$ ${totalManual}`);
            console.log(`   💰 Average: R$ ${(totalManual / tenantAppointments.length).toFixed(2)}`);
        } else {
            console.log('❌ Nenhum appointment encontrado para este tenant!');
        }
        
        // 4. Comparar com o que foi salvo em tenant_metrics
        console.log('\n📊 TESTE 4: Comparar com tenant_metrics salvo');
        
        const { data: savedMetrics } = await client
            .from('tenant_metrics')
            .select('comprehensive_metrics, period')
            .eq('tenant_id', tenantComDados)
            .eq('period', '90d')
            .limit(1);
            
        if (savedMetrics?.length > 0) {
            const comp = savedMetrics[0].comprehensive_metrics || {};
            console.log('📋 Dados salvos em tenant_metrics:');
            console.log(`   💰 total_revenue: R$ ${comp.total_revenue || 0}`);
            console.log(`   📅 total_appointments: ${comp.total_appointments || 0}`);
            console.log(`   💰 monthly_revenue_brl: R$ ${comp.monthly_revenue_brl || 0}`);
            console.log(`   🎯 average_appointment_value: R$ ${comp.average_appointment_value || 0}`);
        } else {
            console.log('❌ Nenhum dado salvo em tenant_metrics para este tenant!');
        }
        
        // DIAGNÓSTICO
        console.log('\n' + '='.repeat(80));
        console.log('🎯 DIAGNÓSTICO:');
        
        const hasRealAppointments = appointments && appointments.length > 0;
        const functionWorking = functionResult && functionResult.monthly_revenue > 0;
        const metricsHaveRevenue = savedMetrics?.length > 0 && 
                                 savedMetrics[0].comprehensive_metrics?.total_revenue > 0;
        
        if (hasRealAppointments && functionWorking && !metricsHaveRevenue) {
            console.log('🔍 PROBLEMA IDENTIFICADO:');
            console.log('   ✅ Appointments reais existem');
            console.log('   ✅ PostgreSQL function retorna valores corretos');
            console.log('   ❌ Dados não chegam em comprehensive_metrics');
            console.log('   💡 BUG: Na transferência da function para tenant_metrics');
        } else if (hasRealAppointments && !functionWorking) {
            console.log('❌ PROBLEMA: PostgreSQL function não calcula receitas');
        } else if (!hasRealAppointments) {
            console.log('❌ PROBLEMA: Não há appointments com preços');
        } else {
            console.log('✅ Sistema funcionando corretamente');
        }
        
    } catch (error) {
        console.error('💥 Erro no debug:', error);
    }
}

debugReceitasPostgreSQLFunction().then(() => process.exit(0)).catch(console.error);