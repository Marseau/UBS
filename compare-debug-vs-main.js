require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function compareDebugVsMain() {
  try {
    console.log('🔍 COMPARING DEBUG PROCEDURE (works) vs MAIN PROCEDURE (fails)\n');
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    if (!tenants || tenants.length === 0) {
      console.log('❌ No tenants found');
      return;
    }
    
    const tenant = tenants[0];
    console.log(`Testing with tenant: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    // Clear table
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // TEST 1: DEBUG PROCEDURE (working)
    console.log('='.repeat(60));
    console.log('🟢 TEST 1: DEBUG PROCEDURE (should work)');
    console.log('='.repeat(60));
    
    const { data: debugResult, error: debugError } = await client.rpc('calculate_tenant_metrics_debug', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    if (debugError) {
      console.log('❌ Debug procedure error:', debugError);
    } else {
      console.log('Debug result:', debugResult);
      
      const { data: debugMetrics, count: debugCount } = await client
        .from('tenant_metrics')
        .select('metric_type, period, metric_data', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`✅ Debug stored: ${debugCount} records`);
      if (debugMetrics && debugMetrics.length > 0) {
        debugMetrics.forEach(m => {
          console.log(`  - ${m.metric_type} [${m.period}]: ${JSON.stringify(m.metric_data).substring(0, 100)}...`);
        });
      }
    }
    
    // Clear for next test
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // TEST 2: v7.0 MAIN PROCEDURE (failing)
    console.log('\n' + '='.repeat(60));
    console.log('🔴 TEST 2: v7.0 MAIN PROCEDURE (should fail)');
    console.log('='.repeat(60));
    
    const { data: mainResult, error: mainError } = await client.rpc('calculate_tenant_metrics_definitiva_total_v7', {
      p_calculation_date: new Date().toISOString().split('T')[0], 
      p_tenant_id: tenant.id
    });
    
    if (mainError) {
      console.log('❌ Main procedure error:', mainError);
    } else {
      console.log('Main result:', mainResult);
      
      const { data: mainMetrics, count: mainCount } = await client
        .from('tenant_metrics')
        .select('metric_type, period, metric_data', { count: 'exact' })
        .eq('tenant_id', tenant.id);
      
      console.log(`❌ Main stored: ${mainCount} records`);
      if (mainMetrics && mainMetrics.length > 0) {
        mainMetrics.forEach(m => {
          console.log(`  - ${m.metric_type} [${m.period}]: ${JSON.stringify(m.metric_data).substring(0, 100)}...`);
        });
      }
    }
    
    // TEST 3: Direct store_tenant_metric with exact v7.0 data
    console.log('\n' + '='.repeat(60));
    console.log('🧪 TEST 3: DIRECT store_tenant_metric with COMPLEX v7.0 data');
    console.log('='.repeat(60));
    
    // Clear table
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    // Create exact same complex JSONB as v7.0 uses
    const complexV7Data = {
      financial_metrics: {
        tenant_revenue: 1000,
        mrr: 1000,
        avg_ticket: 50,
        revenue_per_customer: 100,
        subscription_revenue: 100,
        upsell_revenue: 50,
        recurring_percentage: 15,
        discount_amount: 20
      },
      appointment_metrics: {
        appointments_total: 20,
        appointments_confirmed: 15,
        appointments_completed: 12,
        appointments_cancelled: 2,
        appointments_missed: 1,
        appointments_rescheduled: 0,
        appointment_success_rate: 60,
        avg_appointment_value: 50,
        avg_booking_lead_time: 2
      },
      customer_metrics: {
        customers_total: 10,
        customers_new: 3,
        customers_returning: 7,
        customer_retention_rate: 70,
        avg_customer_lifetime_value: 300,
        customer_acquisition_cost: 15,
        customers_at_risk: 1,
        customer_satisfaction_score: 4.2
      },
      conversation_outcomes: {
        conversations_total: 25,
        successful_bookings: 20,
        failed_bookings: 5,
        avg_conversation_duration: 8,
        conversation_to_booking_rate: 80,
        avg_response_time: 30,
        customer_satisfaction_conversations: 4.1,
        conversation_resolution_rate: 85
      },
      service_metrics: {
        services_available: 5,
        services_booked: 5,
        service_utilization_rate: 100,
        popular_services: 'Consultation, Treatment',
        avg_service_duration: 60,
        service_cancellation_rate: 10,
        peak_service_hours: '14:00-18:00',
        service_revenue_distribution: { consultation: 60, treatment: 40 }
      },
      ai_metrics: {
        ai_interactions_total: 50,
        successful_ai_resolutions: 40,
        ai_escalations: 10,
        ai_success_rate: 80,
        avg_ai_response_time: 2,
        ai_learning_score: 4,
        ai_cost_per_interaction: 0.015,
        ai_automation_rate: 200
      },
      tenant_outcomes: {
        business_growth_rate: 5,
        operational_efficiency: 75,
        customer_engagement_score: 4.1,
        tenant_health_score: 85,
        churn_risk_level: 'LOW',
        recommended_actions: ['Optimize pricing', 'Expand services'],
        improvement_areas: ['Customer retention', 'Service quality'],
        success_metrics: { conversion_rate: 15.5, satisfaction: 4.2 }
      },
      historical_metrics: {
        month_over_month_growth: 8.5,
        quarter_over_quarter_growth: 25,
        year_over_year_growth: 45,
        trend_analysis: { direction: 'upward', confidence: 0.85 },
        seasonal_patterns: { peak_month: 'December', low_month: 'February' },
        performance_benchmarks: { industry_avg: 4, top_quartile: 4.5 },
        growth_trajectory: 'GROWING'
      },
      platform_participation: {
        platform_revenue_share: 10,
        platform_customer_share: 5,
        platform_interaction_share: 8,
        competitive_positioning: 3,
        market_share_rank: 3,
        collaboration_score: 75,
        platform_integration_level: 'INTERMEDIATE'
      },
      cost_breakdown: {
        whatsapp_api_costs: 0.25,
        openai_api_costs: 0.5,
        infrastructure_costs: 20,
        support_costs: 25,
        total_operational_costs: 45.75,
        cost_per_customer: 4.575,
        profit_margin: 95.425
      },
      metadata: {
        calculation_date: '2025-08-10',
        period_days: 30,
        period_start: '2025-07-12',
        period_end: '2025-08-10',
        data_source: 'direct_test',
        version: 'TEST_COMPLEX_V7_DATA',
        metrics_count: 73,
        modules_included: 11
      }
    };
    
    console.log('Testing direct store_tenant_metric with complex v7.0-style JSONB...');
    try {
      const { error: directError } = await client.rpc('store_tenant_metric', {
        p_tenant_id: tenant.id,
        p_metric_type: 'comprehensive',
        p_metric_data: complexV7Data,
        p_period: '30d'
      });
      
      if (directError) {
        console.log('❌ Direct complex store error:', directError);
      } else {
        console.log('✅ Direct complex store succeeded');
        
        const { count } = await client
          .from('tenant_metrics')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);
        
        console.log(`Records stored: ${count}`);
      }
    } catch (err) {
      console.log('❌ Direct complex store exception:', err.message);
    }
    
    // SUMMARY
    console.log('\n' + '='.repeat(60));
    console.log('📊 COMPARISON SUMMARY');
    console.log('='.repeat(60));
    console.log('🟢 Debug procedure: WORKS (stores records)');
    console.log('🔴 v7.0 main procedure: FAILS (0 records)');
    console.log('🧪 Direct complex store: ?');
    console.log('\nNEXT: If direct complex store works, the issue is in HOW v7.0 calls store_tenant_metric');
    console.log('If direct complex store fails, the issue is the JSONB complexity/size');
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

compareDebugVsMain();