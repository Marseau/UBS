// 📋 N8N Code Node - Format Reels Prompt (WITH TITLES)
// RECEBE OS 3 THREADS DO TWITTER (com títulos) E GERA PROMPT PARA 3 REELS

const response = $input.item.json;
const formatPromptData = $('Format Twitter Prompt').item.json;
const weekNumber = formatPromptData.week_number;
const year = formatPromptData.year;
const mainTheme = formatPromptData.main_theme;
const audioName = formatPromptData.audio_name;

// Parse da resposta do Twitter (vem do node anterior)
const contentText = response.choices[0].message.content.trim();
let parsedContent;

try {
  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    parsedContent = JSON.parse(jsonMatch[0]);
  } else {
    parsedContent = JSON.parse(contentText);
  }
} catch (error) {
  throw new Error('Failed to parse GPT response as JSON: ' + error.message);
}

// Validar estrutura com títulos
if (!parsedContent.Thread1 && !parsedContent.thread1) {
  throw new Error('Formato JSON inválido. Expected Thread1, Thread2, Thread3. Keys: ' + Object.keys(parsedContent).join(', '));
}

const thread1 = parsedContent.Thread1 || parsedContent.thread1;
const thread2 = parsedContent.Thread2 || parsedContent.thread2;
const thread3 = parsedContent.Thread3 || parsedContent.thread3;

// Extrair título e tweets de cada thread
const extractThreadData = (thread) => {
  if (!thread) {
    return { title: '', tweets: [], sub_theme: '' };
  }

  let title = '';
  let sub_theme = '';
  let tweets = [];

  // Formato esperado: { title: "...", sub_theme: "...", tweets: [...] }
  if (thread.title && thread.tweets) {
    title = thread.title;
    sub_theme = thread.sub_theme || '';
    tweets = Array.isArray(thread.tweets) ? thread.tweets : [];
  }
  // Fallback: formato antigo (array direto ou objeto com tweets numerados)
  else if (Array.isArray(thread)) {
    tweets = thread;
  } else if (typeof thread === 'object') {
    tweets = Object.keys(thread)
      .filter(k => k.toLowerCase().includes('tweet'))
      .map(k => thread[k])
      .filter(t => t);
  } else if (typeof thread === 'string') {
    tweets = thread.split('\n').filter(t => t.trim());
  }

  return { title, sub_theme, tweets };
};

const thread1Data = extractThreadData(thread1);
const thread2Data = extractThreadData(thread2);
const thread3Data = extractThreadData(thread3);

// Validar que temos tweets suficientes
const allTweets = [
  ...thread1Data.tweets,
  ...thread2Data.tweets,
  ...thread3Data.tweets
];

if (allTweets.length === 0) {
  throw new Error('Nenhum tweet foi extraído do JSON. Parsed content: ' + JSON.stringify(parsedContent).substring(0, 500));
}

console.log(`✅ Extraídos ${allTweets.length} tweets do GPT`);
console.log(`📌 Thread 1: "${thread1Data.title}" (${thread1Data.tweets.length} tweets)`);
console.log(`📌 Thread 2: "${thread2Data.title}" (${thread2Data.tweets.length} tweets)`);
console.log(`📌 Thread 3: "${thread3Data.title}" (${thread3Data.tweets.length} tweets)`);

// Montar strings de tweets para o prompt dos Reels
const thread1Tweets = thread1Data.tweets.join('\n');
const thread2Tweets = thread2Data.tweets.join('\n');
const thread3Tweets = thread3Data.tweets.join('\n');

