const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUBABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Function to convert data to CSV
function convertToCSV(data, headers) {
  if (!data || data.length === 0) return '';
  
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

async function fetchAllConversationHistory() {
  console.log('📊 Fetching ALL conversation history records with pagination...');
  
  let allRecords = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('conversation_history')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error(`❌ Error fetching page ${page}:`, error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    allRecords = allRecords.concat(data);
    console.log(`📊 Fetched page ${page + 1}: ${data.length} records (total: ${allRecords.length})`);
    
    if (data.length < pageSize) {
      break; // Last page
    }
    
    page++;
  }
  
  console.log(`📊 Total conversation history records fetched: ${allRecords.length}`);
  return allRecords;
}

async function generateCompleteConversationsCSV() {
  console.log('📊 Generating COMPLETE Conversations CSV with ALL conversations...');
  
  try {
    // Get all conversation history records with pagination
    const conversationHistory = await fetchAllConversationHistory();

    if (conversationHistory.length === 0) {
      console.error('❌ No conversation history records found');
      return;
    }

    // Get tenants data
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name');

    // Get users data
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name');

    // Create lookup maps
    const tenantMap = new Map(tenants?.map(t => [t.id, t.name]) || []);
    const userMap = new Map(users?.map(u => [u.id, u.name]) || []);

    console.log(`📊 Processing ${conversationHistory.length} conversation history records...`);

    // Process conversation history into session metrics
    const sessionMap = new Map();
    
    conversationHistory.forEach((record, index) => {
      if (index % 1000 === 0) {
        console.log(`📊 Processing record ${index + 1}/${conversationHistory.length}`);
      }
      
      // Extract session_id from conversation_context
      const sessionId = record.conversation_context?.session_id || `${record.id}_${record.tenant_id}`;
      const sessionKey = `${sessionId}_${record.tenant_id}`;
      
      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          session_id: sessionId,
          tenant_id: record.tenant_id,
          user_id: record.user_id,
          tenant_name: tenantMap.get(record.tenant_id) || 'Unknown',
          user_name: userMap.get(record.user_id) || 'Unknown User',
          conversation_start: record.created_at,
          conversation_end: record.created_at,
          messages: [],
          final_outcome: record.conversation_outcome || 'completed'
        });
      }
      
      const session = sessionMap.get(sessionKey);
      session.messages.push(record);
      
      // Update start and end times
      if (new Date(record.created_at) < new Date(session.conversation_start)) {
        session.conversation_start = record.created_at;
      }
      if (new Date(record.created_at) > new Date(session.conversation_end)) {
        session.conversation_end = record.created_at;
      }
      
      // Update final outcome if available
      if (record.conversation_outcome) {
        session.final_outcome = record.conversation_outcome;
      }
    });

    console.log(`📊 Processed ${sessionMap.size} unique conversation sessions`);

    // Convert to final format
    const processedConversations = Array.from(sessionMap.values()).map(session => {
      const userMessages = session.messages.filter(m => m.is_from_user === true).length;
      const aiMessages = session.messages.filter(m => m.is_from_user === false).length;
      const totalMessages = session.messages.length;
      
      const duration = (new Date(session.conversation_end) - new Date(session.conversation_start)) / (1000 * 60);
      const avgConfidence = session.messages.reduce((sum, m) => sum + (m.confidence_score || 0.7), 0) / totalMessages;
      const totalTokens = session.messages.reduce((sum, m) => sum + (m.tokens_used || 100), 0);
      const totalApiCost = session.messages.reduce((sum, m) => sum + (m.api_cost_usd || 0.002), 0);
      const totalProcessingCost = session.messages.reduce((sum, m) => sum + (m.processing_cost_usd || 0.001), 0);
      const detectedIntents = [...new Set(session.messages.map(m => m.intent_detected || 'general').filter(i => i))].join(', ');

      return {
        session_id: session.session_id,
        tenant_name: session.tenant_name,
        user_name: session.user_name,
        conversation_start: session.conversation_start,
        conversation_end: session.conversation_end,
        duration_minutes: Math.round(duration * 100) / 100,
        total_messages: totalMessages,
        user_messages: userMessages,
        ai_messages: aiMessages,
        avg_confidence_score: Math.round(avgConfidence * 1000) / 1000,
        total_tokens: totalTokens,
        total_api_cost: Math.round(totalApiCost * 10000) / 10000,
        total_processing_cost: Math.round(totalProcessingCost * 10000) / 10000,
        total_cost: Math.round((totalApiCost + totalProcessingCost) * 10000) / 10000,
        final_outcome: session.final_outcome,
        detected_intents: detectedIntents
      };
    });

    // Sort by conversation start time (newest first)
    processedConversations.sort((a, b) => new Date(b.conversation_start) - new Date(a.conversation_start));

    const conversationsCSV = convertToCSV(processedConversations, [
      'session_id', 'tenant_name', 'user_name', 'conversation_start', 'conversation_end',
      'duration_minutes', 'total_messages', 'user_messages', 'ai_messages', 'avg_confidence_score',
      'total_tokens', 'total_api_cost', 'total_processing_cost', 'total_cost', 'final_outcome', 'detected_intents'
    ]);

    fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/conversations_complete_1041.csv', conversationsCSV);
    console.log(`🎉 COMPLETE Conversations CSV created: conversations_complete_1041.csv (${processedConversations.length} records)`);
    
  } catch (error) {
    console.error('❌ Error generating conversations CSV:', error);
  }
}

