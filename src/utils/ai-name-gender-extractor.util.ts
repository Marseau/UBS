/**
 * AI-Powered Name & Gender Extractor
 * Usa inteligência artificial para extrair nomes e inferir gênero com alta precisão
 * Inclui métricas operacionais completas para tracking de custos e performance
 */

import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface NameGenderExtractionResult {
  // Dados extraídos pela AI
  nome_completo: string | null;
  primeiro_nome: string | null;
  sobrenome: string | null;
  genero: 'masculino' | 'feminino' | 'nao_informado';
  confianca: number;
  intencao: 'informou_nome' | 'recusou' | 'perguntou_de_volta' | 'ambigua';

  // Métricas operacionais do sistema
  model_used: string;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  api_cost_usd: number;
  processing_time_ms: number;
}

export class AINameGenderExtractor {

  /**
   * Extrai nome e infere gênero usando AI com prompt otimizado
   */
  static async extractNameAndGender(userMessage: string): Promise<NameGenderExtractionResult> {
    const prompt = `Você é responsável por analisar a resposta do usuário à pergunta:
"Qual é o seu nome completo?"

O usuário pode:
- Informar o nome completo.
- Informar apenas primeiro nome ou apelido.
- Se recusar a responder.
- Responder com uma pergunta de volta.
- Misturar nome com comentários.

Sua tarefa:
1. Extrair o nome (se houver).
   - \`primeiro_nome\`: o primeiro nome, se identificável.
   - \`sobrenome\`: o sobrenome, se identificável, senão \`null\`.
   - \`nome_completo\`: junção do que foi informado, ou \`null\` se não houver.
2. Inferir o gênero provável a partir do nome.
   - Valores possíveis: \`"masculino"\`, \`"feminino"\`, \`"nao_informado"\`.
3. Definir a confiança da inferência (entre 0.0 e 1.0).
4. Classificar a intenção da resposta do usuário:
   - \`"informou_nome"\` → forneceu nome (mesmo incompleto).
   - \`"recusou"\` → deixou claro que não quer dar o nome.
   - \`"perguntou_de_volta"\` → respondeu perguntando algo (ex.: "e o seu?").
   - \`"ambigua"\` → resposta não deixa claro.

Mensagem do usuário: "${userMessage}"

Responda **somente** em JSON no formato:

{
  "nome_completo": "... ou null",
  "primeiro_nome": "... ou null",
  "sobrenome": "... ou null",
  "genero": "masculino|feminino|nao_informado",
  "confianca": 0.0-1.0,
  "intencao": "informou_nome|recusou|perguntou_de_volta|ambigua"
}`;

    try {
      console.log('🤖 [AI-NAME-EXTRACTOR] Processing message:', userMessage);
      const startTime = Date.now();

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você é um especialista em extração de nomes e inferência de gênero para nomes brasileiros. Responda sempre em JSON válido.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Baixa temperatura para consistência
        max_tokens: 200
      });

      const processingTime = Date.now() - startTime;

      // Calcular métricas operacionais
      const usage = response.usage;
      const modelUsed = response.model || 'gpt-4o-mini';

      // Custo estimado (gpt-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens)
      const inputCost = (usage?.prompt_tokens || 0) * 0.00000015;
      const outputCost = (usage?.completion_tokens || 0) * 0.0000006;
      const totalCost = inputCost + outputCost;

      const aiResponse = response.choices[0]?.message?.content?.trim();
      console.log('🤖 [AI-NAME-EXTRACTOR] AI Response:', aiResponse);

      if (!aiResponse) {
        return {
          nome_completo: null,
          primeiro_nome: null,
          sobrenome: null,
          genero: 'nao_informado',
          confianca: 0,
          intencao: 'ambigua',
          model_used: modelUsed,
          tokens: {
            prompt_tokens: usage?.prompt_tokens || 0,
            completion_tokens: usage?.completion_tokens || 0,
            total_tokens: usage?.total_tokens || 0
          },
          api_cost_usd: totalCost,
          processing_time_ms: processingTime
        };
      }

      // Parse da resposta JSON da AI
      const aiResult = JSON.parse(aiResponse);

      // Validações e normalizações
      if (aiResult.nome_completo) {
        aiResult.nome_completo = this.normalizeName(aiResult.nome_completo);
      }
      if (aiResult.primeiro_nome) {
        aiResult.primeiro_nome = this.normalizeName(aiResult.primeiro_nome);
      }
      if (aiResult.sobrenome) {
        aiResult.sobrenome = this.normalizeName(aiResult.sobrenome);
      }

      // Criar resultado final com métricas
      const result: NameGenderExtractionResult = {
        ...aiResult,
        model_used: modelUsed,
        tokens: {
          prompt_tokens: usage?.prompt_tokens || 0,
          completion_tokens: usage?.completion_tokens || 0,
          total_tokens: usage?.total_tokens || 0
        },
        api_cost_usd: totalCost,
        processing_time_ms: processingTime
      };

      console.log('✅ [AI-NAME-EXTRACTOR] Extracted result:', result);
      console.log(`💰 [AI-NAME-EXTRACTOR] Cost: $${totalCost.toFixed(6)} | Tokens: ${usage?.total_tokens} | Time: ${processingTime}ms`);

      return result;

    } catch (error) {
      console.error('❌ [AI-NAME-EXTRACTOR] Error:', error);

      return {
        nome_completo: null,
        primeiro_nome: null,
        sobrenome: null,
        genero: 'nao_informado',
        confianca: 0,
        intencao: 'ambigua',
        model_used: 'gpt-4o-mini',
        tokens: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        },
        api_cost_usd: 0,
        processing_time_ms: 0
      };
    }
  }

  /**
   * Normaliza nome para formato adequado
   */
  private static normalizeName(name: string): string {
    return name
      .trim()
      .split(' ')
      .map(word => {
        // Preposições mantém minúscula
        if (['de', 'da', 'do', 'das', 'dos', 'e'].includes(word.toLowerCase())) {
          return word.toLowerCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Testa o extrator com múltiplos exemplos
   */
  static async runTests(): Promise<void> {
    const testCases = [
      'Meu nome é Carlos Alberto da Silva Ferreira',
      'Me chamo Ana Maria Santos',
      'Sou o João Paulo',
      'Eu sou Maria Fernanda',
      'Ana e o seu?',
      'Prefiro não dizer meu nome',
      'Não vou falar',
      'Olá, tudo bem?',
      'José Carlos de Oliveira Neto'
    ];

    console.log('🧪 [AI-NAME-EXTRACTOR] Iniciando testes...\n');

    let totalCost = 0;
    let totalTokens = 0;
    let totalTime = 0;

    for (const testCase of testCases) {
      console.log(`📋 Testando: "${testCase}"`);
      const result = await this.extractNameAndGender(testCase);

      totalCost += result.api_cost_usd;
      totalTokens += result.tokens.total_tokens;
      totalTime += result.processing_time_ms;

      console.log(`✅ Nome: ${result.nome_completo || 'null'} | Gênero: ${result.genero} | Intenção: ${result.intencao}`);
      console.log('---');
    }

    console.log('📊 ESTATÍSTICAS DOS TESTES:');
    console.log(`💰 Custo Total: $${totalCost.toFixed(6)}`);
    console.log(`🔢 Tokens Total: ${totalTokens}`);
    console.log(`⏱️ Tempo Total: ${totalTime}ms`);
    console.log(`📊 Tempo Médio: ${Math.round(totalTime / testCases.length)}ms`);
  }
}