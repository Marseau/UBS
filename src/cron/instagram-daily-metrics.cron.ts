/**
 * INSTAGRAM DAILY METRICS CRON JOB
 *
 * Calcula e persiste métricas diárias do pool ativo:
 * - Leads válidos (45d window)
 * - Hashtags válidas (90d window)
 * - Scraping do dia (novos + atualizados)
 *
 * Agendamento: A cada 5 minutos durante o dia
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Calcula e salva métricas para uma data específica
 */
async function calculateAndSaveMetrics(targetDate: string): Promise<{
  success: boolean;
  metrics?: any;
  error?: string;
}> {
  try {
    console.log(`📊 [CRON] Calculando métricas para ${targetDate}...`);

    // Calcular métricas usando a mesma query do endpoint
    const { data, error } = await supabase.rpc('execute_sql', {
      query_text: `
        WITH
        -- Leads válidos (45d window a partir da data alvo)
        leads_valid AS (
          SELECT id, email, phone, additional_emails, additional_phones, hashtags_bio, hashtags_posts
          FROM instagram_leads
          WHERE captured_at <= '${targetDate}'::date
            AND (captured_at >= '${targetDate}'::date - INTERVAL '44 days'
                 OR updated_at >= '${targetDate}'::date - INTERVAL '44 days')
        ),
        lead_counts AS (
          SELECT
            COUNT(*) as total_leads,
            COUNT(*) FILTER (WHERE
              email IS NOT NULL OR phone IS NOT NULL
              OR (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0)
              OR (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
            ) as leads_with_contact
          FROM leads_valid
        ),
        -- Leads para contagem de hashtags (90d window)
        leads_for_hashtags AS (
          SELECT id, email, phone, additional_emails, additional_phones, hashtags_bio, hashtags_posts
          FROM instagram_leads
          WHERE captured_at <= '${targetDate}'::date
            AND (captured_at >= '${targetDate}'::date - INTERVAL '89 days'
                 OR updated_at >= '${targetDate}'::date - INTERVAL '89 days')
        ),
        hashtag_counts AS (
          SELECT
            COUNT(DISTINCT LOWER(h.hashtag)) as total_hashtags,
            COUNT(DISTINCT LOWER(h.hashtag)) FILTER (WHERE
              l.email IS NOT NULL OR l.phone IS NOT NULL
              OR (l.additional_emails IS NOT NULL AND jsonb_array_length(l.additional_emails) > 0)
              OR (l.additional_phones IS NOT NULL AND jsonb_array_length(l.additional_phones) > 0)
            ) as hashtags_with_contact
          FROM leads_for_hashtags l,
          LATERAL (
            SELECT jsonb_array_elements_text(l.hashtags_bio) as hashtag
            WHERE l.hashtags_bio IS NOT NULL AND jsonb_array_length(l.hashtags_bio) > 0
            UNION ALL
            SELECT jsonb_array_elements_text(l.hashtags_posts) as hashtag
            WHERE l.hashtags_posts IS NOT NULL AND jsonb_array_length(l.hashtags_posts) > 0
          ) h
          WHERE h.hashtag IS NOT NULL AND h.hashtag != ''
        ),
        -- Scraping do dia específico
        scraping_stats AS (
          SELECT
            COUNT(*) FILTER (WHERE DATE(captured_at) = '${targetDate}'::date) as scraped_new,
            COUNT(*) FILTER (WHERE DATE(updated_at) = '${targetDate}'::date AND DATE(captured_at) < '${targetDate}'::date) as scraped_updated
          FROM instagram_leads
        )
        SELECT
          lc.total_leads,
          lc.leads_with_contact,
          hc.total_hashtags,
          hc.hashtags_with_contact,
          ss.scraped_new,
          ss.scraped_updated
        FROM lead_counts lc, hashtag_counts hc, scraping_stats ss
      `
    });

    if (error) {
      console.error(`❌ [CRON] Erro ao calcular métricas:`, error);
      return { success: false, error: error.message };
    }

    const metrics = data?.[0];
    if (!metrics) {
      console.error(`❌ [CRON] Nenhuma métrica retornada`);
      return { success: false, error: 'Nenhuma métrica retornada' };
    }

    console.log(`📊 [CRON] Métricas calculadas:`, {
      leads: metrics.total_leads,
      leadsWithContact: metrics.leads_with_contact,
      hashtags: metrics.total_hashtags,
      hashtagsWithContact: metrics.hashtags_with_contact,
      scrapedNew: metrics.scraped_new,
      scrapedUpdated: metrics.scraped_updated
    });

    // Usar RPC para upsert (SECURITY DEFINER garante permissões)
    const { error: upsertError } = await supabase.rpc('upsert_daily_metrics', {
      p_metric_date: targetDate,
      p_total_leads: metrics.total_leads || 0,
      p_leads_with_contact: metrics.leads_with_contact || 0,
      p_total_hashtags: metrics.total_hashtags || 0,
      p_hashtags_with_contact: metrics.hashtags_with_contact || 0,
      p_scraped_new: metrics.scraped_new || 0,
      p_scraped_updated: metrics.scraped_updated || 0
    });

    if (upsertError) {
      console.error(`❌ [CRON] Erro ao salvar métricas:`, upsertError);
      return { success: false, error: upsertError.message };
    }

    console.log(`✅ [CRON] Métricas salvas com sucesso para ${targetDate}`);
    return { success: true, metrics };

  } catch (error: any) {
    console.error(`❌ [CRON] Erro crítico:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Cron job para atualização de métricas diárias
 * Executa a cada 5 minutos para manter dados atualizados
 */
export const startInstagramDailyMetricsCron = () => {
  console.log('📅 [CRON] Inicializando Instagram Daily Metrics Cron Job...');
  console.log('📅 [CRON] Agendamento: A cada 5 minutos');

  // Executa a cada 5 minutos
  // Formato: segundo minuto hora dia mês dia-da-semana
  // '*/5 * * * *' = a cada 5 minutos
  const cronExpression = '*/5 * * * *';

  cron.schedule(cronExpression, async () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0] as string;

    console.log(`\n⏰ [CRON] Instagram Daily Metrics - ${now.toLocaleTimeString('pt-BR')}`);

    const result = await calculateAndSaveMetrics(today);

    if (result.success) {
      console.log(`✅ [CRON] Atualização concluída - Leads: ${result.metrics?.total_leads}, Hashtags: ${result.metrics?.total_hashtags}`);
    } else {
      console.error(`❌ [CRON] Falha na atualização: ${result.error}`);
    }
  });

  // Executar imediatamente na inicialização
  const today = new Date().toISOString().split('T')[0] as string;
  console.log(`🚀 [CRON] Executando cálculo inicial para ${today}...`);
  calculateAndSaveMetrics(today).then(result => {
    if (result.success) {
      console.log(`✅ [CRON] Cálculo inicial concluído!`);
    }
  });

  console.log('✅ [CRON] Instagram Daily Metrics Cron Job ativo!\n');
};

/**
 * Execução manual para testes
 */
export const runInstagramDailyMetricsManually = async (date?: string) => {
  const targetDate = date || (new Date().toISOString().split('T')[0] as string);
  console.log(`\n🔧 [MANUAL] Calculando métricas para ${targetDate}...\n`);
  return calculateAndSaveMetrics(targetDate);
};
