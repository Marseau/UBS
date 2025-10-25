import { supabase } from '../config/database';

interface AccountAction {
  id?: string;
  source_platform?: string;
  lead_id?: string | null;
  username: string;
  action_type: string;
  post_id?: string | null;
  media_id?: string | null;
  comment_text?: string | null;
  dm_text?: string | null;
  executed_at?: string | null;
  execution_method?: string | null;
  success?: boolean;
  error_message?: string | null;
  retry_count?: number;
  daily_action_count?: number;
}

interface LeadInfo {
  full_name?: string | null;
  followers_count?: number | null;
  lead_score?: number | null;
  business_category?: string | null;
}

export class AccountActionsNotifierService {
  private static readonly N8N_WEBHOOK_URL = process.env.N8N_LEADS_ACTION_WEBHOOK_URL ||
    'http://localhost:5678/webhook/leads-action-info';

  /**
   * Registra uma ação da conta e retorna dados completos para processamento
   */
  static async recordAndNotify(action: AccountAction): Promise<any> {
    console.log('[Account Actions] Recording action:', action);

    try {
      // 1. Buscar informações do lead (se existir)
      let leadInfo: LeadInfo | null = null;
      if (action.lead_id) {
        const { data: lead } = await supabase
          .from('instagram_leads')
          .select('full_name, followers_count, lead_score, business_category')
          .eq('id', action.lead_id)
          .single();

        leadInfo = lead;
      } else if (action.username) {
        // Tentar buscar por username
        const { data: lead } = await supabase
          .from('instagram_leads')
          .select('id, full_name, followers_count, lead_score, business_category')
          .eq('username', action.username)
          .single();

        if (lead) {
          leadInfo = lead;
          action.lead_id = lead.id;
        }
      }

      // 2. Inserir ação no banco
      const { data: insertedAction, error: insertError } = await supabase
        .from('account_actions')
        .insert({
          source_platform: action.source_platform || 'instagram',
          lead_id: action.lead_id,
          username: action.username,
          action_type: action.action_type,
          post_id: action.post_id,
          media_id: action.media_id,
          comment_text: action.comment_text,
          dm_text: action.dm_text,
          executed_at: action.executed_at || new Date().toISOString(),
          execution_method: action.execution_method || 'manual',
          success: action.success !== false, // Default true
          error_message: action.error_message,
          retry_count: action.retry_count || 0,
          daily_action_count: action.daily_action_count || 1,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Account Actions] Error inserting action:', insertError);
        throw insertError;
      }

      console.log('[Account Actions] ✅ Action recorded:', insertedAction.id);

      // 3. Retornar dados completos para processamento externo (N8N)
      return {
        action: insertedAction,
        lead: leadInfo,
        formatted_message: this.formatTelegramMessage(action, leadInfo),
      };
    } catch (error) {
      console.error('[Account Actions] Error:', error);
      throw error;
    }
  }

