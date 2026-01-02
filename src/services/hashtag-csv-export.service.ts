/**
 * HASHTAG CSV EXPORT SERVICE
 *
 * Exporta todas as hashtags do PostgreSQL para formato CSV
 * para uso com OpenAI Vector Store (Parquet não é suportado).
 *
 * Suporta 1M+ hashtags.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export class HashtagCsvExportService {
  private readonly exportDir = path.join(process.cwd(), 'data', 'exports');
  private readonly fileName = 'hashtags_complete.csv';

  constructor() {
    // Garantir que diretório existe
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Exporta TODAS as hashtags do banco para CSV
   * Busca tudo de uma vez para evitar duplicatas (batch com ORDER BY instável)
   */
  async exportAllHashtags(): Promise<{ filePath: string; totalRecords: number; fileSizeKB: number }> {
    console.log('\n🚀 [CSV EXPORT] Iniciando export completo de hashtags...');

    const startTime = Date.now();
    const filePath = path.join(this.exportDir, this.fileName);

    // Buscar TODAS as hashtags de uma vez (evita duplicatas do batch com ORDER BY instável)
    // ~110k rows é gerenciável em memória
    console.log('📊 Buscando todas as hashtags do banco...');

    const { data: allHashtags, error } = await supabase.rpc('execute_sql', {
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
              (whatsapp_number IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL) as has_contact
            FROM instagram_leads, jsonb_array_elements_text(hashtags_bio) as hashtag
            WHERE hashtags_bio IS NOT NULL
            UNION ALL
            SELECT
              hashtag,
              'posts' as source,
              id as lead_id,
              (whatsapp_number IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL) as has_contact
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
        ORDER BY freq_total DESC, hashtag ASC
      `
    });

    if (error) {
      console.error('❌ Erro ao buscar hashtags:', error);
      throw error;
    }

    if (!allHashtags || allHashtags.length === 0) {
      throw new Error('Nenhuma hashtag encontrada no banco');
    }

    console.log(`   ✓ ${allHashtags.length.toLocaleString()} hashtags encontradas`);

    // Escrever CSV de uma vez
    const header = 'hashtag,freq_bio,freq_posts,freq_total,unique_leads,leads_with_contact,contact_rate,last_updated\n';
    const now = new Date().toISOString();
    const csvLines = allHashtags.map((row: any) => {
      const safeHashtag = (row.hashtag || '').replace(/[",\n\r]/g, '');
      return `${safeHashtag},${row.freq_bio || 0},${row.freq_posts || 0},${row.freq_total || 0},${row.unique_leads || 0},${row.leads_with_contact || 0},${row.contact_rate || 0},${now}`;
    }).join('\n') + '\n';

    fs.writeFileSync(filePath, header + csvLines);

    const totalRecords = allHashtags.length;
    const stats = fs.statSync(filePath);
    const fileSizeKB = Math.round(stats.size / 1024);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Export CSV concluído!');
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
   * Verifica se o arquivo CSV existe e está atualizado
   */
  isCsvFileValid(): { valid: boolean; filePath: string; ageHours: number } {
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
   * Retorna estatísticas do arquivo CSV
   */
  async getStats(): Promise<{
    exists: boolean;
    filePath: string;
    sizeKB: number;
    rowCount: number;
    ageHours: number;
  }> {
    const filePath = path.join(this.exportDir, this.fileName);

    if (!fs.existsSync(filePath)) {
      return {
        exists: false,
        filePath,
        sizeKB: 0,
        rowCount: 0,
        ageHours: -1
      };
    }

    const stats = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const rowCount = content.split('\n').filter(line => line.trim()).length - 1; // -1 para o header

    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = Math.round(ageMs / (1000 * 60 * 60));

    return {
      exists: true,
      filePath,
      sizeKB: Math.round(stats.size / 1024),
      rowCount,
      ageHours
    };
  }

  /**
   * Retorna o caminho do arquivo CSV
   */
  getCsvPath(): string {
    return path.join(this.exportDir, this.fileName);
  }
}

export const hashtagCsvExportService = new HashtagCsvExportService();