async function generateCompleteAppointmentsCSV() {
  console.log('📅 Generating COMPLETE Appointments CSV with ALL appointments...');
  
  try {
    // Get all appointments
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*')
      .order('start_time', { ascending: false });

    if (appointmentsError) {
      console.error('❌ Error fetching appointments:', appointmentsError);
      return;
    }

    console.log(`📅 Found ${appointments.length} appointment records`);

    // Get related data
    const { data: tenants } = await supabase.from('tenants').select('id, name, domain');
    const { data: users } = await supabase.from('users').select('id, name');
    const { data: professionals } = await supabase.from('professionals').select('id, name');
    const { data: services } = await supabase.from('services').select('id, name, price');

    // Create lookup maps
    const tenantMap = new Map(tenants?.map(t => [t.id, { name: t.name, domain: t.domain }]) || []);
    const userMap = new Map(users?.map(u => [u.id, u.name]) || []);
    const professionalMap = new Map(professionals?.map(p => [p.id, p.name]) || []);
    const serviceMap = new Map(services?.map(s => [s.id, { name: s.name, price: s.price }]) || []);

    // Process appointments
    const processedAppointments = appointments.map(apt => {
      const duration = (new Date(apt.end_time) - new Date(apt.start_time)) / (1000 * 60);
      const appointmentData = apt.appointment_data || {};
      const tenant = tenantMap.get(apt.tenant_id) || { name: 'Unknown', domain: 'general' };
      const service = serviceMap.get(apt.service_id) || { name: 'General Service', price: 100.00 };
      
      // Determine appointment type
      let appointmentType = 'WhatsApp Chat';
      if (appointmentData.source === 'google_calendar') {
        appointmentType = 'Google Calendar Direct';
      } else if (appointmentData.import_source === 'webhook_simulation') {
        appointmentType = 'Google Calendar Direct';
      }
      
      // Extract conversation ID if available
      let linkedConversationId = appointmentData.conversation_id || null;
      if (appointmentData.session_id) {
        linkedConversationId = appointmentData.session_id;
      }
      
      return {
        appointment_id: apt.id,
        appointment_type: appointmentType,
        tenant_name: tenant.name,
        user_name: userMap.get(apt.user_id) || 'Unknown User',
        professional_name: professionalMap.get(apt.professional_id) || 'Not Assigned',
        service_name: service.name,
        start_time: apt.start_time,
        end_time: apt.end_time,
        duration_minutes: Math.round(duration * 100) / 100,
        status: apt.status,
        quoted_price: Math.round((apt.quoted_price || service.price || 100.00) * 100) / 100,
        final_price: Math.round((apt.final_price || apt.quoted_price || service.price || 100.00) * 100) / 100,
        linked_conversation_id: linkedConversationId,
        booking_method: appointmentData.booking_method || 'whatsapp_ai',
        business_domain: tenant.domain || 'general'
      };
    });

    const appointmentsCSV = convertToCSV(processedAppointments, [
      'appointment_id', 'appointment_type', 'tenant_name', 'user_name', 'professional_name',
      'service_name', 'start_time', 'end_time', 'duration_minutes', 'status', 'quoted_price',
      'final_price', 'linked_conversation_id', 'booking_method', 'business_domain'
    ]);

    fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/appointments_complete_819.csv', appointmentsCSV);
    console.log(`🎉 COMPLETE Appointments CSV created: appointments_complete_819.csv (${processedAppointments.length} records)`);
    
  } catch (error) {
    console.error('❌ Error generating appointments CSV:', error);
  }
}

async function validateDataCounts() {
  console.log('🔍 Validating actual data counts in database...');
  
  try {
    // Count total conversation history records
    const { count: historyCount, error: historyCountError } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true });

    if (!historyCountError) {
      console.log(`📊 Total conversation history records: ${historyCount}`);
    }

    // Count appointments
    const { count: appointmentCount, error: appointmentCountError } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true });

    if (!appointmentCountError) {
      console.log(`📅 Total appointments: ${appointmentCount}`);
    }

    console.log('');
  } catch (error) {
    console.error('❌ Error validating counts:', error);
  }
}

async function main() {
  console.log('🚀 Starting COMPLETE CSV generation for ALL data...');
  console.log('📊 Using pagination to fetch ALL 4560 conversation records');
  console.log('═══════════════════════════════════════════════════');
  
  await validateDataCounts();
  await generateCompleteConversationsCSV();
  console.log('');
  await generateCompleteAppointmentsCSV();
  
  console.log('');
  console.log('✅ COMPLETE CSV generation finished!');
  console.log('📁 Files created:');
  console.log('   - conversations_complete_1041.csv');
  console.log('   - appointments_complete_819.csv');
  
  // Show file sizes
  try {
    const fs = require('fs');
    const convStats = fs.statSync('./conversations_complete_1041.csv');
    const aptStats = fs.statSync('./appointments_complete_819.csv');
    console.log(`📊 Conversations CSV: ${Math.round(convStats.size / 1024)} KB`);
    console.log(`📅 Appointments CSV: ${Math.round(aptStats.size / 1024)} KB`);
  } catch (e) {
    // File size check failed, not critical
  }
}

main().catch(console.error);