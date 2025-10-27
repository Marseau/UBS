// 📋 N8N Code Node - Insert Editorial Content (ESTRUTURA COMPLETA)
// VERSÃO ATUALIZADA: Insere threads + reels na nova estrutura do banco

// Coletar dados de nós anteriores
const twitterData = $('OpenAI - Twitter Threads').item.json;
const twitterMetrics = $('Extract Twitter Metrics').item.json;
const reelsData = $('Parse Reels Response').item.json;
const reelsMetrics = $('Extract Reels Metrics').item.json;
const formatPromptData = $('Format Twitter Prompt').item.json;

// Parse do conteúdo Twitter (com títulos)
const twitterContent = twitterData.choices[0].message.content.trim();
let parsedTwitter;

try {
  const jsonMatch = twitterContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsedTwitter = JSON.parse(jsonMatch[0]);
  } else {
    parsedTwitter = JSON.parse(twitterContent);
  }
} catch (error) {
  throw new Error('Failed to parse Twitter content: ' + error.message);
}

// Extrair threads com títulos
const thread1 = parsedTwitter.Thread1 || parsedTwitter.thread1;
const thread2 = parsedTwitter.Thread2 || parsedTwitter.thread2;
const thread3 = parsedTwitter.Thread3 || parsedTwitter.thread3;

if (!thread1 || !thread2 || !thread3) {
  throw new Error('Missing Twitter threads. Keys: ' + Object.keys(parsedTwitter).join(', '));
}

// Preparar dados para INSERT
const insertData = {
  // Identificação da semana
  week_number: formatPromptData.week_number,
  year: formatPromptData.year,
  main_theme: formatPromptData.main_theme,
  audio_trending: formatPromptData.audio_name,
  status: 'generated', // pending → generated → approved → published

  // Twitter Thread 1
  thread_1_title: thread1.title || '',
  thread_1_sub_theme: thread1.sub_theme || 'anatomy_pain',
  thread_1_tweets: JSON.stringify(thread1.tweets || []),
  thread_1_publication_status: 'pending',

  // Twitter Thread 2
  thread_2_title: thread2.title || '',
  thread_2_sub_theme: thread2.sub_theme || 'failed_attempts',
  thread_2_tweets: JSON.stringify(thread2.tweets || []),
  thread_2_publication_status: 'pending',

  // Twitter Thread 3
  thread_3_title: thread3.title || '',
  thread_3_sub_theme: thread3.sub_theme || 'solution_principles',
  thread_3_tweets: JSON.stringify(thread3.tweets || []),
  thread_3_publication_status: 'pending',

  // Status geral Twitter
  twitter_publication_status: 'pending',

  // Reel 1 (baseado Thread 1)
  reel_1_sub_theme: reelsData.reel_1_sub_theme,
  reel_1_carla_script: reelsData.reel_1_carla_script,
  reel_1_bruno_script: reelsData.reel_1_bruno_script,
  reel_1_instagram_caption: reelsData.reel_1_instagram_caption,
  reel_1_instagram_hashtags: reelsData.reel_1_instagram_hashtags,

  // Reel 2 (baseado Thread 2)
  reel_2_sub_theme: reelsData.reel_2_sub_theme,
  reel_2_carla_script: reelsData.reel_2_carla_script,
  reel_2_bruno_script: reelsData.reel_2_bruno_script,
  reel_2_instagram_caption: reelsData.reel_2_instagram_caption,
  reel_2_instagram_hashtags: reelsData.reel_2_instagram_hashtags,

  // Reel 3 (baseado Thread 3)
  reel_3_sub_theme: reelsData.reel_3_sub_theme,
  reel_3_carla_script: reelsData.reel_3_carla_script,
  reel_3_bruno_script: reelsData.reel_3_bruno_script,
  reel_3_instagram_caption: reelsData.reel_3_instagram_caption,
  reel_3_instagram_hashtags: reelsData.reel_3_instagram_hashtags,

  // Status geral Instagram
  instagram_publication_status: 'pending',

  // Status geral YouTube
  youtube_publication_status: 'pending',

  // Métricas LLM (Twitter)
  llm_model: twitterMetrics.model || 'gpt-4',
  llm_prompt_tokens: twitterMetrics.prompt_tokens || 0,
  llm_completion_tokens: twitterMetrics.completion_tokens || 0,
  llm_total_tokens: twitterMetrics.total_tokens || 0,
  llm_cost_usd: twitterMetrics.cost_usd || 0,

  // Métricas consolidadas em JSONB
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

  // Metadata
  content_type: 'dual_persona',
  persona_format: 'dual',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

console.log('✅ Dados preparados para INSERT em editorial_content');
console.log(`📊 Week: ${insertData.week_number}/${insertData.year}`);
console.log(`🎯 Theme: ${insertData.main_theme}`);
console.log(`📌 Thread 1: "${insertData.thread_1_title}"`);
console.log(`📌 Thread 2: "${insertData.thread_2_title}"`);
console.log(`📌 Thread 3: "${insertData.thread_3_title}"`);

return {
  json: insertData
};
