/**
 * TypeScript Types for Editorial Content System
 * Migration: 020_editorial_content_optimized.sql
 *
 * Sistema editorial semanal completo:
 * - 3 Threads Twitter (Segunda/Quarta/Sexta - 21 tweets total)
 * - 3 Reels Instagram (Terça/Quinta/Sábado - baseados nas threads)
 * - 1 YouTube Short (Sábado - concatenação dos 3 Reels)
 *
 * MVP Architecture:
 * - Tweets: GPT-4
 * - Scripts (Carla + Bruno): GPT-4o (baseados nos tweets)
 * - Vídeos: Canva PNG + ElevenLabs TTS + FFmpeg
 * - Música: instagram_trending_audios table
 */

// ═══════════════════════════════════════════════════════════════════════════
// ENUMS & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export enum EditorialContentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum ContentType {
  EDITORIAL_WEEK = 'editorial_week',  // Conteúdo semanal completo (Twitter + Instagram + YouTube)
  INSTAGRAM_REEL = 'instagram_reel',  // Reel individual
  YOUTUBE_SHORT = 'youtube_short',    // Short individual
}

export enum ThreadSubTheme {
  ANATOMY_PAIN = 'anatomy_pain',           // Thread 1 - Segunda
  FAILED_ATTEMPTS = 'failed_attempts',     // Thread 2 - Quarta
  SOLUTION_PRINCIPLES = 'solution_principles', // Thread 3 - Sexta
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TwitterThreadMetrics {
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
  engagement_rate: number;
}

export interface InstagramReelMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagement_rate: number;
}

export interface YouTubeShortMetrics {
  views: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number;
  engagement_rate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TYPE: Editorial Content (68 campos)
// ═══════════════════════════════════════════════════════════════════════════

export interface EditorialContent {
  // ───────────────────────────────────────────────────────────────────────
  // 1. IDENTIFICAÇÃO & AUDITORIA (6 campos)
  // ───────────────────────────────────────────────────────────────────────
  id: string;
  week_number: number;                    // 1-53
  year: number;                           // >= 2025
  main_theme: string;
  created_at: Date;
  updated_at: Date;

  // ───────────────────────────────────────────────────────────────────────
  // 2. TWITTER - THREAD 1 (Segunda-feira - Anatomia da Dor) - 6 campos
  // ───────────────────────────────────────────────────────────────────────
  thread_1_title: string | null;
  thread_1_sub_theme: ThreadSubTheme | null;
  thread_1_tweets: string[] | null;      // Array[7] de tweets (1/7 até 7/7)
  thread_1_approved: boolean;
  thread_1_published: boolean;
  thread_1_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 3. TWITTER - THREAD 2 (Quarta-feira - Tentativas que Falham) - 6 campos
  // ───────────────────────────────────────────────────────────────────────
  thread_2_title: string | null;
  thread_2_sub_theme: ThreadSubTheme | null;
  thread_2_tweets: string[] | null;      // Array[7] de tweets
  thread_2_approved: boolean;
  thread_2_published: boolean;
  thread_2_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 4. TWITTER - THREAD 3 (Sexta-feira - Princípios de Solução) - 6 campos
  // ───────────────────────────────────────────────────────────────────────
  thread_3_title: string | null;
  thread_3_sub_theme: ThreadSubTheme | null;
  thread_3_tweets: string[] | null;      // Array[7] de tweets
  thread_3_approved: boolean;
  thread_3_published: boolean;
  thread_3_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 5. INSTAGRAM - REEL 1 (Terça-feira - Baseado Thread 1) - 8 campos
  // ───────────────────────────────────────────────────────────────────────
  reel_1_sub_theme: string | null;
  reel_1_carla_script: string | null;    // Gerado pela IA a partir de thread_1_tweets
  reel_1_bruno_script: string | null;    // Gerado pela IA a partir de thread_1_tweets
  reel_1_instagram_caption: string | null;
  reel_1_instagram_hashtags: string[] | null; // Array de hashtags (sem #)
  reel_1_video_url: string | null;       // URL final merged (Canva + ElevenLabs)
  reel_1_approved: boolean;
  reel_1_published: boolean;
  reel_1_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 6. INSTAGRAM - REEL 2 (Quinta-feira - Baseado Thread 2) - 8 campos
  // ───────────────────────────────────────────────────────────────────────
  reel_2_sub_theme: string | null;
  reel_2_carla_script: string | null;    // Gerado pela IA a partir de thread_2_tweets
  reel_2_bruno_script: string | null;    // Gerado pela IA a partir de thread_2_tweets
  reel_2_instagram_caption: string | null;
  reel_2_instagram_hashtags: string[] | null;
  reel_2_video_url: string | null;       // URL final merged
  reel_2_approved: boolean;
  reel_2_published: boolean;
  reel_2_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 7. INSTAGRAM - REEL 3 (Sábado - Baseado Thread 3) - 8 campos
  // ───────────────────────────────────────────────────────────────────────
  reel_3_sub_theme: string | null;
  reel_3_carla_script: string | null;    // Gerado pela IA a partir de thread_3_tweets
  reel_3_bruno_script: string | null;    // Gerado pela IA a partir de thread_3_tweets
  reel_3_instagram_caption: string | null;
  reel_3_instagram_hashtags: string[] | null;
  reel_3_video_url: string | null;       // URL final merged
  reel_3_approved: boolean;
  reel_3_published: boolean;
  reel_3_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 8. YOUTUBE SHORT (Sábado - Concatenação 3 Reels) - 6 campos
  // ───────────────────────────────────────────────────────────────────────
  youtube_short_url: string | null;      // URL concatenado (~3min)
  youtube_caption: string | null;        // "Teste 7 dias grátis → link na bio"
  youtube_short_duration_seconds: number | null;
  youtube_short_approved: boolean;
  youtube_short_published: boolean;
  youtube_short_published_at: Date | null;

