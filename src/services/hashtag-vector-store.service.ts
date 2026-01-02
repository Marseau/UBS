/**
 * HASHTAG VECTOR STORE SERVICE
 *
 * Gerencia Vector Store do OpenAI com hashtags em Parquet
 * Permite busca semântica escalável em 1M+ hashtags
 */

import OpenAI from 'openai';
import * as fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface VectorStoreInfo {
  id: string;
  name: string;
  fileCount: number;
  status: string;
  createdAt: Date;
}

/**
 * Resultado estruturado da busca de hashtags
 */
export interface HashtagSearchResult {
  hashtag: string;
  freq_bio: number;
  freq_posts: number;
  freq_total: number;
  unique_leads: number;
  leads_with_contact: number;
  contact_rate: number;
}

export class HashtagVectorStoreService {
  private vectorStoreId: string = '';
  private readonly vectorStoreName = 'hashtags-aic-system';
  private readonly metadataFile = 'data/parquet/vector-store-metadata.json';

  /**
   * Carrega ou cria Vector Store
   */
  async initialize(): Promise<string> {
    console.log('\n🔷 [VECTOR STORE] Inicializando...');

    // Tentar carregar ID do metadata file
    const storedId = this.loadStoredVectorStoreId();

    if (storedId) {
      console.log(`   ℹ️  Vector Store ID encontrado: ${storedId}`);

      // Verificar se ainda existe
      try {
        const vectorStore = await openai.vectorStores.retrieve(storedId);
        this.vectorStoreId = vectorStore.id;
        console.log(`   ✅ Vector Store validado: ${vectorStore.name}`);
        return this.vectorStoreId;
      } catch (error) {
        console.log(`   ⚠️  Vector Store não encontrado, criando novo...`);
      }
    }

    // Criar novo Vector Store
    return await this.createVectorStore();
  }

  /**
   * Cria novo Vector Store
   */
  private async createVectorStore(): Promise<string> {
    console.log('   📦 Criando novo Vector Store...');

    const vectorStore = await openai.vectorStores.create({
      name: this.vectorStoreName,
      expires_after: {
        anchor: 'last_active_at',
        days: 30
      }
    });

    this.vectorStoreId = vectorStore.id;
    this.saveVectorStoreId(vectorStore.id);

    console.log(`   ✅ Vector Store criado: ${vectorStore.id}`);

    return this.vectorStoreId;
  }

