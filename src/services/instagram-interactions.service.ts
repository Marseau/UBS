import { supabase } from '../config/database';

interface InstagramWebhookEntry {
  id: string;
  time: number;
  changes?: Array<{
    field: string;
    value: {
      from?: { id: string; username: string };
      media?: { id: string; media_product_type: string };
      text?: string;
      id?: string;
    };
  }>;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: { text: string };
  }>;
}

export class InstagramInteractionsService {
  /**
   * Processa webhook do Instagram para capturar interações
   */
  static async processWebhook(body: any): Promise<void> {
    console.log('[Instagram Interactions] Webhook received:', JSON.stringify(body, null, 2));

    if (!body.entry || !Array.isArray(body.entry)) {
      console.warn('[Instagram Interactions] Invalid webhook payload - no entries');
      return;
    }

    for (const entry of body.entry as InstagramWebhookEntry[]) {
      // Processar mudanças (comments, mentions, etc)
      if (entry.changes) {
        for (const change of entry.changes) {
          await this.processChange(change, entry.time);
        }
      }

      // Processar mensagens (DMs)
      if (entry.messaging) {
        for (const message of entry.messaging) {
          await this.processMessage(message);
        }
      }
    }
  }

  /**
   * Processa uma mudança (comment, mention, etc)
   */
  private static async processChange(change: any, timestamp: number): Promise<void> {
    const { field, value } = change;

    console.log(`[Instagram Interactions] Processing change: ${field}`, value);

    // Extrair informações do usuário
    const username = value.from?.username;
    const userId = value.from?.id;
    const mediaId = value.media?.id;
    const text = value.text;

    if (!username) {
      console.warn('[Instagram Interactions] No username in change, skipping');
      return;
    }

    // Determinar tipo de interação
    let interactionType: string;
    switch (field) {
      case 'comments':
        interactionType = 'comment';
        break;
      case 'mentions':
        interactionType = value.media?.media_product_type === 'STORY'
          ? 'story_mention'
          : 'post_mention';
        break;
      default:
        interactionType = field;
    }

    // Buscar ou criar lead
    const lead = await this.findOrCreateLead(username, userId);

    // Registrar interação
    await this.recordInteraction({
      lead_id: lead?.id,
      instagram_user_id: userId,
      username,
      interaction_type: interactionType,
      media_id: mediaId,
      comment_text: interactionType === 'comment' ? text : null,
      interaction_timestamp: new Date(timestamp * 1000),
    });

    // Atualizar contador de interações do lead
    if (lead) {
      await this.updateLeadEngagement(lead.id, interactionType);
    }

    // Verificar se deve fazer auto-follow
    await this.checkAutoFollow(username, interactionType);
  }

  /**
   * Processa uma mensagem direta
   */
  private static async processMessage(message: any): Promise<void> {
    console.log('[Instagram Interactions] Processing DM:', message);

    // Buscar informações do usuário via Graph API
    const userId = message.sender.id;
    const messageText = message.message?.text;
    const timestamp = message.timestamp;

    // Buscar username via API
    const username = await this.getUsernameFromId(userId);
    if (!username) {
      console.warn('[Instagram Interactions] Could not fetch username for user ID:', userId);
      return;
    }

    // Buscar ou criar lead
    const lead = await this.findOrCreateLead(username, userId);

    // Registrar interação
    await this.recordInteraction({
      lead_id: lead?.id,
      instagram_user_id: userId,
      username,
      interaction_type: 'dm',
      message_text: messageText,
      interaction_timestamp: new Date(timestamp),
    });

    // Atualizar lead
    if (lead) {
      await this.updateLeadEngagement(lead.id, 'dm');
    }

    // Auto-follow em DMs é prioritário
    await this.checkAutoFollow(username, 'dm');
  }

  /**
   * Busca username a partir do Instagram User ID
   */
  private static async getUsernameFromId(userId: string): Promise<string | null> {
    try {
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
      const response = await fetch(
        `https://graph.instagram.com/${userId}?fields=username&access_token=${accessToken}`
      );
      const data: any = await response.json();
      return data.username || null;
    } catch (error) {
      console.error('[Instagram Interactions] Error fetching username:', error);
      return null;
    }
  }