  // ───────────────────────────────────────────────────────────────────────
  // 9. METADADOS & CUSTOS (13 campos)
  // ───────────────────────────────────────────────────────────────────────
  instagram_audio_id: string | null;     // ID do áudio trending selecionado
  instagram_audio_name: string | null;   // Nome do áudio
  music_category: string | null;         // Categoria da música (corporate, etc.)

  related_reel_ids: string[] | null;     // IDs dos 3 Reels (para YouTube Short)
  content_type: ContentType | null;      // editorial_week | instagram_reel | youtube_short
  status: EditorialContentStatus;        // pending | approved | published | archived

  // LLM Metrics (geração tweets + scripts)
  llm_model: string | null;              // gpt-4 | gpt-4o
  llm_prompt_tokens: number;
  llm_completion_tokens: number;
  llm_total_tokens: number;
  llm_cost_usd: number;                  // Custo OpenAI
  llm_generation_time_ms: number;
  llm_temperature: number;

  // ───────────────────────────────────────────────────────────────────────
  // 10. MÉTRICAS DE PERFORMANCE (3 campos JSONB)
  // ───────────────────────────────────────────────────────────────────────
  twitter_metrics: TwitterThreadMetrics;
  instagram_metrics: InstagramReelMetrics;
  youtube_metrics: YouTubeShortMetrics;

  // ───────────────────────────────────────────────────────────────────────
  // 11. APROVAÇÕES & REJEIÇÕES (3 campos)
  // ───────────────────────────────────────────────────────────────────────
  approved_by: string | null;
  approved_at: Date | null;

  rejected: boolean;
  rejection_reason: string | null;

  // ───────────────────────────────────────────────────────────────────────
  // 12. CUSTOS OPERACIONAIS (1 campo)
  // ───────────────────────────────────────────────────────────────────────
  api_cost_usd: number;                  // Custo APIs (Twitter + Instagram + YouTube + ElevenLabs)
}

// ═══════════════════════════════════════════════════════════════════════════
// DTO TYPES (Data Transfer Objects)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DTO para criar novo conteúdo editorial
 */
export interface CreateEditorialContentDTO {
  week_number: number;
  year: number;
  main_theme: string;
  content_type?: ContentType;

  // Threads (gerados pelo GPT-4)
  thread_1_title?: string;
  thread_1_sub_theme?: ThreadSubTheme;
  thread_1_tweets?: string[];

  thread_2_title?: string;
  thread_2_sub_theme?: ThreadSubTheme;
  thread_2_tweets?: string[];

  thread_3_title?: string;
  thread_3_sub_theme?: ThreadSubTheme;
  thread_3_tweets?: string[];
}

/**
 * DTO para atualizar scripts e vídeos gerados
 */
export interface UpdateReelContentDTO {
  reel_1_sub_theme?: string;
  reel_1_carla_script?: string;
  reel_1_bruno_script?: string;
  reel_1_instagram_caption?: string;
  reel_1_instagram_hashtags?: string[];
  reel_1_video_url?: string;

