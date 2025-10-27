// N8N Node: Parse Response (FIXED)
// Purpose: Extract content from GPT-4o response and merge with LLM metrics

const response = $input.item.json;
const formatPromptData = $('Format Prompt').item.json;
const llmMetrics = response.llm_metrics;

const weekNumber = formatPromptData.week_number;
const year = formatPromptData.year;
const mainTheme = formatPromptData.main_theme;

// Parse GPT-4o response (expecting day_1 to day_7 structure)
let contentData;
try {
  const content = response.choices[0].message.content;

  // Remove markdown code blocks if present
  const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  contentData = JSON.parse(cleanContent);
} catch (error) {
  throw new Error(`Failed to parse GPT-4o response: ${error.message}. Content: ${response.choices[0].message.content}`);
}

const records = [];

// Calculate scheduled times for the week
const startOfWeek = new Date();
startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday

for (let i = 1; i <= 7; i++) {
  const dayKey = `day_${i}`;
  const dayData = contentData[dayKey];

  if (!dayData) {
    throw new Error(`Missing data for ${dayKey} in GPT-4o response`);
  }

  // Calculate scheduled times for this day
  const currentDate = new Date(startOfWeek);
  currentDate.setDate(currentDate.getDate() + i - 1);

  // X/Twitter: 10h, 13h, 17h (we'll use 10h for the scheduled time)
  const scheduledX = new Date(currentDate);
  scheduledX.setHours(10, 0, 0, 0);

  // Instagram: 11h
  const scheduledIG = new Date(currentDate);
  scheduledIG.setHours(11, 0, 0, 0);

  // YouTube: Sunday at 8h (only for day 7)
  const scheduledYT = i === 7 ? new Date(currentDate).setHours(8, 0, 0, 0) : null;

  // ⚠️ CORREÇÃO CRÍTICA: Usar twitter_insertion_1/2/3 ao invés de twitter[0/1/2]
  const record = {
    week_number: weekNumber,
    year: year,
    day_of_week: i,
    main_theme: mainTheme,
    sub_theme: dayData.sub_theme || `Subtema ${i}`,
    twitter_insertion_1: dayData.twitter_insertion_1,  // ✅ CORRIGIDO
    twitter_insertion_2: dayData.twitter_insertion_2,  // ✅ CORRIGIDO
    twitter_insertion_3: dayData.twitter_insertion_3,  // ✅ CORRIGIDO
    instagram_post: dayData.instagram_post,
    instagram_caption: dayData.instagram_caption,
    instagram_hashtags: dayData.instagram_hashtags,
    youtube_segment: dayData.youtube_segment,
    scheduled_x_at: scheduledX.toISOString(),
    scheduled_instagram_at: scheduledIG.toISOString(),
    scheduled_youtube_at: scheduledYT ? new Date(scheduledYT).toISOString() : null,
    // Merge LLM metrics
    llm_model: llmMetrics.llm_model,
    llm_prompt_tokens: llmMetrics.llm_prompt_tokens,
    llm_completion_tokens: llmMetrics.llm_completion_tokens,
    llm_total_tokens: llmMetrics.llm_total_tokens,
    llm_cost_usd: llmMetrics.llm_cost_usd,
    llm_generation_time_ms: llmMetrics.llm_generation_time_ms,
    llm_temperature: llmMetrics.llm_temperature
  };

  records.push(record);
}

return records.map(record => ({ json: record }));
