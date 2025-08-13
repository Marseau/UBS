/**
 * Verificar valores exatos de appointments para Bella Vista Spa & Salon
 * Períodos: 7d, 30d, 90d
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkBellaVistaAppointments() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('📊 ANÁLISE: Bella Vista Spa & Salon - Appointments');
    console.log('===============================================\n');
    
    try {
        // 1. Buscar tenant Bella Vista
        const { data: tenants } = await client
            .from('tenants')
            .select('id, business_name')
            .eq('business_name', 'Bella Vista Spa & Salon');
            
        if (!tenants || tenants.length === 0) {
            console.log('❌ Tenant Bella Vista não encontrado');
            return;
        }
        
        const bellaVista = tenants[0];
        console.log(`🏢 TENANT: ${bellaVista.business_name}`);
        console.log(`📋 ID: ${bellaVista.id}\n`);
        
        // 2. Verificar dados atuais no metric_data
        console.log('📊 PASSO 1: Valores atuais no metric_data');
        console.log('========================================');
        
        const { data: currentMetrics } = await client
            .from('tenant_metrics')
            .select('period, metric_data, calculated_at')
            .eq('tenant_id', bellaVista.id)
            .eq('metric_type', 'comprehensive')
            .order('calculated_at', { ascending: false });
            
        if (currentMetrics && currentMetrics.length > 0) {
            ['7d', '30d', '90d'].forEach(period => {
                const metric = currentMetrics.find(m => m.period === period);
                if (metric) {
                    const appointments = metric.metric_data?.total_appointments || 0;
                    const growthRate = metric.metric_data?.appointments_growth_rate || 0;
                    console.log(`   ${period}: ${appointments} appointments (Growth: ${growthRate}%)`);
                    console.log(`        Calculado em: ${new Date(metric.calculated_at).toLocaleString('pt-BR')}`);
                } else {
                    console.log(`   ${period}: Não encontrado`);
                }
            });
        }
        
        // 3. Calcular manualmente para cada período
        const periods = [
            { name: '7d', days: 7 },
            { name: '30d', days: 30 },
            { name: '90d', days: 90 }
        ];
        
        console.log('\n📊 PASSO 2: Cálculo manual direto do banco');
        console.log('==========================================');
        
        for (const period of periods) {
            console.log(`\n🔍 PERÍODO ${period.name.toUpperCase()} (${period.days} dias):`);
            
            // Período atual
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - period.days);
            
            console.log(`   📅 De ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
            
            // Contar appointments no período atual
            const { data: currentAppointments, error: currentError } = await client
                .from('appointments')
                .select('id, status, created_at, start_time, final_price, quoted_price')
                .eq('tenant_id', bellaVista.id)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString())
                .order('created_at', { ascending: false });
                
            if (currentError) {
                console.log(`   ❌ Erro: ${currentError.message}`);
                continue;
            }
            
            const currentTotal = currentAppointments?.length || 0;
            console.log(`   📊 TOTAL appointments atuais: ${currentTotal}`);
            
            // Breakdown por status
            if (currentAppointments && currentAppointments.length > 0) {
                const statusCount = {};
                currentAppointments.forEach(apt => {
                    const status = apt.status || 'null';
                    statusCount[status] = (statusCount[status] || 0) + 1;
                });
                
                console.log('   📋 Breakdown por status:');
                Object.entries(statusCount).forEach(([status, count]) => {
                    console.log(`      ${status}: ${count}`);
                });
                
                // Sample de appointments
                console.log('   📄 Sample (primeiros 3):');
                currentAppointments.slice(0, 3).forEach((apt, i) => {
                    console.log(`      ${i+1}. ${new Date(apt.created_at).toLocaleString('pt-BR')} - ${apt.status}`);
                });
            }
            
            // Período anterior para calcular growth rate
            const prevEndDate = new Date(startDate);
            const prevStartDate = new Date(startDate);
            prevStartDate.setDate(prevEndDate.getDate() - period.days);
            
            console.log(`   📅 Período anterior: ${prevStartDate.toISOString().split('T')[0]} até ${prevEndDate.toISOString().split('T')[0]}`);
            
            const { data: prevAppointments } = await client
                .from('appointments')
                .select('count(*)')
                .eq('tenant_id', bellaVista.id)
                .gte('created_at', prevStartDate.toISOString())
                .lt('created_at', prevEndDate.toISOString());
                
            const prevTotal = prevAppointments?.[0]?.count || 0;
            console.log(`   📊 TOTAL appointments anteriores: ${prevTotal}`);
            
            // Calcular growth rate
            let growthRate = 0;
            if (prevTotal > 0) {
                growthRate = ((currentTotal - prevTotal) / prevTotal) * 100;
            } else if (currentTotal > 0) {
                growthRate = 100;
            }
            
            console.log(`   📈 GROWTH RATE calculado: ${growthRate.toFixed(2)}%`);
        }
        
        // 4. Verificar se há discrepâncias
        console.log('\n🔍 PASSO 3: Análise de discrepâncias');
        console.log('===================================');
        
        console.log('Comparando valores metric_data vs cálculo direto...');
        
        if (currentMetrics && currentMetrics.length > 0) {
            periods.forEach(period => {
                const metric = currentMetrics.find(m => m.period === period.name);
                if (metric) {
                    const storedValue = metric.metric_data?.total_appointments || 0;
                    console.log(`\n${period.name}:`);
                    console.log(`   Stored: ${storedValue} appointments`);
                    console.log(`   (Valores calculados acima para comparação)`);
                }
            });
        }
        
    } catch (error) {
        console.log(`❌ Erro: ${error.message}`);
        console.log('Stack:', error.stack?.split('\n').slice(0,5).join('\n'));
    }
}

checkBellaVistaAppointments().catch(console.error);