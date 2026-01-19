/**
 * Campaign Document Processor Service
 *
 * Processa documentos de campanha para RAG:
 * 1. Recebe PDF/DOCX/TXT
 * 2. Extrai texto
 * 3. Divide em chunks inteligentes
 * 4. Gera embeddings via OpenAI
 * 5. Persiste em campaign_documents
 */

import OpenAI from "openai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// =====================================================
// TIPOS E INTERFACES
// =====================================================

export interface DocumentUpload {
  campaignId: string | null; // null = documento global
  title: string;
  docType: "briefing" | "landing_page" | "knowledge" | "faq" | "product" | "policy" | "script" | "other";
  content?: string; // Texto direto
  filePath?: string; // Caminho do arquivo
  fileBuffer?: Buffer; // Buffer do arquivo
  fileName?: string; // Nome do arquivo
  sourceUrl?: string;
  metadata?: Record<string, any>;
}

export interface ChunkOptions {
  maxTokens: number; // Tamanho máximo do chunk (padrão: 500)
  overlapTokens: number; // Sobreposição entre chunks (padrão: 100)
  minTokens: number; // Tamanho mínimo para criar chunk (padrão: 50)
}

export interface ProcessingResult {
  success: boolean;
  documentId?: string;
  chunksCreated: number;
  totalTokens: number;
  error?: string;
}

interface DocumentChunk {
  content: string;
  chunkNumber: number;
  tokenCount: number;
}

// =====================================================
// CONSTANTES
// =====================================================

const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxTokens: 500,
  overlapTokens: 100,
  minTokens: 50,
};

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSION = 1536;

// Aproximação: 1 token ~= 4 caracteres em português
const CHARS_PER_TOKEN = 4;

// =====================================================
// SERVIÇO PRINCIPAL
// =====================================================

