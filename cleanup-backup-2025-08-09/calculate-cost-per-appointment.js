require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * MÉTRICA TEMPORAL: CUSTO POR AGENDAMENTO PAGO (6 MESES)
 * 
 * Para cada tenant, calcular:
 * - Valor pago para a plataforma por mês
 * - Número de agendamentos completed por mês
 * - Custo por agendamento = Valor pago / Agendamentos completed
 */

function generateLast6Months() {
    const months = [];
    const currentDate = new Date('2025-08-31');
    
    for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(currentDate);
        monthDate.setMonth(monthDate.getMonth() - i);
        
        const startDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const endDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        
        months.push({
            name: monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
            start_date: startDate,
            end_date: endDate
        });
    }
    
    return months;
}

async function calculateCostPerAppointment() {
    console.log('📊 MÉTRICA TEMPORAL: CUSTO POR AGENDAMENTO PAGO (6 MESES)');
    console.log('='.repeat(70));
    
    try {
        // Buscar tenants com atividade
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(5); // Primeiros 5 para exemplo
        
        const months = generateLast6Months();
        
        for (const tenant of tenants) {
            console.log(`\n🏢 ${tenant.name.toUpperCase()}`);
            console.log('─'.repeat(50));
            
            let totalPaid = 0;
            let totalAppointments = 0;
            
            for (const month of months) {
                // 1. Buscar valor pago à plataforma no mês
                const { data: billing } = await supabase
                    .from('conversation_billing')
                    .select('total_amount_brl')
                    .eq('tenant_id', tenant.id)
                    .eq('billing_period_start', month.start_date.toISOString().split('T')[0])
                    .single();
                
                const monthlyPaid = billing ? parseFloat(billing.total_amount_brl) : 0;
                
                // 2. Buscar agendamentos completed no mês (usando start_time)
                const { data: appointments } = await supabase
                    .from('appointments')
                    .select('id, status, start_time')
                    .eq('tenant_id', tenant.id)
                    .eq('status', 'completed')
                    .gte('start_time', month.start_date.toISOString())
                    .lte('start_time', month.end_date.toISOString());
                
                const appointmentsCount = appointments ? appointments.length : 0;
                
                // 3. Calcular custo por agendamento
                const costPerAppointment = appointmentsCount > 0 ? monthlyPaid / appointmentsCount : 0;
                
                // 4. Exibir dados do mês
                if (appointmentsCount > 0) {
                    console.log(`${month.name}: R$ ${monthlyPaid.toFixed(2)} ÷ ${appointmentsCount} agend. = R$ ${costPerAppointment.toFixed(2)}/agend.`);
                } else if (monthlyPaid > 0) {
                    console.log(`${month.name}: R$ ${monthlyPaid.toFixed(2)} ÷ 0 agend. = R$ ∞/agend. (sem agendamentos)`);
                } else {
                    console.log(`${month.name}: R$ 0,00 ÷ 0 agend. = R$ 0,00/agend. (sem atividade)`);
                }
                
                totalPaid += monthlyPaid;
                totalAppointments += appointmentsCount;
            }
            
            // 5. Resumo de 6 meses
            const avgCostPerAppointment = totalAppointments > 0 ? totalPaid / totalAppointments : 0;
            
            console.log('─'.repeat(50));
            console.log(`📈 RESUMO 6 MESES:`);
            console.log(`   💰 Total pago: R$ ${totalPaid.toFixed(2)}`);
            console.log(`   📅 Total agendamentos: ${totalAppointments}`);
            if (totalAppointments > 0) {
                console.log(`   💡 Custo médio: R$ ${avgCostPerAppointment.toFixed(2)} por agendamento`);
            } else {
                console.log(`   💡 Sem agendamentos completed no período`);
            }
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('📋 INTERPRETAÇÃO DA MÉTRICA:');
        console.log('   • Custo baixo/agend. = Boa eficiência da plataforma');
        console.log('   • Custo alto/agend. = Pode compensar modelo por agendamento');
        console.log('   • R$ ∞/agend. = Pagando sem realizar agendamentos');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

calculateCostPerAppointment().catch(console.error);