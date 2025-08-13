require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testJsonbSizeHypothesis() {
  try {
    console.log('🔍 TESTING HYPOTHESIS: Is the problem JSONB size/complexity?\n');
    
    const problemTenants = [
      { name: 'Centro Terapêutico Equilíbrio', id: 'f34d8c94-f6cf-4dd7-82de-a3123b380cd8' },
      { name: 'Clínica Mente Sã', id: 'fe2fa876-05da-49b5-b266-8141bcd090fa' }
    ];
    
    for (const tenant of problemTenants) {
      console.log(`=== ${tenant.name} (${tenant.id.substring(0, 8)}) ===`);
      
      // Clear table
      await client.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Let's try manually creating the EXACT same data that would be in the main procedure
      const today = new Date().toISOString().split('T')[0];
      
      for (const periodDays of [7, 30, 90]) {
        console.log(`\\nTesting period ${periodDays}d manually...`);
        
        // Calculate dates exactly like the main procedure
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - (periodDays - 1));
        const endDate = new Date(today);
        
        // Get data exactly like main procedure
        const { data: appointments } = await client
          .from('appointments')
          .select('quoted_price, final_price')
          .eq('tenant_id', tenant.id)
          .gte('start_time', startDate.toISOString())
          .lt('start_time', new Date(endDate.getTime() + 24*60*60*1000).toISOString());
        
        const revenue = (appointments || []).reduce((sum, apt) => {
          const price = apt.quoted_price || apt.final_price || 0;
          return sum + price;
        }, 0);
        
        const appointmentCount = (appointments || []).length;
        
        console.log(`Data: ${appointmentCount} appointments, $${revenue} revenue`);
        
        // Test 1: Try with SIMPLE JSONB (like debug version)
        try {
          const simpleJsonb = {
            revenue: revenue,
            appointments: appointmentCount,
            period_days: periodDays,
            version: 'simple_test'
          };
          
          const { error: simpleError } = await client.rpc('store_tenant_metric', {
            p_tenant_id: tenant.id,
            p_metric_type: 'simple_test',
            p_metric_data: simpleJsonb,
            p_period: periodDays + 'd'
          });
          
          if (simpleError) {
            console.log(`❌ Simple JSONB failed: ${simpleError.message}`);
          } else {
            console.log(`✅ Simple JSONB worked`);
          }
        } catch (err) {
          console.log(`❌ Simple JSONB exception: ${err.message}`);
        }
        
        // Clear for next test
        await client.from('tenant_metrics').delete().eq('tenant_id', tenant.id);
        
        // Test 2: Try with COMPLEX JSONB (like main procedure)
        try {
          const complexJsonb = {
            financial_metrics: {
              tenant_revenue: revenue,
              mrr: revenue * 30 / periodDays,
              avg_ticket: appointmentCount > 0 ? revenue / appointmentCount : 0,
              revenue_per_customer: 0,
              subscription_revenue: 0,
              upsell_revenue: 0,
              recurring_percentage: 0,
              discount_amount: 0
            },
            appointment_metrics: {
              appointments_total: appointmentCount,
              appointments_confirmed: 0,
              appointments_completed: 0,
              appointments_cancelled: 0,
              appointments_missed: 0,
              appointments_rescheduled: 0,
              appointment_success_rate: 0,
              avg_appointment_value: appointmentCount > 0 ? revenue / appointmentCount : 0,
              avg_booking_lead_time: 0
            },
            customer_metrics: {
              customers_total: 0,
              customers_new: 0,
              customers_returning: 0,
              customer_retention_rate: 0,
              avg_customer_lifetime_value: 0,
              customer_acquisition_cost: 0,
              customers_at_risk: 0,
              customer_satisfaction_score: 0
            },
            conversation_outcomes: {
              conversations_total: 0,
              successful_bookings: 0,
              failed_bookings: 0,
              avg_conversation_duration: 0,
              conversation_to_booking_rate: 0,
              avg_response_time: 0,
              customer_satisfaction_conversations: 0,
              conversation_resolution_rate: 0
            },
            service_metrics: {
              services_available: 1,
              services_booked: 0,
              service_utilization_rate: 0,
              popular_services: '',
              avg_service_duration: 0,
              service_cancellation_rate: 0,
              peak_service_hours: '',
              service_revenue_distribution: {}
            },
            ai_metrics: {
              ai_interactions_total: 0,
              successful_ai_resolutions: 0,
              ai_escalations: 0,
              ai_success_rate: 0,
              avg_ai_response_time: 0,
              ai_learning_score: 0,
              ai_cost_per_interaction: 0,
              ai_automation_rate: 0
            },
            metadata: {
              calculation_date: today,
              period_days: periodDays,
              data_source: 'complex_test',
              version: 'COMPLEX_TEST_v1.0'
            }
          };
          
          const { error: complexError } = await client.rpc('store_tenant_metric', {
            p_tenant_id: tenant.id,
            p_metric_type: 'complex_test',
            p_metric_data: complexJsonb,
            p_period: periodDays + 'd'
          });
          
          if (complexError) {
            console.log(`❌ Complex JSONB failed: ${complexError.message}`);
          } else {
            console.log(`✅ Complex JSONB worked`);
          }
        } catch (err) {
          console.log(`❌ Complex JSONB exception: ${err.message}`);
        }
        
        // Clear for next test  
        await client.from('tenant_metrics').delete().eq('tenant_id', tenant.id);
      }
      
      console.log('\\n');
    }
    
    console.log('🎯 HYPOTHESIS TEST COMPLETE');
    console.log('If simple JSONB works but complex fails → JSONB size/complexity is the issue');
    console.log('If both fail → Different issue (constraints, data validation, etc)');
    console.log('If both work → Issue is in the procedure logic, not the data');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testJsonbSizeHypothesis();