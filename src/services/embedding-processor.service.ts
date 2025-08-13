/**
 * Embedding Processor Service
 *
 * Processes text embeddings for crawled_pages table using OpenAI API
 * Handles batch processing with rate limiting and error recovery
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_ANON_KEY || "",
);

interface CrawledPage {
  id: string;
  content: string;
  url: string;
  chunk_number: number;
}

interface ProcessingStats {
  processed: number;
  errors: number;
  remaining: number;
  startTime: Date;
  estimatedCompletion?: Date;
}

export class EmbeddingProcessorService {
  private openai: OpenAI;
  private stats: ProcessingStats;
  private isProcessing: boolean = false;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    this.stats = {
      processed: 0,
      errors: 0,
      remaining: 0,
      startTime: new Date(),
    };
  }

  /**
   * Health check for embedding service
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return {
          status: "error",
          details: { error: "OpenAI API key not configured" },
        };
      }

      // Test OpenAI connection with a small embedding
      await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: "test",
      });

      const pendingCount = await this.getPendingCount();

      return {
        status: "ok",
        details: {
          openai_configured: true,
          pending_embeddings: pendingCount,
          is_processing: this.isProcessing,
          stats: this.stats,
        },
      };
    } catch (error) {
      return {
        status: "error",
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Get count of records pending embedding processing
   */
  async getPendingCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from("crawled_pages")
        .select("*", { count: "exact", head: true })
        .is("embedding", null);

      if (error) throw new Error(error.message);
      return count || 0;
    } catch (error) {
      console.error("Error getting pending count:", error);
      return 0;
    }
  }

  /**
   * Process embeddings in batches
   */
  async processEmbeddings(batchSize: number = 10): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error("Processing already in progress");
    }

    this.isProcessing = true;
    this.stats = {
      processed: 0,
      errors: 0,
      remaining: await this.getPendingCount(),
      startTime: new Date(),
    };

    console.log(
      `🚀 Starting embedding processing: ${this.stats.remaining} records to process`,
    );

    try {
      while (this.stats.remaining > 0) {
        const batch = await this.getNextBatch(batchSize);
        if (batch.length === 0) break;

        await this.processBatch(batch);

        // Update remaining count
        this.stats.remaining = await this.getPendingCount();

        // Calculate estimated completion
        const elapsed = new Date().getTime() - this.stats.startTime.getTime();
        const avgTimePerRecord = elapsed / this.stats.processed;
        this.stats.estimatedCompletion = new Date(
          Date.now() + avgTimePerRecord * this.stats.remaining,
        );

        // Log progress
        console.log(
          `📊 Progress: ${this.stats.processed} processed, ${this.stats.errors} errors, ${this.stats.remaining} remaining`,
        );

        // Rate limiting: wait 200ms between batches to avoid hitting OpenAI limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      console.log(
        `✅ Embedding processing completed: ${this.stats.processed} processed, ${this.stats.errors} errors`,
      );
      return this.stats;
    } catch (error) {
      console.error("Error in embedding processing:", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get next batch of records to process
   */
  private async getNextBatch(batchSize: number): Promise<CrawledPage[]> {
    try {
      const { data, error } = await supabase
        .from("crawled_pages")
        .select("id, content, url, chunk_number")
        .is("embedding", null)
        .limit(batchSize);

      if (error) throw new Error(error.message);
      return data || [];
    } catch (error) {
      console.error("Error getting batch:", error);
      return [];
    }
  }

  /**
   * Process a batch of records
   */
  private async processBatch(batch: CrawledPage[]): Promise<void> {
    const promises = batch.map((record) => this.processRecord(record));
    await Promise.allSettled(promises);
  }

  /**
   * Process individual record
   */
  private async processRecord(record: CrawledPage): Promise<void> {
    try {
      // Truncate content if too long (OpenAI has token limits)
      const maxLength = 8000; // Conservative limit for text-embedding-3-small
      const content =
        record.content.length > maxLength
          ? record.content.substring(0, maxLength) + "..."
          : record.content;

      // Generate embedding
      const embeddingResponse = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: content,
      });

      const embedding = embeddingResponse.data[0]?.embedding;
      if (!embedding) throw new Error("No embedding returned from OpenAI");

      // Update database
      const { error } = await supabase
        .from("crawled_pages")
        .update({ embedding })
        .eq("id", record.id);

      if (error) throw new Error(error.message);

      this.stats.processed++;
      console.log(
        `✅ Processed embedding for ${record.url} (chunk ${record.chunk_number})`,
      );
    } catch (error) {
      this.stats.errors++;
      console.error(
        `❌ Error processing record ${record.id}:`,
        error instanceof Error ? error.message : String(error),
      );

      // For rate limit errors, wait longer
      if (
        error instanceof Error &&
        (error.message.includes("rate limit") ||
          error.message.includes("quota"))
      ) {
        console.log("⏳ Rate limit hit, waiting 10 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  /**
   * Process specific batch by URLs or IDs
   */
  async processSpecificRecords(ids: string[]): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error("Processing already in progress");
    }

    this.isProcessing = true;
    this.stats = {
      processed: 0,
      errors: 0,
      remaining: ids.length,
      startTime: new Date(),
    };

    try {
      const { data, error } = await supabase
        .from("crawled_pages")
        .select("id, content, url, chunk_number")
        .in("id", ids)
        .is("embedding", null);

      if (error) throw new Error(error.message);

      const records = data ?? [];
      await this.processBatch(records);

      return this.stats;
    } catch (error) {
      console.error("Error in specific record processing:", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Stop processing (graceful shutdown)
   */
  async stopProcessing(): Promise<void> {
    if (this.isProcessing) {
      console.log("🛑 Stopping embedding processing...");
      this.isProcessing = false;
    }
  }
}

export default EmbeddingProcessorService;