  /**
   * Upload arquivo CSV para Vector Store
   */
  async uploadCsvFile(csvFilePath: string): Promise<void> {
    if (!this.vectorStoreId) {
      await this.initialize();
    }

    console.log(`\n📤 [VECTOR STORE] Upload do arquivo CSV...`);
    console.log(`   📁 Arquivo: ${csvFilePath}`);

    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`Arquivo não encontrado: ${csvFilePath}`);
    }

    const stats = fs.statSync(csvFilePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   💾 Tamanho: ${sizeMB} MB`);

    // Upload do arquivo
    const file = await openai.files.create({
      file: fs.createReadStream(csvFilePath),
      purpose: 'assistants'
    });

    console.log(`   ✅ Arquivo enviado: ${file.id}`);

    // Adicionar ao Vector Store
    await openai.vectorStores.files.create(this.vectorStoreId!, {
      file_id: file.id
    });

    console.log(`   ✅ Arquivo adicionado ao Vector Store`);
    console.log(`   ⏳ Aguardando processamento de embeddings...`);

    // Aguardar processamento
    await this.waitForFileProcessing(file.id);

    console.log(`   🎉 Upload e processamento concluídos!`);
  }

  /**
   * Aguarda processamento de embeddings do arquivo
   */
  private async waitForFileProcessing(fileId: string, maxWaitSeconds = 300): Promise<void> {
    const startTime = Date.now();

    while (true) {
      const vectorStoreFile = await openai.vectorStores.files.retrieve(
        fileId,
        { vector_store_id: this.vectorStoreId! }
      );

      if (vectorStoreFile.status === 'completed') {
        console.log(`   ✅ Embeddings processados com sucesso!`);
        return;
      }

      if (vectorStoreFile.status === 'failed') {
        throw new Error(`Falha no processamento: ${vectorStoreFile.last_error?.message}`);
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed > maxWaitSeconds) {
        throw new Error('Timeout aguardando processamento de embeddings');
      }

      console.log(`   ⏳ Status: ${vectorStoreFile.status} (${elapsed}s)`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
    }
  }

  /**
   * Busca semântica no Vector Store - retorna JSON estruturado
   * @param seeds - Array de hashtags/termos para buscar similares
   * @param limit - Número máximo de resultados (default: 150)
   * @returns Array de HashtagSearchResult ordenado por relevância
   */
  async searchHashtags(seeds: string[], limit = 150): Promise<HashtagSearchResult[]> {
    if (!this.vectorStoreId) {
      await this.initialize();
    }

    const seedsText = seeds.join(', ');
    console.log(`\n🔍 [VECTOR STORE] Busca semântica: "${seedsText}" (limit: ${limit})`);

    const startTime = Date.now();

    // Criar thread temporário para busca
    const thread = await openai.beta.threads.create();

    // Prompt estruturado para retornar JSON
    const prompt = `Busque no arquivo CSV de hashtags as ${limit} hashtags mais semanticamente similares aos termos: ${seedsText}

IMPORTANTE: Retorne APENAS um JSON válido, sem markdown, sem explicações.

O arquivo CSV tem colunas: hashtag, freq_bio, freq_posts, freq_total, unique_leads, leads_with_contact, contact_rate

Retorne um array JSON com as hashtags encontradas, ordenadas por relevância semântica.
Formato EXATO (sem texto adicional):
[
  {"hashtag": "exemplo", "freq_bio": 10, "freq_posts": 20, "freq_total": 30, "unique_leads": 15, "leads_with_contact": 5, "contact_rate": 33.3},
  ...
]

Priorize hashtags com:
1. Alta similaridade semântica com os termos buscados
2. freq_total >= 5 (para relevância estatística)
3. unique_leads >= 1

Retorne APENAS o array JSON, nada mais.`;

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: prompt
    });

    // Criar Assistant temporário com file_search
    const assistant = await openai.beta.assistants.create({
      name: 'Hashtag Search Assistant',
      model: 'gpt-4o-mini',
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [this.vectorStoreId!]
        }
      },
      instructions: 'Você é um assistente que busca hashtags em arquivos CSV e retorna resultados em JSON. Sempre retorne APENAS JSON válido, sem markdown ou explicações.'
    });

    // Executar busca
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id
    });

    let results: HashtagSearchResult[] = [];

    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(thread.id);
      const response = messages.data[0]?.content[0];

      // Extrair texto da resposta
      if (response && response.type === 'text') {
        let text = response.text.value;

        // Remover markdown code blocks se existirem
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        try {
          results = JSON.parse(text);

          // Validar e limpar resultados
          results = results
            .filter((r: any) => r.hashtag && typeof r.hashtag === 'string')
            .map((r: any) => ({
              hashtag: String(r.hashtag).toLowerCase().replace(/^#/, ''),
              freq_bio: Number(r.freq_bio) || 0,
              freq_posts: Number(r.freq_posts) || 0,
              freq_total: Number(r.freq_total) || 0,
              unique_leads: Number(r.unique_leads) || 0,
              leads_with_contact: Number(r.leads_with_contact) || 0,
              contact_rate: Number(r.contact_rate) || 0
            }))
            .slice(0, limit);

        } catch (parseError) {
          console.error('❌ Erro ao parsear JSON:', parseError);
          console.error('   Resposta recebida:', text.substring(0, 500));
        }
      }

      // Cleanup
      await openai.beta.assistants.delete(assistant.id);
      await openai.beta.threads.delete(thread.id);
    } else {
      // Cleanup mesmo em caso de erro
      try {
        await openai.beta.assistants.delete(assistant.id);
        await openai.beta.threads.delete(thread.id);
      } catch {}

      throw new Error(`Busca falhou: ${run.status}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`   ✅ Encontradas ${results.length} hashtags em ${elapsed}s`);

    return results;
  }

  /**
   * Busca semântica simplificada - recebe string única
   * @deprecated Use searchHashtags(seeds: string[]) para melhor controle
   */
  async searchHashtagsSimple(query: string, limit = 150): Promise<HashtagSearchResult[]> {
    const seeds = query.split(/[,\s]+/).filter(s => s.length > 0);
    return this.searchHashtags(seeds, limit);
  }

  /**
   * Obtém informações do Vector Store
   */
  async getInfo(): Promise<VectorStoreInfo | null> {
    if (!this.vectorStoreId) {
      const storedId = this.loadStoredVectorStoreId();
      if (!storedId) return null;
      this.vectorStoreId = storedId;
    }

    try {
      const vectorStore = await openai.vectorStores.retrieve(this.vectorStoreId!);

      // Contar arquivos iterando sobre o cursor
      let fileCount = 0;
      const files = await openai.vectorStores.files.list(this.vectorStoreId!);
      for await (const _file of files) {
        fileCount++;
      }

      return {
        id: vectorStore.id,
        name: vectorStore.name,
        fileCount,
        status: vectorStore.status,
        createdAt: new Date(vectorStore.created_at * 1000)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Remove arquivo antigo e faz cleanup
   */
  async cleanupOldFiles(): Promise<void> {
    if (!this.vectorStoreId) return;

    console.log('\n🧹 [VECTOR STORE] Limpando arquivos antigos...');

    const files = await openai.vectorStores.files.list(this.vectorStoreId!);

    for await (const file of files) {
      console.log(`   🗑️  Removendo arquivo: ${file.id}`);
      await openai.vectorStores.files.delete(file.id, { vector_store_id: this.vectorStoreId! });
    }

    console.log('   ✅ Cleanup concluído');
  }

  /**
   * Salva Vector Store ID em metadata file
   */
  private saveVectorStoreId(id: string): void {
    const metadata = {
      vectorStoreId: id,
      createdAt: new Date().toISOString(),
      name: this.vectorStoreName
    };

    const dir = this.metadataFile.split('/').slice(0, -1).join('/');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2));
  }

  /**
   * Carrega Vector Store ID do metadata file
   */
  private loadStoredVectorStoreId(): string | null {
    if (!fs.existsSync(this.metadataFile)) {
      return null;
    }

    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataFile, 'utf-8'));
      return metadata.vectorStoreId || null;
    } catch {
      return null;
    }
  }
}

export const hashtagVectorStoreService = new HashtagVectorStoreService();
