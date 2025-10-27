// 📋 N8N Code Node - Format Reels Prompt
// RECEBE OS 3 THREADS DO TWITTER E GERA PROMPT PARA 3 REELS

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

// Extrair os tweets do formato retornado pelo GPT
let allTweets;

if (parsedContent.tweets && Array.isArray(parsedContent.tweets)) {
  // Formato: { tweets: ["tweet1", "tweet2", ...] }
  allTweets = parsedContent.tweets;
} else if (parsedContent.day_1) {
  // Formato antigo: day_1, day_2, day_3
  allTweets = [
    parsedContent.day_1.twitter_insertion_1,
    parsedContent.day_1.twitter_insertion_2,
    parsedContent.day_1.twitter_insertion_3,
    parsedContent.day_1.twitter_insertion_4,
    parsedContent.day_1.twitter_insertion_5,
    parsedContent.day_1.twitter_insertion_6,
    parsedContent.day_1.twitter_insertion_7,
    parsedContent.day_2.twitter_insertion_1,
    parsedContent.day_2.twitter_insertion_2,
    parsedContent.day_2.twitter_insertion_3,
    parsedContent.day_2.twitter_insertion_4,
    parsedContent.day_2.twitter_insertion_5,
    parsedContent.day_2.twitter_insertion_6,
    parsedContent.day_2.twitter_insertion_7,
    parsedContent.day_3.twitter_insertion_1,
    parsedContent.day_3.twitter_insertion_2,
    parsedContent.day_3.twitter_insertion_3,
    parsedContent.day_3.twitter_insertion_4,
    parsedContent.day_3.twitter_insertion_5,
    parsedContent.day_3.twitter_insertion_6,
    parsedContent.day_3.twitter_insertion_7
  ].filter(t => t);
} else {
  throw new Error('Formato JSON desconhecido. Keys: ' + Object.keys(parsedContent).join(', '));
}

// Dividir em 3 threads de 7 tweets cada
const thread1Tweets = allTweets.slice(0, 7).join('\n');
const thread2Tweets = allTweets.slice(7, 14).join('\n');
const thread3Tweets = allTweets.slice(14, 21).join('\n');

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
'**Thread 1 (Anatomia da Dor):**\n' + thread1Tweets + '\n\n' +
'**Thread 2 (Tentativas que Falham):**\n' + thread2Tweets + '\n\n' +
'**Thread 3 (Princípios de Solução):**\n' + thread3Tweets + '\n\n' +
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
'**REEL 1: ANATOMIA DA DOR** (baseado em Thread 1)\n' +
'- Carla (20-25s): Hook + Contexto pessoal + Dor emocional\n' +
'- Bruno (35-40s): Como funciona + Por que funciona + Resultados SEM CTA\n\n' +
'**REEL 2: TENTATIVAS QUE FALHAM** (baseado em Thread 2)\n' +
'- Carla (20-25s): Hook + Experiência frustrada + Raiz do problema\n' +
'- Bruno (35-40s): Princípios corretos + Diferença arquitetural SEM CTA\n\n' +
'**REEL 3: PRINCÍPIOS DE SOLUÇÃO** (baseado em Thread 3)\n' +
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
'    "sub_theme": "Título do Reel 1",\n' +
'    "carla_script": "[55-75 palavras]",\n' +
'    "bruno_script": "[95-120 palavras SEM CTA]",\n' +
'    "instagram_caption": "[Máx 150 chars]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  },\n' +
'  "reel_2": {\n' +
'    "sub_theme": "Título do Reel 2",\n' +
'    "carla_script": "[55-75 palavras]",\n' +
'    "bruno_script": "[95-120 palavras SEM CTA]",\n' +
'    "instagram_caption": "[Máx 150 chars]",\n' +
'    "instagram_hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"]\n' +
'  },\n' +
'  "reel_3": {\n' +
'    "sub_theme": "Título do Reel 3",\n' +
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
    request_start_time: Date.now()
  }
};
