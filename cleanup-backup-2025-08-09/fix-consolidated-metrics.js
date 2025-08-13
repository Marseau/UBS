#!/usr/bin/env node

/**
 * Fix Consolidated Metrics - ONE metric per tenant/period
 * All calculations in a single JSON object
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixConsolidatedMetrics() {
    console.log('🔧 Fixing Consolidated Metrics - ONE per tenant/period');
    console.log('=' .repeat(60));
    
    try {
        // 1. Clean ALL existing metrics
        console.log('🧹 Cleaning all existing metrics...');
        const { error: deleteError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('tenant_id', 'impossible-id'); // Delete all
            
        if (deleteError) {
            console.log('❌ Delete error:', deleteError.message);
        } else {
            console.log('✅ All metrics cleaned');
        }
        
        // 2. Get all active tenants
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active');
        
        if (error || !tenants || tenants.length === 0) {
            console.log('❌ No tenants found');
            return;
        }
        
        console.log(`🏢 Processing ${tenants.length} tenants...`);
        
        // 3. Calculate consolidated metrics for each tenant
        const periods = ['7d', '30d', '90d'];
        let totalCalculated = 0;
        
        for (const tenant of tenants) {
            console.log(`\n🏪 ${tenant.name}`);
            console.log('-'.repeat(40));
            
            for (const period of periods) {
                try {
                    console.log(`   📊 Calculating ${period}...`);
                    
                    // Calculate ALL metrics in one consolidated object
                    const consolidatedMetric = await calculateConsolidatedMetric(tenant.id, period);
                    
                    // Store as ONE record per tenant/period
                    const { error: insertError } = await supabase
                        .from('tenant_metrics')
                        .upsert({
                            tenant_id: tenant.id,
                            metric_type: 'consolidated', // Single type!
                            metric_data: consolidatedMetric,
                            period: period,
                            calculated_at: new Date().toISOString()
                        });
                    
                    if (insertError) {
                        console.log(`     ❌ Error: ${insertError.message}`);
                    } else {
                        console.log(`     ✅ Saved consolidated ${period}`);
                        totalCalculated++;
                    }
                    
                } catch (error) {
                    console.log(`     ❌ Error ${period}: ${error.message}`);
                }
            }
        }
        
        console.log(`\n🎉 RESULTS:`);
        console.log(`   ✅ Tenants processed: ${tenants.length}`);
        console.log(`   📊 Metrics calculated: ${totalCalculated}`);
        console.log(`   📋 Expected: ${tenants.length * periods.length} (${tenants.length} tenants × ${periods.length} periods)`);
        
        // 4. Verify results
        const { data: finalMetrics } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true });
        
        console.log(`\n📈 Database verification: ${finalMetrics?.length || 0} total records`);
        console.log('📋 All metrics should be type "consolidated"');
        
        if (finalMetrics && finalMetrics.length > 0) {
            const typeDistribution = {};
            finalMetrics.forEach(m => {
                typeDistribution[m.metric_type] = (typeDistribution[m.metric_type] || 0) + 1;
            });
            
            console.log('   Types found:');
            Object.entries(typeDistribution).forEach(([type, count]) => {
                console.log(`     ${type}: ${count} records`);
            });
        }
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        console.error(error.stack);
    }
}

async function calculateConsolidatedMetric(tenantId, period) {
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    
    console.log(`     🔄 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // Get all data needed for calculations
    const [appointmentsResult, usersResult] = await Promise.all([
        // Appointments data
        supabase
            .from('appointments')
            .select('appointment_data, start_time, status, final_price, quoted_price, user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString()),
            
        // Users data  
        supabase
            .from('users')
            .select('id, created_at, user_tenants!inner(tenant_id)')
            .eq('user_tenants.tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
    ]);
    
    const appointments = appointmentsResult.data || [];
    const newUsers = usersResult.data || [];
    
    console.log(`     📋 Data: ${appointments.length} appointments, ${newUsers.length} new users`);
    
    // 1. RISK ASSESSMENT - External dependency analysis
    let saasCount = 0, externalCount = 0;
    appointments.forEach(apt => {
        const source = apt.appointment_data?.source;
        if (source === 'google_calendar') {
            externalCount++;
        } else {
            saasCount++;
        }
    });
    
    const totalAppointments = appointments.length;
    const externalPercentage = totalAppointments > 0 ? (externalCount / totalAppointments) * 100 : 0;
    
    const riskAssessment = {
        score: Math.round(externalPercentage * 100) / 100,
        status: externalPercentage <= 30 ? 'Low Risk' : externalPercentage <= 60 ? 'Medium Risk' : 'High Risk',
        level: externalPercentage <= 30 ? 'healthy' : externalPercentage <= 60 ? 'warning' : 'critical',
        external_dependency_percentage: externalPercentage,
        saas_usage_percentage: totalAppointments > 0 ? (saasCount / totalAppointments) * 100 : 0,
        total_appointments: totalAppointments,
        external_appointments: externalCount,
        saas_appointments: saasCount
    };
    
    // 2. NEW CUSTOMERS - User growth analysis  
    const newCustomers = {
        count: newUsers.length,
        growth_analysis: newUsers.length > 0 ? 'growing' : 'stable'
    };
    
    // 3. REVENUE ANALYSIS - Financial performance
    const completedAppointments = appointments.filter(apt => 
        apt.status === 'completed' || apt.status === 'confirmed'
    );
    
    const totalRevenue = completedAppointments.reduce((sum, apt) => {
        return sum + (apt.final_price || apt.quoted_price || 0);
    }, 0);
    
    // Revenue by service breakdown
    const revenueByService = {};
    completedAppointments.forEach(apt => {
        const service = apt.appointment_data?.service_name || 'Outros Serviços';
        const price = apt.final_price || apt.quoted_price || 0;
        revenueByService[service] = (revenueByService[service] || 0) + price;
    });
    
    const revenueAnalysis = {
        total_revenue: Math.round(totalRevenue * 100) / 100,
        completed_appointments: completedAppointments.length,
        average_ticket: completedAppointments.length > 0 ? 
            Math.round((totalRevenue / completedAppointments.length) * 100) / 100 : 0,
        revenue_by_service: revenueByService
    };
    
    // 4. OPERATIONAL METRICS - Appointment status analysis
    const statusDistribution = {};
    appointments.forEach(apt => {
        statusDistribution[apt.status] = (statusDistribution[apt.status] || 0) + 1;
    });
    
    const cancelledCount = statusDistribution['cancelled'] || 0;
    const noShowCount = statusDistribution['no_show'] || 0;
    const completedCount = statusDistribution['completed'] || 0;
    
    const operationalMetrics = {
        appointment_success_rate: totalAppointments > 0 ? 
            Math.round((completedCount / totalAppointments) * 10000) / 100 : 0,
        cancellation_rate: totalAppointments > 0 ? 
            Math.round((cancelledCount / totalAppointments) * 10000) / 100 : 0,
        no_show_rate: totalAppointments > 0 ? 
            Math.round((noShowCount / totalAppointments) * 10000) / 100 : 0,
        status_distribution: statusDistribution
    };
    
    // 5. CUSTOMER ANALYSIS - Unique customers and retention
    const uniqueCustomers = new Set(appointments.map(apt => apt.user_id)).size;
    
    const customerAnalysis = {
        unique_customers: uniqueCustomers,
        new_customers: newUsers.length,
        appointments_per_customer: uniqueCustomers > 0 ? 
            Math.round((totalAppointments / uniqueCustomers) * 100) / 100 : 0
    };
    
    // CONSOLIDATED RESULT - All metrics in ONE object
    return {
        // Meta information
        period_info: {
            period: period,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            calculated_at: new Date().toISOString()
        },
        
        // Main metrics
        risk_assessment: riskAssessment,
        new_customers: newCustomers, 
        revenue_analysis: revenueAnalysis,
        operational_metrics: operationalMetrics,
        customer_analysis: customerAnalysis,
        
        // Summary KPIs for quick access
        summary_kpis: {
            risk_score: riskAssessment.score,
            total_revenue: revenueAnalysis.total_revenue,
            new_customers_count: newCustomers.count,
            success_rate: operationalMetrics.appointment_success_rate,
            unique_customers: customerAnalysis.unique_customers
        }
    };
}

// Run the fix
fixConsolidatedMetrics();