  reel_2_sub_theme?: string;
  reel_2_carla_script?: string;
  reel_2_bruno_script?: string;
  reel_2_instagram_caption?: string;
  reel_2_instagram_hashtags?: string[];
  reel_2_video_url?: string;

  reel_3_sub_theme?: string;
  reel_3_carla_script?: string;
  reel_3_bruno_script?: string;
  reel_3_instagram_caption?: string;
  reel_3_instagram_hashtags?: string[];
  reel_3_video_url?: string;

  instagram_audio_id?: string;
  instagram_audio_name?: string;
  music_category?: string;

  llm_cost_usd?: number;
}

/**
 * DTO para atualizar YouTube Short
 */
export interface UpdateYouTubeShortDTO {
  youtube_short_url: string;
  youtube_caption?: string;
  youtube_short_duration_seconds?: number;
  related_reel_ids: string[];
  api_cost_usd?: number;
}

/**
 * DTO para aprovar conteúdo (granular)
 */
export interface ApproveContentDTO {
  // Threads
  thread_1_approved?: boolean;
  thread_2_approved?: boolean;
  thread_3_approved?: boolean;

  // Reels
  reel_1_approved?: boolean;
  reel_2_approved?: boolean;
  reel_3_approved?: boolean;

  // YouTube
  youtube_short_approved?: boolean;

  // Metadata
  approved_by?: string;
}

/**
 * DTO para marcar como publicado
 */
export interface MarkAsPublishedDTO {
  // Threads
  thread_1_published?: boolean;
  thread_2_published?: boolean;
  thread_3_published?: boolean;

  // Reels
  reel_1_published?: boolean;
  reel_2_published?: boolean;
  reel_3_published?: boolean;

