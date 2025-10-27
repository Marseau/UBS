// 🆕 NOVA ESTRUTURA - 84 CAMPOS - 1 ÚNICO REGISTRO (SEM FALLBACKS)
// Parse da resposta GPT com os 3 Reels

const response = $input.item.json;
const formatReelsData = $('Format Reels Prompt').item.json;

// VALIDAÇÃO RIGOROSA - SEM FALLBACKS
if (!formatReelsData) {
  throw new Error('Node "Format Reels Prompt" não retornou dados válidos');
}

const weekNumber = formatReelsData.week_number;
const year = formatReelsData.year;
const mainTheme = formatReelsData.main_theme;
const audioName = formatReelsData.audio_name;

// Pegar audio ID do node "Get Random Trending Audio"
const audioNode = $('Get Random Trending Audio').first();
if (!audioNode || !audioNode.json) {
  throw new Error('Node "Get Random Trending Audio" não retornou dados válidos');
}

// Se vier como array, pegar o primeiro item
let audioData = audioNode.json;
if (Array.isArray(audioData)) {
  if (audioData.length === 0) {
    throw new Error('Array de áudio está vazio');
  }
  audioData = audioData[0];
}

const audioId = audioData.id || '';

// Pegar métricas LLM
const twitterMetrics = formatReelsData.twitter_llm_metrics || {};
const reelsMetrics = response.llm_metrics_reels || {};

// PEGAR TWEETS DAS THREADS (CORRIGIDO)
const thread1Tweets = formatReelsData.thread_1_tweets || [];
const thread2Tweets = formatReelsData.thread_2_tweets || [];
const thread3Tweets = formatReelsData.thread_3_tweets || [];

// Pegar títulos e sub_themes das threads
const thread1Title = formatReelsData.thread_1_title || 'Thread 1';
const thread1SubTheme = formatReelsData.thread_1_sub_theme || '';
const thread2Title = formatReelsData.thread_2_title || 'Thread 2';
const thread2SubTheme = formatReelsData.thread_2_sub_theme || '';
const thread3Title = formatReelsData.thread_3_title || 'Thread 3';
const thread3SubTheme = formatReelsData.thread_3_sub_theme || '';

console.log('✅ Threads do Twitter:');
console.log(`  Thread 1: ${thread1Tweets.length} tweets`);
console.log(`  Thread 2: ${thread2Tweets.length} tweets`);
console.log(`  Thread 3: ${thread3Tweets.length} tweets`);

// Parse da resposta dos Reels
const contentText = response.reels_response.trim();
let parsedReels;

try {
  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsedReels = JSON.parse(jsonMatch[0]);
  } else {
    parsedReels = JSON.parse(contentText);
  }
} catch (error) {
  throw new Error('Failed to parse Reels response as JSON: ' + error.message);
}

// VALIDAÇÃO DOS REELS
if (!parsedReels.reel_1) {
  throw new Error('Reel 1 não encontrado na resposta do GPT. Keys: ' + Object.keys(parsedReels).join(', '));
}

if (!parsedReels.reel_2) {
  throw new Error('Reel 2 não encontrado na resposta do GPT. Keys: ' + Object.keys(parsedReels).join(', '));
}

if (!parsedReels.reel_3) {
  throw new Error('Reel 3 não encontrado na resposta do GPT. Keys: ' + Object.keys(parsedReels).join(', '));
}

