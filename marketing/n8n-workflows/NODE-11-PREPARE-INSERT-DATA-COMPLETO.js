// 📋 N8N Code Node 11 - Prepare Insert Data (ESTRUTURA COMPLETA MIGRATION 019)
// Este node monta o objeto COMPLETO para INSERT com TODOS os campos da tabela editorial_content

const formatTwitterData = $('Format Twitter Prompt').item.json;
const formatReelsData = $('Format Reels Prompt').item.json;
const reelsData = $('Parse Reels Response').item.json;
const twitterMetrics = formatReelsData.twitter_llm_metrics || {};
const reelsMetrics = $('Extract Reels Metrics').item.json.llm_metrics_reels || {};

// Calcular métricas LLM consolidadas
const totalPromptTokens = (twitterMetrics.llm_prompt_tokens || 0) + (reelsMetrics.llm_prompt_tokens || 0);
const totalCompletionTokens = (twitterMetrics.llm_completion_tokens || 0) + (reelsMetrics.llm_completion_tokens || 0);
const totalTokens = (twitterMetrics.llm_total_tokens || 0) + (reelsMetrics.llm_total_tokens || 0);
const totalCostUsd = (twitterMetrics.llm_cost_usd || 0) + (reelsMetrics.llm_cost_usd || 0);
const totalGenerationTimeMs = (twitterMetrics.llm_generation_time_ms || 0) + (reelsMetrics.llm_generation_time_ms || 0);

