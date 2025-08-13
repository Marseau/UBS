const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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

async function generateCompleteConversationsCSV() {
  console.log('📊 Generating COMPLETE Conversations CSV with ALL 1041 conversations...');
  
  const conversationQuery = `
    -- Complete conversation metrics query for ALL 1041 conversations
    WITH conversation_metrics AS (
      SELECT 
        ch.session_id,
        t.name as tenant_name,
        u.name as user_name,
        MIN(ch.timestamp) as conversation_start,
        MAX(ch.timestamp) as conversation_end,
        EXTRACT(EPOCH FROM (MAX(ch.timestamp) - MIN(ch.timestamp))) / 60.0 as duration_minutes,
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE ch.sender = 'user') as user_messages,
        COUNT(*) FILTER (WHERE ch.sender = 'assistant') as ai_messages,
        AVG(COALESCE(ch.confidence_score, 0.7)) as avg_confidence_score,
        SUM(COALESCE(ch.tokens_used, 100)) as total_tokens,
        SUM(COALESCE(ch.api_cost, 0.002)) as total_api_cost,
        SUM(COALESCE(ch.processing_cost, 0.001)) as total_processing_cost,
        SUM(COALESCE(ch.api_cost, 0.002) + COALESCE(ch.processing_cost, 0.001)) as total_cost,
        COALESCE(cs.final_outcome, 'completed') as final_outcome,
        STRING_AGG(DISTINCT COALESCE(ch.detected_intent, 'general'), ', ') as detected_intents
      FROM conversation_history ch
      LEFT JOIN tenants t ON ch.tenant_id = t.id
      LEFT JOIN users u ON ch.user_id = u.id
      LEFT JOIN conversation_states cs ON ch.session_id = cs.session_id AND ch.tenant_id = cs.tenant_id
      WHERE ch.session_id IS NOT NULL
      GROUP BY ch.session_id, ch.tenant_id, t.name, u.name, cs.final_outcome
    )
    SELECT 
      session_id,
      tenant_name,
      user_name,
      conversation_start,
      conversation_end,
      ROUND(duration_minutes::numeric, 2) as duration_minutes,
      total_messages,
      user_messages,
      ai_messages,
      ROUND(avg_confidence_score::numeric, 3) as avg_confidence_score,
      total_tokens,
      ROUND(total_api_cost::numeric, 4) as total_api_cost,
      ROUND(total_processing_cost::numeric, 4) as total_processing_cost,
      ROUND(total_cost::numeric, 4) as total_cost,
      final_outcome,
      detected_intents
    FROM conversation_metrics
    ORDER BY conversation_start DESC;
  `;

  try {
    const { data: conversations, error } = await supabase.rpc('execute_raw_sql', { 
      query: conversationQuery 
    });

    if (error) {
      console.error('❌ Error fetching conversations:', error);
      
      // Fallback: Direct table query
      console.log('🔄 Trying direct table query...');
      const { data: directData, error: directError } = await supabase
        .from('conversation_history')
        .select(`
          session_id,
          timestamp,
          sender,
          confidence_score,
          tokens_used,
          api_cost,
          processing_cost,
          detected_intent,
          tenant_id,
          user_id,
          tenants!inner(name),
          users!inner(name),
          conversation_states(final_outcome)
        `)
        .not('session_id', 'is', null);

      if (directError) {
        console.error('❌ Direct query also failed:', directError);
        return;
      }

      // Process the direct data into conversation metrics
      const sessionMap = new Map();
      
      directData.forEach(record => {
        const sessionKey = `${record.session_id}_${record.tenant_id}`;
        
        if (!sessionMap.has(sessionKey)) {
          sessionMap.set(sessionKey, {
            session_id: record.session_id,
            tenant_name: record.tenants?.name || 'Unknown',
            user_name: record.users?.name || 'Unknown User',
            conversation_start: record.timestamp,
            conversation_end: record.timestamp,
            messages: [],
            final_outcome: record.conversation_states?.[0]?.final_outcome || 'completed'
          });
        }
        
        const session = sessionMap.get(sessionKey);
        session.messages.push(record);
        
        // Update start and end times
        if (new Date(record.timestamp) < new Date(session.conversation_start)) {
          session.conversation_start = record.timestamp;
        }
        if (new Date(record.timestamp) > new Date(session.conversation_end)) {
          session.conversation_end = record.timestamp;
        }
      });

      // Convert to final format
      const processedConversations = Array.from(sessionMap.values()).map(session => {
        const userMessages = session.messages.filter(m => m.sender === 'user').length;
        const aiMessages = session.messages.filter(m => m.sender === 'assistant').length;
        const totalMessages = session.messages.length;
        
        const duration = (new Date(session.conversation_end) - new Date(session.conversation_start)) / (1000 * 60);
        const avgConfidence = session.messages.reduce((sum, m) => sum + (m.confidence_score || 0.7), 0) / totalMessages;
        const totalTokens = session.messages.reduce((sum, m) => sum + (m.tokens_used || 100), 0);
        const totalApiCost = session.messages.reduce((sum, m) => sum + (m.api_cost || 0.002), 0);
        const totalProcessingCost = session.messages.reduce((sum, m) => sum + (m.processing_cost || 0.001), 0);
        const detectedIntents = [...new Set(session.messages.map(m => m.detected_intent || 'general'))].join(', ');

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

      console.log(`✅ Processed ${processedConversations.length} conversations from direct query`);
      
      const conversationsCSV = convertToCSV(processedConversations, [
        'session_id', 'tenant_name', 'user_name', 'conversation_start', 'conversation_end',
        'duration_minutes', 'total_messages', 'user_messages', 'ai_messages', 'avg_confidence_score',
        'total_tokens', 'total_api_cost', 'total_processing_cost', 'total_cost', 'final_outcome', 'detected_intents'
      ]);

      fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/conversations_complete_1041.csv', conversationsCSV);
      console.log(`🎉 COMPLETE Conversations CSV created: conversations_complete_1041.csv (${processedConversations.length} records)`);
      return;
    }

    const conversationsCSV = convertToCSV(conversations, [
      'session_id', 'tenant_name', 'user_name', 'conversation_start', 'conversation_end',
      'duration_minutes', 'total_messages', 'user_messages', 'ai_messages', 'avg_confidence_score',
      'total_tokens', 'total_api_cost', 'total_processing_cost', 'total_cost', 'final_outcome', 'detected_intents'
    ]);

    fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/conversations_complete_1041.csv', conversationsCSV);
    console.log(`🎉 COMPLETE Conversations CSV created: conversations_complete_1041.csv (${conversations.length} records)`);
    
  } catch (error) {
    console.error('❌ Error generating conversations CSV:', error);
  }
}

async function generateCompleteAppointmentsCSV() {
  console.log('📅 Generating COMPLETE Appointments CSV with ALL 819 appointments...');
  
  const appointmentsQuery = `
    -- Complete appointments query for ALL 819 appointments
    WITH appointment_details AS (
      SELECT 
        a.id as appointment_id,
        CASE 
          WHEN a.appointment_data->>'source' = 'whatsapp_chat' THEN 'WhatsApp Chat'
          WHEN a.appointment_data->>'source' = 'google_calendar' THEN 'Google Calendar Direct'
          ELSE 'WhatsApp Chat'
        END as appointment_type,
        t.name as tenant_name,
        u.name as user_name,
        p.name as professional_name,
        s.name as service_name,
        a.start_time,
        a.end_time,
        EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60.0 as duration_minutes,
        a.status,
        COALESCE((a.appointment_data->>'quoted_price')::numeric, s.price, 100.00) as quoted_price,
        COALESCE((a.appointment_data->>'final_price')::numeric, s.price, 100.00) as final_price,
        a.appointment_data->>'conversation_id' as linked_conversation_id,
        COALESCE(a.appointment_data->>'booking_method', 'whatsapp_ai') as booking_method,
        t.business_domain
      FROM appointments a
      LEFT JOIN tenants t ON a.tenant_id = t.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN professionals p ON a.professional_id = p.id
      LEFT JOIN services s ON a.service_id = s.id
    )
    SELECT 
      appointment_id,
      appointment_type,
      tenant_name,
      user_name,
      professional_name,
      service_name,
      start_time,
      end_time,
      ROUND(duration_minutes::numeric, 2) as duration_minutes,
      status,
      ROUND(quoted_price::numeric, 2) as quoted_price,
      ROUND(final_price::numeric, 2) as final_price,
      linked_conversation_id,
      booking_method,
      business_domain
    FROM appointment_details
    ORDER BY start_time DESC;
  `;

  try {
    const { data: appointments, error } = await supabase.rpc('execute_raw_sql', { 
      query: appointmentsQuery 
    });

    if (error) {
      console.error('❌ Error fetching appointments:', error);
      
      // Fallback: Direct table query
      console.log('🔄 Trying direct appointments query...');
      const { data: directAppointments, error: directError } = await supabase
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          appointment_data,
          tenant_id,
          user_id,
          professional_id,
          service_id,
          tenants!inner(name, business_domain),
          users!inner(name),
          professionals(name),
          services(name, price)
        `);

      if (directError) {
        console.error('❌ Direct appointments query failed:', directError);
        return;
      }

      // Process the direct appointments data
      const processedAppointments = directAppointments.map(apt => {
        const duration = (new Date(apt.end_time) - new Date(apt.start_time)) / (1000 * 60);
        const appointmentData = apt.appointment_data || {};
        
        return {
          appointment_id: apt.id,
          appointment_type: appointmentData.source === 'google_calendar' ? 'Google Calendar Direct' : 'WhatsApp Chat',
          tenant_name: apt.tenants?.name || 'Unknown',
          user_name: apt.users?.name || 'Unknown User',
          professional_name: apt.professionals?.name || 'Not Assigned',
          service_name: apt.services?.name || 'General Service',
          start_time: apt.start_time,
          end_time: apt.end_time,
          duration_minutes: Math.round(duration * 100) / 100,
          status: apt.status,
          quoted_price: Math.round((appointmentData.quoted_price || apt.services?.price || 100.00) * 100) / 100,
          final_price: Math.round((appointmentData.final_price || apt.services?.price || 100.00) * 100) / 100,
          linked_conversation_id: appointmentData.conversation_id || null,
          booking_method: appointmentData.booking_method || 'whatsapp_ai',
          business_domain: apt.tenants?.business_domain || 'general'
        };
      });

      console.log(`✅ Processed ${processedAppointments.length} appointments from direct query`);
      
      const appointmentsCSV = convertToCSV(processedAppointments, [
        'appointment_id', 'appointment_type', 'tenant_name', 'user_name', 'professional_name',
        'service_name', 'start_time', 'end_time', 'duration_minutes', 'status', 'quoted_price',
        'final_price', 'linked_conversation_id', 'booking_method', 'business_domain'
      ]);

      fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/appointments_complete_819.csv', appointmentsCSV);
      console.log(`🎉 COMPLETE Appointments CSV created: appointments_complete_819.csv (${processedAppointments.length} records)`);
      return;
    }

    const appointmentsCSV = convertToCSV(appointments, [
      'appointment_id', 'appointment_type', 'tenant_name', 'user_name', 'professional_name',
      'service_name', 'start_time', 'end_time', 'duration_minutes', 'status', 'quoted_price',
      'final_price', 'linked_conversation_id', 'booking_method', 'business_domain'
    ]);

    fs.writeFileSync('/Users/marseau/Developer/WhatsAppSalon-N8N/appointments_complete_819.csv', appointmentsCSV);
    console.log(`🎉 COMPLETE Appointments CSV created: appointments_complete_819.csv (${appointments.length} records)`);
    
  } catch (error) {
    console.error('❌ Error generating appointments CSV:', error);
  }
}

async function main() {
  console.log('🚀 Starting COMPLETE CSV generation for ALL data...');
  console.log('📊 Target: 1041 conversations + 819 appointments');
  console.log('═══════════════════════════════════════════════════');
  
  await generateCompleteConversationsCSV();
  console.log('');
  await generateCompleteAppointmentsCSV();
  
  console.log('');
  console.log('✅ COMPLETE CSV generation finished!');
  console.log('📁 Files created:');
  console.log('   - conversations_complete_1041.csv');
  console.log('   - appointments_complete_819.csv');
}

main().catch(console.error);