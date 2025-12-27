/**
 * Analisa os ultimos 200 leads capturados para verificar taxa de extracao WhatsApp
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyze() {
  // Verificar fontes de WhatsApp nos ultimos 1000 leads com numero
  const { data: fonteData } = await supabase
    .from('instagram_leads')
    .select('whatsapp_source')
    .not('whatsapp_number', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  const fontes: Record<string, number> = {};
  fonteData?.forEach(l => {
    const f = l.whatsapp_source || 'null';
    fontes[f] = (fontes[f] || 0) + 1;
  });

  console.log('='.repeat(50));
  console.log('FONTES DE WHATSAPP (ultimos 1000 com numero):');
  console.log('='.repeat(50));
  Object.entries(fontes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([f, n]) => console.log(`  ${f}: ${n}`));
  console.log('');

  // Ultimos 200 leads capturados com url_enriched=true
  const { data, error } = await supabase
    .from('instagram_leads')
    .select('id, username, whatsapp_number, whatsapp_source, website, created_at')
    .eq('url_enriched', true)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  const total = data.length;
  const comWhatsapp = data.filter(l => l.whatsapp_number).length;
  const semWhatsapp = total - comWhatsapp;

  // Breakdown por fonte
  const porFonte: Record<string, number> = {};
  data.filter(l => l.whatsapp_number).forEach(l => {
    const fonte = l.whatsapp_source || 'desconhecido';
    porFonte[fonte] = (porFonte[fonte] || 0) + 1;
  });

  console.log('='.repeat(50));
  console.log('ANALISE: ULTIMOS 200 LEADS RECEM-CAPTURADOS');
  console.log('='.repeat(50));
  console.log(`Total analisados: ${total}`);
  console.log(`Com WhatsApp: ${comWhatsapp}`);
  console.log(`Sem WhatsApp: ${semWhatsapp}`);
  console.log(`Taxa de sucesso: ${((comWhatsapp / total) * 100).toFixed(1)}%`);
  console.log('');
  console.log('Breakdown por fonte:');
  Object.entries(porFonte)
    .sort((a, b) => b[1] - a[1])
    .forEach(([fonte, qtd]) => {
      console.log(`  ${fonte}: ${qtd} (${((qtd / comWhatsapp) * 100).toFixed(1)}%)`);
    });
  console.log('');
  console.log(`Periodo: ${data[data.length - 1]?.created_at?.substring(0, 10)} a ${data[0]?.created_at?.substring(0, 10)}`);
}

analyze()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
