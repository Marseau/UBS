/**
 * AIC ENGINE - Análise de Intenção do Cliente + Audience Intelligence Cluster
 *
 * Sistema de análise inteligente de clusters usando IA (OpenAI GPT-4)
 * com Vector Store + Parquet para processar 1M+ hashtags de forma escalável.
 *
 * VERSÃO 2.0: Com Vector Store (busca semântica em arquivo Parquet)
 */

import OpenAI from 'openai';
import { hashtagVectorStoreService } from './hashtag-vector-store.service';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface HashtagFrequency {
  hashtag: string;
  freq_total: number;
  unique_leads?: number;
  contact_rate?: number;
}

interface AICEngineInput {
  niche: string;
  keywords: string[];
  hashtags: HashtagFrequency[];
  nicho_secundario?: string;
  service_description?: string;
  target_audience?: string;
}

interface AICEngineOutput {
  nicho_analisado: string;
  forca_cluster: 'forte' | 'medio' | 'fraco' | 'inexistente';
  hashtags_raiz_encontradas: Array<{
    hashtag: string;
    freq: number;
  }>;
  total_hashtags_relacionadas: number;
  relacao_com_nicho: string;
  possivel_gerar_persona_dm: boolean;
  precisa_scrap: boolean;
  quantidade_scrap_recomendada: number;
  direcao_scrap_recomendada: string[];
  diagnostico_resumido: string;
}

