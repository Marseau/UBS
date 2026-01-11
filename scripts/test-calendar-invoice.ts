/**
 * Test Script: Agendamento com Fatura Automática
 * Simula o que o AI Agent faz quando agenda uma reunião
 */

import { config } from 'dotenv';
config();

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

interface ScheduleResult {
  success: boolean;
  message?: string;
  message_para_lead?: string;
  meeting?: {
    event_id: string;
    meet_link: string;
    scheduled_at: string;
    formatted: string;
  };
  delivery_id?: string;
  delivery_value?: number;
  invoice?: {
    id: string;
    invoice_number: string;
    amount: number;
    status: string;
    due_date: string;
  };
  error?: string;
}

async function testCalendarSchedule(): Promise<void> {
  console.log('🧪 Testando agendamento com fatura automática...\n');

  // 1. Primeiro, listar campanhas para pegar um campaign_id válido
  console.log('1️⃣ Buscando campanhas ativas...');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: campaigns, error: campError } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name')
    .eq('outreach_enabled', true)
    .limit(1);

  if (campError || !campaigns || campaigns.length === 0) {
    console.error('❌ Nenhuma campanha ativa encontrada');
    return;
  }

  const campaignId: string = campaigns[0]!.id;
  const campaignName: string = campaigns[0]!.campaign_name;
  console.log(`✅ Usando campanha: ${campaignName} (${campaignId})\n`);

  // 2. Simular dados do lead (como o AI Agent envia)
  const testLead = {
    campaign_id: campaignId,
    slot_number: 1,
    lead_name: 'Maria Teste',
    lead_phone: '5511999887766',
    lead_email: 'maria.teste@email.com',
    lead_instagram: 'maria_teste_ig',
    lead_whatsapp: '5511999887766',
    interest_score: 0.85,
    signals: ['Pediu agendamento', 'Interesse confirmado'],
    questions: ['Qual o valor?', 'Como funciona?'],
    delivered_to: 'Representante AIC'
  };

  console.log('2️⃣ Dados do lead de teste:');
  console.log(JSON.stringify(testLead, null, 2));
  console.log('');

  // 3. Chamar endpoint de agendamento
  console.log('3️⃣ Chamando POST /api/aic/calendar/schedule...');

  try {
    const response = await fetch(`${API_BASE}/api/aic/calendar/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testLead)
    });

    const result = await response.json() as ScheduleResult;

    console.log('\n📋 Resposta do endpoint:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n✅ SUCESSO!');
      console.log(`   📅 Reunião: ${result.meeting?.formatted || 'N/A'}`);
      console.log(`   🔗 Meet: ${result.meeting?.meet_link || 'N/A'}`);
      console.log(`   📦 Delivery ID: ${result.delivery_id || 'N/A'}`);
      console.log(`   💰 Valor: R$${result.delivery_value?.toFixed(2) || '0.00'}`);

      if (result.invoice) {
        console.log('\n🧾 FATURA CRIADA AUTOMATICAMENTE:');
        console.log(`   Número: ${result.invoice.invoice_number}`);
        console.log(`   Valor: R$${result.invoice.amount.toFixed(2)}`);
        console.log(`   Status: ${result.invoice.status}`);
        console.log(`   Vencimento: ${result.invoice.due_date}`);
      } else {
        console.log('\n⚠️ Fatura não foi criada');
      }
    } else {
      console.log('\n❌ FALHA:', result.message);
      if (result.error) console.log('   Erro:', result.error);
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error('\n❌ Erro na requisição:', err.message);
    console.log('\n💡 Certifique-se que o servidor está rodando: npm run dev');
  }

  // 4. Verificar no banco de dados
  console.log('\n4️⃣ Verificando registros no banco...');

  const { data: deliveries } = await supabase
    .from('aic_lead_deliveries')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log(`\n📦 Últimas entregas (${deliveries?.length || 0}):`);
  if (deliveries) {
    deliveries.forEach((d: Record<string, unknown>, i: number) => {
      console.log(`   ${i + 1}. ${d.lead_name} - R$${d.delivery_value} - ${d.status}`);
    });
  }

  const { data: invoices } = await supabase
    .from('aic_campaign_payments')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('payment_type', 'lead_invoice')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log(`\n🧾 Últimas faturas de leads (${invoices?.length || 0}):`);
  if (invoices) {
    invoices.forEach((inv: Record<string, unknown>, i: number) => {
      console.log(`   ${i + 1}. ${inv.invoice_number} - R$${inv.amount} - ${inv.status} - Venc: ${inv.due_date}`);
    });
  }

  console.log('\n✨ Teste concluído!');
}

testCalendarSchedule().catch(console.error);