export class CampaignDocumentProcessorService {
  private openai: OpenAI;
  private supabase: SupabaseClient;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    );
  }

  // =====================================================
  // MÉTODO PRINCIPAL: Processar documento completo
  // =====================================================

  async processDocument(
    upload: DocumentUpload,
    options: Partial<ChunkOptions> = {},
  ): Promise<ProcessingResult> {
    const chunkOptions = { ...DEFAULT_CHUNK_OPTIONS, ...options };

    try {
      console.log(
        `📄 Processando documento: ${upload.title} (campaign: ${upload.campaignId || "GLOBAL"})`,
      );

      // 1. Extrair texto do documento
      let text = "";
      if (upload.content) {
        text = upload.content;
      } else if (upload.fileBuffer && upload.fileName) {
        text = await this.extractText(upload.fileBuffer, upload.fileName);
      } else if (upload.filePath) {
        const buffer = fs.readFileSync(upload.filePath);
        const fileName = path.basename(upload.filePath);
        text = await this.extractText(buffer, fileName);
      } else {
        throw new Error("Nenhum conteúdo fornecido para processamento");
      }

      if (!text || text.trim().length === 0) {
        throw new Error("Documento vazio ou não foi possível extrair texto");
      }

      console.log(
        `📝 Texto extraído: ${text.length} caracteres (~${Math.ceil(text.length / CHARS_PER_TOKEN)} tokens)`,
      );

      // 2. Limpar e normalizar texto
      text = this.cleanText(text);

      // 3. Dividir em chunks
      const chunks = this.createChunks(text, chunkOptions);
      console.log(`📦 Criados ${chunks.length} chunks`);

      if (chunks.length === 0) {
        throw new Error("Não foi possível criar chunks do documento");
      }

      // 4. Gerar embeddings e salvar
      let chunksCreated = 0;
      let totalTokens = 0;
      let documentId: string | undefined;

      for (const chunk of chunks) {
        try {
          // Gerar embedding
          const embedding = await this.generateEmbedding(chunk.content);

          // Salvar no banco
          const { data, error } = await this.supabase
            .from("campaign_documents")
            .insert({
              campaign_id: upload.campaignId,
              doc_type: upload.docType,
              title: upload.title,
              content: chunk.content,
              content_chunk: chunk.chunkNumber,
              embedding: embedding,
              metadata: {
                ...upload.metadata,
                original_file: upload.fileName || null,
                token_count: chunk.tokenCount,
                total_chunks: chunks.length,
              },
              source_url: upload.sourceUrl,
              is_active: true,
            })
            .select("id")
            .single();

          if (error) {
            console.error(
              `❌ Erro ao salvar chunk ${chunk.chunkNumber}:`,
              error,
            );
            continue;
          }

          if (!documentId && data) {
            documentId = data.id;
          }

          chunksCreated++;
          totalTokens += chunk.tokenCount;

          console.log(
            `✅ Chunk ${chunk.chunkNumber}/${chunks.length} salvo (${chunk.tokenCount} tokens)`,
          );

          // Rate limiting: pequena pausa entre chamadas
          await this.sleep(100);
        } catch (chunkError) {
          console.error(
            `❌ Erro ao processar chunk ${chunk.chunkNumber}:`,
            chunkError,
          );
        }
      }

      console.log(
        `🎉 Documento processado: ${chunksCreated}/${chunks.length} chunks, ${totalTokens} tokens totais`,
      );

      return {
        success: chunksCreated > 0,
        documentId,
        chunksCreated,
        totalTokens,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao processar documento:`, errorMessage);

      return {
        success: false,
        chunksCreated: 0,
        totalTokens: 0,
        error: errorMessage,
      };
    }
  }

  // =====================================================
  // EXTRAÇÃO DE TEXTO
  // =====================================================

  private async extractText(buffer: Buffer, fileName: string): Promise<string> {
    const extension = path.extname(fileName).toLowerCase();

    switch (extension) {
      case ".txt":
        return buffer.toString("utf-8");

      case ".pdf":
        return await this.extractFromPdf(buffer);

      case ".docx":
        return await this.extractFromDocx(buffer);

      case ".md":
        return buffer.toString("utf-8");

      default:
        throw new Error(`Formato de arquivo não suportado: ${extension}`);
    }
  }

  private async extractFromPdf(buffer: Buffer): Promise<string> {
    try {
      // Importação dinâmica do pdf-parse
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer);
      return data.text || "";
    } catch (error) {
      console.error("Erro ao extrair texto do PDF:", error);
      throw new Error(
        "Falha ao extrair texto do PDF. Verifique se pdf-parse está instalado.",
      );
    }
  }

  private async extractFromDocx(buffer: Buffer): Promise<string> {
    try {
      // Importação dinâmica do mammoth
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    } catch (error) {
      console.error("Erro ao extrair texto do DOCX:", error);
      throw new Error(
        "Falha ao extrair texto do DOCX. Verifique se mammoth está instalado.",
      );
    }
  }

  // =====================================================
  // CHUNKING INTELIGENTE
  // =====================================================

  private createChunks(text: string, options: ChunkOptions): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    // Dividir por parágrafos primeiro
    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

    let currentChunk = "";
    let currentTokens = 0;
    let chunkNumber = 1;

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.estimateTokens(paragraph);

      // Se o parágrafo sozinho excede o máximo, dividir por sentenças
      if (paragraphTokens > options.maxTokens) {
        // Salvar chunk atual se existir
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            chunkNumber: chunkNumber++,
            tokenCount: currentTokens,
          });
          currentChunk = "";
          currentTokens = 0;
        }

        // Dividir parágrafo grande em chunks menores
        const subChunks = this.splitLargeParagraph(paragraph, options);
        for (const subChunk of subChunks) {
          chunks.push({
            content: subChunk.content,
            chunkNumber: chunkNumber++,
            tokenCount: subChunk.tokenCount,
          });
        }
        continue;
      }

      // Verificar se adicionar este parágrafo excede o limite
      if (currentTokens + paragraphTokens > options.maxTokens) {
        // Salvar chunk atual
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            chunkNumber: chunkNumber++,
            tokenCount: currentTokens,
          });
        }

        // Iniciar novo chunk com overlap
        const overlap = this.getOverlapText(currentChunk, options.overlapTokens);
        currentChunk = overlap + (overlap ? "\n\n" : "") + paragraph;
        currentTokens =
          this.estimateTokens(overlap) + paragraphTokens;
      } else {
        // Adicionar ao chunk atual
        currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
        currentTokens += paragraphTokens;
      }
    }

    // Salvar último chunk se tiver tamanho mínimo
    if (currentChunk.trim() && currentTokens >= options.minTokens) {
      chunks.push({
        content: currentChunk.trim(),
        chunkNumber: chunkNumber,
        tokenCount: currentTokens,
      });
    }

    return chunks;
  }

  private splitLargeParagraph(
    paragraph: string,
    options: ChunkOptions,
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = paragraph.split(/(?<=[.!?])\s+/);

    let currentChunk = "";
    let currentTokens = 0;
    let localChunkNum = 1;

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);

      if (currentTokens + sentenceTokens > options.maxTokens) {
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            chunkNumber: localChunkNum++,
            tokenCount: currentTokens,
          });
        }

        // Se a sentença sozinha é muito grande, dividir por palavras
        if (sentenceTokens > options.maxTokens) {
          const wordChunks = this.splitByWords(sentence, options.maxTokens);
          for (const wc of wordChunks) {
            chunks.push({
              content: wc,
              chunkNumber: localChunkNum++,
              tokenCount: this.estimateTokens(wc),
            });
          }
          currentChunk = "";
          currentTokens = 0;
        } else {
          currentChunk = sentence;
          currentTokens = sentenceTokens;
        }
      } else {
        currentChunk += (currentChunk ? " " : "") + sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        chunkNumber: localChunkNum,
        tokenCount: currentTokens,
      });
    }

    return chunks;
  }

  private splitByWords(text: string, maxTokens: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk = "";
    let currentTokens = 0;

    for (const word of words) {
      const wordTokens = this.estimateTokens(word);

      if (currentTokens + wordTokens > maxTokens) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = word;
        currentTokens = wordTokens;
      } else {
        currentChunk += (currentChunk ? " " : "") + word;
        currentTokens += wordTokens;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private getOverlapText(text: string, overlapTokens: number): string {
    if (!text || overlapTokens <= 0) return "";

    const words = text.split(/\s+/);
    const targetChars = overlapTokens * CHARS_PER_TOKEN;

    let overlap = "";
    for (let i = words.length - 1; i >= 0 && overlap.length < targetChars; i--) {
      overlap = words[i] + (overlap ? " " + overlap : "");
    }

    return overlap;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  // =====================================================
  // EMBEDDING
  // =====================================================

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding || embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error("Embedding inválido retornado pela OpenAI");
      }

      return embedding;
    } catch (error) {
      console.error("Erro ao gerar embedding:", error);
      throw error;
    }
  }

  // =====================================================
  // UTILITÁRIOS
  // =====================================================

  private cleanText(text: string): string {
    return (
      text
        // Remover múltiplas quebras de linha
        .replace(/\n{3,}/g, "\n\n")
        // Remover espaços múltiplos
        .replace(/[ \t]+/g, " ")
        // Remover caracteres de controle
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        // Normalizar aspas
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        // Trim
        .trim()
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // =====================================================
  // MÉTODOS DE GESTÃO DE DOCUMENTOS
  // =====================================================

  /**
   * Lista documentos de uma campanha
   */
  async listDocuments(
    campaignId: string | null,
  ): Promise<{ id: string; title: string; doc_type: string; chunks: number }[]> {
    const query = this.supabase
      .from("campaign_documents")
      .select("id, title, doc_type, content_chunk")
      .eq("is_active", true);

    if (campaignId) {
      query.eq("campaign_id", campaignId);
    } else {
      query.is("campaign_id", null);
    }

    const { data, error } = await query.order("title");

    if (error) {
      console.error("Erro ao listar documentos:", error);
      return [];
    }

    // Agrupar por título para contar chunks
    const grouped = (data || []).reduce(
      (acc, doc) => {
        const key = doc.title;
        if (!acc[key]) {
          acc[key] = {
            id: doc.id,
            title: doc.title,
            doc_type: doc.doc_type,
            chunks: 0,
          };
        }
        acc[key].chunks++;
        return acc;
      },
      {} as Record<string, any>,
    );

    return Object.values(grouped);
  }

  /**
   * Desativa um documento (soft delete)
   */
  async deactivateDocument(
    title: string,
    campaignId: string | null,
  ): Promise<boolean> {
    const query = this.supabase
      .from("campaign_documents")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("title", title);

    if (campaignId) {
      query.eq("campaign_id", campaignId);
    } else {
      query.is("campaign_id", null);
    }

    const { error } = await query;

    if (error) {
      console.error("Erro ao desativar documento:", error);
      return false;
    }

    return true;
  }

  /**
   * Reprocessa um documento existente
   */
  async reprocessDocument(
    title: string,
    campaignId: string | null,
    options: Partial<ChunkOptions> = {},
  ): Promise<ProcessingResult> {
    // Buscar conteúdo original (primeiro chunk)
    const query = this.supabase
      .from("campaign_documents")
      .select("*")
      .eq("title", title)
      .eq("content_chunk", 1);

    if (campaignId) {
      query.eq("campaign_id", campaignId);
    } else {
      query.is("campaign_id", null);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return {
        success: false,
        chunksCreated: 0,
        totalTokens: 0,
        error: "Documento não encontrado",
      };
    }

    // Desativar versão antiga
    await this.deactivateDocument(title, campaignId);

    // Reprocessar
    return this.processDocument(
      {
        campaignId,
        title: data.title,
        docType: data.doc_type,
        content: data.content,
        sourceUrl: data.source_url,
        metadata: data.metadata,
      },
      options,
    );
  }

  // =====================================================
  // EXTRAÇÃO DE CAMPOS DA CAMPANHA VIA GPT
  // =====================================================

  /**
   * Extrai Nicho, Público Alvo e Descrição dos documentos da campanha
   */
  async extractCampaignFields(campaignId: string): Promise<{
    success: boolean;
    nicho?: string;
    publicoAlvo?: string;
    descricaoServico?: string;
    error?: string;
  }> {
    try {
      console.log(`📄 Extraindo campos da campanha: ${campaignId}`);

      // 1. Buscar todos os chunks de documentos da campanha
      const { data: documents, error } = await this.supabase
        .from("campaign_documents")
        .select("title, content, doc_type, content_chunk")
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("title")
        .order("content_chunk");

      if (error) {
        console.error("Erro ao buscar documentos:", error);
        return { success: false, error: "Erro ao buscar documentos da campanha" };
      }

      if (!documents || documents.length === 0) {
        return { success: false, error: "Nenhum documento encontrado para esta campanha" };
      }

      console.log(`📚 Encontrados ${documents.length} chunks de documentos`);

      // 2. Concatenar conteúdo dos documentos (limitar a ~8000 tokens para GPT)
      let combinedContent = "";
      const maxChars = 32000; // ~8000 tokens

      for (const doc of documents) {
        if (combinedContent.length + doc.content.length > maxChars) {
          break;
        }
        combinedContent += `\n\n--- ${doc.title} (${doc.doc_type}) ---\n${doc.content}`;
      }

      console.log(`📝 Conteúdo combinado: ${combinedContent.length} caracteres`);

      // 3. Usar GPT para extrair os campos
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Você é um especialista em análise de documentos de campanhas de marketing.
Sua tarefa é extrair informações específicas dos documentos fornecidos.

IMPORTANTE:
- Extraia informações REAIS dos documentos, não invente
- Se uma informação não estiver clara, use o contexto para inferir
- Mantenha as respostas concisas e diretas
- Se não encontrar informação suficiente, indique "Não identificado"`
          },
          {
            role: "user",
            content: `Analise os seguintes documentos de campanha e extraia:

1. **NICHO ALVO**: Qual é o segmento/nicho de mercado da campanha? (ex: "Advogados", "Salões de Beleza", "Clínicas Médicas")

2. **PÚBLICO ALVO**: Quem são os clientes ideais? Descreva características como profissão, localização, necessidades, comportamento.

3. **DESCRIÇÃO DO SERVIÇO/PRODUTO**: O que está sendo oferecido? Descreva brevemente o serviço ou produto principal da campanha.

DOCUMENTOS:
${combinedContent}

Responda EXATAMENTE neste formato JSON:
{
  "nicho": "string com o nicho identificado",
  "publicoAlvo": "string descrevendo o público-alvo",
  "descricaoServico": "string descrevendo o serviço/produto"
}`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { success: false, error: "GPT não retornou resposta" };
      }

      const extracted = JSON.parse(content);
      console.log(`✅ Campos extraídos:`, extracted);

      return {
        success: true,
        nicho: extracted.nicho || "Não identificado",
        publicoAlvo: extracted.publicoAlvo || "Não identificado",
        descricaoServico: extracted.descricaoServico || "Não identificado"
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao extrair campos:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Busca conteúdo bruto dos documentos de uma campanha
   */
  async getDocumentsContent(campaignId: string): Promise<string> {
    const { data: documents, error } = await this.supabase
      .from("campaign_documents")
      .select("title, content, doc_type")
      .eq("campaign_id", campaignId)
      .eq("is_active", true)
      .order("title")
      .order("content_chunk");

    if (error || !documents || documents.length === 0) {
      return "";
    }

    return documents.map(d => `${d.title}: ${d.content}`).join("\n\n");
  }
}

// Export singleton
export const campaignDocumentProcessor = new CampaignDocumentProcessorService();
