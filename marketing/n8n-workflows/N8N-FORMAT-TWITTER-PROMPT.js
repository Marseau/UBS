// 📋 N8N Code Node - Format Twitter Prompt (SEM FALLBACKS)
// BASEADO EXATAMENTE EM PROMPT-TWITTER-THREADS-V3-FINAL.md
// VALIDAÇÃO RIGOROSA - TODOS OS CAMPOS OBRIGATÓRIOS

// ⚠️ Este node VAI FALHAR se:
// - main_theme não for fornecido
// - week_number não for fornecido
// - Node "Get Random Trending Audio" não retornar dados válidos
// - Campos audio_name, audio_id ou trending_score estiverem ausentes

// VALIDAÇÃO RIGOROSA - SEM FALLBACKS

// Pegar dados do node "Edit Fields" especificamente
const editFieldsNode = $('Edit Fields').first();

if (!editFieldsNode || !editFieldsNode.json) {
  throw new Error('Node "Edit Fields" não encontrado ou não retornou dados válidos');
}

let inputData = editFieldsNode.json;

// Se vier como array, pegar o primeiro item
if (Array.isArray(inputData)) {
  if (inputData.length === 0) {
    throw new Error('Array de input está vazio. Node "Edit Fields" não retornou dados.');
  }
  inputData = inputData[0];
}

// Validar tipo do inputData
if (!inputData || typeof inputData !== 'object') {
  throw new Error('Input inválido do node "Edit Fields". Esperado objeto com main_theme e week_number. Recebido: ' + typeof inputData);
}

if (!inputData.main_theme) {
  throw new Error('Campo "main_theme" não encontrado no node "Edit Fields". Keys disponíveis: ' + Object.keys(inputData).join(', '));
}

if (!inputData.week_number) {
  throw new Error('Campo "week_number" não encontrado no node "Edit Fields". Keys disponíveis: ' + Object.keys(inputData).join(', '));
}

const mainTheme = inputData.main_theme;
const weekNumber = inputData.week_number;
const year = new Date().getFullYear();

// VALIDAÇÃO DE ÁUDIO - SEM FALLBACKS
const audioNode = $('Get Random Trending Audio').first();

if (!audioNode || !audioNode.json) {
  throw new Error('Node "Get Random Trending Audio" não retornou dados válidos');
}

const audioData = audioNode.json;

if (!audioData.audio_name) {
  throw new Error('Campo "audio_name" não encontrado no trending audio. Keys disponíveis: ' + Object.keys(audioData).join(', '));
}

if (!audioData.audio_id) {
  throw new Error('Campo "audio_id" não encontrado no trending audio. Keys disponíveis: ' + Object.keys(audioData).join(', '));
}

if (typeof audioData.trending_score !== 'number') {
  throw new Error('Campo "trending_score" deve ser um número. Valor recebido: ' + audioData.trending_score);
}

const audioName = audioData.audio_name;
const audioId = audioData.audio_id;
const trendingScore = audioData.trending_score;

console.log(`✅ Dados validados: Tema="${mainTheme}", Semana=${weekNumber}, Áudio="${audioName}"`);

