/**
 * Test Script: Fatura Semanal
 * Testa a geração de faturas semanais consolidadas
 */

import { config } from 'dotenv';
config();

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3004';

async function testWeeklyInvoice(): Promise<void> {
  console.log('🧪 Testando geração de fatura semanal...\n');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Verificar entregas pendentes
  console.log('1️⃣ Verificando entregas pendentes de faturamento...');

  const { data: pendingDeliveries } = await supabase
    .from('aic_lead_deliveries')
    .select('id, campaign_id, lead_name, delivery_value, created_at, invoice_id')
    .is('invoice_id', null)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`   Entregas pendentes: ${pendingDeliveries?.length || 0}`);
  if (pendingDeliveries && pendingDeliveries.length > 0) {
    pendingDeliveries.forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.lead_name} - R$${d.delivery_value} - ${new Date(d.created_at).toLocaleDateString('pt-BR')}`);
    });
  }

  // 2. Listar pendências por campanha
  console.log('\n2️⃣ Consultando pendências por campanha...');

  try {
    const response = await fetch(`${API_BASE}/api/aic/invoices/pending`);
    const result = await response.json() as any;

    console.log(`   Total campanhas: ${result.total_campaigns}`);
    console.log(`   Total leads pendentes: ${result.total_pending_leads}`);
    console.log(`   Total valor pendente: R$${result.total_pending_amount?.toFixed(2)}`);

    if (result.campaigns) {
      result.campaigns.forEach((c: any) => {
        console.log(`   - ${c.campaign_name}: ${c.pending_leads} leads (R$${c.pending_amount.toFixed(2)})`);
      });
    }
  } catch (error: any) {
    console.error('   Erro ao consultar pendências:', error.message);
  }

  // 3. Gerar faturas semanais (include_all=true para pegar todas pendentes)
  console.log('\n3️⃣ Gerando faturas semanais (include_all=true)...');

  try {
    const response = await fetch(`${API_BASE}/api/aic/invoices/weekly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include_all: true })
    });

    const result = await response.json() as any;
    console.log('\n📋 Resultado:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.invoices?.length > 0) {
      console.log('\n✅ FATURAS GERADAS:');
      result.invoices.forEach((inv: any) => {
        console.log(`   🧾 ${inv.invoice_number}`);
        console.log(`      Campanha: ${inv.campaign}`);
        console.log(`      Leads: ${inv.leads}`);
        console.log(`      Valor: R$${inv.amount.toFixed(2)}`);
      });
    }
  } catch (error: any) {
    console.error('   Erro ao gerar faturas:', error.message);
    console.log('\n💡 Certifique-se que o servidor está rodando na porta 3004');
  }

  // 4. Verificar faturas criadas no banco
  console.log('\n4️⃣ Verificando faturas no banco...');

  const { data: invoices } = await supabase
    .from('aic_campaign_payments')
    .select('invoice_number, amount, status, type, description, due_date, created_at')
    .eq('type', 'lead_invoice')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   Faturas de leads: ${invoices?.length || 0}`);
  if (invoices) {
    invoices.forEach((inv, i) => {
      console.log(`   ${i + 1}. ${inv.invoice_number} - R$${inv.amount} - ${inv.status}`);
      console.log(`      ${inv.description}`);
    });
  }

  // 5. Verificar entregas agora vinculadas
  console.log('\n5️⃣ Verificando entregas vinculadas a faturas...');

  const { data: linkedDeliveries } = await supabase
    .from('aic_lead_deliveries')
    .select('lead_name, invoice_id')
    .not('invoice_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   Entregas faturadas: ${linkedDeliveries?.length || 0}`);
  if (linkedDeliveries) {
    linkedDeliveries.forEach((d, i) => {
      console.log(`   ${i + 1}. ${d.lead_name} -> ${d.invoice_id?.substring(0, 8)}...`);
    });
  }

  console.log('\n✨ Teste concluído!');
}

testWeeklyInvoice().catch(console.error);
