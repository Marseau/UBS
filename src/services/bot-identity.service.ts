/**
 * Bot Identity Service - Humanização com controle determinístico
 * Trata small talk essencial sem depender do LLM
 */

import { supabaseAdmin } from '../config/database';
import { composeReply, REPLY_TEMPLATES } from '../utils/response-composer';

// Regexes determinísticas para small talk essencial
const BOT_IDENTITY_REGEX = /(qual\s+seu\s+nome|quem\s+(é|e)\s+(você|voce|vc)|seu\s+nome)/i;
const THANKS_REGEX = /\b(obrigad[oa]|valeu|agradecid[oa])\b/i;
const HOW_ARE_YOU_REGEX = /\b(tudo\s*bem|como\s*vai|tudo\s*certo)\b/i;
const HELLO_REGEX = /\b(oi|olá|boa\s*(tarde|noite|dia)|hey)\b/i;

interface TenantConfig {
  business_name: string;
  ai_settings?: {
    bot_name?: string;
    persona?: string;
    style?: {
      emoji?: boolean;
      warmth?: 'baixa' | 'média' | 'alta';
      brevity?: 'curta' | 'média' | 'detalhada';
    };
  };
}

export class BotIdentityService {
  
  /**
   * Detecta se é small talk determinístico (não precisa de LLM)
   */
  static detectSmallTalk(text: string): string | null {
    if (BOT_IDENTITY_REGEX.test(text)) return 'identity';
    if (THANKS_REGEX.test(text)) return 'thanks';
    if (HOW_ARE_YOU_REGEX.test(text)) return 'how_are_you';
    if (HELLO_REGEX.test(text)) return 'hello';
    return null;
  }

  /**
   * Busca configuração do tenant (bot_name, style)
   */
  static async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    try {
      const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select('business_name, ai_settings')
        .eq('id', tenantId)
        .single();
      
      if (error || !tenant) {
        console.warn(`[BOT IDENTITY] Tenant config not found: ${tenantId}`);
        return { business_name: 'sua empresa' };
      }
      
      return tenant as TenantConfig;
    } catch (error) {
      console.error('[BOT IDENTITY] Error fetching tenant config:', error);
      return { business_name: 'sua empresa' };
    }
  }

  /**
   * Responde small talk com base no tenant config
   */
  static async handleSmallTalk(
    smallTalkType: string, 
    tenantId: string,
    currentState?: string
  ): Promise<string> {
    const config = await this.getTenantConfig(tenantId);
    const botName = config.ai_settings?.bot_name ?? 'Assistente UBS';
    const businessName = config.business_name ?? 'sua empresa';
    const style = config.ai_settings?.style ?? {};
    
    let response: string;
    
    switch (smallTalkType) {
      case 'identity':
        response = REPLY_TEMPLATES.identity(botName, businessName);
        break;
      case 'thanks':
        response = REPLY_TEMPLATES.thanks;
        break;
      case 'how_are_you':
        response = REPLY_TEMPLATES.howAreYou;
        break;
      case 'hello':
        response = REPLY_TEMPLATES.hello;
        break;
      default:
        return '';
    }

    // Se está em onboarding, adiciona continuação do fluxo
    if (currentState?.startsWith('onboarding_')) {
      if (currentState === 'onboarding_need_name') {
        response += '\n\n' + REPLY_TEMPLATES.needName;
      } else if (currentState === 'onboarding_need_email') {
        response += '\n\nPode me informar seu e-mail?';
      }
    }

    return composeReply(response, style);
  }

  /**
   * Resposta humanizada para onboarding
   */
  static composeOnboardingReply(
    template: keyof typeof REPLY_TEMPLATES,
    tenantId: string,
    ...args: any[]
  ): string {
    // Para implementação futura: buscar style do tenant
    const response = typeof REPLY_TEMPLATES[template] === 'function' 
      ? (REPLY_TEMPLATES[template] as any)(...args)
      : REPLY_TEMPLATES[template];
    
    return composeReply(response);
  }
}