require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testNoExceptionDebug() {
  try {
    console.log('🔍 TESTING NO EXCEPTION DEBUG to see raw PostgreSQL errors\n');
    
    console.log('First, let me apply the debug function...');
    console.log('Please run: psql -d your_db -f database/debug-no-exception.sql\n');
    console.log('Or copy and paste the SQL from database/debug-no-exception.sql into your Supabase SQL editor\n');
    console.log('Then press Enter to continue...');
    
    // For now, let's assume it's applied and test
    await new Promise(resolve => {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      readline.question('Press Enter when debug function is applied...', () => {
        readline.close();
        resolve();
      });
    });
    
    // Get first tenant
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .limit(1);
    
    const tenant = tenants[0];
    console.log(`\nTesting with: ${tenant.business_name} ${tenant.id.substring(0, 8)}\n`);
    
    // Clear table
    await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    console.log('🚀 Running NO EXCEPTION debug procedure...\n');
    
    const { data: result, error } = await client.rpc('calculate_tenant_metrics_no_exception_debug', {
      p_calculation_date: new Date().toISOString().split('T')[0],
      p_tenant_id: tenant.id
    });
    
    if (error) {
      console.log('🎯🎯🎯 CAUGHT THE REAL ERROR! 🎯🎯🎯');
      console.log('Error code:', error.code);
      console.log('Error message:', error.message);
      console.log('Error details:', error.details);
      console.log('Error hint:', error.hint);
      console.log('\nThis is the REAL reason why store_tenant_metric fails in v7.0!');
    } else {
      console.log('✅ Result:', result);
      
      // Check if record was stored
      const { count } = await client
        .from('tenant_metrics')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);
      
      console.log(`Records stored: ${count}`);
      
      if (count === 1) {
        console.log('🎉 SUCCESS! The simplified version works!');
        console.log('This means the issue is likely in the COMPLEX JSONB building in v7.0');
        
        // Let's test with the EXACT v7.0 complex JSONB
        console.log('\n🧪 Now testing with EXACT v7.0 complex JSONB...');
        
        await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        
        // Create complex version
        const createComplexSQL = `
CREATE OR REPLACE FUNCTION test_v7_complex_jsonb(
    p_tenant_id uuid
) RETURNS json AS $$
DECLARE
    v_comprehensive_metrics JSONB;
BEGIN
    -- Build EXACT same complex metrics as v7.0
    v_comprehensive_metrics := jsonb_build_object(
        'financial_metrics', jsonb_build_object(
            'tenant_revenue', 1000,
            'mrr', 1000,
            'avg_ticket', 50,
            'revenue_per_customer', 100,
            'subscription_revenue', 100,
            'upsell_revenue', 50,
            'recurring_percentage', 15.0,
            'discount_amount', 20
        ),
        'appointment_metrics', jsonb_build_object(
            'appointments_total', 20,
            'appointments_confirmed', 15,
            'appointments_completed', 12,
            'appointments_cancelled', 2,
            'appointments_missed', 1,
            'appointments_rescheduled', 0,
            'appointment_success_rate', 60.0,
            'avg_appointment_value', 50,
            'avg_booking_lead_time', 2
        ),
        'customer_metrics', jsonb_build_object(
            'customers_total', 10,
            'customers_new', 3,
            'customers_returning', 7,
            'customer_retention_rate', 70.0,
            'avg_customer_lifetime_value', 300,
            'customer_acquisition_cost', 15,
            'customers_at_risk', 1,
            'customer_satisfaction_score', 4.2
        ),
        'conversation_outcomes', jsonb_build_object(
            'conversations_total', 25,
            'successful_bookings', 20,
            'failed_bookings', 5,
            'avg_conversation_duration', 8,
            'conversation_to_booking_rate', 80.0,
            'avg_response_time', 30,
            'customer_satisfaction_conversations', 4.1,
            'conversation_resolution_rate', 85.0
        ),
        'service_metrics', jsonb_build_object(
            'services_available', 5,
            'services_booked', 5,
            'service_utilization_rate', 100.0,
            'popular_services', 'Consultation, Treatment',
            'avg_service_duration', 60,
            'service_cancellation_rate', 10.0,
            'peak_service_hours', '14:00-18:00',
            'service_revenue_distribution', jsonb_build_object('consultation', 60, 'treatment', 40)
        ),
        'ai_metrics', jsonb_build_object(
            'ai_interactions_total', 50,
            'successful_ai_resolutions', 40,
            'ai_escalations', 10,
            'ai_success_rate', 80.0,
            'avg_ai_response_time', 2,
            'ai_learning_score', 4.0,
            'ai_cost_per_interaction', 0.015,
            'ai_automation_rate', 200.0
        ),
        'tenant_outcomes', jsonb_build_object(
            'business_growth_rate', 5.0,
            'operational_efficiency', 75.0,
            'customer_engagement_score', 4.1,
            'tenant_health_score', 85,
            'churn_risk_level', 'LOW',
            'recommended_actions', '[\"Optimize pricing\", \"Expand services\"]'::jsonb,
            'improvement_areas', '[\"Customer retention\", \"Service quality\"]'::jsonb,
            'success_metrics', jsonb_build_object('conversion_rate', 15.5, 'satisfaction', 4.2)
        ),
        'historical_metrics', jsonb_build_object(
            'month_over_month_growth', 8.5,
            'quarter_over_quarter_growth', 25.0,
            'year_over_year_growth', 45.0,
            'trend_analysis', jsonb_build_object('direction', 'upward', 'confidence', 0.85),
            'seasonal_patterns', jsonb_build_object('peak_month', 'December', 'low_month', 'February'),
            'performance_benchmarks', jsonb_build_object('industry_avg', 4.0, 'top_quartile', 4.5),
            'growth_trajectory', 'GROWING'
        ),
        'platform_participation', jsonb_build_object(
            'platform_revenue_share', 10.0,
            'platform_customer_share', 5.0,
            'platform_interaction_share', 8.0,
            'competitive_positioning', 3,
            'market_share_rank', 3,
            'collaboration_score', 75,
            'platform_integration_level', 'INTERMEDIATE'
        ),
        'cost_breakdown', jsonb_build_object(
            'whatsapp_api_costs', 0.25,
            'openai_api_costs', 0.5,
            'infrastructure_costs', 20,
            'support_costs', 25,
            'total_operational_costs', 45.75,
            'cost_per_customer', 4.575,
            'profit_margin', 95.425
        ),
        'metadata', jsonb_build_object(
            'calculation_date', CURRENT_DATE,
            'period_days', 30,
            'period_start', CURRENT_DATE - 29,
            'period_end', CURRENT_DATE,
            'data_source', 'test_complex',
            'version', 'TEST_V7_EXACT_COMPLEX',
            'metrics_count', 73,
            'modules_included', 11
        )
    );
    
    RAISE NOTICE 'Complex JSONB size: % chars', LENGTH(v_comprehensive_metrics::text);
    
    -- NO EXCEPTION - let's see what happens
    PERFORM store_tenant_metric(
        p_tenant_id,
        'comprehensive',
        v_comprehensive_metrics,
        '30d'
    );
    
    RETURN json_build_object('success', true, 'message', 'Complex JSONB test completed');
END;
$$ LANGUAGE plpgsql;
`;
        
        console.log('Please apply this complex test function and run it...');
      } else {
        console.log('❌ Even simplified version fails - there is a deeper PostgreSQL issue');
      }
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

testNoExceptionDebug();