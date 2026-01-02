/**
 * Agent Prompt Service
 *
 * Gerencia prompts de agentes IA armazenados no banco de dados
 * Suporta customização por campanha, tipo (outbound/inbound) e canal (Instagram/WhatsApp)
 */

import { createClient } from '@supabase/supabase-js';

export interface AgentPrompt {
  id: string;
  campaign_id: string | null;
  type: 'outbound' | 'inbound';
  channel: 'instagram' | 'whatsapp' | 'all';
  name: string;
  description: string;
  system_prompt: string;
  user_prompt_template: string | null;
  greeting_message: string | null;
  fallback_message: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PromptVariables {
  [key: string]: string | number | null;
}

export class AgentPromptService {
  private supabase: ReturnType<typeof createClient>;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Buscar prompt ativo para campanha específica
   * Fallback para prompt padrão (campaign_id=null) se não encontrar
   */
  async getActivePrompt(
    campaignId: string,
    type: 'outbound' | 'inbound',
    channel: 'instagram' | 'whatsapp'
  ): Promise<AgentPrompt | null> {
    try {
      // Usar função SQL para buscar (prioriza específico, fallback para padrão)
      const { data, error } = await this.supabase.rpc('get_active_prompt', {
        p_campaign_id: campaignId,
        p_type: type,
        p_channel: channel,
      });

      if (error) {
        console.error('[AgentPrompt] Erro ao buscar prompt:', error);
        return null;
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`[AgentPrompt] Nenhum prompt encontrado para campaign=${campaignId}, type=${type}, channel=${channel}`);
        return null;
      }

      return data[0] as unknown as AgentPrompt;
    } catch (error: any) {
      console.error('[AgentPrompt] Erro ao buscar prompt:', error.message);
      return null;
    }
  }

  /**
   * Interpolar variáveis em template
   * Exemplo: "Olá {{name}}!" + {name: "João"} = "Olá João!"
   */
  interpolateTemplate(template: string, variables: PromptVariables): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value ?? ''));
    }

    return result;
  }

  /**
   * Montar system prompt com variáveis interpoladas
   */
  async buildSystemPrompt(
    campaignId: string,
    type: 'outbound' | 'inbound',
    channel: 'instagram' | 'whatsapp',
    variables: PromptVariables
  ): Promise<string | null> {
    const prompt = await this.getActivePrompt(campaignId, type, channel);

    if (!prompt) {
      return null;
    }

    return this.interpolateTemplate(prompt.system_prompt, variables);
  }

  /**
   * Montar greeting message com variáveis interpoladas
   */
  async buildGreeting(
    campaignId: string,
    type: 'outbound' | 'inbound',
    channel: 'instagram' | 'whatsapp',
    variables: PromptVariables
  ): Promise<string | null> {
    const prompt = await this.getActivePrompt(campaignId, type, channel);

    if (!prompt || !prompt.greeting_message) {
      return null;
    }

    return this.interpolateTemplate(prompt.greeting_message, variables);
  }

  /**
   * Criar novo prompt (admin)
   */
  async createPrompt(data: Partial<AgentPrompt>): Promise<AgentPrompt | null> {
    try {
      const { data: newPrompt, error } = await this.supabase
        .from('aic_agent_prompts')
        .insert(data)
        .select()
        .single();

      if (error) {
        console.error('[AgentPrompt] Erro ao criar prompt:', error);
        return null;
      }

      return newPrompt as unknown as AgentPrompt;
    } catch (error: any) {
      console.error('[AgentPrompt] Erro ao criar prompt:', error.message);
      return null;
    }
  }

  /**
   * Atualizar prompt existente (admin)
   */
  async updatePrompt(
    id: string,
    data: Partial<AgentPrompt>
  ): Promise<AgentPrompt | null> {
    try {
      const { data: updatedPrompt, error } = await this.supabase
        .from('aic_agent_prompts')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[AgentPrompt] Erro ao atualizar prompt:', error);
        return null;
      }

      return updatedPrompt as unknown as AgentPrompt;
    } catch (error: any) {
      console.error('[AgentPrompt] Erro ao atualizar prompt:', error.message);
      return null;
    }
  }

  /**
   * Desativar prompt (soft delete para A/B testing)
   */
  async deactivatePrompt(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('aic_agent_prompts')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('[AgentPrompt] Erro ao desativar prompt:', error);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('[AgentPrompt] Erro ao desativar prompt:', error.message);
      return false;
    }
  }

  /**
   * Listar prompts de uma campanha (admin)
   */
  async listPrompts(
    campaignId: string | null,
    type?: 'outbound' | 'inbound',
    channel?: 'instagram' | 'whatsapp'
  ): Promise<AgentPrompt[]> {
    try {
      let query = this.supabase
        .from('aic_agent_prompts')
        .select('*')
        .order('version', { ascending: false });

      if (campaignId !== null) {
        query = query.eq('campaign_id', campaignId);
      } else {
        query = query.is('campaign_id', null);
      }

      if (type) {
        query = query.eq('type', type);
      }

      if (channel) {
        query = query.eq('channel', channel);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[AgentPrompt] Erro ao listar prompts:', error);
        return [];
      }

      return (data as unknown as AgentPrompt[]) || [];
    } catch (error: any) {
      console.error('[AgentPrompt] Erro ao listar prompts:', error.message);
      return [];
    }
  }
}

// Export singleton instance
export const agentPromptService = new AgentPromptService();