const prompt = 'Você é um estrategista de conteúdo para Instagram Reels especializado em narrativas visuais que viralizam no formato vertical 9:16 (1080x1920).\n\n' +
'## SUA MISSÃO\n\n' +
'Criar 3 Reels (baseados nas 3 threads do Twitter) com formato dual persona (Carla + Bruno), otimizados para viralidade e conversão de seguidores.\n\n' +
'**TEMA DA SEMANA:** ' + mainTheme + '\n' +
'**SEMANA:** ' + weekNumber + '/' + year + '\n' +
'**ÁUDIO TRENDING:** ' + audioName + '\n\n' +
'---\n\n' +
'## ⚠️ ESTRATÉGIA CRÍTICA DE CTA PARA YOUTUBE\n\n' +
'- **Reel 1 (Bruno)**: NÃO incluir CTA no final do script de voz\n' +
'- **Reel 2 (Bruno)**: NÃO incluir CTA no final do script de voz\n' +
'- **Reel 3 (Bruno)**: INCLUIR CTA forte no final do script de voz\n\n' +
'**Motivo**: Os 3 Reels serão concatenados em um YouTube Short de ~3 minutos. Apenas o Reel 3 (final) deve ter CTA para evitar repetição.\n\n' +
'**Caption Instagram**: Todos os 3 Reels mantêm CTA padrão no caption: "Teste 7 dias grátis → link na bio"\n\n' +
'---\n\n' +
'## THREADS DO TWITTER PARA ADAPTAR\n\n' +
'**Thread 1: ' + thread1Data.title + '**\n' +
'(Sub-tema: ' + thread1Data.sub_theme + ')\n' +
thread1Tweets + '\n\n' +
'**Thread 2: ' + thread2Data.title + '**\n' +
'(Sub-tema: ' + thread2Data.sub_theme + ')\n' +
thread2Tweets + '\n\n' +
'**Thread 3: ' + thread3Data.title + '**\n' +
'(Sub-tema: ' + thread3Data.sub_theme + ')\n' +
thread3Tweets + '\n\n' +
'---\n\n' +
'## PERSONAS DUAL\n\n' +
'**CARLA (32 anos, gestora)**\n' +
'- Tom: Empático, vulnerável, "eu também passei por isso"\n' +
'- Papel: Apresentar o PROBLEMA com dados pessoais e emoção\n' +
'- Tempo: 20-25s | Palavras: 55-75 | WPM: 160-180\n\n' +
'**BRUNO (35 anos, especialista SaaS)**\n' +
'- Tom: Confiante, técnico acessível, baseado em dados\n' +
'- Papel: SOLUÇÃO detalhada + COMO FUNCIONA + resultados + CTA\n' +
'- Tempo: 35-40s | Palavras: 95-120 | WPM: 160-180\n\n' +
'---\n\n' +
'## ESTRUTURA DE CADA REEL (60s)\n\n' +
'**REEL 1: ' + (thread1Data.title || 'ANATOMIA DA DOR') + '** (baseado em Thread 1)\n' +
'- Carla (20-25s): Hook + Contexto pessoal + Dor emocional\n' +
'- Bruno (35-40s): Como funciona + Por que funciona + Resultados SEM CTA\n\n' +
'**REEL 2: ' + (thread2Data.title || 'TENTATIVAS QUE FALHAM') + '** (baseado em Thread 2)\n' +
'- Carla (20-25s): Hook + Experiência frustrada + Raiz do problema\n' +
'- Bruno (35-40s): Princípios corretos + Diferença arquitetural SEM CTA\n\n' +
'**REEL 3: ' + (thread3Data.title || 'PRINCÍPIOS DE SOLUÇÃO') + '** (baseado em Thread 3)\n' +
'- Carla (20-25s): Hook + Transformação possível + Ponte emocional\n' +
'- Bruno (35-40s): Arquitetura completa + Resultado sistêmico + CTA FINAL\n\n' +
'---\n\n' +
'## HASHTAGS (7-10, sem #)\n\n' +
'**Grupo A - Alto volume (3-4):** marketingdigital, empreendedorismo, negocios, vendas, gestao, produtividade, tecnologia\n\n' +
'**Grupo B - Nicho SaaS (3-4):** saasbrasil, automatizacao, automatizacaowhatsapp, whatsappbusiness, chatbot, integracao\n\n' +
'**Grupo C - Ultra-específica (1-2):**\n' +
'- Reel 1: captacaodeleads, leads, conversao, qualificacao\n' +
'- Reel 2: agendamento, googlecalendar, gestaodetempo\n' +
'- Reel 3: roi, metricas, analytics, resultados\n\n' +
'---\n\n' +
'## VALIDAÇÃO CRÍTICA\n\n' +
'**Contagem PALAVRAS (não caracteres):**\n' +
'- Carla: 55-75 palavras exatas\n' +
'- Bruno: 95-120 palavras exatas\n' +
'- Total por Reel: 150-195 palavras (60s)\n\n' +
'**Caption:** Máx 150 caracteres com CTA "Teste 7 dias grátis → link na bio"\n\n' +
'---\n\n' +
'## FORMATO DE SAÍDA\n\n' +
'RETORNE APENAS JSON VÁLIDO (sem markdown):\n\n' +
'{\n' +
'  "reel_1": {\n' +
'    "sub_theme": "' + (thread1Data.title || 'Título do Reel 1') + '",\n' +
'    "carla_script": "[55-75 palavras]",\n' +
'    "bruno_script": "[95-120 palavras SEM CTA]",\n' +
'    "instagram_caption": "[Máx 150 chars]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  },\n' +
'  "reel_2": {\n' +
'    "sub_theme": "' + (thread2Data.title || 'Título do Reel 2') + '",\n' +
'    "carla_script": "[55-75 palavras]",\n' +
'    "bruno_script": "[95-120 palavras SEM CTA]",\n' +
'    "instagram_caption": "[Máx 150 chars]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  },\n' +
'  "reel_3": {\n' +
'    "sub_theme": "' + (thread3Data.title || 'Título do Reel 3') + '",\n' +
'    "carla_script": "[55-75 palavras]",\n' +
'    "bruno_script": "[95-120 palavras COM CTA FINAL]",\n' +
'    "instagram_caption": "[Máx 150 chars]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  }\n' +
'}\n\n' +
'---\n\n' +
'## REGRAS RÍGIDAS\n\n' +
'❌ NUNCA ultrapasse limites de palavras\n' +
'❌ NUNCA conte caracteres, SEMPRE conte PALAVRAS\n' +
'❌ NUNCA invente estatísticas sem fonte\n\n' +
'✅ SEMPRE valide contagem de palavras\n' +
'✅ SEMPRE baseie em conteúdo das threads\n' +
'✅ SEMPRE use CTA padrão no caption\n' +
'✅ SEMPRE mix balanceado hashtags (3-4 A + 3-4 B + 1-2 C)';

return {
  json: {
    prompt,
    week_number: weekNumber,
    year,
    main_theme: mainTheme,
    audio_name: audioName,
    twitter_content: parsedContent,
    twitter_llm_metrics: response.llm_metrics || response.llm_metrics_twitter || {},
    request_start_time: Date.now(),
    debug_tweets_count: allTweets.length,
    thread_1_title: thread1Data.title,
    thread_2_title: thread2Data.title,
    thread_3_title: thread3Data.title,
    thread_1_sub_theme: thread1Data.sub_theme,
    thread_2_sub_theme: thread2Data.sub_theme,
    thread_3_sub_theme: thread3Data.sub_theme,
    thread_1_tweets: thread1Data.tweets,
    thread_2_tweets: thread2Data.tweets,
    thread_3_tweets: thread3Data.tweets
  }
};
