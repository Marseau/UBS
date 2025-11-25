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
        const vectorStore = await (openai.beta as any).vectorStores.retrieve(storedId);
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

    const vectorStore = await (openai.beta as any).vectorStores.create({
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
   * Upload arquivo Parquet para Vector Store
   */
  async uploadParquetFile(parquetFilePath: string): Promise<void> {
    if (!this.vectorStoreId) {
      await this.initialize();
    }

    console.log(`\n📤 [VECTOR STORE] Upload do arquivo Parquet...`);
    console.log(`   📁 Arquivo: ${parquetFilePath}`);

    if (!fs.existsSync(parquetFilePath)) {
      throw new Error(`Arquivo não encontrado: ${parquetFilePath}`);
    }

    const stats = fs.statSync(parquetFilePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   💾 Tamanho: ${sizeMB} MB`);

    // Upload do arquivo
    const file = await openai.files.create({
      file: fs.createReadStream(parquetFilePath),
      purpose: 'assistants'
    });

    console.log(`   ✅ Arquivo enviado: ${file.id}`);

    // Adicionar ao Vector Store
    await (openai.beta as any).vectorStores.files.create(this.vectorStoreId!, {
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
      const vectorStoreFile = await (openai.beta as any).vectorStores.files.retrieve(
        this.vectorStoreId!,
        fileId
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
   * Busca semântica no Vector Store
   */
  async searchHashtags(query: string, limit = 100): Promise<any> {
    if (!this.vectorStoreId) {
      await this.initialize();
    }

    console.log(`\n🔍 [VECTOR STORE] Busca semântica: "${query}"`);

    // Criar thread temporário para busca
    const thread = await openai.beta.threads.create();

    // Enviar mensagem com file_search
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: query
    });

    // Criar Assistant temporário com file_search
    const assistant = await openai.beta.assistants.create({
      name: 'Hashtag Search Assistant',
      model: 'gpt-4o',
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [this.vectorStoreId!]
        }
      }
    });

    // Executar busca
    const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: assistant.id
    });

    if (run.status === 'completed') {
      const messages = await openai.beta.threads.messages.list(thread.id);
      const response = messages.data[0]?.content[0];

      // Cleanup
      await openai.beta.assistants.delete(assistant.id);
      await openai.beta.threads.delete(thread.id);

      return response;
    }

    throw new Error(`Busca falhou: ${run.status}`);
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
      const vectorStore = await (openai.beta as any).vectorStores.retrieve(this.vectorStoreId!);
      const files = await (openai.beta as any).vectorStores.files.list(this.vectorStoreId!);

      return {
        id: vectorStore.id,
        name: vectorStore.name,
        fileCount: files.data.length,
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

    const files = await (openai.beta as any).vectorStores.files.list(this.vectorStoreId!);

    for (const file of files.data) {
      console.log(`   🗑️  Removendo arquivo: ${file.id}`);
      await (openai.beta as any).vectorStores.files.delete(this.vectorStoreId!, file.id);
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