// Montar objeto COMPLETO para INSERT
const insertData = {
  // ===================================
  // IDENTIFICAÇÃO DA SEMANA
  // ===================================
  week_number: formatTwitterData.week_number,
  year: formatTwitterData.year,
  main_theme: formatTwitterData.main_theme,
  audio_trending: formatTwitterData.audio_name,

  // ===================================
  // STATUS GERAL
  // ===================================
  status: 'generated', // pending | generated | approved | published | archived

  // ===================================
  // TWITTER THREAD 1 (Anatomia da Dor)
  // ===================================
  thread_1_title: formatReelsData.thread_1_title || '',
  thread_1_sub_theme: formatReelsData.thread_1_sub_theme || 'anatomy_pain',
  thread_1_tweets: JSON.stringify(formatReelsData.thread_1_tweets || []),
  thread_1_publication_schedule: JSON.stringify([
    // Exemplo: { tweet_index: 0, scheduled_at: "2025-10-13T08:00:00Z", published: false }
  ]),
  thread_1_publication_status: 'pending', // pending | scheduled | publishing | published | failed

  // ===================================
  // TWITTER THREAD 2 (Tentativas que Falham)
  // ===================================
  thread_2_title: formatReelsData.thread_2_title || '',
  thread_2_sub_theme: formatReelsData.thread_2_sub_theme || 'failed_attempts',
  thread_2_tweets: JSON.stringify(formatReelsData.thread_2_tweets || []),
  thread_2_publication_schedule: JSON.stringify([]),
  thread_2_publication_status: 'pending',

  // ===================================
  // TWITTER THREAD 3 (Princípios de Solução)
  // ===================================
  thread_3_title: formatReelsData.thread_3_title || '',
  thread_3_sub_theme: formatReelsData.thread_3_sub_theme || 'solution_principles',
  thread_3_tweets: JSON.stringify(formatReelsData.thread_3_tweets || []),
  thread_3_publication_schedule: JSON.stringify([]),
  thread_3_publication_status: 'pending',

  // ===================================
  // STATUS GERAL TWITTER
  // ===================================
  twitter_publication_status: 'pending', // pending | scheduled | publishing | published | failed

  // ===================================
  // INSTAGRAM REEL 1 (baseado Thread 1 - Terça)
  // ===================================
  reel_1_sub_theme: reelsData.reel_1_sub_theme || formatReelsData.thread_1_title || '',
  reel_1_carla_script: reelsData.reel_1_carla_script || '',
  reel_1_bruno_script: reelsData.reel_1_bruno_script || '',
  reel_1_instagram_caption: reelsData.reel_1_instagram_caption || '',
  reel_1_instagram_hashtags: reelsData.reel_1_instagram_hashtags || [],
  reel_1_video_url: null, // Será preenchido após geração do vídeo
  reel_1_scheduled_at: null, // Será preenchido pelo scheduler (Terça 19:00)
  reel_1_published_at: null,

  // ===================================
  // INSTAGRAM REEL 2 (baseado Thread 2 - Quinta)
  // ===================================
  reel_2_sub_theme: reelsData.reel_2_sub_theme || formatReelsData.thread_2_title || '',
  reel_2_carla_script: reelsData.reel_2_carla_script || '',
  reel_2_bruno_script: reelsData.reel_2_bruno_script || '',
  reel_2_instagram_caption: reelsData.reel_2_instagram_caption || '',
  reel_2_instagram_hashtags: reelsData.reel_2_instagram_hashtags || [],
  reel_2_video_url: null,
  reel_2_scheduled_at: null, // Quinta 19:00
  reel_2_published_at: null,

  // ===================================
  // INSTAGRAM REEL 3 (baseado Thread 3 - Sábado)
  // ===================================
  reel_3_sub_theme: reelsData.reel_3_sub_theme || formatReelsData.thread_3_title || '',
  reel_3_carla_script: reelsData.reel_3_carla_script || '',
  reel_3_bruno_script: reelsData.reel_3_bruno_script || '',
  reel_3_instagram_caption: reelsData.reel_3_instagram_caption || '',
  reel_3_instagram_hashtags: reelsData.reel_3_instagram_hashtags || [],
  reel_3_video_url: null,
  reel_3_scheduled_at: null, // Sábado 19:00
  reel_3_published_at: null,

  // ===================================
  // STATUS GERAL INSTAGRAM
  // ===================================
  instagram_publication_status: 'pending', // pending | scheduled | publishing | published | failed

  // ===================================
  // YOUTUBE SHORT (concatenação dos 3 Reels)
  // ===================================
  youtube_publication_status: 'pending', // pending | scheduled | publishing | published | failed
  youtube_scheduled_at: null, // Sábado 19:00 (mesmo horário Reel 3)
  youtube_published_at: null,

  // ===================================
  // MÉTRICAS LLM (Twitter + Reels combinados)
  // ===================================
  llm_model: twitterMetrics.llm_model || 'gpt-4',
  llm_prompt_tokens: totalPromptTokens,
  llm_completion_tokens: totalCompletionTokens,
  llm_total_tokens: totalTokens,
  llm_cost_usd: parseFloat(totalCostUsd.toFixed(6)),
  llm_generation_time_ms: totalGenerationTimeMs,
  llm_temperature: 0.8,
  api_cost_usd: parseFloat(totalCostUsd.toFixed(6)),

  // ===================================
  // MÉTRICAS CONSOLIDADAS (JSONB) - Inicializadas com zeros
  // ===================================
  twitter_metrics: JSON.stringify({
    impressions: 0,
    engagements: 0,
    likes: 0,
    retweets: 0,
    replies: 0,
    updated_at: new Date().toISOString()
  }),

  instagram_metrics: JSON.stringify({
    reach: 0,
    engagements: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    updated_at: new Date().toISOString()
  }),

  youtube_metrics: JSON.stringify({
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    watch_time_minutes: 0,
    updated_at: new Date().toISOString()
  }),

  // ===================================
  // METADATA
  // ===================================
  content_type: 'dual_persona',
  persona_format: 'dual',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Log de validação
console.log('✅ Dados preparados para INSERT em editorial_content');
console.log(`📊 Week: ${insertData.week_number}/${insertData.year}`);
console.log(`🎯 Theme: ${insertData.main_theme}`);
console.log(`📌 Thread 1: "${insertData.thread_1_title}" (${formatReelsData.thread_1_tweets?.length || 0} tweets)`);
console.log(`📌 Thread 2: "${insertData.thread_2_title}" (${formatReelsData.thread_2_tweets?.length || 0} tweets)`);
console.log(`📌 Thread 3: "${insertData.thread_3_title}" (${formatReelsData.thread_3_tweets?.length || 0} tweets)`);
console.log(`🎬 Reel 1: "${insertData.reel_1_sub_theme}"`);
console.log(`🎬 Reel 2: "${insertData.reel_2_sub_theme}"`);
console.log(`🎬 Reel 3: "${insertData.reel_3_sub_theme}"`);
console.log(`💰 Total LLM Cost: $${insertData.llm_cost_usd}`);
console.log(`🔢 Total Tokens: ${insertData.llm_total_tokens}`);

return {
  json: insertData
};
