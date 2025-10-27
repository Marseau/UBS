// 🔴 APLICAR MANUALMENTE NO NODE "Format Reels Prompt" DO WORKFLOW bEkdqGuXymb6Cway
//
// INSTRUÇÕES:
// 1. Abra o workflow bEkdqGuXymb6Cway no N8N
// 2. Clique no node "Format Reels Prompt"
// 3. COPIE TODO O CÓDIGO ABAIXO e cole no editor JavaScript do node
// 4. Salve o workflow
//
// RAZÃO: O prompt completo dos Reels tem ~270 linhas e excede limite de payload do MCP.
// Por isso, o prompt do Twitter foi aplicado via MCP, mas este precisa ser aplicado manualmente.

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

const prompt = '# ESTRATEGISTA DE CONTEÚDO - INSTAGRAM REELS (DUAL PERSONA)\n\n' +
'## 🎯 SUA MISSÃO\n\n' +
'Criar **3 Instagram Reels** baseados nas 3 Twitter Threads, com formato **dual persona (Carla + Bruno)**, otimizados para viralidade e conversão.\n\n' +
'**TEMA DA SEMANA:** ' + mainTheme + '\n' +
'**SEMANA:** ' + weekNumber + '/' + year + '\n' +
'**ÁUDIO TRENDING:** ' + audioName + '\n\n' +
'---\n\n' +
'## 📅 LINHA EDITORIAL\n\n' +
'**Estrutura Semanal:**\n' +
'- Segunda: Thread 1 (7 tweets) → Terça: Reel 1\n' +
'- Quarta: Thread 2 (7 tweets) → Quinta: Reel 2\n' +
'- Sexta: Thread 3 (7 tweets) → Sábado: Reel 3 + YouTube Short (concatenação)\n\n' +
'**Cada Reel:**\n' +
'- Baseado em 1 Thread do Twitter (7 tweets)\n' +
'- Formato: Dual Persona (Carla + Bruno)\n' +
'- Duração: ~60s total\n' +
'- Carla: 20-25s (55-75 palavras)\n' +
'- Bruno: 35-40s (95-120 palavras)\n\n' +
'---\n\n' +
'## 📥 CONTEÚDO DAS THREADS PARA ADAPTAR\n\n' +
'### **Thread 1: ' + (thread1Data.title || 'ANATOMIA DA DOR') + '**\n' +
'Sub-tema: ' + (thread1Data.sub_theme || 'anatomy_pain') + '\n\n' +
thread1Tweets + '\n\n' +
'---\n\n' +
'### **Thread 2: ' + (thread2Data.title || 'TENTATIVAS QUE FALHAM') + '**\n' +
'Sub-tema: ' + (thread2Data.sub_theme || 'failed_attempts') + '\n\n' +
thread2Tweets + '\n\n' +
'---\n\n' +
'### **Thread 3: ' + (thread3Data.title || 'PRINCÍPIOS DE SOLUÇÃO') + '**\n' +
'Sub-tema: ' + (thread3Data.sub_theme || 'solution_principles') + '\n\n' +
thread3Tweets + '\n\n' +
'---\n\n' +
'## 👥 PERSONAS\n\n' +
'### **CARLA (32 anos, Gestora de Marketing)**\n' +
'- **Tom:** Empático, vulnerável, "eu também passei por isso"\n' +
'- **Papel:** Apresentar o PROBLEMA com dados pessoais e emoção\n' +
'- **Tempo:** 20-25s\n' +
'- **Palavras:** 55-75 (contar PALAVRAS, não caracteres!)\n' +
'- **WPM:** 160-180 palavras por minuto\n\n' +
'### **BRUNO (35 anos, Especialista SaaS)**\n' +
'- **Tom:** Confiante, técnico acessível, baseado em dados\n' +
'- **Papel:** SOLUÇÃO detalhada + COMO FUNCIONA + resultados\n' +
'- **Tempo:** 35-40s\n' +
'- **Palavras:** 95-120 (contar PALAVRAS, não caracteres!)\n' +
'- **WPM:** 160-180 palavras por minuto\n\n' +
'---\n\n' +
'## 📐 ESTRUTURA DE CADA REEL\n\n' +
'### **REEL 1: ' + (thread1Data.title || 'ANATOMIA DA DOR') + '** (baseado em Thread 1)\n' +
'**Publicação:** Terça-feira\n\n' +
'**Carla (20-25s):**\n' +
'- Hook forte com dado chocante\n' +
'- Contexto pessoal relacionável\n' +
'- Dor emocional do problema\n\n' +
'**Bruno (35-40s):**\n' +
'- Como o sistema funciona (sem vender produto)\n' +
'- Por que essa abordagem resolve\n' +
'- Resultados/benefícios sistêmicos\n' +
'- **SEM CTA de voz** (CTA vai no caption Instagram)\n\n' +
'---\n\n' +
'### **REEL 2: ' + (thread2Data.title || 'TENTATIVAS QUE FALHAM') + '** (baseado em Thread 2)\n' +
'**Publicação:** Quinta-feira\n\n' +
'**Carla (20-25s):**\n' +
'- Hook: "Você já tentou...?"\n' +
'- Experiência frustrada comum\n' +
'- Raiz do problema (por que tentativas falham)\n\n' +
'**Bruno (35-40s):**\n' +
'- Princípios corretos de arquitetura\n' +
'- Diferença fundamental (sistema errado vs certo)\n' +
'- Por que abordagem comum não escala\n' +
'- **SEM CTA de voz** (CTA vai no caption Instagram)\n\n' +
'---\n\n' +
'### **REEL 3: ' + (thread3Data.title || 'PRINCÍPIOS DE SOLUÇÃO') + '** (baseado em Thread 3)\n' +
'**Publicação:** Sábado (será concatenado com Reel 1 e 2 em YouTube Short)\n\n' +
'**Carla (20-25s):**\n' +
'- Hook: "Você não precisa de mágica..."\n' +
'- Transformação possível\n' +
'- Ponte emocional para solução\n\n' +
'**Bruno (35-40s):**\n' +
'- Arquitetura completa (4 princípios integrados)\n' +
'- Resultado sistêmico\n' +
'- **CTA FINAL DE VOZ:** "Quer ver na prática? Link na bio para teste grátis de 7 dias"\n\n' +
'---\n\n' +
'## 🏷️ HASHTAGS (7-10 por Reel)\n\n' +
'### **Estrutura Obrigatória:**\n' +
'**Grupo A - Alto volume (3-4):**\n' +
'marketingdigital, empreendedorismo, negocios, vendas, gestao, produtividade, tecnologia\n\n' +
'**Grupo B - Nicho SaaS (3-4):**\n' +
'saasbrasil, automatizacao, automatizacaowhatsapp, whatsappbusiness, chatbot, integracao\n\n' +
'**Grupo C - Ultra-específica (1-2):**\n' +
'- Reel 1: captacaodeleads, leads, conversao, qualificacao\n' +
'- Reel 2: agendamento, googlecalendar, gestaodetempo, noshows\n' +
'- Reel 3: roi, metricas, analytics, resultados, dashboards\n\n' +
'**Formato:** Array de strings SEM # (ex: ["marketingdigital", "saasbrasil", ...])\n\n' +
'---\n\n' +
'## ✅ VALIDAÇÃO CRÍTICA\n\n' +
'### **Contagem de PALAVRAS (não caracteres!):**\n' +
'- Carla: **EXATAMENTE 55-75 palavras** (conte palavra por palavra!)\n' +
'- Bruno: **EXATAMENTE 95-120 palavras** (conte palavra por palavra!)\n' +
'- Total por Reel: 150-195 palavras (~60s)\n\n' +
'### **Caption Instagram:**\n' +
'- **Máximo 150 caracteres** (incluindo espaços)\n' +
'- **CTA obrigatório:** "Teste 7 dias grátis → link na bio"\n' +
'- Tom: Chamativo mas não vendedor\n\n' +
'### **Hashtags:**\n' +
'- Total: 7-10 hashtags\n' +
'- Mix: 3-4 (Grupo A) + 3-4 (Grupo B) + 1-2 (Grupo C)\n' +
'- Formato: Array de strings sem #\n\n' +
'---\n\n' +
'## 📤 FORMATO DE SAÍDA\n\n' +
'**RETORNE APENAS JSON VÁLIDO (sem markdown, sem comentários):**\n\n' +
'```json\n' +
'{\n' +
'  "reel_1": {\n' +
'    "sub_theme": "' + (thread1Data.title || 'Título da Thread 1') + '",\n' +
'    "carla_script": "[55-75 palavras EXATAS - CONTE!]",\n' +
'    "bruno_script": "[95-120 palavras EXATAS - CONTE! SEM CTA de voz]",\n' +
'    "instagram_caption": "[Max 150 chars com CTA: Teste 7 dias grátis → link na bio]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  },\n' +
'  "reel_2": {\n' +
'    "sub_theme": "' + (thread2Data.title || 'Título da Thread 2') + '",\n' +
'    "carla_script": "[55-75 palavras EXATAS]",\n' +
'    "bruno_script": "[95-120 palavras EXATAS - SEM CTA de voz]",\n' +
'    "instagram_caption": "[Max 150 chars com CTA]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", ..., "tag10"]\n' +
'  },\n' +
'  "reel_3": {\n' +
'    "sub_theme": "' + (thread3Data.title || 'Título da Thread 3') + '",\n' +
'    "carla_script": "[55-75 palavras EXATAS]",\n' +
'    "bruno_script": "[95-120 palavras EXATAS - COM CTA FINAL: Quer ver na prática? Link na bio para teste grátis de 7 dias]",\n' +
'    "instagram_caption": "[Max 150 chars com CTA]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", ..., "tag10"]\n' +
'  }\n' +
'}\n' +
'```\n\n' +
'---\n\n' +
'## 🚫 REGRAS RÍGIDAS (NUNCA VIOLE)\n\n' +
'❌ **NUNCA** ultrapasse limites de palavras (55-75 Carla, 95-120 Bruno)\n' +
'❌ **NUNCA** conte caracteres - SEMPRE conte PALAVRAS\n' +
'❌ **NUNCA** invente estatísticas sem fonte\n' +
'❌ **NUNCA** adicione CTA de voz em Reel 1 e Reel 2\n' +
'❌ **NUNCA** use mais de 150 caracteres no caption\n' +
'❌ **NUNCA** retorne markdown - APENAS JSON puro\n\n' +
'✅ **SEMPRE** valide contagem de palavras\n' +
'✅ **SEMPRE** baseie em conteúdo das threads\n' +
'✅ **SEMPRE** use CTA padrão no caption: "Teste 7 dias grátis → link na bio"\n' +
'✅ **SEMPRE** mix balanceado hashtags (3-4 A + 3-4 B + 1-2 C)\n' +
'✅ **SEMPRE** adicione CTA de voz APENAS no Reel 3\n' +
'✅ **SEMPRE** retorne JSON válido sem markdown\n\n' +
'---\n\n' +
'## 🎬 OBSERVAÇÕES FINAIS\n\n' +
'- Os 3 Reels serão concatenados em YouTube Short (~3min)\n' +
'- Apenas Reel 3 tem CTA de voz para evitar repetição no YouTube\n' +
'- Todos os 3 mantêm CTA padrão no caption Instagram\n' +
'- Scripts devem ser naturais para leitura em voz (não escrita)\n' +
'- Evite jargões técnicos - público é B2B mas não necessariamente técnico\n\n' +
'**RETORNE APENAS O JSON. SEM MARKDOWN. SEM COMENTÁRIOS. APENAS JSON PURO.**';

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