  /**
   * Formata mensagem em Markdown para Telegram
   */
  private static formatTelegramMessage(action: AccountAction, leadInfo: LeadInfo | null): string {
    const emoji = this.getActionEmoji(action.action_type);
    const actionName = this.getActionName(action.action_type);
    const statusEmoji = action.success !== false ? '✅' : '❌';
    const platformEmoji = this.getPlatformEmoji(action.source_platform || 'instagram');
    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let message = `${emoji} *${actionName}* ${statusEmoji}\n\n`;
    message += `${platformEmoji} *Plataforma:* ${(action.source_platform || 'instagram').toUpperCase()}\n`;
    message += `👤 *Username:* @${action.username}\n`;

    // Adicionar informações do lead
    if (leadInfo) {
      if (leadInfo.full_name) {
        message += `📛 *Nome:* ${leadInfo.full_name}\n`;
      }
      if (leadInfo.followers_count !== null && leadInfo.followers_count !== undefined) {
        message += `👥 *Seguidores:* ${this.formatNumber(leadInfo.followers_count)}\n`;
      }
      if (leadInfo.lead_score !== null && leadInfo.lead_score !== undefined) {
        message += `⭐ *Score:* ${leadInfo.lead_score}/100\n`;
      }
      if (leadInfo.business_category) {
        message += `🏢 *Categoria:* ${leadInfo.business_category}\n`;
      }
    }

    // Adicionar detalhes específicos da ação
    switch (action.action_type) {
      case 'comment':
        if (action.comment_text) {
          message += `\n💬 *Comentário:*\n_"${action.comment_text}"_\n`;
        }
        break;
      case 'dm':
        if (action.dm_text) {
          message += `\n📨 *Mensagem:*\n_"${action.dm_text}"_\n`;
        }
        break;
      case 'like':
        if (action.post_id) {
          message += `\n🔗 *Post:* ${action.post_id}\n`;
        }
        break;
    }

    // Método de execução
    const methodEmoji = action.execution_method === 'puppeteer' ? '🤖' :
                       action.execution_method === 'graph_api' ? '⚡' : '👤';
    message += `\n${methodEmoji} *Método:* ${action.execution_method || 'manual'}\n`;

    // Status
    if (action.success === false && action.error_message) {
      message += `\n⚠️ *Erro:* ${action.error_message}\n`;
    }

    // Timestamp
    message += `\n🕐 *Data/Hora:* ${timestamp}`;

    // Contador diário
    if (action.daily_action_count && action.daily_action_count > 1) {
      message += `\n📊 *Ação #${action.daily_action_count} hoje*`;
    }

    return message;
  }

  /**
   * Envia mensagem para N8N webhook
   */
  private static async sendToN8N(message: string): Promise<void> {
    try {
      const response = await fetch(this.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mensagem: message,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`N8N webhook returned ${response.status}: ${response.statusText}`);
      }

      console.log('[Account Actions Notifier] ✅ Message sent to N8N webhook');
    } catch (error) {
      console.error('[Account Actions Notifier] Error sending to N8N:', error);
      // Não falhar a operação se notificação falhar
    }
  }

  /**
   * Retorna emoji para cada tipo de ação
   */
  private static getActionEmoji(actionType: string): string {
    const emojis: Record<string, string> = {
      follow: '➕',
      unfollow: '➖',
      like: '❤️',
      comment: '💬',
      dm: '📨',
      story_view: '👀',
    };
    return emojis[actionType] || '🔔';
  }

  /**
   * Retorna nome legível da ação
   */
  private static getActionName(actionType: string): string {
    const names: Record<string, string> = {
      follow: 'SEGUIU',
      unfollow: 'DEIXOU DE SEGUIR',
      like: 'CURTIU',
      comment: 'COMENTOU',
      dm: 'ENVIOU DM',
      story_view: 'VIU STORY',
    };
    return names[actionType] || actionType.toUpperCase();
  }

  /**
   * Retorna emoji para cada plataforma
   */
  private static getPlatformEmoji(platform: string): string {
    const emojis: Record<string, string> = {
      instagram: '📸',
      twitter: '🐦',
      facebook: '📘',
      tiktok: '🎵',
      linkedin: '💼',
      youtube: '📺',
    };
    return emojis[platform] || '🌐';
  }

  /**
   * Formata número com separadores de milhar
   */
  private static formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }

  /**
   * Busca contador de ações de hoje
   */
  static async getTodayActionCount(actionType: string): Promise<number> {
    const { data } = await supabase
      .from('account_actions_today_count')
      .select('count_today')
      .eq('action_type', actionType)
      .single();

    return data?.count_today || 0;
  }

  /**
   * Verifica se pode executar ação (rate limiting)
   */
  static async canExecuteAction(actionType: string, dailyLimit: number): Promise<boolean> {
    const count = await this.getTodayActionCount(actionType);
    return count < dailyLimit;
  }
}