  /**
   * Busca lead existente ou retorna null
   */
  private static async findOrCreateLead(username: string, userId?: string): Promise<any> {
    const { data: lead } = await supabase
      .from('instagram_leads')
      .select('*')
      .eq('username', username)
      .single();

    return lead;
  }

  /**
   * Registra uma interação no banco
   */
  private static async recordInteraction(interaction: any): Promise<void> {
    const { error } = await supabase
      .from('instagram_interactions')
      .insert(interaction);

    if (error) {
      console.error('[Instagram Interactions] Error recording interaction:', error);
    } else {
      console.log(`[Instagram Interactions] ✅ Recorded ${interaction.interaction_type} from @${interaction.username}`);
    }
  }

  /**
   * Atualiza engagement score e contadores do lead
   */
  private static async updateLeadEngagement(leadId: string, interactionType: string): Promise<void> {
    // Calcular pontos baseado no tipo de interação
    const points: Record<string, number> = {
      'dm': 15,
      'comment': 10,
      'story_mention': 8,
      'post_mention': 8,
      'like': 5,
      'share': 7,
      'save': 6,
    };

    const scoreIncrease = points[interactionType] || 5;

    // Buscar valores atuais
    const { data: currentLead } = await supabase
      .from('instagram_leads')
      .select('interaction_count, engagement_score')
      .eq('id', leadId)
      .single();

    // Atualizar campos com incrementos calculados
    const updates: any = {
      interaction_count: (currentLead?.interaction_count || 0) + 1,
      engagement_score: (currentLead?.engagement_score || 0) + scoreIncrease,
      last_interaction_type: interactionType,
      last_interaction_at: new Date().toISOString(),
    };

    if (interactionType === 'comment') {
      updates.has_commented = true;
    }

    if (interactionType === 'dm') {
      updates.has_dm = true;
    }

    const { error } = await supabase
      .from('instagram_leads')
      .update(updates)
      .eq('id', leadId);

    if (error) {
      console.error('[Instagram Interactions] Error updating lead engagement:', error);
    }
  }

  /**
   * Verifica se deve fazer auto-follow baseado na interação
   */
  private static async checkAutoFollow(username: string, interactionType: string): Promise<void> {
    // Critérios para auto-follow
    const autoFollowTriggers = ['dm', 'comment', 'story_mention'];

    if (!autoFollowTriggers.includes(interactionType)) {
      console.log(`[Instagram Interactions] Interaction type '${interactionType}' does not trigger auto-follow`);
      return;
    }

    // Buscar lead
    const { data: lead } = await supabase
      .from('instagram_leads')
      .select('*')
      .eq('username', username)
      .single();

    if (!lead) {
      console.log(`[Instagram Interactions] Lead @${username} not found in database`);
      return;
    }

    // Verificar se já foi seguido
    if (lead.follow_status === 'followed') {
      console.log(`[Instagram Interactions] @${username} already followed, skipping`);
      return;
    }

    // Marcar para follow (será executado pelo workflow N8N)
    console.log(`[Instagram Interactions] 🎯 @${username} triggered auto-follow via ${interactionType}`);

    // Registrar na tabela de interações que deve fazer follow
    const { error } = await supabase
      .from('instagram_interactions')
      .update({ auto_followed: true, followed_at: new Date().toISOString() })
      .eq('username', username)
      .eq('interaction_type', interactionType)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[Instagram Interactions] Error marking for auto-follow:', error);
    }
  }

  /**
   * Busca leads que devem ser seguidos (para workflow N8N)
   */
  static async getLeadsToFollow(limit: number = 10): Promise<any[]> {
    // Buscar leads que interagiram mas ainda não foram seguidos
    const { data: interactions } = await supabase
      .from('instagram_interactions')
      .select(`
        *,
        lead:instagram_leads(*)
      `)
      .eq('auto_followed', true)
      .is('followed_at', null)
      .in('interaction_type', ['dm', 'comment', 'story_mention'])
      .order('interaction_timestamp', { ascending: false })
      .limit(limit);

    return interactions || [];
  }
}
