require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debug30dCalculation() {
  try {
    console.log('🔍 DEBUGGING: What happens during 30d calculation for failing tenants\n');
    
    const problemTenants = ['f34d8c94', 'fe2fa876'];
    
    // Get all tenants first to compare
    const { data: allTenants } = await client
      .from('tenants')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name');
    
    console.log(`📋 Found ${allTenants.length} active tenants`);
    
    for (const tenant of allTenants) {
      const prefix = tenant.id.substring(0, 8);
      const isProblematic = problemTenants.includes(prefix);
      
      if (isProblematic) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔴 PROBLEMATIC TENANT: ${tenant.business_name} (${prefix})`);
        console.log(`${'='.repeat(60)}`);
      } else {
        console.log(`\n✅ WORKING TENANT: ${tenant.business_name} (${prefix})`);
      }
      
      // Test the exact date calculations the procedure uses
      const today = new Date();
      const calculationDate = today.toISOString().split('T')[0];
      
      console.log(`📅 Calculation date: ${calculationDate}`);
      
      // Test each period like the procedure does
      for (const periodDays of [7, 30, 90]) {
        console.log(`\n--- Period ${periodDays}d ---`);
        
        // Replicate EXACT procedure logic
        const startDate = new Date(calculationDate);
        startDate.setDate(startDate.getDate() - (periodDays - 1));
        const endDate = new Date(calculationDate);
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];
        
        console.log(`Date window: ${startDateStr} to ${endDateStr}`);
        console.log(`SQL condition: start_time >= '${startDateStr}T00:00:00' AND start_time < '${new Date(endDate.getTime() + 24*60*60*1000).toISOString()}'`);
        
        // Test appointments query
        const { data: appointments, count: aptCount } = await client
          .from('appointments')
          .select('id, start_time, status, quoted_price, final_price', { count: 'exact' })
          .eq('tenant_id', tenant.id)
          .gte('start_time', startDate.toISOString())
          .lt('start_time', new Date(endDate.getTime() + 24*60*60*1000).toISOString());
        
        const revenue = appointments ? appointments.reduce((sum, apt) => {
          const price = apt.quoted_price || apt.final_price || 0;
          return sum + price;
        }, 0) : 0;
        
        console.log(`💰 Appointments: ${aptCount || 0}, Revenue: $${revenue}`);
        
        // Test conversations query  
        const { count: convCount } = await client
          .from('conversation_history')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', startDate.toISOString())
          .lt('created_at', new Date(endDate.getTime() + 24*60*60*1000).toISOString());
        
        console.log(`💬 Conversations: ${convCount || 0}`);
        
        // For problematic tenants on 30d, let's check if there's something special
        if (isProblematic && periodDays === 30) {
          console.log(`🔍 DEEP DIVE for ${prefix} on 30d period:`);
          
          // Check if there are appointments in this window
          if (appointments && appointments.length > 0) {
            console.log('Sample appointments:');
            appointments.slice(0, 3).forEach((apt, i) => {
              console.log(`  ${i + 1}. ${apt.start_time} - Status: ${apt.status} - Price: ${apt.quoted_price || apt.final_price || 0}`);
            });
          } else {
            console.log('❌ NO appointments found in 30d window');
          }
          
          // Check conversations detail
          const { data: conversations } = await client
            .from('conversation_history')
            .select('created_at, is_from_user, conversation_context')
            .eq('tenant_id', tenant.id)
            .gte('created_at', startDate.toISOString())
            .lt('created_at', new Date(endDate.getTime() + 24*60*60*1000).toISOString())
            .limit(5);
          
          if (conversations && conversations.length > 0) {
            console.log('Sample conversations:');
            conversations.forEach((conv, i) => {
              const sessionId = conv.conversation_context?.session_id;
              console.log(`  ${i + 1}. ${conv.created_at} - From user: ${conv.is_from_user} - Session: ${sessionId}`);
            });
          } else {
            console.log('❌ NO conversations found in 30d window');
          }
        }
        
        // Don't flood output for working tenants
        if (isProblematic || periodDays === 30) {
          // Only show details for problematic tenants or 30d period for all
        } else if (aptCount === 0 && convCount === 0) {
          console.log('(No data in this period)');
        }
      }
      
      // Only show a few tenants to avoid too much output
      const currentIndex = allTenants.indexOf(tenant);
      if (currentIndex > 3 && !isProblematic) {
        console.log(`\n... (skipping remaining ${allTenants.length - currentIndex - 1} working tenants) ...\n`);
        break;
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debug30dCalculation();