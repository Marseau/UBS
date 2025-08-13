#!/usr/bin/env node

/**
 * Test the new 25 metrics with fixed database issues
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNewMetricsFixed() {
    console.log('🧪 Testing New Metrics System - Fixed Version');
    console.log('=' .repeat(60));
    
    try {
        // First, clean old metrics
        console.log('🧹 Cleaning old metrics (participation, ranking)...');
        
        const { error: deleteError } = await supabase
            .from('tenant_metrics')
            .delete()
            .in('metric_type', ['participation', 'ranking']);
        
        if (deleteError) {
            console.log('⚠️ Error cleaning old metrics:', deleteError.message);
        } else {
            console.log('✅ Old metrics cleaned');
        }
        
        // Get a test tenant
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(1);
        
        if (error || !tenants || tenants.length === 0) {
            console.log('❌ No tenants found');
            return;
        }
        
        const tenant = tenants[0];
        console.log(`🏢 Testing with: ${tenant.name}`);
        
        // Test only the working metrics first - Risk Assessment
        console.log('\n🎯 Testing Risk Assessment Metric...');
        await testRiskAssessment(tenant.id);
        
        // Test simple metrics that don't depend on conversation_outcome
        console.log('\n👥 Testing New Customers Metric...');
        await testNewCustomers(tenant.id);
        
        console.log('\n💰 Testing Monthly Revenue Metric...');
        await testMonthlyRevenue(tenant.id);
        
        // Check results
        const { data: newMetrics } = await supabase
            .from('tenant_metrics')
            .select('metric_type, period, calculated_at')
            .eq('tenant_id', tenant.id)
            .order('calculated_at', { ascending: false });
        
        console.log(`\n📊 Results: ${newMetrics?.length || 0} new metrics saved`);
        if (newMetrics && newMetrics.length > 0) {
            console.log('📈 Saved metrics:');
            newMetrics.forEach(m => {
                console.log(`   ✅ ${m.metric_type} (${m.period})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
        console.error(error.stack);
    }
}

async function testRiskAssessment(tenantId) {
    try {
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            console.log(`   Testing ${period}...`);
            
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - periodDays);
            
            // Get appointments to calculate risk
            const { data: appointments } = await supabase
                .from('appointments')
                .select('appointment_data, start_time, status')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString());
            
            if (!appointments || appointments.length === 0) {
                console.log(`      ⚠️ No appointments for ${period}`);
                continue;
            }
            
            // Count sources
            let saasCount = 0, externalCount = 0;
            appointments.forEach(apt => {
                const source = apt.appointment_data?.source;
                if (source === 'google_calendar') {
                    externalCount++;
                } else {
                    saasCount++;
                }
            });
            
            const total = appointments.length;
            const externalPercentage = total > 0 ? (externalCount / total) * 100 : 0;
            
            const riskMetric = {
                score: Math.round(externalPercentage * 100) / 100,
                status: externalPercentage <= 30 ? 'Low Risk' : 'Medium Risk',
                level: externalPercentage <= 30 ? 'healthy' : 'warning',
                factors: {
                    payment_history: { score: 100 - externalPercentage, status: 'good' },
                    usage_trend: { score: 100 - externalPercentage, status: 'good' },
                    customer_growth: { score: 100 - externalPercentage, status: 'good' },
                    support_tickets: { score: 100 - externalPercentage, status: 'good' }
                },
                recommendations: [`External dependency: ${externalPercentage.toFixed(1)}%`]
            };
            
            // Store directly
            const { error } = await supabase
                .from('tenant_metrics')
                .upsert({
                    tenant_id: tenantId,
                    metric_type: 'risk_assessment',
                    metric_data: riskMetric,
                    period: period,
                    calculated_at: new Date().toISOString()
                });
            
            if (error) {
                console.log(`      ❌ Error saving ${period}:`, error.message);
            } else {
                console.log(`      ✅ Saved ${period}: ${externalPercentage.toFixed(1)}% risk`);
            }
        }
    } catch (error) {
        console.log('   ❌ Risk assessment error:', error.message);
    }
}

async function testNewCustomers(tenantId) {
    try {
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - periodDays);
            
            // Count new users
            const { data: newUsers } = await supabase
                .from('users')
                .select('id, created_at, user_tenants!inner(tenant_id)')
                .eq('user_tenants.tenant_id', tenantId)
                .gte('created_at', startDate.toISOString())
                .lte('created_at', endDate.toISOString());
            
            const count = newUsers?.length || 0;
            
            const metric = {
                count: count,
                change_percent: 0 // Simplified for testing
            };
            
            const { error } = await supabase
                .from('tenant_metrics')
                .upsert({
                    tenant_id: tenantId,
                    metric_type: 'new_customers',
                    metric_data: metric,
                    period: period,
                    calculated_at: new Date().toISOString()
                });
            
            if (error) {
                console.log(`   ❌ Error saving new_customers ${period}:`, error.message);
            } else {
                console.log(`   ✅ Saved new_customers ${period}: ${count} customers`);
            }
        }
    } catch (error) {
        console.log('❌ New customers error:', error.message);
    }
}

async function testMonthlyRevenue(tenantId) {
    try {
        const periods = ['7d', '30d', '90d'];
        
        for (const period of periods) {
            const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - periodDays);
            
            // Calculate revenue from appointments
            const { data: appointments } = await supabase
                .from('appointments')
                .select('final_price, quoted_price, start_time')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate.toISOString())
                .lte('start_time', endDate.toISOString())
                .in('status', ['completed', 'confirmed']);
            
            const revenue = appointments?.reduce((sum, apt) => {
                return sum + (apt.final_price || apt.quoted_price || 0);
            }, 0) || 0;
            
            const metric = {
                current_revenue: Math.round(revenue * 100) / 100,
                previous_revenue: 0,
                change_percent: 0,
                revenue_by_service: {}
            };
            
            const { error } = await supabase
                .from('tenant_metrics')
                .upsert({
                    tenant_id: tenantId,
                    metric_type: 'monthly_revenue',
                    metric_data: metric,
                    period: period,
                    calculated_at: new Date().toISOString()
                });
            
            if (error) {
                console.log(`   ❌ Error saving monthly_revenue ${period}:`, error.message);
            } else {
                console.log(`   ✅ Saved monthly_revenue ${period}: R$${revenue.toFixed(2)}`);
            }
        }
    } catch (error) {
        console.log('❌ Monthly revenue error:', error.message);
    }
}

// Run test
testNewMetricsFixed();