require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function manualPlatformAggregation() {
  try {
    console.log('🔧 MANUAL PLATFORM METRICS AGGREGATION');
    console.log('Since procedure deployment needs SQL Editor, we will aggregate manually\\n');
    
    const periods = ['7d', '30d', '90d'];
    const targetDate = new Date().toISOString().split('T')[0];
    
    for (const period of periods) {
      console.log(`📊 Processing period: ${period}`);
      
      // Get all tenant_metrics for this period
      const { data: tenantMetrics, error: fetchError } = await client
        .from('tenant_metrics')
        .select('tenant_id, metric_data')
        .eq('period', period)
        .eq('metric_type', 'comprehensive');
      
      if (fetchError) {
        console.log(`❌ Error fetching tenant metrics for ${period}:`, fetchError.message);
        continue;
      }
      
      if (!tenantMetrics || tenantMetrics.length === 0) {
        console.log(`⚠️ No tenant metrics found for period ${period}`);
        continue;
      }
      
      console.log(`   Found ${tenantMetrics.length} tenant records`);
      
      // Aggregate metrics manually
      let platformMrr = 0;
      let totalRevenue = 0;
      let totalAppointments = 0;
      let totalCustomers = 0;
      let totalAiInteractions = 0;
      let totalConversations = 0;
      let activeTenants = 0;
      let profitableTenants = 0;
      let totalPlatformCosts = 0;
      let totalPlatformMargin = 0;
      
      // Weighted averages
      let weightedSuccessRate = 0;
      let weightedConversionRate = 0;
      let weightedSatisfaction = 0;
      let weightedHealthScore = 0;
      let totalAppointmentsForWeights = 0;
      
      tenantMetrics.forEach(tenant => {
        const financial = tenant.metric_data?.financial_metrics || {};
        const appointments = tenant.metric_data?.appointment_metrics || {};
        const customers = tenant.metric_data?.customer_metrics || {};
        const conversations = tenant.metric_data?.conversation_outcomes || {};
        const outcomes = tenant.metric_data?.tenant_outcomes || {};
        
        // Platform MRR = SUM(platform_subscription_cost)
        const subscriptionCost = parseFloat(financial.platform_subscription_cost || 0);
        platformMrr += subscriptionCost;
        
        // Other aggregations
        totalRevenue += parseFloat(financial.tenant_revenue || 0);
        const appointmentCount = parseInt(appointments.appointments_total || 0);
        totalAppointments += appointmentCount;
        totalCustomers += parseInt(customers.customers_total || 0);
        totalAiInteractions += parseInt(conversations.ai_interactions_total || 0);
        totalConversations += parseInt(conversations.conversations_total || 0);
        
        if (appointmentCount > 0) activeTenants++;
        if (financial.is_profitable === true) profitableTenants++;
        
        totalPlatformCosts += parseFloat(financial.total_platform_cost || 0);
        totalPlatformMargin += parseFloat(financial.total_margin_usd || 0);
        
        // Weighted averages (weight by appointments)
        if (appointmentCount > 0) {
          weightedSuccessRate += (parseFloat(appointments.appointment_success_rate || 0) * appointmentCount);
          weightedConversionRate += (parseFloat(conversations.conversion_rate || 0) * appointmentCount);
          weightedSatisfaction += (parseFloat(conversations.customer_satisfaction_score || 0) * appointmentCount);
          weightedHealthScore += (parseInt(outcomes.health_score || 0) * appointmentCount);
          totalAppointmentsForWeights += appointmentCount;
        }
      });
      
      // Calculate weighted averages
      const avgSuccessRate = totalAppointmentsForWeights > 0 ? 
        (weightedSuccessRate / totalAppointmentsForWeights).toFixed(2) : 0;
      const avgConversionRate = totalAppointmentsForWeights > 0 ? 
        (weightedConversionRate / totalAppointmentsForWeights).toFixed(2) : 0;
      const avgSatisfaction = totalAppointmentsForWeights > 0 ? 
        (weightedSatisfaction / totalAppointmentsForWeights).toFixed(1) : 0;
      const avgHealthScore = totalAppointmentsForWeights > 0 ? 
        Math.round(weightedHealthScore / totalAppointmentsForWeights) : 0;
      
      console.log(`   💰 Platform MRR: $${platformMrr}`);
      console.log(`   💵 Total Revenue: $${totalRevenue}`);
      console.log(`   📅 Total Appointments: ${totalAppointments}`);
      console.log(`   ✅ Active Tenants: ${activeTenants}/${tenantMetrics.length}`);
      console.log(`   📈 Avg Success Rate: ${avgSuccessRate}%`);
      console.log(`   📊 Avg Health Score: ${avgHealthScore}`);
      
      // Check if platform_metrics table exists and insert
      const { data: insertResult, error: insertError } = await client
        .from('platform_metrics')
        .upsert({
          calculation_date: targetDate,
          period: period,
          platform_mrr: platformMrr,
          total_tenants_processed: tenantMetrics.length,
          active_tenants: activeTenants,
          total_revenue: totalRevenue,
          total_appointments: totalAppointments,
          total_customers: totalCustomers,
          total_ai_interactions: totalAiInteractions,
          total_conversations: totalConversations,
          avg_appointment_success_rate: parseFloat(avgSuccessRate),
          avg_conversion_rate: parseFloat(avgConversionRate),
          avg_customer_satisfaction_score: parseFloat(avgSatisfaction),
          avg_health_score: avgHealthScore,
          total_platform_costs: totalPlatformCosts,
          total_platform_margin: totalPlatformMargin,
          profitable_tenants_count: profitableTenants,
          data_source: 'manual_javascript_aggregation',
          aggregation_method: 'client_side_calculation'
        }, {
          onConflict: 'calculation_date,period'
        });
      
      if (insertError) {
        console.log(`❌ Error inserting platform metrics for ${period}:`, insertError.message);
      } else {
        console.log(`✅ Platform metrics for ${period} saved successfully\n`);
      }
    }
    
    // Verify results
    const { data: results } = await client
      .from('platform_metrics')
      .select('*')
      .eq('calculation_date', targetDate)
      .order('period');
    
    if (results && results.length > 0) {
      console.log('🎉 MANUAL AGGREGATION COMPLETED SUCCESSFULLY!');
      console.log(`✅ ${results.length} platform metrics records created`);
      
      console.log('\n📊 PLATFORM METRICS SUMMARY:');
      results.forEach(metric => {
        console.log(`${metric.period}: MRR=$${metric.platform_mrr}, Revenue=$${metric.total_revenue}, Tenants=${metric.active_tenants}/${metric.total_tenants_processed}`);
      });
      
      const mrr30d = results.find(r => r.period === '30d')?.platform_mrr || 0;
      console.log(`\n🏆 MONTHLY RECURRING REVENUE: $${mrr30d}`);
      
    } else {
      console.log('❌ No platform metrics found after aggregation');
    }
    
  } catch (error) {
    console.error('❌ Manual aggregation error:', error.message);
  }
}

manualPlatformAggregation();