const prompt = '# PROMPT GERADOR DE TWITTER THREADS - UBS TAYLOR MADE\n\n' +
'## 🎯 SUA MISSÃO\n\n' +
'Você é um **estrategista de conteúdo para Twitter** especializado em dores de mercado B2B para empresas que dependem de agendamento e conversão de leads.\n\n' +
'**Sua tarefa:**\n' +
'Ao Receber **tema/dor** será criar **21 tweets** (3 threads de 7 tweets cada) baseados em **pesquisa real de mercado** buscando captar seguidores.\n\n' +
'---\n\n' +
'## 📊 CONTEXTO DO PRODUTO: UBS TAYLOR MADE\n\n' +
'**O sistema se propõe de maneira costumizada:**\n' +
'Para agendamentos\n' +
'- Automação do processo: Clientes podem agendar, reagendar e cancelar compromissos diretamente pelo WhatsApp, a qualquer hora. A IA conduz a conversa de forma inteligente, identificando a intenção do usuário e oferecendo horários disponíveis em tempo real.\n' +
'- Sincronização em tempo real: A agenda da empresa (ou de profissionais específicos) é automaticamente atualizada no Google Calendar, evitando conflitos e garantindo que todos tenham acesso à mesma informação.\n' +
'- Lembretes automáticos: A plataforma envia lembretes por WhatsApp antes dos agendamentos, reduzindo significativamente o número de faltas e atrasos, o que garante maior eficiência e receita para o negócio.\n' +
'- Gestão de múltiplos calendários: A solução pode gerenciar a agenda de múltiplos profissionais ou recursos, alocando o cliente ao profissional correto de acordo com a especialidade ou disponibilidade.\n\n' +
'Para conversão de leads\n' +
'- Qualificação automatizada: A IA atua como um SDR (Sales Development Representative) virtual, conversando com os leads que chegam pelo WhatsApp para qualificá-los. O sistema filtra os leads desinteressados e prioriza os mais promissores.\n' +
'- Respostas imediatas: O chatbot com IA responde aos leads em segundos, eliminando o tempo de espera e aumentando a chance de engajamento, já que os clientes em potencial são atendidos enquanto ainda estão interessados.\n' +
'- Fluxos de nutrição personalizados: Com base nas interações no WhatsApp, a IA pode iniciar fluxos de nutrição personalizados, enviando informações relevantes para cada tipo de lead, com o objetivo de movê-lo pelo funil de vendas.\n' +
'- Geração de relatórios: A plataforma oferece relatórios detalhados sobre a origem dos leads, as taxas de conversão e o desempenho do processo de agendamento, permitindo que a empresa tome decisões estratégicas com base em dados.\n\n' +
'Como essa solução resolve as dores das empresas\n' +
'- Redução da carga de trabalho: A equipe não precisa mais gastar tempo com tarefas repetitivas, como responder a perguntas comuns e agendar manualmente. Isso libera os colaboradores para se concentrarem em atividades mais estratégicas.\n' +
'- Otimização do fluxo de trabalho: Ao integrar a comunicação (WhatsApp), a gestão de agenda (Google Calendar) e a inteligência (IA) em uma única plataforma, o processo se torna fluido e sem atritos.\n' +
'- Aumento da receita: A qualificação de leads mais eficiente e a redução de faltas aos agendamentos levam a um aumento direto na receita da empresa.\n' +
'- Melhora da experiência do cliente: A comunicação rápida e a facilidade de agendamento pelo canal preferido do cliente (WhatsApp) aumentam a satisfação e a fidelidade.\n\n' +
'**Público-alvo:**\n' +
'1. **Prestadores de serviço independentes e autônomos**\n' +
'- São profissionais que dependem diretamente da agilidade e eficiência do agendamento para gerar receita, mas que muitas vezes não têm tempo ou recursos para gerenciar essa tarefa manualmente.\n' +
'Segmentos: Personal trainers, consultores, coaches, tutores, fotógrafos e profissionais de beleza (maquiadores, manicures).\n' +
'Problemas resolvidos: Gestão de agenda, lembretes de compromissos para reduzir faltas (no-shows) e qualificação inicial de leads.\n' +
'2. **Pequenas e médias empresas (PMEs)**\n' +
'- Para empresas com um fluxo maior de clientes, a automação permite que a equipe se concentre em tarefas mais estratégicas, enquanto o SaaS cuida de todo o processo de agendamento e conversão.\n' +
'Segmentos: Salões de beleza, clínicas médicas e de estética, consultórios odontológicos, estúdios de tatuagem, oficinas mecânicas, escolas de idiomas e academias.\n' +
'Problemas resolvidos: Centralização das informações, qualificação automática de leads, agendamento de consultas e lembretes para evitar o esquecimento dos clientes.\n' +
'3. **Empresas com atendimento ao cliente intensivo**\n' +
'- Comunicação eficiente é crucial para esses negócios, e o SaaS pode ajudar a automatizar grande parte desse processo, liberando o tempo da equipe.\n' +
'Segmentos: Setor imobiliário (agendamento de visitas), setor de educação (agendamento de aulas e reuniões), provedores de serviços de TI (suporte técnico) e call centers.\n' +
'Problemas resolvidos: Interações automatizadas com clientes, encaminhamento de solicitações e qualificação inicial de novos clientes.\n\n' +
'**O que NÃO pode prometer:**\n' +
'❌ Porcentagens específicas de melhoria ("aumente 67% sua conversão")\n' +
'❌ Resultados garantidos sem dados reais\n' +
'❌ Comparações "antes vs depois" fictícias\n' +
'❌ Cases de clientes inventados\n\n' +
'**O que PODE fazer:**\n' +
'✅ Citar estudos de mercado de fontes confiáveis (SEMPRE com fonte)\n' +
'✅ Fazer cálculos hipotéticos de custo (deixando claro que é exemplo)\n' +
'✅ Explicar capacidades técnicas do sistema\n' +
'✅ Descrever princípios de como resolve o problema\n\n' +
'---\n\n' +
'## 📥 INPUT QUE VOCÊ RECEBERÁ\n\n' +
'Tema da semana: ' + mainTheme + '\n' +
'Semana: ' + weekNumber + '/' + year + '\n\n' +
'---\n\n' +
'## 📤 OUTPUT QUE VOCÊ DEVE GERAR\n\n' +
'**FORMATO JSON OBRIGATÓRIO com 21 TWEETS organizados em 3 THREADS de 7 tweets cada:**\n\n' +
'**Thread 1 (tweets 1-7):** ANATOMIA DA DOR\n' +
'- Foco: Explorar o PROBLEMA em profundidade\n' +
'- Objetivo: Gerar identificação ("isso sou eu!")\n' +
'- OBRIGATÓRIO: Criar um **título chamativo** para esta thread\n' +
'- OBRIGATÓRIO: Definir **sub_theme** (slug em snake_case, ex: "anatomy_pain")\n\n' +
'**Thread 2 (tweets 8-14):** TENTATIVAS COMUNS QUE FALHAM\n' +
'- Foco: Por que soluções óbvias NÃO resolvem\n' +
'- Objetivo: Quebrar objeções ("já tentei X e não funcionou")\n' +
'- OBRIGATÓRIO: Criar um **título chamativo** para esta thread\n' +
'- OBRIGATÓRIO: Definir **sub_theme** (slug em snake_case, ex: "failed_attempts")\n\n' +
'**Thread 3 (tweets 15-21):** PRINCÍPIOS DE SOLUÇÃO\n' +
'- Foco: COMO resolver (conceitos, não produto)\n' +
'- Objetivo: Educar sobre arquitetura correta\n' +
'- OBRIGATÓRIO: Criar um **título chamativo** para esta thread\n' +
'- OBRIGATÓRIO: Definir **sub_theme** (slug em snake_case, ex: "solution_principles")\n\n' +
'---\n\n' +
'## 🔍 PROCESSO OBRIGATÓRIO DE PESQUISA\n\n' +
'### **PASSO 1: PESQUISE O MERCADO**\n\n' +
'**Você DEVE pesquisar e incluir:**\n\n' +
'1. **Estudos de fontes confiáveis:**\n' +
'   - Harvard Business Review\n' +
'   - McKinsey & Company\n' +
'   - Forrester Research\n' +
'   - Gartner\n' +
'   - Salesforce State of Marketing\n' +
'   - HubSpot Research\n' +
'   - Gallup\n' +
'   - Forbes\n' +
'   - Inc. Magazine\n\n' +
'2. **Dados específicos que deve buscar:**\n' +
'   - Porcentagens de perda/falha no mercado\n' +
'   - Custos médios do problema\n' +
'   - Tempo desperdiçado\n' +
'   - Taxa de falha de soluções comuns\n' +
'   - Benchmarks do setor\n\n' +
'3. **Formato de citação (OBRIGATÓRIO):**\n' +
'   "[Dado específico] (Fonte, Ano)"\n\n' +
'   Exemplo:\n' +
'   "73% dos leads não retornam após 1h sem resposta (Harvard Business Review, 2023)"\n\n' +
'---\n\n' +
'## ✅ CHECKLIST DE VALIDAÇÃO\n\n' +
'Antes de entregar os 21 tweets, valide:\n\n' +
'### **Pesquisa:**\n' +
'- Incluiu pelo menos 3 estudos de fontes confiáveis\n' +
'- Todas as estatísticas têm fonte citada\n' +
'- Dados são recentes (2022-2025)\n\n' +
'### **Conteúdo:**\n' +
'- Cálculos hipotéticos deixam claro que são exemplos\n' +
'- NÃO promete resultados específicos do produto\n' +
'- NÃO inventa cases de clientes\n' +
'- Foca em DORES e PRINCÍPIOS, não em venda\n\n' +
'### **Estrutura:**\n' +
'- Exatamente 21 tweets\n' +
'- 3 threads de 7 tweets cada\n' +
'- Thread 1 = Anatomia da dor\n' +
'- Thread 2 = Tentativas que falham\n' +
'- Thread 3 = Princípios de solução\n\n' +
'### **Tom:**\n' +
'- Consultivo, não vendedor\n' +
'- Baseado em dados e estudos\n' +
'- Empático com a dor\n' +
'- Educativo, não promocional\n\n' +
'### **Formato:**\n' +
'- Cada tweet 200-280 caracteres (legibilidade)\n' +
'- Numeração clara (1/7, 2/7, etc.)\n' +
'- Usa emojis estrategicamente (não excesso)\n' +
'- CTAs educativos, não vendas diretas\n\n' +
'---\n\n' +
'## 🚫 REGRAS RÍGIDAS (NUNCA VIOLE)\n\n' +
'❌ **NUNCA invente estatísticas sem fonte**\n' +
'❌ **NUNCA prometa "aumente X% sua conversão"**\n' +
'❌ **NUNCA crie cases fictícios de clientes**\n' +
'❌ **NUNCA use dados do produto sem contextualizá-los**\n' +
'❌ **NUNCA pule a pesquisa de mercado**\n\n' +
'✅ **SEMPRE cite a fonte dos dados**\n' +
'✅ **SEMPRE deixe claro quando é exemplo hipotético**\n' +
'✅ **SEMPRE foque em dores do mercado, não no produto**\n' +
'✅ **SEMPRE mantenha tom consultivo**\n\n' +
'---\n\n' +
'## 📋 FORMATO DE SAÍDA JSON OBRIGATÓRIO\n\n' +
'RETORNE APENAS JSON VÁLIDO (sem markdown, sem comentários):\n\n' +
'```json\n' +
'{\n' +
'  "Thread1": {\n' +
'    "title": "Título chamativo da Thread 1 relacionado ao tema ' + mainTheme + '",\n' +
'    "sub_theme": "anatomy_pain",\n' +
'    "tweets": [\n' +
'      "1/7 [Tweet 1 texto completo 200-280 chars]",\n' +
'      "2/7 [Tweet 2 texto completo 200-280 chars]",\n' +
'      "3/7 [Tweet 3 texto completo 200-280 chars]",\n' +
'      "4/7 [Tweet 4 texto completo 200-280 chars]",\n' +
'      "5/7 [Tweet 5 texto completo 200-280 chars]",\n' +
'      "6/7 [Tweet 6 texto completo 200-280 chars]",\n' +
'      "7/7 [Tweet 7 texto completo 200-280 chars com CTA]"\n' +
'    ]\n' +
'  },\n' +
'  "Thread2": {\n' +
'    "title": "Título chamativo da Thread 2 relacionado ao tema ' + mainTheme + '",\n' +
'    "sub_theme": "failed_attempts",\n' +
'    "tweets": [\n' +
'      "1/7 [Tweet 1 texto completo 200-280 chars]",\n' +
'      "2/7 [Tweet 2 texto completo 200-280 chars]",\n' +
'      "3/7 [Tweet 3 texto completo 200-280 chars]",\n' +
'      "4/7 [Tweet 4 texto completo 200-280 chars]",\n' +
'      "5/7 [Tweet 5 texto completo 200-280 chars]",\n' +
'      "6/7 [Tweet 6 texto completo 200-280 chars]",\n' +
'      "7/7 [Tweet 7 texto completo 200-280 chars com CTA]"\n' +
'    ]\n' +
'  },\n' +
'  "Thread3": {\n' +
'    "title": "Título chamativo da Thread 3 relacionado ao tema ' + mainTheme + '",\n' +
'    "sub_theme": "solution_principles",\n' +
'    "tweets": [\n' +
'      "1/7 [Tweet 1 texto completo 200-280 chars]",\n' +
'      "2/7 [Tweet 2 texto completo 200-280 chars]",\n' +
'      "3/7 [Tweet 3 texto completo 200-280 chars]",\n' +
'      "4/7 [Tweet 4 texto completo 200-280 chars]",\n' +
'      "5/7 [Tweet 5 texto completo 200-280 chars]",\n' +
'      "6/7 [Tweet 6 texto completo 200-280 chars]",\n' +
'      "7/7 [Tweet 7 texto completo 200-280 chars com CTA]"\n' +
'    ]\n' +
'  }\n' +
'}\n' +
'```\n\n' +
'## ⚠️ INSTRUÇÕES CRÍTICAS DE FORMATO:\n\n' +
'1. **RETORNE APENAS O JSON** - Sem ```json, sem markdown, sem texto adicional\n' +
'2. **Cada tweet completo** - 200-280 caracteres prontos para postagem\n' +
'3. **Numeração obrigatória** - Formato exato: "1/7", "2/7", ..., "7/7"\n' +
'4. **Títulos criativos** - Devem ser únicos e relacionados ao tema ' + mainTheme + '\n' +
'5. **sub_theme em snake_case** - Exemplo: "anatomy_pain", "failed_attempts", "solution_principles"\n' +
'6. **Inclua hashtags estratégicas** - Em tweets selecionados (não todos)\n' +
'7. **CTAs sutis** - Apenas no último tweet de cada thread (7/7)\n' +
'8. **Cada thread = Array de exatamente 7 strings** - Sem objetos aninhados, apenas strings\n\n' +
'## ✅ EXEMPLO DE TÍTULO CRIATIVO:\n\n' +
'- ❌ Ruim: "Anatomia da Dor"\n' +
'- ✅ Bom: "Por Que Seus Leads Somem em 60 Minutos"\n' +
'- ✅ Bom: "O Custo Real do Agendamento Manual"\n' +
'- ✅ Bom: "3 Sinais de Que Você Está Perdendo Dinheiro"\n\n' +
'RETORNE APENAS O JSON VÁLIDO CONFORME O FORMATO ACIMA.';

return {
  json: {
    prompt,
    week_number: weekNumber,
    year,
    main_theme: mainTheme,
    audio_name: audioName,
    audio_id: audioId,
    trending_score: trendingScore,
    request_start_time: Date.now()
  }
};
