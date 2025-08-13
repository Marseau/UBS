/**
 * Debug Appointments Pricing
 * Investigar por que revenue está zero
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function debugAppointmentsPricing() {
    console.log('🔍 DEBUG APPOINTMENTS PRICING - 7 DIAS');
    console.log('=' .repeat(60));

    try {
        const supabase = getAdminClient();
        
        // Data de 7 dias atrás
        const dateRange = {
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString()
        };
        
        console.log(`📅 Período: ${dateRange.start} até ${dateRange.end}`);
        
        // Buscar appointments dos últimos 7 dias
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('id, tenant_id, status, quoted_price, final_price, start_time')
            .gte('start_time', dateRange.start)
            .lte('start_time', dateRange.end)
            .limit(10);

        if (error) {
            throw new Error(`Erro: ${error.message}`);
        }

        console.log(`\n📊 Encontrados ${appointments?.length || 0} appointments nos últimos 7 dias`);
        
        if (appointments && appointments.length > 0) {
            console.log('\n📋 DETALHES DOS APPOINTMENTS:');
            console.log('-'.repeat(60));
            
            appointments.forEach((apt, index) => {
                console.log(`\n${index + 1}. ID: ${apt.id}`);
                console.log(`   Status: ${apt.status}`);
                console.log(`   Quoted Price: ${apt.quoted_price}`);
                // console.log(`   Effective Price: ${apt.effective_price}`);
                console.log(`   Final Price: ${apt.final_price}`);
                console.log(`   Start Time: ${apt.start_time}`);
                
                // Calcular preço usando a lógica atual
                const price = apt.quoted_price || apt.final_price || 0;
                console.log(`   💰 Preço Calculado: R$ ${price}`);
                
                // Verificar se seria incluído no revenue
                const includeInRevenue = (apt.status === 'completed' || apt.status === 'confirmed');
                console.log(`   ✅ Incluir no Revenue: ${includeInRevenue ? 'SIM' : 'NÃO'} (status: ${apt.status})`);
            });
            
            // Estatísticas gerais
            console.log('\n📈 ESTATÍSTICAS:');
            console.log('-'.repeat(30));
            
            const statusCount = {};
            appointments.forEach(apt => {
                statusCount[apt.status] = (statusCount[apt.status] || 0) + 1;
            });
            
            console.log('Status distribution:');
            Object.entries(statusCount).forEach(([status, count]) => {
                console.log(`   ${status}: ${count}`);
            });
            
            const withPrices = appointments.filter(apt => 
                apt.quoted_price || apt.final_price
            ).length;
            
            console.log(`\nAppointments com preço: ${withPrices}/${appointments.length}`);
            
            const eligibleForRevenue = appointments.filter(apt => 
                (apt.status === 'completed' || apt.status === 'confirmed') &&
                (apt.quoted_price || apt.final_price)
            );
            
            console.log(`Eligible for revenue: ${eligibleForRevenue.length}`);
            
            const totalRevenue = eligibleForRevenue.reduce((sum, apt) => {
                const price = apt.quoted_price || apt.final_price || 0;
                return sum + price;
            }, 0);
            
            console.log(`💰 Revenue total calculado: R$ ${totalRevenue}`);
            
        } else {
            console.log('❌ Nenhum appointment encontrado nos últimos 7 dias');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

debugAppointmentsPricing();