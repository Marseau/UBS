#!/usr/bin/env node

/**
 * Script para verificar estrutura das tabelas conversation_history e appointments
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyTableStructures() {
  console.log('🔍 Verificando estrutura das tabelas relevantes...');
  
  try {
    // 1. Verificar se conversation_history tem coluna source
    console.log('\n1️⃣ Testando inserção em conversation_history...');
    try {
      const testData = {
        tenant_id: 'test_123',
        contact_name: 'Test User',
        contact_phone: '11999999999',
        message: 'teste',
        response: 'resposta teste',
        message_type: 'inbound',
        source: 'test',
        created_at: new Date().toISOString()
      };

      // Tentar inserir (não vai salvar de verdade, só testar estrutura)
      const { error: conversationError } = await supabase
        .from('conversation_history')
        .insert([testData])
        .select();
      
      if (conversationError) {
        console.log(`❌ conversation_history.source ERROR: ${conversationError.message}`);
        if (conversationError.message.includes('column "source" does not exist')) {
          console.log('📝 CONCLUSÃO: Tabela conversation_history NÃO tem coluna source');
        }
      } else {
        console.log('✅ conversation_history.source funciona');
        // Limpar teste
        await supabase
          .from('conversation_history')
          .delete()
          .eq('tenant_id', 'test_123');
      }
    } catch (error) {
      console.log(`❌ Erro testando conversation_history: ${error.message}`);
    }

    // 2. Verificar estrutura da tabela appointments
    console.log('\n2️⃣ Verificando tabela appointments...');
    try {
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('appointment_data')
        .limit(1);
      
      if (appointmentsError) {
        console.log(`❌ appointments ERROR: ${appointmentsError.message}`);
      } else {
        console.log('✅ Tabela appointments existe');
        if (appointments && appointments.length > 0) {
          console.log(`📊 Exemplo appointment_data:`, JSON.stringify(appointments[0].appointment_data, null, 2));
        } else {
          console.log('📊 Tabela appointments vazia');
        }
      }
    } catch (error) {
      console.log(`❌ Erro verificando appointments: ${error.message}`);
    }

    // 3. Listar todas as colunas das tabelas
    console.log('\n3️⃣ Verificando colunas da conversation_history...');
    try {
      const { data: conversationCols } = await supabase
        .from('conversation_history')
        .select('*')
        .limit(1);
      
      if (conversationCols && conversationCols.length > 0) {
        console.log('📋 Colunas disponíveis em conversation_history:');
        Object.keys(conversationCols[0]).forEach(col => {
          console.log(`   - ${col}`);
        });
      } else {
        console.log('📋 Tabela conversation_history vazia - listando campos conhecidos');
      }
    } catch (error) {
      console.log(`❌ Erro listando colunas: ${error.message}`);
    }

    console.log('\n4️⃣ Verificando colunas da appointments...');
    try {
      const { data: appointmentCols } = await supabase
        .from('appointments')
        .select('*')
        .limit(1);
      
      if (appointmentCols && appointmentCols.length > 0) {
        console.log('📋 Colunas disponíveis em appointments:');
        Object.keys(appointmentCols[0]).forEach(col => {
          console.log(`   - ${col}`);
        });
      } else {
        console.log('📋 Tabela appointments vazia');
      }
    } catch (error) {
      console.log(`❌ Erro listando colunas appointments: ${error.message}`);
    }

    console.log('\n📋 CONCLUSÕES:');
    console.log('1. Se conversation_history.source não existe, use apenas account_type nas outras tabelas');
    console.log('2. Se appointments.appointment_data existe, use appointment_data.source para isolamento');
    console.log('3. Para demo, priorize isolamento via account_type nas tabelas principais');

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar
verifyTableStructures();