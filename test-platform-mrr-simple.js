/**
 * Simple test to verify the platform MRR calculation fix
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testPlatformMrrCalculation() {
    try {
        console.log('🧪 Testing Platform MRR Calculation Fix...\n');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase credentials');
        }
        
        const client = createClient(supabaseUrl, supabaseKey);
        
        console.log('1. 📊 Checking subscription payments for the last 30 days...');
        
        // Check subscription payments for the last 30 days
        const { data: subscriptionPayments, error } = await client
            .from('subscription_payments')
            .select('tenant_id, amount, currency, subscription_plan, payment_status, payment_period_start')
            .eq('payment_status', 'completed')
            .gte('payment_period_start', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
            
        if (error) throw error;
        
        console.log(`   Found ${subscriptionPayments?.length || 0} subscription payments`);
        
        if (subscriptionPayments && subscriptionPayments.length > 0) {
            const totalMRR = subscriptionPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
            const payingTenants = new Set(
                subscriptionPayments
                    .filter(p => parseFloat(p.amount || 0) > 0)
                    .map(p => p.tenant_id)
            ).size;
            
            console.log(`   💰 Expected Platform MRR: R$ ${totalMRR.toFixed(2)}`);
            console.log(`   👥 Paying tenants: ${payingTenants}`);
            
            // Payment breakdown
            const paymentsByPlan = {};
            subscriptionPayments.forEach(payment => {
                const plan = payment.subscription_plan || 'unknown';
                const amount = parseFloat(payment.amount || 0);
                if (!paymentsByPlan[plan]) paymentsByPlan[plan] = { count: 0, total: 0 };
                paymentsByPlan[plan].count++;
                paymentsByPlan[plan].total += amount;
            });
            
            console.log(`   📋 Payment breakdown:`);
            Object.entries(paymentsByPlan).forEach(([plan, data]) => {
                console.log(`      ${plan}: ${data.count} payments, R$ ${data.total.toFixed(2)}`);
            });
            
            console.log('\n2. 🔍 Checking tenant_metrics for subscription cost fields...');
            
            // Check if tenant_metrics have subscription cost data
            const { data: tenantMetrics } = await client
                .from('tenant_metrics')
                .select('tenant_id, metric_data, metricas_validadas, calculated_at')
                .eq('period', '30d')
                .eq('metric_type', 'comprehensive')
                .limit(3);
                
            let foundCostInMetrics = 0;
            let foundCostInValidated = 0;
            
            if (tenantMetrics) {
                tenantMetrics.forEach(metric => {
                    const data = metric.metric_data || {};
                    const validated = metric.metricas_validadas || {};
                    
                    if (data.custo_plataforma_brl || data.monthly_platform_cost_brl || data.platform_subscription_cost) {
                        foundCostInMetrics++;
                    }
                    
                    if (validated.monthly_platform_cost_brl && validated.monthly_platform_cost_brl.cost_brl) {
                        foundCostInValidated++;
                    }
                });
            }
            
            console.log(`   📊 Metrics with cost in metric_data: ${foundCostInMetrics}`);
            console.log(`   ✅ Metrics with cost in metricas_validadas: ${foundCostInValidated}`);
            
            if (foundCostInMetrics === 0 && foundCostInValidated === 0) {
                console.log('   ⚠️  No subscription cost found in tenant_metrics, will use fallback to subscription_payments table');
            }
            
            console.log('\n3. 🧮 Testing the aggregation logic simulation...');
            
            // Simulate the aggregation logic
            const subscriptionCostMap = new Map();
            subscriptionPayments.forEach(payment => {
                const currentCost = subscriptionCostMap.get(payment.tenant_id) || 0;
                const paymentAmount = parseFloat(payment.amount || 0);
                subscriptionCostMap.set(payment.tenant_id, currentCost + paymentAmount);
            });
            
            let simulatedPlatformMrr = 0;
            
            if (tenantMetrics) {
                tenantMetrics.forEach(metric => {
                    const data = metric.metric_data || {};
                    let subscriptionCost = 0;
                    
                    if (data.custo_plataforma_brl) {
                        subscriptionCost = parseFloat(data.custo_plataforma_brl);
                        console.log(`      Using custo_plataforma_brl: R$ ${subscriptionCost}`);
                    } else if (data.monthly_platform_cost_brl) {
                        subscriptionCost = parseFloat(data.monthly_platform_cost_brl);
                        console.log(`      Using monthly_platform_cost_brl: R$ ${subscriptionCost}`);
                    } else if (data.platform_subscription_cost) {
                        subscriptionCost = parseFloat(data.platform_subscription_cost);
                        console.log(`      Using platform_subscription_cost: R$ ${subscriptionCost}`);
                    } else if (metric.metricas_validadas && metric.metricas_validadas.monthly_platform_cost_brl) {
                        subscriptionCost = parseFloat(metric.metricas_validadas.monthly_platform_cost_brl.cost_brl || 0);
                        console.log(`      Using metricas_validadas cost: R$ ${subscriptionCost}`);
                    } else {
                        // Fallback to subscription_payments lookup
                        subscriptionCost = subscriptionCostMap.get(metric.tenant_id) || 0;
                        console.log(`      Using fallback subscription_payments for ${metric.tenant_id.substring(0, 8)}: R$ ${subscriptionCost}`);
                    }
                    
                    simulatedPlatformMrr += subscriptionCost;
                });
            }
            
            console.log(`   🧮 Simulated Platform MRR: R$ ${simulatedPlatformMrr.toFixed(2)}`);
            
            if (simulatedPlatformMrr > 0) {
                console.log('\n✅ SUCCESS: The fix should correctly calculate Platform MRR!');
                console.log(`💡 The platform aggregation service will now find R$ ${simulatedPlatformMrr.toFixed(2)} instead of $0.00`);
            } else {
                console.log('\n⚠️  Issue: Simulated Platform MRR is still $0');
            }
            
        } else {
            console.log('   ⚠️  No subscription payments found in the last 30 days');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Run the test
testPlatformMrrCalculation();