// Criar 1 ÚNICO REGISTRO com TODOS os dados (nova estrutura de 84 campos)
const record = {
  // IDENTIFICAÇÃO (3 campos)
  week_number: weekNumber,
  year: year,
  main_theme: mainTheme,

  // TWITTER THREADS (18 campos - 6 por thread)
  thread_1_title: thread1Title,
  thread_1_sub_theme: thread1SubTheme,
  thread_1_tweets: JSON.stringify(thread1Tweets),
  thread_1_approved: false,
  thread_1_published: false,
  thread_1_published_at: null,

  thread_2_title: thread2Title,
  thread_2_sub_theme: thread2SubTheme,
  thread_2_tweets: JSON.stringify(thread2Tweets),
  thread_2_approved: false,
  thread_2_published: false,
  thread_2_published_at: null,

  thread_3_title: thread3Title,
  thread_3_sub_theme: thread3SubTheme,
  thread_3_tweets: JSON.stringify(thread3Tweets),
  thread_3_approved: false,
  thread_3_published: false,
  thread_3_published_at: null,

  // INSTAGRAM REELS (27 campos - 9 por reel)
  reel_1_sub_theme: parsedReels.reel_1.sub_theme,
  reel_1_carla_script: parsedReels.reel_1.carla_script,
  reel_1_bruno_script: parsedReels.reel_1.bruno_script,
  reel_1_instagram_caption: parsedReels.reel_1.instagram_caption,
  reel_1_instagram_hashtags: JSON.stringify(parsedReels.reel_1.instagram_hashtags || []),
  reel_1_video_url: null,
  reel_1_approved: false,
  reel_1_published: false,
  reel_1_published_at: null,

  reel_2_sub_theme: parsedReels.reel_2.sub_theme,
  reel_2_carla_script: parsedReels.reel_2.carla_script,
  reel_2_bruno_script: parsedReels.reel_2.bruno_script,
  reel_2_instagram_caption: parsedReels.reel_2.instagram_caption,
  reel_2_instagram_hashtags: JSON.stringify(parsedReels.reel_2.instagram_hashtags || []),
  reel_2_video_url: null,
  reel_2_approved: false,
  reel_2_published: false,
  reel_2_published_at: null,

  reel_3_sub_theme: parsedReels.reel_3.sub_theme,
  reel_3_carla_script: parsedReels.reel_3.carla_script,
  reel_3_bruno_script: parsedReels.reel_3.bruno_script,
  reel_3_instagram_caption: parsedReels.reel_3.instagram_caption,
  reel_3_instagram_hashtags: JSON.stringify(parsedReels.reel_3.instagram_hashtags || []),
  reel_3_video_url: null,
  reel_3_approved: false,
  reel_3_published: false,
  reel_3_published_at: null,

  // YOUTUBE SHORT (6 campos)
  youtube_short_url: null,
  youtube_caption: 'Teste 7 dias grátis → link na bio',
  youtube_short_duration_seconds: null,
  youtube_short_approved: false,
  youtube_short_published: false,
  youtube_short_published_at: null,
  // METADATA (13 campos)
  instagram_audio_id: audioId,
  instagram_audio_name: audioName,
  music_category: 'corporate',
  related_reel_ids: null,
  content_type: 'instagram_reel',
  status: 'pending',
  llm_model: reelsMetrics.llm_model || 'gpt-4o',
  llm_prompt_tokens: (twitterMetrics.llm_prompt_tokens || 0) + (reelsMetrics.llm_prompt_tokens || 0),
  llm_completion_tokens: (twitterMetrics.llm_completion_tokens || 0) + (reelsMetrics.llm_completion_tokens || 0),
  llm_total_tokens: (twitterMetrics.llm_total_tokens || 0) + (reelsMetrics.llm_total_tokens || 0),
  llm_cost_usd: (twitterMetrics.llm_cost_usd || 0) + (reelsMetrics.llm_cost_usd || 0),
  llm_generation_time_ms: (twitterMetrics.llm_generation_time_ms || 0) + (reelsMetrics.llm_generation_time_ms || 0),
  llm_temperature: 0.8,

  // METRICS (3 JSONB campos)
  twitter_metrics: JSON.stringify({}),
  instagram_metrics: JSON.stringify({}),
  youtube_metrics: JSON.stringify({}),

  // APPROVALS (10 campos)
  approved_for_x: false,
  approved_for_instagram: false,
  approved_for_youtube: false,
  approved_by: null,
  approved_at: null,
  published_x: false,
  published_instagram: false,
  published_youtube: false,
  rejected: false,
  rejection_reason: null,

  // API COSTS (1 campo)
  api_cost_usd: (twitterMetrics.api_cost_usd || 0) + (reelsMetrics.api_cost_usd || 0)
};

console.log('✅ Registro criado com sucesso');
console.log(`  Total de campos: ${Object.keys(record).length}`);

return [{ json: record }];