  // YouTube
  youtube_short_published?: boolean;
}

/**
 * DTO para atualizar métricas
 */
export interface UpdateMetricsDTO {
  twitter_metrics?: Partial<TwitterThreadMetrics>;
  instagram_metrics?: Partial<InstagramReelMetrics>;
  youtube_metrics?: Partial<YouTubeShortMetrics>;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME TYPES (não persistidos no banco)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scripts gerados on-demand para vídeos Dual Persona
 * NÃO são persistidos no banco (podem ser regenerados a partir dos tweets)
 */
export interface DualPersonaScripts {
  carla_script: string;                  // 20-25s de narração (55-75 palavras)
  bruno_script: string;                  // 35-40s de narração (95-120 palavras)
  instagram_caption: string;             // Max 150 chars + CTA
  instagram_hashtags: string[];          // 7-10 hashtags
}

/**
 * Resultado da geração de conteúdo via GPT-4
 */
export interface GPTGeneratedTwitterContent {
  thread_1: {
    title: string;
    sub_theme: ThreadSubTheme;
    tweets: string[];                    // Array[7]
  };
  thread_2: {
    title: string;
    sub_theme: ThreadSubTheme;
    tweets: string[];
  };
  thread_3: {
    title: string;
    sub_theme: ThreadSubTheme;
    tweets: string[];
  };
  llm_cost_usd: number;                  // Custo da geração
}

/**
 * Resultado da geração de scripts para Reels via GPT-4o
 */
export interface GPTGeneratedReelScripts {
  reel_1: DualPersonaScripts;
  reel_2: DualPersonaScripts;
  reel_3: DualPersonaScripts;
  llm_cost_usd: number;                  // Custo adicional
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY FILTER TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EditorialContentFilters {
  week_number?: number;
  year?: number;
  status?: EditorialContentStatus;
  content_type?: ContentType;

  // Filtros de aprovação pendente
  pending_approval?: boolean;            // Pelo menos 1 item não aprovado

  // Filtros de publicação pendente
  pending_publication?: boolean;         // Pelo menos 1 item aprovado mas não publicado
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW MODELS (para Dashboard)
// ═══════════════════════════════════════════════════════════════════════════

export interface EditorialContentSummary {
  id: string;
  week_number: number;
  year: number;
  main_theme: string;
  status: EditorialContentStatus;
  content_type: ContentType;

  // Contadores de aprovação
  total_items: number;                   // 7 (3 threads + 3 reels + 1 youtube)
  approved_items: number;
  pending_approval_items: number;

  // Contadores de publicação
  published_items: number;
  pending_publication_items: number;

  // Métricas consolidadas
  total_twitter_impressions: number;
  total_instagram_views: number;
  total_youtube_views: number;

  // Custos totais
  total_cost_usd: number;

  created_at: Date;
  updated_at: Date;
}

/**
 * Status detalhado de aprovação (para UI de aprovação)
 */
export interface ApprovalStatus {
  thread_1: { approved: boolean; title: string | null };
  thread_2: { approved: boolean; title: string | null };
  thread_3: { approved: boolean; title: string | null };
  reel_1: { approved: boolean; video_url: string | null };
  reel_2: { approved: boolean; video_url: string | null };
  reel_3: { approved: boolean; video_url: string | null };
  youtube_short: { approved: boolean; video_url: string | null };
}

/**
 * Status detalhado de publicação
 */
export interface PublicationStatus {
  thread_1: { published: boolean; published_at: Date | null };
  thread_2: { published: boolean; published_at: Date | null };
  thread_3: { published: boolean; published_at: Date | null };
  reel_1: { published: boolean; published_at: Date | null };
  reel_2: { published: boolean; published_at: Date | null };
  reel_3: { published: boolean; published_at: Date | null };
  youtube_short: { published: boolean; published_at: Date | null };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tipo para inserção no banco (omite campos auto-gerados)
 */
export type EditorialContentInsert = Omit<
  EditorialContent,
  'id' | 'created_at' | 'updated_at'
>;

/**
 * Tipo para atualização no banco (todos os campos opcionais)
 */
export type EditorialContentUpdate = Partial<
  Omit<EditorialContent, 'id' | 'created_at' | 'updated_at'>
>;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isValidThreadSubTheme(value: string): value is ThreadSubTheme {
  return Object.values(ThreadSubTheme).includes(value as ThreadSubTheme);
}

export function isValidEditorialContentStatus(
  value: string
): value is EditorialContentStatus {
  return Object.values(EditorialContentStatus).includes(
    value as EditorialContentStatus
  );
}

export function isValidContentType(value: string): value is ContentType {
  return Object.values(ContentType).includes(value as ContentType);
}

/**
 * Verifica se todos os threads estão aprovados
 */
export function areAllThreadsApproved(content: EditorialContent): boolean {
  return (
    content.thread_1_approved &&
    content.thread_2_approved &&
    content.thread_3_approved
  );
}

/**
 * Verifica se todos os reels estão aprovados
 */
export function areAllReelsApproved(content: EditorialContent): boolean {
  return (
    content.reel_1_approved &&
    content.reel_2_approved &&
    content.reel_3_approved
  );
}

/**
 * Verifica se todos os itens estão aprovados
 */
export function isFullyApproved(content: EditorialContent): boolean {
  return (
    areAllThreadsApproved(content) &&
    areAllReelsApproved(content) &&
    content.youtube_short_approved
  );
}

/**
 * Verifica se todos os threads estão publicados
 */
export function areAllThreadsPublished(content: EditorialContent): boolean {
  return (
    content.thread_1_published &&
    content.thread_2_published &&
    content.thread_3_published
  );
}

/**
 * Verifica se todos os reels estão publicados
 */
export function areAllReelsPublished(content: EditorialContent): boolean {
  return (
    content.reel_1_published &&
    content.reel_2_published &&
    content.reel_3_published
  );
}

/**
 * Verifica se todos os itens estão publicados
 */
export function isFullyPublished(content: EditorialContent): boolean {
  return (
    areAllThreadsPublished(content) &&
    areAllReelsPublished(content) &&
    content.youtube_short_published
  );
}

/**
 * Calcula total de custos
 */
export function getTotalCost(content: EditorialContent): number {
  return content.llm_cost_usd + content.api_cost_usd;
}

/**
 * Retorna contadores de aprovação
 */
export function getApprovalCounts(content: EditorialContent): {
  total: number;
  approved: number;
  pending: number;
} {
  const items = [
    content.thread_1_approved,
    content.thread_2_approved,
    content.thread_3_approved,
    content.reel_1_approved,
    content.reel_2_approved,
    content.reel_3_approved,
    content.youtube_short_approved,
  ];

  const approved = items.filter(Boolean).length;

  return {
    total: 7,
    approved,
    pending: 7 - approved,
  };
}

/**
 * Retorna contadores de publicação
 */
export function getPublicationCounts(content: EditorialContent): {
  total: number;
  published: number;
  pending: number;
} {
  const items = [
    content.thread_1_published,
    content.thread_2_published,
    content.thread_3_published,
    content.reel_1_published,
    content.reel_2_published,
    content.reel_3_published,
    content.youtube_short_published,
  ];

  const published = items.filter(Boolean).length;

  return {
    total: 7,
    published,
    pending: 7 - published,
  };
}
