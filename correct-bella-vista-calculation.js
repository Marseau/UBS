/**
 * CÁLCULO CORRETO: Usando start_time (data do agendamento)
 * NÃO created_at (data de criação)
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function correctBellaVistaCalculation() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('✅ CÁLCULO CORRETO: Bella Vista - usando start_time');
    console.log('===============================================\n');
    
    try {
        const bellaVistaId = '33b8c488-5aa9-4891-b335-701d10296681';
        
        // Períodos corretos
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        for (const period of periods) {
            console.log(`🔍 PERÍODO ${period.name.toUpperCase()} - USANDO start_time:`);
            
            // Período atual
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - period.days);
            
            console.log(`   📅 De ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
            
            // QUERY CORRETA: Filtrar por start_time
            const { data: appointments } = await client
                .from('appointments')
                .select('id, status, start_time, created_at')
                .eq('tenant_id', bellaVistaId)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .order('start_time', { ascending: false });
            
            const total = appointments?.length || 0;
            console.log(`   📊 TOTAL appointments (start_time): ${total}`);
            
            if (appointments && appointments.length > 0) {
                // Breakdown por status
                const statusCount = {};
                appointments.forEach(apt => {
                    const status = apt.status || 'null';
                    statusCount[status] = (statusCount[status] || 0) + 1;
                });
                
                console.log('   📋 Breakdown por status:');
                Object.entries(statusCount).forEach(([status, count]) => {
                    console.log(`      ${status}: ${count}`);
                });
                
                // Sample
                console.log('   📄 Sample (primeiros 3):');
                appointments.slice(0, 3).forEach((apt, i) => {
                    console.log(`      ${i+1}. Start: ${new Date(apt.start_time).toLocaleString('pt-BR')} - ${apt.status}`);
                    console.log(`         Created: ${new Date(apt.created_at).toLocaleString('pt-BR')}`);
                });
            }
            
            // Período anterior para growth rate
            const prevEndDate = new Date(startDate);
            const prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevEndDate.getDate() - period.days);
            
            console.log(`   📅 Período anterior: ${prevStartDate.toISOString().split('T')[0]} até ${prevEndDate.toISOString().split('T')[0]}`);
            
            const { data: prevCount } = await client
                .from('appointments')
                .select('count(*)')
                .eq('tenant_id', bellaVistaId)
                .gte('start_time', prevStartDate.toISOString())
                .lt('start_time', prevEndDate.toISOString());
                
            const prevTotal = prevCount?.[0]?.count || 0;
            console.log(`   📊 TOTAL appointments anteriores: ${prevTotal}`);
            
            // Growth rate
            let growthRate = 0;
            if (prevTotal > 0) {
                growthRate = ((total - prevTotal) / prevTotal) * 100;
            } else if (total > 0) {
                growthRate = 100;
            }
            
            console.log(`   📈 GROWTH RATE: ${growthRate.toFixed(2)}%`);
            console.log('');
        }
        
        // Comparar com metric_data
        console.log('🔍 COMPARAÇÃO COM metric_data:');
        console.log('=============================');
        
        const { data: storedMetrics } = await client
            .from('tenant_metrics')
            .select('period, metric_data')
            .eq('tenant_id', bellaVistaId)
            .eq('metric_type', 'comprehensive')
            .order('calculated_at', { ascending: false });
            
        if (storedMetrics) {
            storedMetrics.forEach(metric => {
                const stored = metric.metric_data?.total_appointments || 0;
                const storedGrowth = metric.metric_data?.appointments_growth_rate || 0;
                console.log(`   ${metric.period}: Stored=${stored}, Growth=${storedGrowth}%`);
            });
        }
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
    }
}

correctBellaVistaCalculation().catch(console.error);