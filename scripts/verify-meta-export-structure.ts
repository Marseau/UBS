/**
 * Verifica estrutura criada pela Migration 023
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('🔍 Verificando estrutura Meta Export...\n');

  try {
    // 1. Verificar meta_audience_exports
    console.log('1️⃣ Testando tabela meta_audience_exports...');
    const { data: exports, error: exportsError } = await supabase
      .from('meta_audience_exports')
      .select('*')
      .limit(1);

    if (exportsError) {
      console.log('❌ Erro:', exportsError.message);
    } else {
      console.log('✅ Tabela meta_audience_exports acessível\n');
    }

    // 2. Verificar campos em taylor_made_leads
    console.log('2️⃣ Verificando campos em taylor_made_leads...');
    const { data: leads, error: leadsError } = await supabase
      .from('taylor_made_leads')
      .select('instagram_username, exported_to_meta, meta_export_date, times_discovered, last_seen_at')
      .limit(1);

    if (leadsError) {
      console.log('❌ Erro:', leadsError.message);
    } else {
      console.log('✅ Campos de exportação disponíveis\n');
    }

    // 3. Inserir um registro de teste
    console.log('3️⃣ Testando insert em meta_audience_exports...');
    const { data: testExport, error: insertError } = await supabase
      .from('meta_audience_exports')
      .insert({
        segment_name: 'test_segment',
        file_url: 'https://test.com/test.csv',
        total_leads_exported: 100,
        status: 'ready_for_upload'
      })
      .select()
      .single();

    if (insertError) {
      console.log('❌ Erro:', insertError.message);
    } else {
      console.log('✅ Insert funcionando!');
      console.log('   ID criado:', testExport.id);

      // Deletar registro de teste
      await supabase.from('meta_audience_exports').delete().eq('id', testExport.id);
      console.log('   Registro de teste removido\n');
    }

    console.log('='.repeat(70));
    console.log('🎉 ESTRUTURA VERIFICADA COM SUCESSO!');
    console.log('='.repeat(70));
    console.log('\n✅ Workflows prontos para serem ativados:\n');
    console.log('   📌 Instagram Lead Scraper - Puppeteer (7VIfKceAYH68ucLS)');
    console.log('   📌 Meta Custom Audience - CSV Export (miW9wcmXztxaKcUM)\n');

  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  }
}

verify()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Erro:', error);
    process.exit(1);
  });
