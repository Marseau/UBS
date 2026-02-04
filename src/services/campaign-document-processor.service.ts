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

  // =====================================================
  // EXTRAÇÃO COMPLETA DE BRIEFING VIA GPT
  // =====================================================

  /**
   * Extrai TODOS os campos do briefing dos documentos da campanha
   * Usado para pré-preencher o formulário com sugestões da IA
   * O cliente valida e ajusta conforme necessário
   */
  async extractBriefingFields(campaignId: string): Promise<{
    success: boolean;
    fields?: {
      campaign_offer?: string;
      target_audience?: string;
      main_pain?: string;
      why_choose_us?: string;
      objections?: string[];
      call_to_action?: string;
      competitors?: string[];
      tone_of_voice?: string;
    };
    sources?: string[];
    error?: string;
  }> {
    try {
      console.log(`🤖 [AI Extract] Extraindo campos do briefing para campanha: ${campaignId}`);

      // 1. Buscar dados estruturados da campanha (contrato/proposta)
      const { data: campaign, error: campaignError } = await this.supabase
        .from("cluster_campaigns")
        .select("campaign_name, nicho_principal, target_audience, service_description")
        .eq("id", campaignId)
        .single();

      // 2. Buscar dados da jornada (proposal_data)
      const { data: journey } = await this.supabase
        .from("aic_client_journeys")
        .select("proposal_data, contract_value, lead_value")
        .eq("campaign_id", campaignId)
        .single();

      // 3. Buscar todos os documentos da campanha
      const { data: documents, error } = await this.supabase
        .from("campaign_documents")
        .select("title, content, doc_type, content_chunk, source_url")
        .eq("campaign_id", campaignId)
        .eq("is_active", true)
        .order("doc_type")
        .order("content_chunk");

      if (error) {
        console.error("[AI Extract] Erro ao buscar documentos:", error);
        return { success: false, error: "Erro ao buscar documentos da campanha" };
      }

      // Verificar se há alguma fonte de dados
      const hasDocuments = documents && documents.length > 0;
      const hasCampaignData = campaign && (campaign.nicho_principal || campaign.target_audience || campaign.service_description);
      const hasJourneyData = journey?.proposal_data && Object.keys(journey.proposal_data).length > 0;

      if (!hasDocuments && !hasCampaignData && !hasJourneyData) {
        return { success: false, error: "Nenhum dado encontrado. Processe a landing page, faça upload de documentos ou preencha os dados da campanha." };
      }

      console.log(`📚 [AI Extract] Fontes: ${documents?.length || 0} docs, campanha: ${hasCampaignData ? 'sim' : 'não'}, jornada: ${hasJourneyData ? 'sim' : 'não'}`);

      // 4. Montar contexto combinado
      let combinedContent = "";
      const maxChars = 48000; // ~12000 tokens
      const sources: string[] = [];

      // 4.1 Adicionar dados estruturados da campanha (PRIORIDADE)
      if (hasCampaignData) {
        combinedContent += `\n\n=== DADOS DO CONTRATO/PROPOSTA ===\n`;
        if (campaign.campaign_name) combinedContent += `Nome da Campanha: ${campaign.campaign_name}\n`;
        if (campaign.nicho_principal) combinedContent += `Nicho Principal: ${campaign.nicho_principal}\n`;
        if (campaign.target_audience) combinedContent += `Público-Alvo: ${campaign.target_audience}\n`;
        if (campaign.service_description) combinedContent += `Descrição do Serviço: ${campaign.service_description}\n`;
        sources.push("Contrato/Proposta");
      }

      // 4.2 Adicionar dados da jornada
      if (hasJourneyData) {
        const pd = journey.proposal_data as any;
        combinedContent += `\n\n=== DADOS DA JORNADA ===\n`;
        if (pd.target_niche) combinedContent += `Nicho: ${pd.target_niche}\n`;
        if (pd.target_audience) combinedContent += `Público: ${pd.target_audience}\n`;
        if (pd.service_description) combinedContent += `Serviço: ${pd.service_description}\n`;
        if (journey.contract_value) combinedContent += `Valor do Contrato: R$ ${journey.contract_value}\n`;
        if (journey.lead_value) combinedContent += `Valor por Lead: R$ ${journey.lead_value}\n`;
        sources.push("Jornada do Cliente");
      }

      // 4.3 Adicionar documentos (LP, uploads)
      if (hasDocuments) {
        for (const doc of documents) {
          if (combinedContent.length + doc.content.length > maxChars) {
            break;
          }
          combinedContent += `\n\n=== ${doc.doc_type.toUpperCase()}: ${doc.title} ===\n${doc.content}`;
          if (doc.source_url && !sources.includes(doc.source_url)) {
            sources.push(doc.source_url);
          }
        }
      }

      console.log(`📝 [AI Extract] Conteúdo combinado: ${combinedContent.length} caracteres de ${sources.length} fontes`);

      // 3. Usar GPT para extrair campos do briefing
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Você é um especialista em análise de documentos comerciais e criação de briefings de campanhas de marketing.

Sua tarefa é extrair informações específicas dos documentos fornecidos para pré-preencher um formulário de briefing.

REGRAS IMPORTANTES:
- Extraia informações baseadas nos documentos fornecidos
- Para campos factuais (oferta, público-alvo, CTA), use apenas o que está nos documentos
- Se NÃO encontrar informação suficiente para um campo factual, deixe como null
- Seja específico e use linguagem de vendas/marketing quando apropriado
- Para OBJEÇÕES: esta é a exceção — você DEVE gerar objeções mesmo que não estejam explícitas. Analise o produto/serviço descrito e liste as objeções mais comuns que um potencial cliente teria. Procure também seções de FAQ, perguntas frequentes, garantias, ou textos defensivos/explicativos nos documentos — esses trechos geralmente respondem a objeções implícitas. SEMPRE retorne pelo menos 3-5 objeções com respostas.`
          },
          {
            role: "user",
            content: `Analise os seguintes documentos e extraia os campos do briefing:

DOCUMENTOS:
${combinedContent}

---

Extraia as seguintes informações:

1. **OFERTA ESPECIAL** (campaign_offer): Há alguma oferta, desconto, promoção, condição especial ou benefício exclusivo mencionado? (ex: "20% de desconto", "primeira consulta grátis", "preço especial por lead")

2. **PERFIL DO CLIENTE IDEAL** (target_audience): Quem é o público-alvo? Descreva o perfil ideal: segmento, porte, características, necessidades. Seja específico.

3. **PROBLEMA QUE RESOLVE** (main_pain): Qual é a principal dor/problema que o produto/serviço resolve para o cliente?

4. **POR QUE ESCOLHER** (why_choose_us): Quais são os principais diferenciais? Por que o cliente deveria escolher este serviço/produto ao invés da concorrência?

5. **OBJEÇÕES E RESPOSTAS** (objections): IMPORTANTE - procure trechos que parecem respostas a dúvidas/objeções comuns, mesmo que a pergunta não esteja explícita. Exemplos de objeções típicas: "Isso é spam?", "E se minha conta for bloqueada?", "Como sei que funciona?", "Qual o prazo?", "Como é o pagamento?". Quando encontrar uma resposta/explicação defensiva, crie a objeção correspondente. Formato: [{"objection": "a dúvida/objeção do cliente", "response": "como responder"}]

6. **CALL TO ACTION** (call_to_action): Qual seria a melhor proposta para um lead qualificado? (ex: "Agendar uma demonstração", "Solicitar orçamento", "Iniciar teste grátis")

7. **CONCORRENTES** (competitors): Há menção de concorrentes ou empresas similares no mercado?

8. **TOM DE VOZ** (tone_of_voice): Qual tom de comunicação parece mais adequado? Opções: formal, consultivo, amigavel, tecnico, inspirador

Responda EXATAMENTE neste formato JSON:
{
  "campaign_offer": "string ou null se não encontrado",
  "target_audience": "string ou null se não encontrado",
  "main_pain": "string ou null se não encontrado",
  "why_choose_us": "string ou null se não encontrado",
  "objections": [{"objection": "pergunta/objeção", "response": "como responder"}, ...] ou null,
  "call_to_action": "string ou null se não encontrado",
  "competitors": ["concorrente 1", ...] ou null,
  "tone_of_voice": "formal|consultivo|amigavel|tecnico|inspirador ou null"
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
      console.log(`✅ [AI Extract] Campos extraídos com sucesso:`, Object.keys(extracted).filter(k => extracted[k]));

      // Limpar campos null
      const fields: any = {};
      if (extracted.campaign_offer) fields.campaign_offer = extracted.campaign_offer;
      if (extracted.target_audience) fields.target_audience = extracted.target_audience;
      if (extracted.main_pain) fields.main_pain = extracted.main_pain;
      if (extracted.why_choose_us) fields.why_choose_us = extracted.why_choose_us;
      if (extracted.objections && extracted.objections.length > 0) fields.objections = extracted.objections;
      if (extracted.call_to_action) fields.call_to_action = extracted.call_to_action;
      if (extracted.competitors && extracted.competitors.length > 0) fields.competitors = extracted.competitors;
      if (extracted.tone_of_voice) fields.tone_of_voice = extracted.tone_of_voice;

      return {
        success: true,
        fields,
        sources
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [AI Extract] Erro:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }
}

// Export singleton
export const campaignDocumentProcessor = new CampaignDocumentProcessorService();
