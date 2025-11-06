import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log('🔄 Resetando dados de enriquecimento de URL...\n');

  try {
    // 1. Contar quantos registros serão afetados
    const { count: totalToReset } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true })
      .eq('url_enriched', true);

    console.log(`📊 Total de leads com url_enriched = true: ${totalToReset || 0}`);

    if (!totalToReset || totalToReset === 0) {
      console.log('✅ Nenhum lead para resetar!');
      return;
    }

    // 2. Fazer o UPDATE
    console.log('\n🔧 Executando UPDATE...');

    const { data, error } = await supabase
      .from('instagram_leads')
      .update({
        url_enriched: false,
        additional_emails: null,
        additional_phones: null
      })
      .eq('url_enriched', true)
      .select('lead_id');

    if (error) {
      console.error('❌ Erro ao executar UPDATE:', error);
      process.exit(1);
    }

    console.log(`✅ UPDATE executado com sucesso!`);
    console.log(`📝 Total de registros atualizados: ${data?.length || 0}`);

    // 3. Verificar resultados
    const { count: remainingEnriched } = await supabase
      .from('instagram_leads')
      .select('*', { count: 'exact', head: true })
      .eq('url_enriched', true);

    console.log(`\n📊 Verificação pós-UPDATE:`);
    console.log(`   - Leads com url_enriched = true: ${remainingEnriched || 0}`);
    console.log(`   - Leads resetados: ${totalToReset}`);

    if (remainingEnriched === 0) {
      console.log('\n🎉 Todos os leads foram resetados com sucesso!');
      console.log('✅ Pronto para re-scraping com o scraper otimizado!');
    }

  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
})();