export class AICEngineService {
  /**
   * Analisa cluster usando IA (GPT-4) com Vector Store
   * VERSÃO 2.0: Usa busca semântica em Parquet ao invés de enviar todas as hashtags
   */
  async analyzeCluster(input: AICEngineInput): Promise<AICEngineOutput> {
    console.log(`\n🧠 [AIC ENGINE V2.0] Iniciando análise inteligente para nicho: ${input.niche}`);
    console.log(`🔷 Modo: Vector Store + Busca Semântica`);

    // Inicializar Vector Store
    const vectorStoreId = await hashtagVectorStoreService.initialize();
    console.log(`✅ Vector Store carregado: ${vectorStoreId}`);

    // Construir prompt AIC Engine (SEM as hashtags inline - IA vai buscar no Vector Store)
    const prompt = this.buildAICPromptV2(
      input.niche,
      input.keywords,
      input.nicho_secundario,
      input.service_description,
      input.target_audience
    );

    try {
      console.log('🤖 Criando Assistant com File Search...');

      // Criar Assistant com acesso ao Vector Store
      const assistant = await openai.beta.assistants.create({
        name: 'AIC Engine V2.0',
        model: 'gpt-4o',
        instructions: 'Você é o AIC Engine, um sistema especializado em análise de clusters de hashtags para marketing digital no Instagram. Use file_search para buscar hashtags relacionadas ao nicho solicitado. SEMPRE responda APENAS com JSON válido, sem markdown ou explicações adicionais.',
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStoreId]
          }
        },
        response_format: { type: 'json_object' }
      });

      console.log(`✅ Assistant criado: ${assistant.id}`);

      // Criar Thread
      const thread = await openai.beta.threads.create();

      // Enviar mensagem
      await openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: prompt
      });

      console.log('⏳ Executando análise com busca semântica...');

      // Executar Run
      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistant.id
      });

      if (run.status !== 'completed') {
        throw new Error(`Run falhou com status: ${run.status}`);
      }

      // Obter resposta
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data[0];

      if (!assistantMessage) {
        throw new Error('Nenhuma mensagem retornada');
      }

      const firstContent = assistantMessage.content[0];
      const responseText =
        firstContent && firstContent.type === 'text'
          ? (firstContent as any).text.value
          : null;

      if (!responseText) {
        throw new Error('Resposta vazia da OpenAI');
      }

      console.log('✅ Resposta recebida da IA com busca semântica');

      // Cleanup
      await openai.beta.assistants.delete(assistant.id);
      await openai.beta.threads.delete(thread.id);

      // Parse da resposta JSON
      const result: AICEngineOutput = JSON.parse(responseText);

      // Validar estrutura da resposta
      this.validateAICOutput(result);

      console.log(`📈 Resultado: Cluster ${result.forca_cluster.toUpperCase()}`);
      console.log(`   - Hashtags raiz: ${result.hashtags_raiz_encontradas.length}`);
      console.log(`   - Total relacionadas: ${result.total_hashtags_relacionadas}`);
      console.log(`   - Pode gerar persona/DM: ${result.possivel_gerar_persona_dm ? 'SIM' : 'NÃO'}`);
      console.log(`   - Precisa scrap: ${result.precisa_scrap ? 'SIM' : 'NÃO'} (${result.quantidade_scrap_recomendada} hashtags)`);

      return result;
    } catch (error: any) {
      console.error('❌ Erro no AIC Engine:', error);
      throw new Error(`Falha na análise IA: ${error.message}`);
    }
  }

  /**
   * Constrói o prompt V2 (sem hashtags inline - usa file_search)
   */
  private buildAICPromptV2(
    niche: string,
    keywords: string[],
    nichoSecundario?: string,
    serviceDescription?: string,
    targetAudience?: string
  ): string {
    let contextExtra = '';

    if (nichoSecundario) {
      contextExtra += `\nNicho secundário: ${nichoSecundario}`;
    }

    if (serviceDescription) {
      contextExtra += `\nDescrição do serviço/produto: ${serviceDescription}`;
    }

    if (targetAudience) {
      contextExtra += `\nPúblico-alvo desejado: ${targetAudience}`;
    }

    return `🧠 PROMPT — AIC ENGINE V2.0 (Cluster Validator com Vector Store)

Contexto:
Você é o mecanismo central do AIC (Análise de Intenção do Cliente + Audience Intelligence Cluster).
Sua função é analisar a intenção do cliente e usar a ferramenta file_search para buscar hashtags relacionadas na base de dados Parquet.
${contextExtra}

⸻

INPUT DO SISTEMA

1. Nicho solicitado pelo cliente:
${niche}

2. Palavras-chave raiz associadas ao nicho:
${keywords.join(', ')}

3. **IMPORTANTE**: Use a ferramenta file_search para buscar hashtags relacionadas ao nicho na base de dados.
   A base contém colunas: hashtag, freq_bio, freq_posts, freq_total, unique_leads, leads_with_contact, contact_rate

⸻

REGRAS INTERNAS DO AIC — (APLIQUE SEMPRE)

🔵 Classificação da força do cluster
Cluster Forte:
- ≥ 10 hashtags relevantes com freq_total ≥ 80
- ≥ 100 hashtags relacionadas encontradas

Cluster Médio:
- 5 a 9 hashtags relevantes com freq_total ≥ 50
- 50 a 99 hashtags relacionadas

Cluster Fraco:
- 2 a 4 hashtags relevantes
- 20 a 49 hashtags relacionadas

Cluster Inexistente:
- 0 ou 1 hashtag relevante

🔵 Regras de Suficiência Operacional
Para ser possível gerar persona e copy/DM realista:
- Necessário ≥ 3 hashtags raiz com frequência ≥ 70
- Necessário ≥ 300 hashtags totais associadas (diretas + semânticas)

🔵 Regras de Scrap adicional
Cluster Forte → scrap não necessário
Cluster Médio → scrap recomendado (100 a 200 novas hashtags)
Cluster Fraco → scrap necessário (200 a 400 hashtags)
Cluster Inexistente → scrap obrigatório e específico (≥ 500 hashtags)

🔵 Como identificar hashtags relacionadas ao nicho
1. Use file_search para buscar hashtags que contêm as keywords raiz
2. Identifique hashtags que co-ocorrem semanticamente com as keywords
3. Busque hashtags que pertencem ao mesmo tema (marketing, ads, fitness, estética, etc.)

⸻

SAÍDA (FORMATO PADRÃO – SEMPRE OBEDEÇA)

Responda APENAS com JSON válido neste formato exato:
{
  "nicho_analisado": "${niche}",
  "forca_cluster": "forte | medio | fraco | inexistente",
  "hashtags_raiz_encontradas": [
      {"hashtag": "exemplo", "freq": 100}
  ],
  "total_hashtags_relacionadas": 0,
  "relacao_com_nicho": "explicação objetiva baseada nas hashtags encontradas via file_search",
  "possivel_gerar_persona_dm": true,
  "precisa_scrap": false,
  "quantidade_scrap_recomendada": 0,
  "direcao_scrap_recomendada": [
      "exemplo de direção 1",
      "exemplo de direção 2"
  ],
  "diagnostico_resumido": "explicação clara para tomada de decisão"
}`;
  }

  /**
   * Constrói o prompt estruturado do AIC Engine (LEGACY - V1)
   */
  private buildAICPrompt(
    niche: string,
    keywords: string[],
    hashtagsJson: string,
    nichoSecundario?: string,
    serviceDescription?: string,
    targetAudience?: string
  ): string {
    let contextExtra = '';

    if (nichoSecundario) {
      contextExtra += `\nNicho secundário: ${nichoSecundario}`;
    }

    if (serviceDescription) {
      contextExtra += `\nDescrição do serviço/produto: ${serviceDescription}`;
    }

    if (targetAudience) {
      contextExtra += `\nPúblico-alvo desejado: ${targetAudience}`;
    }

    return `🧠 PROMPT — AIC ENGINE (Cluster Validator)

Contexto:
Você é o mecanismo central do AIC (Análise de Intenção do Cliente + Audience Intelligence Cluster).
Sua função é analisar a intenção do cliente, cruzar com a base de hashtags fornecida e determinar se é possível construir um cluster forte, médio ou fraco — e quais ações são necessárias.
${contextExtra}

⸻

INPUT DO SISTEMA

1. Nicho solicitado pelo cliente:
${niche}

2. Palavras-chave raiz associadas ao nicho:
${keywords.join(', ')}

3. Base completa de hashtags com frequência (top 2000 por relevância):
${hashtagsJson}

⸻

REGRAS INTERNAS DO AIC — (APLIQUE SEMPRE)

🔵 Classificação da força do cluster
Cluster Forte:
- ≥ 10 hashtags relevantes com freq_total ≥ 80
- ≥ 100 hashtags relacionadas encontradas

Cluster Médio:
- 5 a 9 hashtags relevantes com freq_total ≥ 50
- 50 a 99 hashtags relacionadas

Cluster Fraco:
- 2 a 4 hashtags relevantes
- 20 a 49 hashtags relacionadas

Cluster Inexistente:
- 0 ou 1 hashtag relevante

🔵 Regras de Suficiência Operacional
Para ser possível gerar persona e copy/DM realista:
- Necessário ≥ 3 hashtags raiz com frequência ≥ 70
- Necessário ≥ 300 hashtags totais associadas (diretas + semânticas)

🔵 Regras de Scrap adicional
Cluster Forte → scrap não necessário
Cluster Médio → scrap recomendado (100 a 200 novas hashtags)
Cluster Fraco → scrap necessário (200 a 400 hashtags)
Cluster Inexistente → scrap obrigatório e específico (≥ 500 hashtags)

🔵 Como identificar hashtags relacionadas ao nicho
1. Hashtags que contêm keywords raiz
2. Hashtags que co-ocorrem semanticamente com as keywords
3. Hashtags que pertencem ao mesmo tema (marketing, ads, fitness, estética, etc.)

⸻

SAÍDA (FORMATO PADRÃO – SEMPRE OBEDEÇA)

Responda APENAS com JSON válido neste formato exato:
{
  "nicho_analisado": "${niche}",
  "forca_cluster": "forte | medio | fraco | inexistente",
  "hashtags_raiz_encontradas": [
      {"hashtag": "exemplo", "freq": 100}
  ],
  "total_hashtags_relacionadas": 0,
  "relacao_com_nicho": "explicação objetiva baseada na base",
  "possivel_gerar_persona_dm": true,
  "precisa_scrap": false,
  "quantidade_scrap_recomendada": 0,
  "direcao_scrap_recomendada": [
      "exemplo de direção 1",
      "exemplo de direção 2"
  ],
  "diagnostico_resumido": "explicação clara para tomada de decisão"
}`;
  }

  /**
   * Valida estrutura da resposta da IA
   */
  private validateAICOutput(output: any): void {
    const requiredFields = [
      'nicho_analisado',
      'forca_cluster',
      'hashtags_raiz_encontradas',
      'total_hashtags_relacionadas',
      'relacao_com_nicho',
      'possivel_gerar_persona_dm',
      'precisa_scrap',
      'quantidade_scrap_recomendada',
      'direcao_scrap_recomendada',
      'diagnostico_resumido'
    ];

    for (const field of requiredFields) {
      if (!(field in output)) {
        throw new Error(`Campo obrigatório ausente na resposta da IA: ${field}`);
      }
    }

    const validForcas = ['forte', 'medio', 'fraco', 'inexistente'];
    if (!validForcas.includes(output.forca_cluster)) {
      throw new Error(`forca_cluster inválida: ${output.forca_cluster}`);
    }

    if (!Array.isArray(output.hashtags_raiz_encontradas)) {
      throw new Error('hashtags_raiz_encontradas deve ser um array');
    }

    if (!Array.isArray(output.direcao_scrap_recomendada)) {
      throw new Error('direcao_scrap_recomendada deve ser um array');
    }
  }
}

export const aicEngineService = new AICEngineService();
