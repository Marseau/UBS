/**
 * OUTREACH LIMITS CONFIGURATION
 *
 * Configuração centralizada de limites de rate para outreach cold.
 * Baseado em pesquisa de limites seguros para WhatsApp e Instagram.
 *
 * IMPORTANTE: Estes são limites CONSERVADORES para evitar bloqueios.
 * Contas novas devem usar limites ainda menores no período de warmup.
 *
 * Limites definidos:
 * - WhatsApp: 15/hora × 8 horas = 120/dia
 * - Instagram: 10/hora × 8 horas = 80/dia
 * - Distribuição: 60% WhatsApp, 40% Instagram
 * - Fallback: WhatsApp → Instagram
 */

// ============================================================================
// WHATSAPP RATE LIMITS
// ============================================================================

export const WHATSAPP_LIMITS = {
  // Mensagens por hora (com delays de 20-50s entre mensagens)
  HOURLY_LIMIT: 15,

  // Mensagens por dia (15/hora × 8 horas comerciais = 120/dia)
  DAILY_LIMIT: 120,

  // Delay entre mensagens em ms (humanização)
  MIN_DELAY_MS: 20000,  // 20 segundos
  MAX_DELAY_MS: 50000,  // 50 segundos

  // Limites para contas em warmup (primeiros 14 dias)
  WARMUP_HOURLY_LIMIT: 5,
  WARMUP_DAILY_LIMIT: 30,

  // Horário comercial
  BUSINESS_HOURS_START: 9,
  BUSINESS_HOURS_END: 18,
};

// ============================================================================
// INSTAGRAM RATE LIMITS
// ============================================================================

export const INSTAGRAM_LIMITS = {
  // DMs por hora (Instagram é mais sensível)
  HOURLY_LIMIT: 10,

  // DMs por dia (10/hora × 8 horas comerciais = 80/dia)
  DAILY_LIMIT: 80,

  // Delay entre DMs em ms (humanização - deve ser maior que WhatsApp)
  MIN_DELAY_MS: 45000,  // 45 segundos
  MAX_DELAY_MS: 120000, // 2 minutos

  // Limites para contas em warmup (primeiros 21 dias)
  WARMUP_HOURLY_LIMIT: 3,
  WARMUP_DAILY_LIMIT: 20,

  // Horário comercial
  BUSINESS_HOURS_START: 9,
  BUSINESS_HOURS_END: 21, // Instagram permite horário mais amplo
};

// ============================================================================
// DISTRIBUIÇÃO DE LEADS
// ============================================================================

export const DISTRIBUTION_CONFIG = {
  /**
   * Percentual de leads que serão contatados via WhatsApp
   * Prioridade para WhatsApp pois:
   * - Maior taxa de abertura (95%+)
   * - Menor chance de ser visto como spam
   * - Comunicação mais direta
   */
  WHATSAPP_PERCENTAGE: 60,

  /**
   * Percentual de leads que serão contatados via Instagram
   * Usado para:
   * - Leads sem telefone
   * - Fallback quando WhatsApp falha
   * - Perfis muito ativos no Instagram
   */
  INSTAGRAM_PERCENTAGE: 40,

  /**
   * Estratégia de fallback
   * Quando WhatsApp falha (número inválido, bloqueado, etc),
   * tentar Instagram se disponível
   */
  FALLBACK_ENABLED: true,
  FALLBACK_STRATEGY: 'whatsapp_to_instagram' as const,

  /**
   * Critérios para escolher canal
   */
  CHANNEL_SELECTION: {
    // Se lead tem telefone válido E username Instagram, usar WhatsApp (60%)
    // Se lead tem APENAS username Instagram, usar Instagram (40%)
    // Se lead tem APENAS telefone, usar WhatsApp (100%)
    PREFER_WHATSAPP_WHEN_BOTH: true,

    // Validação de telefone antes de tentar WhatsApp
    VALIDATE_PHONE_BEFORE_SEND: true,

    // Retry via outro canal em caso de falha
    RETRY_ON_OTHER_CHANNEL: true,
    MAX_RETRY_ATTEMPTS: 1,
  }
};

// ============================================================================
// CAPACIDADE DIÁRIA CALCULADA
// ============================================================================

/**
 * Calcula capacidade total diária baseada nos limites por canal
 *
 * Com os limites atuais (1 sessão WA + 1 conta IG):
 * - WhatsApp: 120/dia
 * - Instagram: 80/dia
 * - Total: 200 leads/dia
 */
export function calculateDailyCapacity(
  numWhatsAppSessions: number = 1,
  numInstagramAccounts: number = 1
): { whatsapp: number; instagram: number; total: number } {
  const whatsappCapacity = WHATSAPP_LIMITS.DAILY_LIMIT * numWhatsAppSessions;
  const instagramCapacity = INSTAGRAM_LIMITS.DAILY_LIMIT * numInstagramAccounts;

  return {
    whatsapp: whatsappCapacity,
    instagram: instagramCapacity,
    total: whatsappCapacity + instagramCapacity
  };
}

/**
 * Determina qual canal usar para um lead específico
 */
export function determineOutreachChannel(lead: {
  phone?: string | null;
  instagram_username?: string | null;
  whatsapp_available?: boolean;
}): 'whatsapp' | 'instagram' | 'none' {
  const hasPhone = lead.phone && lead.phone.length >= 10;
  const hasInstagram = lead.instagram_username && lead.instagram_username.length > 0;

  // Se tem ambos, usar distribuição configurada
  if (hasPhone && hasInstagram) {
    // 60% WhatsApp, 40% Instagram
    return Math.random() * 100 < DISTRIBUTION_CONFIG.WHATSAPP_PERCENTAGE
      ? 'whatsapp'
      : 'instagram';
  }

  // Se só tem telefone
  if (hasPhone) {
    return 'whatsapp';
  }

  // Se só tem Instagram
  if (hasInstagram) {
    return 'instagram';
  }

  return 'none';
}

/**
 * Retorna o canal de fallback quando o principal falha
 */
export function getFallbackChannel(
  currentChannel: 'whatsapp' | 'instagram',
  lead: { phone?: string | null; instagram_username?: string | null }
): 'whatsapp' | 'instagram' | 'none' {
  if (!DISTRIBUTION_CONFIG.FALLBACK_ENABLED) {
    return 'none';
  }

  if (currentChannel === 'whatsapp') {
    // Fallback de WhatsApp para Instagram
    return lead.instagram_username ? 'instagram' : 'none';
  }

  if (currentChannel === 'instagram') {
    // Fallback de Instagram para WhatsApp
    return lead.phone && lead.phone.length >= 10 ? 'whatsapp' : 'none';
  }

  return 'none';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  WHATSAPP_LIMITS,
  INSTAGRAM_LIMITS,
  DISTRIBUTION_CONFIG,
  calculateDailyCapacity,
  determineOutreachChannel,
  getFallbackChannel
};
