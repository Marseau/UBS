/**
 * HASHTAG PARQUET EXPORT SERVICE
 *
 * Exporta todas as hashtags do PostgreSQL para formato Parquet
 * para uso com OpenAI Vector Store e análise escalável.
 *
 * Suporta 1M+ hashtags com compressão eficiente.
 */

import * as parquet from 'parquetjs-lite';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HashtagRecord {
  hashtag: string;
  freq_bio: number;
  freq_posts: number;
  freq_total: number;
  unique_leads: number;
  leads_with_contact: number;
  contact_rate: number;
  last_updated: string;
}

export class HashtagParquetExportService {
  private readonly exportDir = path.join(process.cwd(), 'data', 'parquet');
  private readonly fileName = 'hashtags_complete.parquet';

  constructor() {
    // Garantir que diretório existe
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Exporta TODAS as hashtags do banco para Parquet
   * Processa em batches para não sobrecarregar memória
   */
  async exportAllHashtags(): Promise<{ filePath: string; totalRecords: number; fileSizeKB: number }> {
    console.log('\n🚀 [PARQUET EXPORT] Iniciando export completo de hashtags...');

    const startTime = Date.now();
    const filePath = path.join(this.exportDir, this.fileName);

    // Schema Parquet otimizado
    const schema = new parquet.ParquetSchema({
      hashtag: { type: 'UTF8', compression: 'SNAPPY' },
      freq_bio: { type: 'INT32' },
      freq_posts: { type: 'INT32' },
      freq_total: { type: 'INT32' },
      unique_leads: { type: 'INT32' },
      leads_with_contact: { type: 'INT32' },
      contact_rate: { type: 'FLOAT' },
      last_updated: { type: 'TIMESTAMP_MILLIS' }
    });

    // Criar writer Parquet
    const writer = await parquet.ParquetWriter.openFile(schema, filePath);

    let totalRecords = 0;
    const batchSize = 10000; // Processar 10k por vez
    let offset = 0;
    let hasMore = true;

    console.log('📊 Buscando hashtags do banco em batches...');

    while (hasMore) {
      const { data: batch, error } = await supabase.rpc('execute_sql', {
        query_text: `
          WITH hashtag_frequency AS (
            SELECT
              hashtag,
              COUNT(*) FILTER (WHERE source = 'bio') as freq_bio,
              COUNT(*) FILTER (WHERE source = 'posts') as freq_posts,
              COUNT(*) as freq_total,
              COUNT(DISTINCT lead_id) as unique_leads,
              COUNT(DISTINCT lead_id) FILTER (WHERE has_contact) as leads_with_contact
            FROM (
              SELECT
                hashtag,
                'bio' as source,
                id as lead_id,
                (email IS NOT NULL OR phone IS NOT NULL) as has_contact
              FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
              WHERE hashtags_bio IS NOT NULL
              UNION ALL
              SELECT
                hashtag,
                'posts' as source,
                id as lead_id,
                (email IS NOT NULL OR phone IS NOT NULL) as has_contact
              FROM instagram_leads, jsonb_array_elements_text(hashtags_posts) as hashtag
              WHERE hashtags_posts IS NOT NULL
            ) combined
            WHERE hashtag IS NOT NULL AND hashtag != ''
            GROUP BY hashtag
          )
          SELECT
            hashtag,
            freq_bio,
            freq_posts,
            freq_total,
            unique_leads,
            leads_with_contact,
            ROUND((leads_with_contact::numeric / NULLIF(unique_leads, 0)::numeric * 100)::numeric, 1) as contact_rate
          FROM hashtag_frequency
          ORDER BY freq_total DESC
          LIMIT ${batchSize} OFFSET ${offset}
        `
      });

      if (error) {
        console.error('❌ Erro ao buscar batch:', error);
        throw error;
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      // Escrever batch no Parquet
      for (const row of batch) {
        await writer.appendRow({
          hashtag: row.hashtag,
          freq_bio: row.freq_bio || 0,
          freq_posts: row.freq_posts || 0,
          freq_total: row.freq_total || 0,
          unique_leads: row.unique_leads || 0,
          leads_with_contact: row.leads_with_contact || 0,
          contact_rate: row.contact_rate || 0,
          last_updated: new Date()
        });
      }

      totalRecords += batch.length;
      offset += batchSize;

      console.log(`   ✓ Processados ${totalRecords.toLocaleString()} registros...`);

      // Se retornou menos que batchSize, acabou
      if (batch.length < batchSize) {
        hasMore = false;
      }
    }

    // Fechar writer
    await writer.close();

    const stats = fs.statSync(filePath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Export Parquet concluído!');
    console.log(`   📁 Arquivo: ${filePath}`);
    console.log(`   📊 Total de registros: ${totalRecords.toLocaleString()}`);
    console.log(`   💾 Tamanho do arquivo: ${fileSizeKB.toLocaleString()} KB`);
    console.log(`   ⏱️  Tempo de processamento: ${duration}s`);

    return {
      filePath,
      totalRecords,
      fileSizeKB
    };
  }

  /**
   * Verifica se o arquivo Parquet existe e está atualizado
   */
  isParquetFileValid(): { valid: boolean; filePath: string; ageHours: number } {
    const filePath = path.join(this.exportDir, this.fileName);

    if (!fs.existsSync(filePath)) {
      return { valid: false, filePath, ageHours: -1 };
    }

    const stats = fs.statSync(filePath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = Math.round(ageMs / (1000 * 60 * 60));

    // Válido se tiver menos de 24 horas
    const valid = ageHours < 24;

    return { valid, filePath, ageHours };
  }

  /**
   * Lê amostra do arquivo Parquet (para debug)
   */
  async readSample(limit = 10): Promise<HashtagRecord[]> {
    const filePath = path.join(this.exportDir, this.fileName);

    if (!fs.existsSync(filePath)) {
      throw new Error('Arquivo Parquet não encontrado. Execute export primeiro.');
    }

    const reader = await parquet.ParquetReader.openFile(filePath);
    const cursor = reader.getCursor();

    const records: HashtagRecord[] = [];
    let count = 0;

    let record = null;
    while ((record = await cursor.next()) && count < limit) {
      records.push(record as HashtagRecord);
      count++;
    }

    await reader.close();

    return records;
  }

  /**
   * Retorna estatísticas do arquivo Parquet
   */
  async getStats(): Promise<{
    exists: boolean;
    filePath: string;
    sizeKB: number;
    rowCount: number;
    ageHours: number;
  }> {
    const validation = this.isParquetFileValid();

    if (!validation.valid && validation.ageHours === -1) {
      return {
        exists: false,
        filePath: validation.filePath,
        sizeKB: 0,
        rowCount: 0,
        ageHours: -1
      };
    }

    const stats = fs.statSync(validation.filePath);
    const reader = await parquet.ParquetReader.openFile(validation.filePath);
    const rowCount = reader.getRowCount();
    await reader.close();

    return {
      exists: true,
      filePath: validation.filePath,
      sizeKB: Math.round(stats.size / 1024),
      rowCount,
      ageHours: validation.ageHours
    };
  }
}

export const hashtagParquetExportService = new HashtagParquetExportService();
