/**
 * Test Script: Validate 16 Existing Metrics in tenant_metrics table
 * Tests all 4 existing metric types and compares calculated vs stored results
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        db: { schema: 'public' }
    }
);

/**
 * Test Configuration
 */
const TEST_CONFIG = {
    TENANT_ID: '33b8c488-5aa9-4891-b335-701d10296681', // From existing data
    PERIODS: ['7d', '30d', '90d'],
    METRIC_TYPES: ['ranking', 'participation', 'risk_assessment', 'evolution']
};

/**
 * Get stored metrics from tenant_metrics table
 */
async function getStoredMetrics(tenantId, metricType, period) {
    try {
        const { data, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('metric_type', metricType)
            .eq('period', period)
            .order('calculated_at', { ascending: false })
            .limit(1);

        if (error) throw error;
        return data?.[0] || null;

    } catch (error) {
        console.error(`❌ Error getting stored ${metricType} metric:`, error);
        return null;
    }
}

/**
 * Calculate fresh ranking metric
 */
async function calculateRankingMetric(tenantId, period) {
    try {
        console.log(`🔄 Calculating RANKING metric for tenant ${tenantId}, period ${period}`);
        
        // Get all active tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active');

        if (tenantsError) throw tenantsError;
        
        console.log(`   📊 Found ${tenants?.length || 0} active tenants for ranking`);

        // Get tenant basic metrics for comparison
        const periodDays = parseInt(period.replace('d', '')) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get appointments data for revenue and count
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('tenant_id, final_price, status, created_at')
            .in('status', ['completed', 'confirmed'])
            .gte('created_at', startDate.toISOString());

        if (appointmentsError) throw appointmentsError;

        // Get customers data
        const { data: customers, error: customersError } = await supabase
            .from('user_tenants')
            .select('tenant_id, user_id, created_at')
            .gte('created_at', startDate.toISOString());

        if (customersError) throw customersError;

        // Calculate metrics per tenant
        const tenantMetrics = tenants.map(tenant => {
            const tenantAppointments = appointments?.filter(a => a.tenant_id === tenant.id) || [];
            const tenantCustomers = customers?.filter(c => c.tenant_id === tenant.id) || [];
            
            const revenue = tenantAppointments.reduce((sum, apt) => sum + (apt.final_price || 0), 0);
            const appointmentCount = tenantAppointments.length;
            const customerCount = tenantCustomers.length;
            
            return {
                tenant_id: tenant.id,
                business_name: tenant.business_name,
                revenue,
                appointments: appointmentCount,
                customers: customerCount,
                growth: 0 // Simplified for testing
            };
        });

        // Calculate rankings
        const targetTenant = tenantMetrics.find(t => t.tenant_id === tenantId);
        if (!targetTenant) {
            throw new Error(`Tenant ${tenantId} not found in active tenants`);
        }

        // Sort and rank by revenue
        const sortedByRevenue = [...tenantMetrics].sort((a, b) => b.revenue - a.revenue);
        const revenueRank = sortedByRevenue.findIndex(t => t.tenant_id === tenantId) + 1;
        
        // Sort and rank by customers
        const sortedByCustomers = [...tenantMetrics].sort((a, b) => b.customers - a.customers);
        const customersRank = sortedByCustomers.findIndex(t => t.tenant_id === tenantId) + 1;
        
        // Sort and rank by appointments
        const sortedByAppointments = [...tenantMetrics].sort((a, b) => b.appointments - a.appointments);
        const appointmentsRank = sortedByAppointments.findIndex(t => t.tenant_id === tenantId) + 1;

        // Calculate overall position and category
        const totalTenants = tenants.length;
        const overallPosition = Math.round((revenueRank + customersRank + appointmentsRank) / 3);
        const topPercent = (overallPosition / totalTenants) * 100;
        
        let category;
        if (topPercent <= 10) category = 'Top 10%';
        else if (topPercent <= 25) category = 'Top 25%';
        else if (topPercent <= 50) category = 'Top 50%';
        else if (topPercent <= 75) category = 'Top 75%';
        else category = 'Bottom 25%';

        const calculatedRanking = {
            position: overallPosition,
            totalTenants,
            category,
            score: Math.round(100 - topPercent),
            metrics: {
                revenue: { value: targetTenant.revenue, rank: revenueRank },
                customers: { value: targetTenant.customers, rank: customersRank },
                appointments: { value: targetTenant.appointments, rank: appointmentsRank },
                growth: { value: 0, rank: Math.ceil(totalTenants / 2) }
            }
        };

        console.log(`   ✅ RANKING calculated: Position ${overallPosition}/${totalTenants} (${category})`);
        return calculatedRanking;

    } catch (error) {
        console.error(`❌ Error calculating ranking metric:`, error);
        return null;
    }
}

/**
 * Calculate fresh participation metric
 */
async function calculateParticipationMetric(tenantId, period) {
    try {
        console.log(`🔄 Calculating PARTICIPATION metric for tenant ${tenantId}, period ${period}`);
        
        const periodDays = parseInt(period.replace('d', '')) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get platform totals
        const { data: allAppointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('tenant_id, final_price')
            .in('status', ['completed', 'confirmed'])
            .gte('created_at', startDate.toISOString());

        if (appointmentsError) throw appointmentsError;

        const { data: allCustomers, error: customersError } = await supabase
            .from('user_tenants')
            .select('tenant_id')
            .gte('created_at', startDate.toISOString());

        if (customersError) throw customersError;

        const { data: allConversations, error: conversationsError } = await supabase
            .from('conversation_history')
            .select('tenant_id')
            .gte('created_at', startDate.toISOString());

        if (conversationsError) throw conversationsError;

        // Calculate tenant specific data
        const tenantAppointments = allAppointments?.filter(a => a.tenant_id === tenantId) || [];
        const tenantCustomers = allCustomers?.filter(c => c.tenant_id === tenantId) || [];
        const tenantConversations = allConversations?.filter(c => c.tenant_id === tenantId) || [];

        // Calculate totals
        const tenantRevenue = tenantAppointments.reduce((sum, apt) => sum + (apt.final_price || 0), 0);
        const platformRevenue = allAppointments.reduce((sum, apt) => sum + (apt.final_price || 0), 0);
        
        const tenantCustomersCount = tenantCustomers.length;
        const platformCustomersCount = allCustomers.length;
        
        const tenantAppointmentsCount = tenantAppointments.length;
        const platformAppointmentsCount = allAppointments.length;
        
        const tenantConversationsCount = tenantConversations.length;
        const platformConversationsCount = allConversations.length;

        // Calculate participation percentages
        const revenueParticipation = platformRevenue > 0 ? (tenantRevenue / platformRevenue) * 100 : 0;
        const customersParticipation = platformCustomersCount > 0 ? (tenantCustomersCount / platformCustomersCount) * 100 : 0;
        const appointmentsParticipation = platformAppointmentsCount > 0 ? (tenantAppointmentsCount / platformAppointmentsCount) * 100 : 0;
        const aiInteractionsParticipation = platformConversationsCount > 0 ? (tenantConversationsCount / platformConversationsCount) * 100 : 0;

        const calculatedParticipation = {
            revenue: { 
                percentage: Number(revenueParticipation.toFixed(2)), 
                trend: 'stable' // Simplified for testing
            },
            customers: { 
                percentage: Number(customersParticipation.toFixed(2)), 
                trend: 'stable' 
            },
            appointments: { 
                percentage: Number(appointmentsParticipation.toFixed(2)), 
                trend: 'stable' 
            },
            aiInteractions: { 
                percentage: Number(aiInteractionsParticipation.toFixed(2)), 
                trend: 'stable' 
            },
            marketShare: {
                current: Number(revenueParticipation.toFixed(2)),
                previousPeriod: Number(revenueParticipation.toFixed(2)), // Simplified
                change: 0
            }
        };

        console.log(`   ✅ PARTICIPATION calculated: Revenue ${revenueParticipation.toFixed(2)}%, Customers ${customersParticipation.toFixed(2)}%`);
        return calculatedParticipation;

    } catch (error) {
        console.error(`❌ Error calculating participation metric:`, error);
        return null;
    }
}

/**
 * Calculate fresh risk assessment metric
 */
async function calculateRiskAssessmentMetric(tenantId, period) {
    try {
        console.log(`🔄 Calculating RISK_ASSESSMENT metric for tenant ${tenantId}, period ${period}`);
        
        // Get tenant data
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('subscription_plan, created_at, status')
            .eq('id', tenantId)
            .single();

        if (tenantError) throw tenantError;

        const periodDays = parseInt(period.replace('d', '')) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get tenant appointments for usage trend
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('created_at, status')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString());

        if (appointmentsError) throw appointmentsError;

        // Get tenant customers for growth trend
        const { data: customers, error: customersError } = await supabase
            .from('user_tenants')
            .select('created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString());

        if (customersError) throw customersError;

        // Calculate risk factors
        
        // 1. Payment History Score
        let paymentScore = 100;
        if (tenant.subscription_plan === 'trial') paymentScore = 60;
        else if (tenant.status === 'suspended') paymentScore = 20;
        else if (tenant.status === 'inactive') paymentScore = 10;
        
        // 2. Usage Trend Score (based on appointments)
        const appointmentCount = appointments?.length || 0;
        const appointmentsPerDay = periodDays > 0 ? appointmentCount / periodDays : 0;
        let usageScore = 70; // baseline
        if (appointmentsPerDay > 5) usageScore = 95;
        else if (appointmentsPerDay > 2) usageScore = 85;
        else if (appointmentsPerDay > 1) usageScore = 75;
        else if (appointmentsPerDay > 0.5) usageScore = 60;
        else usageScore = 30;
        
        // 3. Customer Growth Score
        const customerCount = customers?.length || 0;
        const customersPerDay = periodDays > 0 ? customerCount / periodDays : 0;
        let customerScore = 70; // baseline
        if (customersPerDay > 1) customerScore = 95;
        else if (customersPerDay > 0.5) customerScore = 85;
        else if (customersPerDay > 0.2) customerScore = 75;
        else if (customersPerDay > 0) customerScore = 60;
        else customerScore = 35;
        
        // 4. Support Tickets Score (simplified)
        let supportScore = 85; // Default good score
        
        // Calculate overall risk score (lower is better)
        const riskScore = Math.round(
            100 - (
                (paymentScore * 0.3) +
                (usageScore * 0.3) +
                (customerScore * 0.25) +
                (supportScore * 0.15)
            )
        );
        
        // Determine risk status
        let status, level;
        if (riskScore <= 20) {
            status = 'Low Risk';
            level = 'healthy';
        } else if (riskScore <= 40) {
            status = 'Medium Risk';
            level = 'warning';
        } else if (riskScore <= 70) {
            status = 'High Risk';
            level = 'warning';
        } else {
            status = 'Critical Risk';
            level = 'critical';
        }
        
        // Generate recommendations
        const recommendations = [];
        if (paymentScore < 80) recommendations.push('Monitor payment status closely');
        if (usageScore < 70) recommendations.push('Engage with customer success team');
        if (customerScore < 70) recommendations.push('Implement customer retention strategies');
        if (supportScore < 80) recommendations.push('Improve support response times');
        if (recommendations.length === 0) recommendations.push('Continue current growth strategy');

        const calculatedRisk = {
            score: riskScore,
            status,
            level,
            factors: {
                payment_history: { 
                    score: paymentScore, 
                    status: paymentScore >= 90 ? 'excellent' : paymentScore >= 70 ? 'good' : 'poor' 
                },
                usage_trend: { 
                    score: usageScore, 
                    status: usageScore >= 90 ? 'excellent' : usageScore >= 70 ? 'good' : 'poor' 
                },
                customer_growth: { 
                    score: customerScore, 
                    status: customerScore >= 90 ? 'excellent' : customerScore >= 70 ? 'good' : 'poor' 
                },
                support_tickets: { 
                    score: supportScore, 
                    status: supportScore >= 90 ? 'excellent' : supportScore >= 70 ? 'good' : 'moderate' 
                }
            },
            recommendations
        };

        console.log(`   ✅ RISK_ASSESSMENT calculated: Score ${riskScore} (${status})`);
        return calculatedRisk;

    } catch (error) {
        console.error(`❌ Error calculating risk assessment metric:`, error);
        return null;
    }
}

/**
 * Calculate fresh evolution metric
 */
async function calculateEvolutionMetric(tenantId, period) {
    try {
        console.log(`🔄 Calculating EVOLUTION metric for tenant ${tenantId}, period ${period}`);
        
        const periodDays = parseInt(period.replace('d', '')) || 30;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // Get historical appointments for MRR evolution
        const { data: appointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('created_at, final_price')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (appointmentsError) throw appointmentsError;

        // Get historical customers for growth evolution
        const { data: customers, error: customersError } = await supabase
            .from('user_tenants')
            .select('created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (customersError) throw customersError;

        // Process evolution data
        const labels = [];
        const tenantMRR = [];
        const platformMRR = [];
        const tenantCustomers = [];
        const platformCustomers = [];
        const mrrParticipation = [];
        const customerParticipation = [];

        // Group data by weeks for shorter periods or months for longer periods
        const groupBy = periodDays <= 30 ? 'week' : 'month';
        
        // Simplified evolution calculation
        const intervals = Math.min(6, Math.floor(periodDays / (groupBy === 'week' ? 7 : 30)));
        
        for (let i = 0; i < intervals; i++) {
            const intervalStart = new Date(startDate);
            intervalStart.setDate(startDate.getDate() + i * (groupBy === 'week' ? 7 : 30));
            const intervalEnd = new Date(intervalStart);
            intervalEnd.setDate(intervalStart.getDate() + (groupBy === 'week' ? 7 : 30));
            
            const intervalLabel = intervalStart.toLocaleDateString('pt-BR', { 
                month: 'short', 
                day: groupBy === 'week' ? 'numeric' : undefined 
            });
            labels.push(intervalLabel);
            
            // Calculate revenue for interval
            const intervalAppointments = appointments?.filter(apt => {
                const aptDate = new Date(apt.created_at);
                return aptDate >= intervalStart && aptDate < intervalEnd;
            }) || [];
            
            const intervalRevenue = intervalAppointments.reduce((sum, apt) => sum + (apt.final_price || 0), 0);
            tenantMRR.push(intervalRevenue);
            platformMRR.push(intervalRevenue * 10); // Simulated platform total
            mrrParticipation.push(Number((10).toFixed(1))); // Simplified 10%
            
            // Calculate customers for interval
            const intervalCustomers = customers?.filter(cust => {
                const custDate = new Date(cust.created_at);
                return custDate >= intervalStart && custDate < intervalEnd;
            }) || [];
            
            tenantCustomers.push(intervalCustomers.length);
            platformCustomers.push(intervalCustomers.length * 10); // Simulated platform total
            customerParticipation.push(Number((10).toFixed(1))); // Simplified 10%
        }

        const calculatedEvolution = {
            mrrEvolution: {
                labels,
                tenantData: tenantMRR,
                platformData: platformMRR,
                participationPercentage: mrrParticipation
            },
            customerGrowth: {
                labels,
                tenantData: tenantCustomers,
                platformData: platformCustomers,
                participationPercentage: customerParticipation
            }
        };

        console.log(`   ✅ EVOLUTION calculated: ${intervals} intervals with ${labels.length} data points`);
        return calculatedEvolution;

    } catch (error) {
        console.error(`❌ Error calculating evolution metric:`, error);
        return null;
    }
}

/**
 * Compare calculated vs stored metrics
 */
function compareMetrics(calculated, stored, metricType) {
    console.log(`\n🔍 COMPARING ${metricType.toUpperCase()} METRICS:`);
    console.log('═'.repeat(60));
    
    if (!calculated) {
        console.log('❌ Calculated metric is NULL');
        return { status: 'FAILED', reason: 'Calculation failed' };
    }
    
    if (!stored) {
        console.log('❌ Stored metric is NULL - no data in tenant_metrics table');
        return { status: 'FAILED', reason: 'No stored data' };
    }
    
    console.log('📊 CALCULATED METRICS:');
    console.log(JSON.stringify(calculated, null, 2));
    
    console.log('\n💾 STORED METRICS:');
    console.log(JSON.stringify(stored.metric_data, null, 2));
    
    // Basic structural comparison
    const calculatedKeys = Object.keys(calculated);
    const storedKeys = Object.keys(stored.metric_data || {});
    
    const missingInStored = calculatedKeys.filter(key => !storedKeys.includes(key));
    const extraInStored = storedKeys.filter(key => !calculatedKeys.includes(key));
    
    console.log('\n🔍 STRUCTURE COMPARISON:');
    if (missingInStored.length > 0) {
        console.log(`❌ Missing in stored: ${missingInStored.join(', ')}`);
    }
    if (extraInStored.length > 0) {
        console.log(`⚠️ Extra in stored: ${extraInStored.join(', ')}`);
    }
    if (missingInStored.length === 0 && extraInStored.length === 0) {
        console.log('✅ Structure matches');
    }
    
    return {
        status: 'COMPARED',
        calculated,
        stored: stored.metric_data,
        missingInStored,
        extraInStored,
        structureMatch: missingInStored.length === 0 && extraInStored.length === 0
    };
}

/**
 * Main test function
 */
async function test16ExistingMetrics() {
    try {
        console.log('🚀 Testing 16 Existing Metrics in tenant_metrics table');
        console.log('═'.repeat(80));
        console.log(`📋 Test Configuration:`);
        console.log(`   Tenant ID: ${TEST_CONFIG.TENANT_ID}`);
        console.log(`   Periods: ${TEST_CONFIG.PERIODS.join(', ')}`);
        console.log(`   Metric Types: ${TEST_CONFIG.METRIC_TYPES.join(', ')}`);
        console.log('═'.repeat(80));
        
        const results = {
            ranking: {},
            participation: {},
            risk_assessment: {},
            evolution: {}
        };
        
        // Test each metric type
        for (const metricType of TEST_CONFIG.METRIC_TYPES) {
            console.log(`\n🎯 TESTING ${metricType.toUpperCase()} METRICS`);
            console.log('─'.repeat(50));
            
            for (const period of TEST_CONFIG.PERIODS) {
                console.log(`\n⏱️ Testing ${metricType} for period ${period}`);
                
                // Get stored metric
                const stored = await getStoredMetrics(TEST_CONFIG.TENANT_ID, metricType, period);
                
                // Calculate fresh metric
                let calculated = null;
                switch (metricType) {
                    case 'ranking':
                        calculated = await calculateRankingMetric(TEST_CONFIG.TENANT_ID, period);
                        break;
                    case 'participation':
                        calculated = await calculateParticipationMetric(TEST_CONFIG.TENANT_ID, period);
                        break;
                    case 'risk_assessment':
                        calculated = await calculateRiskAssessmentMetric(TEST_CONFIG.TENANT_ID, period);
                        break;
                    case 'evolution':
                        calculated = await calculateEvolutionMetric(TEST_CONFIG.TENANT_ID, period);
                        break;
                }
                
                // Compare results
                const comparison = compareMetrics(calculated, stored, `${metricType}_${period}`);
                results[metricType][period] = comparison;
            }
        }
        
        // Generate summary report
        console.log('\n📊 FINAL SUMMARY REPORT');
        console.log('═'.repeat(80));
        
        let totalTests = 0;
        let successfulTests = 0;
        let structureMatches = 0;
        
        Object.entries(results).forEach(([metricType, periods]) => {
            console.log(`\n${metricType.toUpperCase()}:`);
            Object.entries(periods).forEach(([period, result]) => {
                totalTests++;
                const status = result.status === 'COMPARED' ? '✅' : '❌';
                const structure = result.structureMatch ? '✅' : '❌';
                console.log(`   ${period}: ${status} Calculated | ${structure} Structure`);
                
                if (result.status === 'COMPARED') successfulTests++;
                if (result.structureMatch) structureMatches++;
            });
        });
        
        console.log('\n🎯 OVERALL RESULTS:');
        console.log(`   Total Tests: ${totalTests}`);
        console.log(`   Successful Calculations: ${successfulTests}/${totalTests}`);
        console.log(`   Structure Matches: ${structureMatches}/${totalTests}`);
        console.log(`   Success Rate: ${((successfulTests/totalTests)*100).toFixed(1)}%`);
        
        return results;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Run tests if called directly
if (require.main === module) {
    test16ExistingMetrics()
        .then((results) => {
            console.log('\n✅ Test completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Test failed:', error);
            process.exit(1);
        });
}

module.exports = { 
    test16ExistingMetrics,
    calculateRankingMetric,
    calculateParticipationMetric,
    calculateRiskAssessmentMetric,
    calculateEvolutionMetric,
    compareMetrics
};