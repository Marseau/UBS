
// 🔎 Helper para determinar contexto de usuário (novo, novo_no_tenant, existente)
async function determineUserContext(user: any, tenantId: string) {
  if (!user) return 'novo_user';
  if (user && !(user.tenants || []).includes(tenantId)) return 'novo_no_tenant';
  return 'existente';
}

// whatsapp-webhook.router.ts
import express from 'express';
import path from 'path';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import crypto from 'crypto';
import { RealAvailabilityService } from '../services/real-availability.service';
import { BusinessHoursService } from '../services/business-hours.service';
import { ContextualUpsellService } from '../services/contextual-upsell.service';
import { RetentionStrategyService, RetentionOffer } from '../services/retention-strategy.service';
import { ContextualSuggestionsService, SuggestionContext } from '../services/contextual-suggestions.service';
import { AppointmentActionablesService } from '../services/appointment-actionables.service';
import { MapsLocationService } from '../services/maps-location.service';
import Redis from 'ioredis';
import { supabaseAdmin } from '../config/database';
import { handleIncomingMessage } from "../services/message-handler";
import { WebhookV3FlowIntegrationService } from '../services/webhook-v3-flow-integration.service';
import { WebhookFlowOrchestratorService } from '../services/webhook-flow-orchestrator.service';
import { ConversationOutcomeAnalyzerService } from '../services/conversation-outcome-analyzer.service';
import { demoTokenValidator } from '../utils/demo-token-validator';
import { VALID_CONVERSATION_OUTCOMES } from '../types/billing-cron.types';

// ===== INTENT ALLOWLIST - Apenas UserIntents reais =====
const ALLOWED_INTENTS = new Set<string>([
  'greeting',
  'services', 
  'pricing',
  'availability',
  'my_appointments',
  'address',
  'business_hours',
  'cancel_appointment',  // Corrigido: 'cancel' → 'cancel_appointment'
  'reschedule',
  'confirm',
  'booking',             // Adicionado: core intent
  'error',
  'unknown',
  'general_inquiry'      // Fallback
]);


/**
 * Mapeia intent detectado para um conversation_outcome válido.
 */
function mapIntentToConversationOutcome(
  intent: string | undefined,
  text: string,
  shouldSendWhatsApp: boolean
): string {
  const DEFAULT_OUTCOME = 'info_request_fulfilled';

  if (!intent) {
    console.log('🔧 MAP DEBUG: No intent, retornando info_request_fulfilled');
    return DEFAULT_OUTCOME;
  }

  // Padrões diretos no texto
  const isCancel = /cancelar\s+([0-9a-fA-F-]{8,})/i.test(text);
  const isReschedule = /remarcar\s+([0-9a-fA-F-]{8,})/i.test(text);

  if (shouldSendWhatsApp && isCancel) {
    console.log('🔧 MAP DEBUG: appointment_cancelled');
    return 'appointment_cancelled';
  }
  if (shouldSendWhatsApp && isReschedule) {
    console.log('🔧 MAP DEBUG: appointment_rescheduled');
    return 'appointment_rescheduled';
  }

  switch (intent) {
    case 'my_appointments':   return 'appointment_inquiry';
    case 'services':          return 'service_inquiry';
    case 'pricing':           return 'price_inquiry';
    case 'address':           return 'location_inquiry';
    case 'business_hours':    return 'business_hours_inquiry';
    case 'booking':           return shouldSendWhatsApp ? 'appointment_created' : 'appointment_inquiry';
    case 'reschedule':        return 'appointment_modified';
    case 'cancel':            return 'appointment_cancelled';
    case 'confirm':           return 'appointment_confirmed';
    case 'personal_info':     return 'appointment_inquiry';
    case 'greeting':
    case 'policies':
    case 'payments':
    case 'handoff':
    case 'general':
    default:                  return DEFAULT_OUTCOME;
  }
}


 
/**
 * NOTA: Para validar a assinatura do WhatsApp corretamente,
 * garanta que este path receba RAW body:
 * app.use('/webhook/whatsapp', express.raw({ type: 'application/json' }));
 * (e use express.json() para o restante das rotas)
 */

// ===== Logger & Config =====
const logger = (() => {
    try {
        // Use pino if available at runtime; fallback to console otherwise
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const pino = require('pino');
        return pino({
            level: process.env.LOG_LEVEL || 'info',
            transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined
        });
    } catch {
        return {
            info: (...args: any[]) => console.log(...args),
            warn: (...args: any[]) => console.warn(...args),
            error: (...args: any[]) => console.error(...args)
        } as any;
    }
})();

const config = {
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '180'), // 🚀 OTIMIZAÇÃO #3: Reduzir tokens
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.6'),
        promptCostPer1k: parseFloat(process.env.OPENAI_PROMPT_COST_PER_1K || '0'),
        completionCostPer1k: parseFloat(process.env.OPENAI_COMPLETION_COST_PER_1K || '0')
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        sessionTtl: parseInt(process.env.SESSION_TTL || '3600'), // 1h
        cacheTtl: parseInt(process.env.CACHE_TTL || '300') // 5 min
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 min
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '20'),
        spamThreshold: parseInt(process.env.SPAM_THRESHOLD || '5')
    },
    whatsapp: {
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
        webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET || ''
    }
};

// ===== Demo Parity Flag =====
// Forçar paridade total: desativa prompts especiais em modo demo
const DEMO_PARITY = false;

// ===== Agent prompt loader (by domain) =====
function loadAgentSystemPromptByDomain(domain?: string): string | null {
    try {
        if (!domain) return null;
        const domainKey = String(domain).toLowerCase();
        const filenameMap: Record<string, { file: string; className: string }> = {
            beauty: { file: 'beauty-agent.js', className: 'BeautyAgent' },
            healthcare: { file: 'healthcare-agent.js', className: 'HealthcareAgent' },
            legal: { file: 'legal-agent.js', className: 'LegalAgent' },
            education: { file: 'education-agent.js', className: 'EducationAgent' },
            sports: { file: 'sports-agent.js', className: 'SportsAgent' },
            consulting: { file: 'consulting-agent.js', className: 'ConsultingAgent' },
            general: { file: 'general-agent.js', className: 'GeneralAgent' },
            other: { file: 'other-agent.js', className: 'OtherAgent' }
        };
        const meta = filenameMap[domainKey] || filenameMap['general'];
        if (!meta) return null;
        const distAgentsDir = path.join(__dirname, '../services/agents');
        const agentPath = path.join(distAgentsDir, meta.file);
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const mod = require(agentPath);
        const AgentCtor = mod && meta.className ? mod[meta.className] : null;
        if (!AgentCtor) return null;
        const instance = new AgentCtor();
        const agent = typeof instance.getAgent === 'function' ? instance.getAgent() : null;
        const systemPrompt: string | undefined = agent?.systemPrompt;
        return systemPrompt || null;
    } catch {
        return null;
    }
}

// ===== Init =====
const router = express.Router();
const openai = new OpenAI({ apiKey: config.openai.apiKey });
const redis = new Redis(config.redis.url);

// ===== Types =====
interface SessionData {
    name?: string;
    email?: string;
    gender?: string;
    firstTime?: boolean;
    inferredService?: string;
    preferredWindow?: 'manha' | 'tarde' | 'noite';
    preferredDayISO?: string;
    lastActivity: number;
    messageCount: number;
    spamScore: number;
    history: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
    demoMode?: any; // Demo mode payload from token
    onboardingCompleted?: boolean; // Track if onboarding is complete
    pendingConfirmation?: {
        type: 'create' | 'reschedule';
        appointmentId: string;
        dateTimeISO?: string;
        display?: string;
    };
    pendingRetention?: {
        appointmentId: string;
        offers: RetentionOffer[];
        attempts: number;
    };
}

interface TenantCache {
    id: string;
    business_name: string;
    domain: 'beauty'|'healthcare'|'legal'|'education'|'sports'|'consulting'|'general'|string;
    address?: string;
    payment_methods?: string[];
    policies: { reschedule: string; cancel: string; no_show: string; };
    business_description?: string;
    services: Array<{ name: string; duration?: string; price?: string }>;
}

interface ProcessingResult {
    success: boolean;
    response: string;
    action?: 'direct_response'|'llm_required'|'spam_detected'|'rate_limited'|'contextual_suggestion';
    metadata?: Record<string, any>;
}

// ===== Security: Rate Limit =====
const rateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    keyGenerator: (req) => {
        try {
            const v = (req as any).body || {};
            const entry = Array.isArray(v.entry) ? v.entry[0] : undefined;
            const change = entry && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
            const value = change?.value || {};
            const msg = Array.isArray(value.messages) ? value.messages[0] : undefined;
            const from = msg?.from || req.ip;
            return `whatsapp:${from}`;
        } catch { return `whatsapp:${req.ip}`; }
    },
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(200).json({ status: 'rate_limited', response: 'Muitas mensagens. Aguarde um momento.' });
    }
});

// ===== Security: Signature Validation (uses raw body) =====
function validateWhatsAppSignature(req: express.Request, res: express.Response, next: express.NextFunction) {
    // Bypass assinatura quando em modo DEMO (token válido)
    if ((req as any).demoMode) {
        logger.info('Bypassing WhatsApp signature due to valid x-demo-token');
        return next();
    }
    if (!config.whatsapp.webhookSecret) return next();
    const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;
    if (!sigHeader?.startsWith('sha256=')) {
        logger.warn('Missing/invalid signature header');
        return res.status(401).json({ error: 'Missing/invalid signature' });
    }
    // req.body deve ser Buffer (express.raw)
    const payload = req.body as Buffer;
    if (!Buffer.isBuffer(payload)) {
        logger.error('Signature validation requires raw Buffer body on this route');
        return res.status(500).json({ error: 'Server misconfiguration (raw body required)' });
    }
    const expected = crypto.createHmac('sha256', config.whatsapp.webhookSecret).update(payload).digest('hex');
    const provided = sigHeader.slice('sha256='.length);
    const ok = provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    return ok ? next() : res.status(401).json({ error: 'Invalid signature' });
}

// ===== Cache Service =====
class CacheService {
    private prefix = 'whatsapp:';
    
    async getSession(key: string): Promise<SessionData | null> {
        try {
            const data = await redis.get(`${this.prefix}session:${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get error', { key, error });
            return null;
        }
    }
    async setSession(key: string, data: SessionData): Promise<void> {
        try {
            await redis.setex(`${this.prefix}session:${key}`, config.redis.sessionTtl, JSON.stringify(data));
        } catch (error) {
            logger.error('Cache set error', { key, error });
        }
    }
    async getTenant(phoneNumberId: string): Promise<TenantCache | null> {
        try {
            const data = await redis.get(`${this.prefix}tenant:${phoneNumberId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error('Cache get tenant error', { phoneNumberId, error });
            return null;
        }
    }
    async setTenant(phoneNumberId: string, tenant: TenantCache): Promise<void> {
        try {
            await redis.setex(`${this.prefix}tenant:${phoneNumberId}`, config.redis.cacheTtl, JSON.stringify(tenant));
        } catch (error) {
            logger.error('Cache set tenant error', { phoneNumberId, error });
        }
    }
    async incrementSpamScore(key: string): Promise<number> {
        try {
            const score = await redis.incr(`${this.prefix}spam:${key}`);
            await redis.expire(`${this.prefix}spam:${key}`, 300);
            return score;
        } catch (error) {
            logger.error('Spam score increment error', { key, error });
            return 0;
        }
    }
}

// ===== Validation / NLP =====
class ValidationService {
    static extractEmail(text: string): string | undefined {
        const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        return match?.[0];
    }
    static extractName(text: string): string | undefined {
        const patterns = [/meu nome é\s+(.+)/i, /me chamo\s+(.+)/i, /sou\s+(.+)/i, /nome\s*:\s*(.+)/i];
        for (const p of patterns) {
            const m = text.match(p);
            if (m?.[1]) {
                const cleaned = m[1].replace(/\s*(e o seu\??|qual o seu\??|seu nome\??).*/i, '').trim();
                if (cleaned.length >= 3) return cleaned;
            }
        }
        const m2 = text.match(/([A-ZÀ-Ú][\p{L}’'´`-]+(?:\s+[A-ZÀ-Ú][\p{L}’'´`-]+)+)/u);
      return m2?.[1]?.trim();
      }
      static inferGenderFromName(name?: string): string | undefined {
      if (!name) return undefined;
      const first = name.split(/\s+/)[0]?.toLowerCase();
      if (!first) return undefined;
      if (/a$/.test(first)) return 'feminino';
      if (/o$/.test(first)) return 'masculino';
      return undefined;
      }
      static detectSpam(text: string, session: SessionData): boolean {
      const patterns = [
      /(.)\1{4,}/,
      /[🔥💰🎯]{3,}/,
      /\b(bitcoin|crypto|investimento|ganhe|dinheiro)\b/i,
      /https?:\/\/(?!wa\.me)/i
      ];
      return patterns.some(p => p.test(text)) || text.length > 500 || session.messageCount > 10;
      }
      static detectIntent(text: string): string | null {
      const t = text.toLowerCase().trim();
      
      // Menu rápido 1..5
      if (/^\s*1\s*$/.test(t)) return 'availability';
      if (/^\s*2\s*$/.test(t)) return 'my_appointments';
      if (/^\s*3\s*$/.test(t)) return 'cancel';
      if (/^\s*4\s*$/.test(t)) return 'reschedule';
      if (/^\s*5\s*$/.test(t)) return 'handoff';
      
      const intents: Record<string, RegExp> = {
      greeting: /(oi|ol[áa]|bom dia|boa tarde|boa noite)/i,
      services: /(servi[cç]os?|pre[çc]os?|valor(es)?|cat[aá]logo|quanto custa)/i,
      availability: /(disponibilidade|quando posso|hor[aá]rio|datas|agenda|tem.*vaga|amanh[ãa]|hoje|depois de amanh[ãa]|semana que vem)/i,
      my_appointments: /(meus agendamentos|tenho.*agendamento|o que marquei|ver agendamentos)/i,
      cancel: /(cancelar|desmarcar)/i,
      reschedule: /(remarcar|trocar hor[aá]rio|mudar hor[aá]rio)/i,
      policies: /(pol[ií]tica|no-?show)/i,
      handoff: /(atendente|humano|falar com.*pessoa)/i,
      address: /(endere[cç]o|onde fica|localiza[çc][ãa]o|como chegar|maps|google\s*maps|local\b)/i,
      payments: /(pagamento|pix|cart[aã]o|formas de pagamento)/i,
      business_hours: /(hor[áa]rios? de funcion|hor[áa]rio(s)? de atend|abre(m)?|fecha(m)?|funciona(m)?)/i,
      wrong_number: /(n[ãa]o sou.*cliente|mensagem (por )?engano|n[úu]mero errado|ligou errado|contato errado)/i,
      test_message: /(teste|ping|health\s*check)/i,
      booking_abandoned: /(deixa pra l[áa]|esquece|n[ãa]o quero mais|depois eu vejo|fica pra outra|agora n[ãa]o)/i,
      confirm: /(confirm(ar|ado)|ok[,\s].*marcar|fechado)/i,
      modify_appointment: /(trocar (servi[cç]o|profissional)|mudar (servi[cç]o|data|hora)|alterar agendamento)/i,
      noshow_followup: /(n[ãa]o compareci|no\s*show|faltei|n[ãa]o pude ir)/i
      };
      for (const [k, re] of Object.entries(intents)) if (re.test(text)) return k;
      return null; // nenhum regex bateu → deixa LLM decidir; se LLM não classificar, persistir NULL
      }
      }
      
      // ===== DB Service =====
      class DatabaseService {
      static async findTenantByBusinessPhone(phoneNumberId: string): Promise<any | null> {
      try {
      const digits = String(phoneNumberId || '').replace(/\D/g, '');
      const plusDigits = `+${digits}`;
        const { data: tenant, error } = await supabaseAdmin
        .from('tenants').select('*')
        .or(`whatsapp_phone.eq.${digits},whatsapp_phone.eq.${plusDigits}`)
        .single();
        if (!error && tenant) return tenant;
        
        const fb = await supabaseAdmin
        .from('tenants').select('*')
        .or(`phone.eq.${digits},phone.eq.${plusDigits}`)
        .single();
      if (!fb.error && fb.data) return fb.data;
      
      const j = await supabaseAdmin
        .from('tenants').select('*')
        .contains('whatsapp_numbers', [{ phone_number_id: digits }]);
      if (!j.error && j.data?.[0]) return j.data[0];
      
      return null;
      } catch (error) {
      logger.error('Database tenant search error', { phoneNumberId, error });
      return null;
      }
      }
      static async listServices(tenantId: string): Promise<Array<{ name: string; duration?: string; price?: string }>> {
      try {
      const { data, error } = await supabaseAdmin
        .from('services').select('*')
        .eq('tenant_id', tenantId).limit(200);
      if (error || !data) return [];
      return data.map((s: any) => ({
        name: s?.name || s?.title || 'Serviço',
        duration: s?.duration ?? s?.duration_minutes ?? s?.duration_min ?? s?.time ?? s?.length,
        price: s?.price ?? s?.value ?? s?.cost ?? s?.amount
      }));
      } catch (error) {
      logger.error('Database services error', { tenantId, error });
      return [];
      }
      }
      static async findUserByPhone(tenantId: string, phone: string): Promise<any | null> {
      try {
      const raw = String(phone || '').trim();
      const digits = raw.replace(/\D/g, '');
      const candidatesSet = new Set<string>();
      if (digits) {
        candidatesSet.add(digits);
        candidatesSet.add(`+${digits}`);
        if (digits.startsWith('55')) {
          const local = digits.slice(2);
          if (local) {
            candidatesSet.add(local);
            candidatesSet.add(`+${local}`);
          }
        } else {
          candidatesSet.add(`55${digits}`);
          candidatesSet.add(`+55${digits}`);
        }
      }
      const candidates = Array.from(candidatesSet);
      const orClause = candidates.map(v => `phone.eq.${v}`).join(',');
      // 1) Dentro do tenant
      const jt = await supabaseAdmin
        .from('users').select('id, name, email, phone, user_tenants!inner(tenant_id)')
        .eq('user_tenants.tenant_id', tenantId)
        .or(orClause)
        .limit(1).maybeSingle();
      if (!jt.error && jt.data) return jt.data;
      // 2) Fallback global
      const u = await supabaseAdmin
        .from('users').select('*')
        .or(orClause)
        .limit(1).maybeSingle();
      return u.data || null;
      } catch (error) {
      logger.error('Database user search error', { tenantId, phone, error });
      return null;
      }
      }
      static async listUserAppointments(tenantId: string, userId: string): Promise<any[]> {
      try {
      const { data } = await supabaseAdmin
        .from('appointments').select('*')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(20);
      return data || [];
      } catch (error) {
      logger.error('Database appointments error', { tenantId, userId, error });
      return [];
      }
      }

      static async upsertUserForTenant(tenantId: string, phone: string, session: SessionData): Promise<string | null> {
      try {
        const raw = String(phone || '').trim();
        const digits = raw.replace(/\D/g, '');
        const candidatesSet = new Set<string>();
        if (digits) {
          // Priorizar match exato primeiro
          candidatesSet.add(digits);
          candidatesSet.add(`+${digits}`);
          
          // Apenas adicionar variações se o número for válido (11+ dígitos)
          if (digits.length >= 11) {
            if (digits.startsWith('55')) {
              const local = digits.slice(2);
              if (local && local.length >= 10) {
                candidatesSet.add(local);
                candidatesSet.add(`+${local}`);
              }
            } else if (digits.length >= 10) {
              candidatesSet.add(`55${digits}`);
              candidatesSet.add(`+55${digits}`);
            }
          }
        }
        const candidates = Array.from(candidatesSet);
        const orClause = candidates.map(v => `phone.eq.${v}`).join(',');

        // Busca usuário existente globalmente
        const existing = await supabaseAdmin.from('users').select('*').or(orClause).limit(1).maybeSingle();
        let userId: string | null = existing.data?.id || null;

        // Cria ou atualiza usuário (aceita parciais: nome OU email)
        const payload: any = {
          name: session.name || existing.data?.name || null,
          email: session.email || existing.data?.email || null,
          phone: digits ? `+${digits}` : (existing.data?.phone || null),
          gender: session.gender || (existing.data as any)?.gender || null
        };
        if (!userId) {
          const ins = await supabaseAdmin.from('users').insert([payload]).select('id').single();
          if (ins.data?.id) userId = ins.data.id;
        } else {
          await supabaseAdmin.from('users').update(payload).eq('id', userId);
        }
        if (!userId) return null;

        // Vincula ao tenant em user_tenants se não existir
        const rel = await supabaseAdmin.from('user_tenants').select('tenant_id,user_id').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
        if (!rel.data) {
          await supabaseAdmin.from('user_tenants').insert([{ tenant_id: tenantId, user_id: userId }]);
        }
        return userId;
      } catch (error) {
        logger.error('Upsert user failed', { tenantId, phone, error });
        return null;
      }
      }
      
      
      static async cancelAppointment(tenantId: string, appointmentId: string): Promise<boolean> {
        try {
          const { error } = await supabaseAdmin
            .from('appointments')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('id', appointmentId);
          return !error;
        } catch (error) {
          logger.error('Database cancel appointment error', { tenantId, appointmentId, error });
          return false;
        }
      }
      static async rescheduleAppointment(tenantId: string, appointmentId: string, newDateTime: string): Promise<boolean> {
        try {
          const { error } = await supabaseAdmin
            .from('appointments')
            .update({ start_time: newDateTime, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId).eq('id', appointmentId);
          return !error;
        } catch (error) {
          logger.error('Database reschedule appointment error', { tenantId, appointmentId, error });
          return false;
        }
      }

      // ===== Conversation State Helpers =====
      static async setConversationAwaiting(tenantId: string, userId: string, ttlMs: number): Promise<void> {
        try {
          const expiresAt = new Date(Date.now() + ttlMs).toISOString();
          // Tipos gerados não incluem conversation_states; usar any para a tabela
          const existing: any = await (supabaseAdmin as any)
            .from('conversation_states')
            .select('id, current_state')
            .eq('tenant_id', tenantId)
            .eq('user_id', userId)
            .maybeSingle();
          if (existing.data?.id) {
            await (supabaseAdmin as any)
              .from('conversation_states')
              .update({ current_state: 'awaiting_user', expires_at: expiresAt, updated_at: new Date().toISOString() })
              .eq('id', existing.data.id);
          } else {
            await (supabaseAdmin as any)
              .from('conversation_states')
              .insert([{ tenant_id: tenantId, user_id: userId, current_state: 'awaiting_user', expires_at: expiresAt, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
          }
        } catch (error) {
          logger.error('Set conversation awaiting failed', { tenantId, userId, error });
        }
      }
      }
      
      // ===== Formatter =====
      class FormatterService {
      static formatServices(services: Array<{ name: string; duration?: string; price?: string }>): string {
      if (!services.length) return 'Infelizmente neste momento não possuo esta informação no sistema.';
      return services.slice(0, 8).map(s => {
      const meta = [s.duration, s.price].filter(Boolean).join(' | ');
      return meta ? `• ${s.name} — ${meta}` : `• ${s.name}`;
      }).join('\n');
      }
      static formatAppointments(list: any[]): string {
      if (!list.length) return 'Não encontrei agendamentos futuros no sistema.';
      return list.slice(0, 8).map(a => {
      const id = a?.id || '';
      const service = a?.service_name || a?.service?.name || 'Serviço';
      const professional = a?.professional_name || a?.professional?.name;
      const when = this.formatDateTime(a);
      return `• ${when} — ${service}${professional ? ` (${professional})` : ''}${id ? ` [ID ${id}]` : ''}`;
    }).join('\n');
    }
    static formatDateTime(a: any): string {
    const cands = [a?.start_time, a?.starts_at, a?.startsAt, a?.start, a?.date_time, a?.datetime];
    for (const c of cands) {
      if (!c) continue;
      const d = new Date(c);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      }
    }
    const date = a?.date || a?.day, time = a?.time || a?.hour;
    if (date && time) return `${date} ${time}`;
    if (date) return String(date);
    if (time) return String(time);
    return 'Data não disponível';
    }
    static parseDateTime(input: string): string | undefined {
    const m = input.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
    if (!m) return undefined;
    const [, d, mo, y, h, mi] = m;
    const year = y ? (y.length === 2 ? Number(`20${y}`) : Number(y)) : new Date().getFullYear();
        const date = new Date(year, Number(mo) - 1, Number(d), Number(h), Number(mi));
        return isNaN(date.getTime()) ? undefined : date.toISOString();
        }
        }
        
        // ===== Helpers: Availability & Fuzzy Service =====
        function inferDateAndWindow(text: string): { dateISO?: string; window?: 'manha'|'tarde'|'noite' } {
        const t = text.toLowerCase();
        const now = new Date();
        if (/\bhoje\b/.test(t)) return { dateISO: now.toISOString(), window: now.getHours()<12?'manha':now.getHours()<17?'tarde':'noite' };
        if (/\bamanh[ãa]\b/.test(t)) { const d = new Date(now); d.setDate(now.getDate()+1); return { dateISO: d.toISOString() }; }
        if (/\bdepois de amanh[ãa]\b/.test(t)) { const d = new Date(now); d.setDate(now.getDate()+2); return { dateISO: d.toISOString() }; }
        if (/semana que vem/.test(t)) { const d = new Date(now); d.setDate(now.getDate()+7); return { dateISO: d.toISOString() }; }
        let window: 'manha'|'tarde'|'noite'|undefined;
        if (/\bmanh[ãa]\b/.test(t)) window = 'manha';
        else if (/\btarde\b/.test(t)) window = 'tarde';
        else if (/\bnoite\b/.test(t)) window = 'noite';
        return { window };
        }
        
        // ✅ NOVO: Sistema REAL de availability - sem hardcoded!
        async function getRealAvailableSlots(tenantId: string, dateISO?: string, window?: 'manha'|'tarde'|'noite'): Promise<{
          success: boolean;
          slots: string[];
          message: string;
        }> {
          try {
            const availabilityService = new RealAvailabilityService();
            const result = await availabilityService.getRealAvailableSlots(tenantId, dateISO, window);
            
            if (result.success && result.slots.length > 0) {
              const slotsFormatted = result.slots.map(slot => slot.formatted);
              return {
                success: true,
                slots: slotsFormatted,
                message: availabilityService.formatSlotsForChat(result.slots)
              };
            } else {
              return {
                success: false,
                slots: [],
                message: result.message
              };
            }
          } catch (error) {
            console.error('❌ [WEBHOOK] Erro ao buscar slots reais:', error);
            return {
              success: false,
              slots: [],
              message: 'Erro ao consultar disponibilidade. Tente novamente.'
            };
          }
        }
        
        function fuzzyService(q: string, services: {name:string}[]): string | undefined {
        const s = q.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
        let best = { name: '', score: 0 };
        for (const it of services) {
        const n = (it.name||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
        let score = 0;
        if (n===s) score+=5;
        if (n.startsWith(s)||s.startsWith(n)) score+=3;
        if (n.includes(s)) score+=2;
        for (const w of s.split(/\s+/)) if (w && n.includes(w)) score+=1;
        if (score>best.score) best = { name: it.name, score };
        }
        return best.score>=3 ? best.name : undefined;
        }
        
        // ===== Message Processor =====
        class MessageProcessor {
        private flowIntegration: WebhookV3FlowIntegrationService;
        
        constructor(private cache: CacheService, private openai: OpenAI) {
            this.flowIntegration = new WebhookV3FlowIntegrationService();
        }
        
        async process(sessionKey: string, text: string, phoneNumberId: string, userPhone: string, demoPayload?: any): Promise<ProcessingResult> {
        try {
        // 0.5) CRÍTICO: Extrair tenantId do demo token ANTES de tudo
        let forcedTenantId: string | null = null;
        if (demoPayload) {
          forcedTenantId = demoPayload.tenantId || '09b7ebf5-a06f-4e24-bb8b-40fc6b59c05e';
          logger.info('🎭 [DEMO-EXTRACTION] Using tenantId from demo token', { 
            tenantId: forcedTenantId, 
            source: demoPayload.source,
            fromToken: !!demoPayload.tenantId 
          });
        }

        // 1) Session
        const session = await this.getOrCreateSession(sessionKey);
        
        // 2) Spam
        if (ValidationService.detectSpam(text, session)) {
        const spamScore = await this.cache.incrementSpamScore(userPhone);
        logger.warn('Spam detected', { userPhone, spamScore, t: text.slice(0, 80) });
        if (spamScore > config.rateLimit.spamThreshold) {
          return { success: false, response: 'Detectamos atividade suspeita. Entre em contato pelo site oficial.', action: 'spam_detected' };
        }
        }
        
        // 3) Update session from msg
        this.updateSessionFromMessage(session, text);
        
        // 3.5) Add demo mode info to session for Flow Lock detection
        if (demoPayload) {
          session.demoMode = demoPayload;
        }
        
        // 4) Intent - REMOVIDO: agora será detectado pelo Flow Lock System
        // let intent = ValidationService.detectIntent(text);
        // Detecção de intent movida para flowIntegration.processWithFlowLockOrFallback()
        const intent = null; // Forçar detecção correta de intent - sem placeholders
        // Confirmação explícita (confirmo/ciente/de acordo/ok/👍/✅) quando há pendingConfirmation
        if (/\b(confirm(o|ado)?|ciente|de acordo|ok)\b|[👍✅]/i.test(text)) {
          if (session.pendingConfirmation?.appointmentId) {
            const display = session.pendingConfirmation.display || 'agendamento';
            // Limpa pendingConfirmation da sessão e persiste
            session.pendingConfirmation = undefined;
            await cache.setSession(sessionKey, session);
            return { success: true, response: `Confirmação registrada: ${display}. Nos vemos lá!`, action: 'direct_response', metadata: { intent: 'confirm', outcome: 'appointment_confirmed' } };
          }
        }

        // Processar respostas às ofertas de retenção
        if (session.pendingRetention?.appointmentId) {
          const retentionResponse = this.processRetentionResponse(text, session.pendingRetention);
          if (retentionResponse) {
            if (retentionResponse.action === 'accept_offer') {
              // Cliente aceitou uma oferta - cancelar retenção
              session.pendingRetention = undefined;
              await cache.setSession(sessionKey, session);
              return { 
                success: true, 
                response: retentionResponse.message, 
                action: 'direct_response', 
                metadata: { intent: 'retention_accepted', outcome: 'retention_successful' }
              };
            } else if (retentionResponse.action === 'decline_all') {
              // Cliente recusou todas as ofertas - proceder com cancelamento
              const appointmentId = session.pendingRetention.appointmentId;
              const tenant = await this.getTenantFromCache(phoneNumberId);
              
              if (tenant) {
                const ok = await DatabaseService.cancelAppointment(tenant.id, appointmentId);
                
                // Log retenção falhada
                const retentionService = new RetentionStrategyService();
                await retentionService.logRetentionAttempt(
                  { tenantId: tenant.id, appointmentId }, 
                  session.pendingRetention.offers, 
                  'lost'
                );
                
                session.pendingRetention = undefined;
                await cache.setSession(sessionKey, session);
                
                return { 
                  success: ok, 
                  response: ok ? `Agendamento [ID ${appointmentId}] cancelado. Esperamos te ver em breve! 😊` : `Erro ao cancelar. Tente novamente.`, 
                  action: 'direct_response',
                  metadata: { intent: 'cancel_confirmed', outcome: 'appointment_cancelled' }
                };
              }
            }
            // Se não foi uma resposta definitiva, continuar processamento normal
          }
        }
        
        // 5) Direct commands (cancel/remarcar/address/payments)
        const direct = await this.processDirectCommands(sessionKey, text, phoneNumberId, intent || 'unknown', session);
        if (direct) {
        this.captureUsageOnlyAsync(sessionKey, session, text);
        await this.updateSessionHistory(sessionKey, session, text, direct.response);
        return direct;
        }
        
        // 6) Tenant & user context (with forced tenantId from demo token)
        const tenantData = await this.getTenantData(phoneNumberId, intent || 'unknown', userPhone, forcedTenantId);
        
        // 6.1) Interceptar MY_APPOINTMENTS para usar actionables estruturados
        const intentCheck = ValidationService.detectIntent(text);
        
        // Verificar se é uma ação de agendamento (cancelar_123, remarcar_456, etc.)
        const actionMatch = text.match(/^(cancelar|remarcar|detalhes|confirmar)_([a-f0-9-]{36})/i);
        if (actionMatch && tenantData?.tenant?.id && tenantData?.user?.id) {
          const [, action, appointmentId] = actionMatch;
          console.log('🎯 [APPOINTMENT_ACTION] Processando ação estruturada:', { action, appointmentId });
          try {
            const actionablesService = new AppointmentActionablesService();
            const actionResult = await actionablesService.processSelectedAction(
              tenantData.tenant.id,
              tenantData.user.id,
              appointmentId || '',
              (action || '').toLowerCase()
            );
            
            if (actionResult.success) {
              await this.updateSessionHistory(sessionKey, session, text, actionResult.message);
              return { 
                success: true, 
                response: actionResult.message, 
                action: 'direct_response', 
                metadata: { intent: `appointment_${action}`, tenantId: tenantData.tenant.id } 
              };
            }
          } catch (error) {
            console.error('❌ [APPOINTMENT_ACTION] Erro ao processar ação:', error);
            // Continua para o Flow Lock como fallback
          }
        }
        
        // Interceptar MY_APPOINTMENTS para listar agendamentos
        if (intentCheck === 'my_appointments' && tenantData?.tenant?.id && tenantData?.user?.id) {
          console.log('🗓️ [MY_APPOINTMENTS] Interceptado para actionables estruturados');
          try {
            const actionablesService = new AppointmentActionablesService();
            const actionablesResult = await actionablesService.getAppointmentsWithActionables(
              tenantData.tenant.id,
              tenantData.user.id
            );
            
            if (actionablesResult.success) {
              await this.updateSessionHistory(sessionKey, session, text, actionablesResult.message);
              return { 
                success: true, 
                response: actionablesResult.message, 
                action: 'direct_response', 
                metadata: { intent: 'my_appointments', tenantId: tenantData.tenant.id } 
              };
            }
          } catch (error) {
            console.error('❌ [MY_APPOINTMENTS] Erro ao processar actionables:', error);
            // Continua para o Flow Lock como fallback
          }
        }
        
        // 6.5) Pre-declare variables for context blocks
        let availabilityBlock = '';
        let businessHoursBlock = '';
        let upsellBlock = '';
        // 6.1) Forçar saudação com nome quando usuário existir
        // Detectar saudação por conteúdo da mensagem
        if (/\b(ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite|hey|hello)/i.test(text) && tenantData?.tenant?.id) {
          const user = await DatabaseService.findUserByPhone(tenantData.tenant.id, userPhone);
          const firstName = (user?.name || session.name || '').split(/\s+/)[0] || '';
          if (firstName) {
            session.name = firstName;
            await cache.setSession(sessionKey, session);
            const greet = this.greetingByTime(tenantData.tenant.business_name, firstName);
            return { success: true, response: `${greet} Como posso te ajudar?`, action: 'direct_response', metadata: { intent: 'greeting', tenantId: tenantData.tenant.id } };
          }
        }
        
        // 7) Availability (fallback) precompute
        // Detectar consulta de disponibilidade por conteúdo
        if (/\b(disponibilidade|dispon[íi]vel|hor[aá]rio|agenda|vaga|marcar)/i.test(text)) {
          const { dateISO, window } = inferDateAndWindow(text);
          if (window && !session.preferredWindow) session.preferredWindow = window;
          if (dateISO && !session.preferredDayISO) session.preferredDayISO = dateISO;
          
          // Usar sistema real de availability (não hardcoded)
          const realAvailability = new RealAvailabilityService();
          const availabilityResult = await realAvailability.getRealAvailableSlots(
            tenantData?.tenant?.id || '',
            session.preferredDayISO,
            session.preferredWindow
          );
          
          if (availabilityResult.success && availabilityResult.slots.length > 0) {
            const slots = availabilityResult.slots.map(slot => slot.formatted);
            availabilityBlock = `Tenho: ${slots.join(', ')}. Algum funciona?`;
          }
        }

        // 8) Business Hours (precompute real hours)
        // Detectar consulta de horários de funcionamento
        if (/(hor[áa]rios? de funcion|hor[áa]rios? de atend|hor[áa]rio de funcion|hor[áa]rio de atend|que horas (abre|fecha|funciona)|quando (abre|fecha|funciona))/i.test(text)) {
          const businessHoursService = new BusinessHoursService();
          const businessHoursResult = await businessHoursService.getBusinessHours(
            tenantData?.tenant?.id || ''
          );
          
          if (businessHoursResult.success) {
            businessHoursBlock = businessHoursResult.formatted_message;
          }
        }

        // 9) Contextual Upsell (precompute when services are mentioned)
        if (/(serviço|preço|valor|custo|quanto custa|lista|opções)/i.test(text) && tenantData?.tenant?.services?.length) {
          const upsellService = new ContextualUpsellService();
          
          // Verificar elegibilidade para upsell
          const isEligible = tenantData?.user?.id ? 
            await upsellService.isEligibleForUpsell(tenantData.tenant.id, tenantData.user.id) : 
            true;

          if (isEligible) {
            const upsellContext = {
              tenantId: tenantData.tenant.id,
              userId: tenantData?.user?.id,
              currentService: session.inferredService,
              userProfile: {
                gender: session.gender,
                previousServices: [], // TODO: implementar histórico
                spendingPattern: 'standard' as const // TODO: analisar padrão baseado em histórico
              },
              sessionContext: {
                mentionedServices: session.inferredService ? [session.inferredService] : [],
                timeWindow: session.preferredWindow
              }
            };

            const upsellResult = await upsellService.detectUpsellOpportunities(upsellContext);
            if (upsellResult.success && upsellResult.opportunities.length > 0) {
              upsellBlock = upsellResult.contextualMessage;
            }
          }
        }
      
      // 10) Fuzzy service inference
      if ((tenantData?.tenant as any)?.services?.length) {
        const f = fuzzyService(text, (tenantData!.tenant as any).services);
        if (f) session.inferredService = f;
      }
      
      // 9) ONBOARDING MOVIDO PARA DEPOIS DO FLOW LOCK - permitir intent detection primeiro
      // TODO: Aplicar onboarding apenas para intents greeting/general

      // 10) Garantir usuário no tenant após concluir onboarding (completo)
      let onboardingJustCompleted = false;
      try {
        const inferredGenderForUpsert = ValidationService.inferGenderFromName(session.name || '');
        if (tenantData?.tenant?.id && session.name && session.email && (session.gender || inferredGenderForUpsert)) {
          // Verificar se o onboarding acabou de ser completado
          const wasIncomplete = !session.onboardingCompleted;
          
          const ensuredUserId = await DatabaseService.upsertUserForTenant(tenantData.tenant.id, userPhone, session);
          if (ensuredUserId) {
            tenantData.user = { id: ensuredUserId, name: session.name, email: session.email, phone: userPhone, gender: session.gender };
            
            // Marcar onboarding como completo
            if (wasIncomplete) {
              session.onboardingCompleted = true;
              onboardingJustCompleted = true;
              console.log('🎯 [CONTEXTUAL-SUGGESTIONS] Onboarding completado - ativando sugestões contextuais');
            }
          }
        }
      } catch {
        // Ignore user initialization errors
      }

      // 10.1) Sistema de Sugestões Contextuais Inteligentes (pós-onboarding)
      if (onboardingJustCompleted && intent === 'greeting' && tenantData?.tenant?.id && tenantData?.user?.id) {
        console.log('🌟 [CONTEXTUAL-SUGGESTIONS] Gerando sugestões pós-onboarding');
        
        try {
          const suggestionsService = new ContextualSuggestionsService();
          
          // Construir contexto para sugestões
          const suggestionContext: SuggestionContext = {
            tenantId: tenantData.tenant.id,
            userId: tenantData.user.id,
            userName: session.name || 'Usuário',
            userGender: session.gender,
            tenantDomain: tenantData.tenant.domain || 'general',
            isBusinessHours: this.isWithinBusinessHours(),
            currentHour: new Date().getHours(),
            dayOfWeek: new Date().getDay(),
            tenantServices: (tenantData.tenant as any).services || [],
            userHistory: await suggestionsService.getUserHistory(tenantData.tenant.id, tenantData.user.id),
            activePromotions: await suggestionsService.getActivePromotions(tenantData.tenant.id)
          };

          const contextualSuggestion = await suggestionsService.generateContextualSuggestions(suggestionContext);
          const formattedSuggestion = suggestionsService.formatSuggestionForMessage(contextualSuggestion);

          console.log('✨ [CONTEXTUAL-SUGGESTIONS] Sugestão gerada:', {
            urgency: contextualSuggestion.urgencyLevel,
            showAvailability: contextualSuggestion.shouldShowAvailability,
            preview: formattedSuggestion.substring(0, 100) + '...'
          });

          // Retornar sugestão contextual em vez de processar com LLM
          await this.updateSessionHistory(sessionKey, session, text, formattedSuggestion);
          return { 
            success: true, 
            response: formattedSuggestion, 
            action: 'contextual_suggestion', 
            metadata: { 
              intent, 
              tenantId: tenantData.tenant.id,
              suggestionType: 'post_onboarding',
              urgencyLevel: contextualSuggestion.urgencyLevel
            }
          };
          
        } catch (error) {
          console.warn('⚠️ [CONTEXTUAL-SUGGESTIONS] Erro ao gerar sugestões, usando LLM fallback:', error);
          // Continuar com fluxo normal se der erro
        }
      }

      // 11) LLM response
      console.log('🔍 [DEBUG] Antes de processWithFlowLockOrFallback:', {
        intent,
        tenantId: tenantData?.tenant?.id,
        userId: tenantData?.user?.id,
        text: text.substring(0, 50)
      });
      const llmResponse = await this.flowIntegration.processWithFlowLockOrFallback(
      session, text, intent, tenantData, availabilityBlock, businessHoursBlock, upsellBlock,
      this.generateLLMResponse.bind(this)
    );
      console.log('🔍 [DEBUG] Após processWithFlowLockOrFallback:', {
        llmResponse: llmResponse.substring(0, 100),
        intent
      });
      
      // 12) History persist
      await this.updateSessionHistory(sessionKey, session, text, llmResponse);
      // (revertido) watchdog de inatividade removido
      // 12.1) Se houve remarcação direta, preparar pendingConfirmation
      // Detectar intenção de remarcação por conteúdo
      if (/\b(remarc|reagend|mud[ao]|altera|trocar|desmarca)/i.test(text) && (tenantData?.tenant?.id)) {
        const meta = (await cache.getSession(sessionKey) as any) || {};
        const md = (meta as any);
        // se a etapa anterior definiu metadata na rota, será usada no persist abaixo
      }
      
      return { success: true, response: llmResponse, action: 'llm_required', metadata: { intent, tenantId: tenantData?.tenant?.id } };
      
      } catch (error) {
      logger.error('Message processing error', { sessionKey, error });
      return { success: false, response: 'Desculpe, ocorreu um erro. Tente novamente em alguns instantes.', action: 'direct_response' };
      }
      }
      
      private async getOrCreateSession(sessionKey: string): Promise<SessionData> {
      let session = await this.cache.getSession(sessionKey);
      if (!session) {
      session = { lastActivity: Date.now(), messageCount: 0, spamScore: 0, history: [] };
      }
      session.lastActivity = Date.now();
      session.messageCount++;
      return session;
      }
      
      private updateSessionFromMessage(session: SessionData, text: string): void {
      const email = ValidationService.extractEmail(text);
      const name = ValidationService.extractName(text);
      const gender = ValidationService.inferGenderFromName(name || session.name);
      if (email && !session.email) session.email = email;
      if (name && !session.name) session.name = name;
      if (gender && !session.gender) session.gender = gender;
      if ((session.email || email) && session.firstTime === undefined) session.firstTime = true;
      }

      // Classificação de intenção via IA para fallback quando regex falhar
      private async classifyIntentWithLLM(text: string): Promise<string | null> {
        try {
          const keys = Array.from(ALLOWED_INTENTS).join(', ');
          const system = `Classifique a intenção do usuário entre: ${keys}. Responda apenas com a chave exata.`;
          const completion = await this.openai.chat.completions.create({
            model: config.openai.model,
            temperature: 0,
            max_tokens: 8,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: text }
            ]
          });
          const out = completion.choices?.[0]?.message?.content?.trim().toLowerCase();
          if (out && ALLOWED_INTENTS.has(out)) return out;
          return null;
        } catch {
          return null;
        }
      }
      
      /**
       * Processar resposta do usuário às ofertas de retenção
       */
      private processRetentionResponse(text: string, pendingRetention: { appointmentId: string; offers: RetentionOffer[]; attempts: number }): { action: 'accept_offer' | 'decline_all' | 'unclear'; message: string } | null {
        const normalizedText = text.toLowerCase().trim();

        // PRIMEIRO: Verificar respostas negativas EXPLÍCITAS (incluir "mesmo assim") - EXCLUINDO ambíguas
        if (/\b(nao|recuso|prefiro cancelar|quero cancelar|mesmo assim.*cancelar|mesmo assim.*vou cancelar)\b/.test(normalizedText) ||
            (/\b(não)\b/.test(normalizedText) && !/\b(não sei)\b/.test(normalizedText))) {
          return {
            action: 'decline_all',
            message: ''
          };
        }

        // SEGUNDO: Respostas positivas (aceitar ofertas) - excluindo aquelas que contêm negação
        if (/\b(sim|aceito|quero|vou|gostaria|me interessa|opção\s*[123]|reagendar|remarcar)\b/.test(normalizedText) && !/\b(mesmo assim|não|nao)\b/.test(normalizedText)) {
          // Detectar qual oferta específica
          let selectedOffer: RetentionOffer | undefined = undefined;
          if (/\b(opção\s*1|primeira|1)\b/.test(normalizedText) && pendingRetention.offers.length >= 1) {
            selectedOffer = pendingRetention.offers[0];
          } else if (/\b(opção\s*2|segunda|2)\b/.test(normalizedText) && pendingRetention.offers.length >= 2) {
            selectedOffer = pendingRetention.offers[1];
          } else if (/\b(opção\s*3|terceira|3)\b/.test(normalizedText) && pendingRetention.offers.length >= 3) {
            selectedOffer = pendingRetention.offers[2];
          } else if (pendingRetention.offers.length > 0) {
            // Se não especificou, usar primeira oferta
            selectedOffer = pendingRetention.offers[0];
          }

          if (selectedOffer) {
            return {
              action: 'accept_offer',
              message: `Perfeito! ${selectedOffer.title} foi aplicado ao seu agendamento. Nossa equipe entrará em contato para finalizar os detalhes. Obrigado por continuar conosco! 🤝`
            };
          }
        }

        // TERCEIRO: Respostas ambíguas/incertas (primeira tentativa) 
        if (/\b(não sei|talvez|outro|outra hora|depois|mais tarde|pensar)\b/.test(normalizedText)) {
          if (pendingRetention.attempts < 2) {
            return null; // Deixar processar normalmente e tentar entender novamente
          } else {
            // Após 2 tentativas com respostas ambíguas, assumir cancelamento
            return {
              action: 'decline_all',
              message: ''
            };
          }
        }

        // QUARTO: Outras respostas não compreendidas
        if (pendingRetention.attempts < 2) {
          return null; // Deixar processar normalmente e tentar entender novamente
        }

        // Se já tentou 2x e não compreendeu, assumir que quer cancelar
        return {
          action: 'decline_all',
          message: ''
        };
      }

      private async processDirectCommands(sessionKey: string, text: string, phoneNumberId: string, intent: string, session: SessionData): Promise<ProcessingResult | null> {
      const tenant = await this.getTenantFromCache(phoneNumberId);
      if (!tenant) return null;
      
      // Sistema de retenção em cancelamentos
		const __cancelMatch = text.match(/cancelar\s+([0-9a-fA-F-]{8,})/i);
		if (__cancelMatch) {
			const __id: string | undefined = __cancelMatch[1] ? String(__cancelMatch[1]) : undefined;
			if (__id) {
				// Primeiro, obter detalhes do agendamento
				const { data: appointmentData } = await supabaseAdmin
					.from('appointments')
					.select('id, service_id, professional_id, start_time, user_id, services(name, base_price)')
					.eq('tenant_id', tenant.id)
					.eq('id', __id)
					.single();

				if (!appointmentData) {
					return { success: false, response: `Não consegui localizar o agendamento [ID ${__id}]. Confira o ID e tente novamente.`, action: 'direct_response' };
				}

				// Buscar informações do usuário
				const { data: userData } = await supabaseAdmin
					.from('users')
					.select('id, name, email, phone')
					.eq('id', appointmentData.user_id)
					.single();

				// Configurar contexto de retenção
				const retentionService = new RetentionStrategyService();
				const retentionContext = {
					tenantId: tenant.id,
					userId: appointmentData.user_id,
					appointmentId: __id,
					appointmentDetails: {
						service: appointmentData.services?.name || 'Serviço',
						professional: 'Profissional', // Pode buscar depois se necessário
						datetime: new Date(appointmentData.start_time),
						value: parseFloat(String(appointmentData.services?.base_price || '0'))
					}
				};

				// Gerar estratégia de retenção
				const retentionResult = await retentionService.generateRetentionStrategy(retentionContext);

				if (retentionResult.shouldAttemptRetention) {
					// Tentar retenção - apresentar ofertas
					console.log(`🎯 [RETENTION] Tentativa de retenção para ${__id}`);
					
					// Marcar na sessão que há uma tentativa de retenção pendente
					session.pendingRetention = {
						appointmentId: __id,
						offers: retentionResult.offers,
						attempts: 1
					};
					await cache.setSession(sessionKey, session);

					return { 
						success: true, 
						response: retentionResult.retentionMessage, 
						action: 'direct_response',
						metadata: { intent: 'cancel_retention', outcome: 'retention_attempted' }
					};
				} else {
					// Proceder com cancelamento normal
					const ok = await DatabaseService.cancelAppointment(tenant.id, __id);
					if (ok) {
						await retentionService.logRetentionAttempt(retentionContext, [], 'lost');
					}
					return { success: ok, response: ok ? `Agendamento [ID ${__id}] cancelado. Precisa de mais algo?` : `Não consegui cancelar [ID ${__id}]. Confira o ID e tente novamente.`, action: 'direct_response' };
				}
			}
		}
		// Remarcação direta
		const __rescheduleMatch = text.match(/remarcar\s+([0-9a-fA-F-]{8,}).*?(?:para|em|->)\s*([\d/:.\-\s]{5,})/i);
		if (__rescheduleMatch) {
			const __id: string | undefined = __rescheduleMatch[1] ? String(__rescheduleMatch[1]) : undefined;
			const __whenText: string | undefined = __rescheduleMatch[2] ? String(__rescheduleMatch[2]) : undefined;
			const newISO = __whenText ? FormatterService.parseDateTime(__whenText) : undefined;
			if (__id && newISO) {
				const ok = await DatabaseService.rescheduleAppointment(tenant.id, __id, newISO);
				const when = new Date(newISO).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
				return { success: ok, response: ok ? `Proposta registrada: ${when}. Para confirmar, digite “confirmo”, “ciente” ou “de acordo”.` : `Não consegui remarcar. Verifique o formato da data (ex.: 22/08 15:00).`, action: 'direct_response', metadata: { outcome: ok ? 'appointment_rescheduled' : undefined, confirm_display: when, appointment_id: __id, confirm_required: ok } };
			}
		}
      // Endereço & Pagamentos (resposta direta se cadastrado)
      if (intent === 'address') {
      const addrObj: any = (tenant as any)?.business_address;
      const addrStr = tenant.address || (addrObj ? [addrObj?.street, addrObj?.number, addrObj?.city, addrObj?.state].filter(Boolean).join(', ') : undefined);
      if (addrStr) {
        this.captureUsageOnlyAsync(sessionKey, session, text);
        return { success: true, response: `Estamos em ${addrStr}. Precisa que eu envie o local no Maps?`, action: 'direct_response' };
      }
      }
      if (intent === 'payments' && tenant.payment_methods?.length) {
      this.captureUsageOnlyAsync(sessionKey, session, text);
      return { success: true, response: `Formas de pagamento: ${tenant.payment_methods.join(', ')}. Deseja ver os serviços?`, action: 'direct_response' };
    }
    // Consulta de preço (determinístico)
    try {
      const isPriceQuery = /(pre[çc]o|valor|quanto\s+(custa|sai|fica))/i.test(text);
      if ((intent === 'services' || intent === 'general') && isPriceQuery && Array.isArray(tenant.services) && tenant.services.length) {
        const serviceNames = tenant.services.map((s: any) => s?.name).filter(Boolean);
        let target = session.inferredService;
        if (!target) {
          const guess = fuzzyService(text, tenant.services as any);
          if (guess) target = guess;
        }
        if (!target) {
          const sample = serviceNames.slice(0, 3).join(', ');
          const ask = serviceNames.length ? `De qual serviço você quer o valor? (ex.: ${sample})` : 'De qual serviço você quer o valor?';
          return { success: true, response: ask, action: 'direct_response', metadata: { intent: 'services' } };
        }
        const found = (tenant.services as any[]).find(s => String(s?.name||'').toLowerCase() === String(target).toLowerCase())
          || (tenant.services as any[]).find(s => String(s?.name||'').toLowerCase().includes(String(target).toLowerCase()));
        const rawPrice = found?.price;
        const formatBRL = (p: any) => {
          const num = typeof p === 'number' ? p : parseFloat(String(p).replace(/[^0-9.,]/g,'').replace(',','.'));
          if (!isFinite(num)) return null;
          return num.toFixed(2).replace('.', ',');
        };
        if (rawPrice != null && rawPrice !== '') {
          const brl = formatBRL(rawPrice);
          const priceText = brl ? `R$ ${brl}` : 'Valor disponível no momento do agendamento';
          this.captureUsageOnlyAsync(sessionKey, session, text);
          return { success: true, response: `O ${target} sai por ${priceText}. Quer que eu verifique horários?`, action: 'direct_response', metadata: { intent: 'services', service: target } };
        }
        this.captureUsageOnlyAsync(sessionKey, session, text);
        return { success: true, response: `Para ${target}, o valor é sob consulta. Posso confirmar e te retorno, ou prefere que eu já veja horários?`, action: 'direct_response', metadata: { intent: 'services', service: target } };
      }
    } catch {}
    // Serviços (determinístico, sem LLM)
    if (intent === 'services' && Array.isArray(tenant.services) && tenant.services.length) {
      const names = tenant.services.map((s: any) => s?.name).filter(Boolean);
      const unique = Array.from(new Set(names));
      const top = unique.slice(0, 6);
      let list: string;
      if (top.length <= 1) {
        list = top[0];
      } else {
        list = top.slice(0, -1).join(', ') + ' e ' + top[top.length - 1];
      }
      const tail = unique.length > top.length ? ' e outros' : '';
      const phrase = top.length ? `Temos ${list}${tail}. Quer que eu veja horários ou valores de algum específico?` : 'Temos diversos serviços. Posso te enviar as opções conforme sua preferência (manhã, tarde ou noite)?';
      return { success: true, response: phrase, action: 'direct_response', metadata: { intent: 'services', tenantId: tenant.id } };
    }
    return null;
    }
    
    private async getTenantFromCache(phoneNumberId: string): Promise<TenantCache | null> {
    let tenantCache = await cache.getTenant(phoneNumberId);
    if (!tenantCache) {
      const t = await DatabaseService.findTenantByBusinessPhone(phoneNumberId);
      if (t) {
        const services = await DatabaseService.listServices(t.id);
        tenantCache = {
          id: t.id,
          business_name: t.business_name,
          domain: t.domain || 'general',
          address: t?.address || undefined,
          payment_methods: Array.isArray((t as any)?.payment_methods) ? (t as any).payment_methods : undefined,
          policies: {
            reschedule: t?.reschedule_policy || 'Remarcações até 24h antes sem custo.',
            cancel: t?.cancel_policy || 'Cancelamentos até 24h antes com reembolso integral.',
            no_show: t?.no_show_policy || 'Em caso de não comparecimento, poderá haver cobrança.'
          },
          business_description: (t as any)?.business_description || undefined,
          services
        };
        await cache.setTenant(phoneNumberId, tenantCache);
      }
    }
    return tenantCache;
    }
    
    private async getTenantData(phoneNumberId: string, intent: string, userPhone: string, forcedTenantId?: string | null) {
    // Se temos forcedTenantId do demo token, buscar tenant real
    if (forcedTenantId) {
      logger.info('🎭 [GET-TENANT-DATA] Using forced tenantId for demo', { forcedTenantId });
      
      // Buscar dados reais do tenant COM serviços (igual ao modo produção)
      const tenant = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('id', forcedTenantId)
        .single();
      
      if (!tenant.data) {
        logger.error('🚨 [GET-TENANT-DATA] Demo tenant not found', { forcedTenantId });
        return null;
      }
      
      // CARREGAR SERVIÇOS (igual ao getTenantFromCache)
      const services = await DatabaseService.listServices(forcedTenantId);
      
      // Criar objeto tenant com serviços (exatamente como em produção)
      const tenantWithServices = {
        ...tenant.data,
        services
      };
      
      return {
        tenant: tenantWithServices,
        user: null, 
        appointments: []
      };
    }

    const tenant = await this.getTenantFromCache(phoneNumberId);
    if (!tenant) return null;
    let user: any = null, appointments: any[] = [];
    if (['my_appointments', 'cancel', 'reschedule'].includes(intent)) {
      user = await DatabaseService.findUserByPhone(tenant.id, userPhone);
      if (user) appointments = await DatabaseService.listUserAppointments(tenant.id, (user as any)?.id);
    }
    return { tenant, user, appointments };
    }
    
    private greetingByTime(tenantName?: string, userName?: string) {
    const hr = new Date().getHours();
    const g = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    const who = userName ? `, ${userName}` : '!';
    const biz = tenantName ? ` Sou a assistente do ${tenantName}.` : '';
    return `${g}${who}${biz}`;
      }
      
      private async generateLLMResponse(session: SessionData, text: string, intent: string, tenantData: any, availabilityBlock: string, businessHoursBlock: string, upsellBlock: string): Promise<string> {
      const personas = {
      beauty: 'Tom acolhedor e elegante, foco em bem-estar estético.',
      healthcare: 'Calmo e responsável, foco em segurança.',
      legal: 'Formal e claro, sem aconselhamento definitivo.',
      education: 'Didático e motivador.',
      sports: 'Energético e pragmático.',
      consulting: 'Profissional e estratégico.',
      general: 'Cordial e prático.'
      } as const;
      
      const persona = personas[(tenantData?.tenant?.domain as keyof typeof personas) || 'general'];
      const sessionSummary = [
      session.name ? `Nome: ${session.name}` : undefined,
      session.email ? `Email: ${session.email}` : undefined,
      session.gender ? `Gênero: ${session.gender}` : undefined,
      session.firstTime !== undefined ? `Primeira vez: ${session.firstTime ? 'sim' : 'não'}` : undefined,
      session.inferredService ? `Serviço inferido: ${session.inferredService}` : undefined,
      session.preferredWindow ? `Janela: ${session.preferredWindow}` : undefined
    ].filter(Boolean).join(' | ');
    
    const greeting = this.greetingByTime(tenantData?.tenant?.business_name, session.name);
    const quickMenu = '';
    
    const contextBlocks: string[] = [];
    if (tenantData?.tenant?.services?.length) contextBlocks.push(`SERVIÇOS:\n${FormatterService.formatServices(tenantData.tenant.services)}`);
    if (tenantData?.appointments?.length) contextBlocks.push(`AGENDAMENTOS:\n${FormatterService.formatAppointments(tenantData.appointments)}`);
      if (['policies','cancel','reschedule'].includes(intent)) {
      const p = tenantData?.tenant?.policies;
      if (p) contextBlocks.push(`POLÍTICAS:\n• Remarcação: ${p.reschedule}\n• Cancelamento: ${p.cancel}\n• No-show: ${p.no_show}`);
    }
    if (availabilityBlock) contextBlocks.push(`DISPONIBILIDADE:\n${availabilityBlock}`);
    if (businessHoursBlock) contextBlocks.push(`HORÁRIOS DE FUNCIONAMENTO:\n${businessHoursBlock}`);
    if (upsellBlock) contextBlocks.push(`OPORTUNIDADE ESPECIAL:\n${upsellBlock}`);
    // Bloco ENDEREÇO (se disponível via address string ou business_address JSON)
    try {
      const addrObj: any = (tenantData?.tenant as any)?.business_address;
      const addrStr = tenantData?.tenant?.address || (addrObj ? [addrObj?.street, addrObj?.number, addrObj?.city, addrObj?.state].filter(Boolean).join(', ') : undefined);
      if (addrStr) contextBlocks.push(`ENDEREÇO:\n${addrStr}`);
    } catch {}
      
      // Parity mode + Universal prompts (primeira vez vs recorrente)
      const agentPrompt = DEMO_PARITY ? loadAgentSystemPromptByDomain(tenantData?.tenant?.domain) : null;
      const desc = (tenantData?.tenant as any)?.business_description ? String((tenantData?.tenant as any).business_description).replace(/\s+/g,' ').slice(0,160) : '';
      const positioning = desc ? `Posicionamento: ${desc}` : '';
      const userKnown = !!(tenantData?.user?.id);
      const hasName = !!(session.name || tenantData?.user?.name);
      const hasEmail = !!(session.email || tenantData?.user?.email);
      const inferredGender = ValidationService.inferGenderFromName(session.name || tenantData?.user?.name || '');
      const hasGender = !!(session.gender || inferredGender);
      const hasAppointments = Array.isArray(tenantData?.appointments) && tenantData.appointments.length > 0;
      const canReferencePastAppointments = userKnown && hasAppointments;
      let onboardingStage: 'need_name'|'need_email'|'need_gender'|null = null;
      if (!userKnown) {
        if (!hasName) onboardingStage = 'need_name';
        else if (!hasEmail) onboardingStage = 'need_email';
        else if (!hasGender) onboardingStage = 'need_gender';
      }

      const prelude = DEMO_PARITY ? '' : `${greeting}`;
      // 🎯 PROMPT EXECUTIVO – SaaS Honesto (Revisado)
      const universalFirstTime = [
        `Você é a assistente oficial do {business_name}. Seu papel é atender com clareza, honestidade e objetividade, sempre em tom natural.`,
        '⚠️ Nunca invente dados. Nunca prometa retorno. Nunca mencione atendente humano.',
        '',
        '🔑 Regras Gerais:',
        '1. Respostas curtas (1–2 frases).',
        '2. Sempre usar dados reais do BD.',
        '• Endereço, horários, preços, políticas, serviços, agendamentos.',
        '• Se o BD não tiver → responder exatamente: "Infelizmente neste momento não possuo esta informação no sistema."',
        '3. Proibido:',
        '• Menus numerados (1, 2, 3…)',
        '• Emojis de opção (1️⃣,2️⃣,3️⃣)',
        '• Frases vagas como "vou verificar e retorno" ou "vou encaminhar ao atendente"',
        '4. Fluxo Onboarding (apenas para novos usuários): coletar nome, e-mail e gênero (um por vez).',
        '',
        'Durante testes: Cada conversa deve ter ≥6 mensagens. 100% das respostas devem vir do BD ou da frase honesta padrão.',
        'Zero respostas inventadas. Zero atendentes humanos. Zero promessas de retorno.',
        positioning
      ].filter(Boolean).join('\n');
      const universalReturning = [
        `Você é a assistente oficial do {business_name}. Seu papel é atender com clareza, honestidade e objetividade, sempre em tom natural.`,
        '⚠️ Nunca invente dados. Nunca prometa retorno. Nunca mencione atendente humano.',
        '',
        'Cumprimente pelo nome (se existir) e finalize com: "Como posso te ajudar?"',
        'Respostas curtas (1–2 frases). Sempre usar dados reais do BD.',
        'Se o BD não tiver → responder exatamente: "Infelizmente neste momento não possuo esta informação no sistema."',
        'Não re-peça nome/e-mail/gênero se já existem.',
        positioning
      ].filter(Boolean).join('\n');

      const contextRules = [
        !canReferencePastAppointments ? 'Se não houver usuário conhecido nem histórico de agendamentos, NÃO mencione “agendamentos anteriores” e NÃO ofereça ver agendamentos.' : 'Se houver usuário conhecido e agendamentos, você pode oferecer ver agendamentos.',
      ].filter(Boolean).join('\n');

      const systemPrompt = [
        agentPrompt || (onboardingStage ? universalFirstTime : universalReturning),
        `Negócio: ${tenantData?.tenant?.business_name || 'N/D'}`,
        sessionSummary || 'Nenhum dado coletado ainda',
        prelude,
        contextRules,
        ...contextBlocks
      ].filter(Boolean).join('\n');
      
      const generalInstruction = onboardingStage ? 'Ofereça ajuda objetiva: serviços ou horários, em linguagem natural. Não mencione ver agendamentos.' : (canReferencePastAppointments ? 'Ofereça ajuda objetiva: serviços, horários ou ver agendamentos, em linguagem natural.' : 'Ofereça ajuda objetiva: serviços ou horários, em linguagem natural. Não mencione ver agendamentos.');

      // 📚 Instruções por Intent - SaaS Honesto
      const intentInstructions: Record<string, string> = {
      greeting: 'Cumprimente pelo nome (se existir) e finalize com: "Como posso te ajudar?"',
      services: 'Liste serviços reais em frases naturais. Se BD vazio → frase honesta padrão.',
      pricing: 'Informe valor real. Se não existir → "Para este serviço o valor não está cadastrado no sistema."',
      availability: 'Ofereça horários reais. Se não houver → frase honesta padrão.',
      my_appointments: 'Liste agendamentos reais. Se não houver → "Não encontrei agendamentos futuros no sistema."',
      cancel: 'Solicite ID real. Se não existir → "Este ID não foi encontrado no sistema."',
      reschedule: 'Solicite ID real. Se não existir → "Este ID não foi encontrado no sistema."',
      confirm: 'Aceite confirmações como "confirmo", "ciente", "ok", "✅".',
      address: 'Use endereço real do BD. Se não houver → frase honesta padrão.',
      payments: 'Liste métodos reais. Se não houver → frase honesta padrão.',
      business_hours: businessHoursBlock ? `Use os horários pré-computados disponíveis no contexto "HORÁRIOS DE FUNCIONAMENTO".` : 'Informe: "Os horários não estão configurados no sistema. Entre em contato para mais informações."',
      policies: 'Mostre políticas reais. Se não houver → frase honesta padrão.',
      handoff: 'Se houver outros canais (ex.: e-mail, telefone) → informe-os. Se não → frase honesta padrão.',
      noshow_followup: 'Explique brevemente a política cadastrada (se não houver → frase honesta padrão).',
      general: 'Se o usuário perguntar algo fora do escopo, responda: "Posso ajudar apenas com informações sobre serviços, horários e agendamentos."',
      wrong_number: 'Agradeça o aviso e encerre cordialmente.',
      test_message: 'Responda "ok, online" de forma amigável e curta.',
      booking_abandoned: 'Agradeça e encerre cordialmente; ofereça retomar quando quiser.',
      modify_appointment: 'Peça o ID e detalhe o que deseja alterar (serviço/profissional/data/hora).'
      };
      
      const history: ChatCompletionMessageParam[] = session.history.slice(-6).map(h => ({ role: h.role, content: h.content }));
      
      const objectiveKey = onboardingStage ? 'first_time' : (intent === 'greeting' ? 'returning' : intent);
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + '\n🚨 REFORÇO CRÍTICO: Toda resposta ou vem do BD, ou é a frase honesta padrão. NUNCA invente dados. NUNCA prometa retorno. NUNCA mencione atendente humano. Proibido usar menus numerados (1,2,3,4,5), emojis de opção (1️⃣,2️⃣,3️⃣) ou "escolha uma opção".' },
        ...history,
        { role: 'user', content: `${text}\n\n[OBJETIVO]: ${intentInstructions[objectiveKey as keyof typeof intentInstructions] || intentInstructions.general}` }
      ];
      
      // Timeout curto para UX responsiva
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      
      try {
      const before = Date.now();
      let completion;
      try {
        completion = await this.openai.chat.completions.create({
          model: config.openai.model,
          temperature: config.openai.temperature,
          max_tokens: config.openai.maxTokens,
          messages
        }, { signal: controller.signal as any });
      } catch (e: any) {
        const msg = e?.message || '';
        const code = e?.code || e?.error?.code || '';
        if (/model_not_found/i.test(code + ' ' + msg) || /does not have access to model/i.test(msg)) {
          completion = await this.openai.chat.completions.create({
            model: config.openai.model,
            temperature: config.openai.temperature,
            max_tokens: config.openai.maxTokens,
            messages
          }, { signal: controller.signal as any });
        } else {
          throw e;
        }
      }
      const latencyMs = Date.now() - before;
      // Anexar telemetria básica no session para usar adiante
      (session as any).__last_llm_stats = {
        prompt_tokens: (completion as any)?.usage?.prompt_tokens ?? null,
        completion_tokens: (completion as any)?.usage?.completion_tokens ?? null,
        total_tokens: (completion as any)?.usage?.total_tokens ?? null,
        latency_ms: latencyMs
      };
      // Salvar as estatísticas LLM no cache
      // Como não temos o sessionKey original, vamos criar um temporário com timestamp
      const tempSessionKey = `temp_llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        await cache.setSession(tempSessionKey, session);
        console.log('✅ Estatísticas LLM salvas no cache:', tempSessionKey);
      } catch (error) {
        console.log('⚠️ Erro ao salvar estatísticas LLM no cache:', error);
      }
      const raw = completion.choices?.[0]?.message?.content?.trim() || 'Como posso ajudar?';
      const cleaned = raw
        // remove menus numerados e emojis de opção
        .replace(/\b(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣)\b/g,'')
        .replace(/\b\d+\)\s*/g,'')
        // remove frases mecânicas de call-to-action
        .replace(/\bescolha uma opção[:,]?/gi,'')
        .replace(/\bop[çc][aã]o\s*\d+\b/gi,'')
        .replace(/\b(segue|seguem) as op[çc][oõ]es[:,]?/gi,'')
        // normaliza espaços
        .replace(/\s{2,}/g,' ')
        .trim();
      let final = cleaned.length ? cleaned : 'Como posso ajudar?';
      if (!canReferencePastAppointments) {
        final = final
          .replace(/\b(ver|verificar)\s+(seus|meus)?\s*agendamentos(?:\s+anteriores)?/gi, 'ver horários disponíveis')
          .replace(/\bagendamentos\s+anteriores\b/gi, 'horários disponíveis');
      }
      final = final.replace(/\s{2,}/g,' ').trim();
      return final;
      } catch (error) {
      logger.error('OpenAI completion error', { error });
      // Fallback ultra-curto (sem mencionar agendamentos)
      return availabilityBlock || 'Como posso te ajudar? Posso te mostrar os serviços ou ver horários.';
      } finally {
      clearTimeout(timeout);
      }
      }
      
      private async updateSessionHistory(sessionKey: string, session: SessionData, userMessage: string, aiResponse: string): Promise<void> {
      const ts = Date.now();
      session.history.push({ role: 'user', content: userMessage, timestamp: ts }, { role: 'assistant', content: aiResponse, timestamp: ts });
      session.history = session.history.slice(-8);
      await cache.setSession(sessionKey, session);
      }

      // Captura assíncrona de usage (tokens/custo) mesmo em respostas diretas  
      private captureUsageOnlyAsync(sessionKey: string, session: SessionData, text: string): void {
        // 🚀 OTIMIZAÇÃO #5: Amostragem durante burst testing (10% dos casos)
        const isBurstTest = sessionKey.includes('burst_') || sessionKey.includes('pico_');
        if (isBurstTest && Math.random() > 0.1) {
          return; // Skip 90% das chamadas durante burst
        }
        
        // Execute em background sem bloquear resposta
        setImmediate(async () => {
          try {
            const completion = await this.openai.chat.completions.create({
            model: config.openai.model,
            temperature: 0,
            max_tokens: 1,
            messages: [
              { role: 'system', content: 'Responda apenas com OK.' },
              { role: 'user', content: text || 'OK' }
            ]
          });
          (session as any).__last_llm_stats = {
            prompt_tokens: (completion as any)?.usage?.prompt_tokens ?? null,
            completion_tokens: (completion as any)?.usage?.completion_tokens ?? null,
            total_tokens: (completion as any)?.usage?.total_tokens ?? null,
            latency_ms: null
          };
          await cache.setSession(sessionKey, session);
          } catch (error) {
            logger.warn('Telemetry capture failed, non-blocking:', error);
          }
        });
      }

      /**
       * Verificar se estamos dentro do horário comercial (método simples)
       */
      private isWithinBusinessHours(): boolean {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0 = domingo, 1 = segunda, etc.
        
        // Horário comercial padrão: Segunda a Sexta, 8h às 18h
        const isWeekday = currentDay >= 1 && currentDay <= 5;
        const isBusinessHour = currentHour >= 8 && currentHour < 18;
        
        return isWeekday && isBusinessHour;
      }
    }
      
    // ===== Init Services =====
    const cache = new CacheService();
    const orchestrator = new WebhookFlowOrchestratorService();
    const outcomeAnalyzer = new ConversationOutcomeAnalyzerService();
    
    // ===== Middlewares =====
    router.use(demoTokenValidator.middleware());
    
    // Temporarily disable rate limiter for load testing
    if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== 'true') {
      router.use(rateLimiter);
    }
      
      // ===== Routes =====
      router.get('/status', (_req, res) => {
      res.json({ ok: true, service: 'whatsapp-webhook-v3', timestamp: new Date().toISOString(), version: '3.0.0' });
      });
      
      router.get('/webhook', (req, res) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      logger.info('WhatsApp webhook verified');
      res.status(200).send(challenge);
      } else {
      res.status(403).send('Forbidden');
      }
      });
      
      router.post('/webhook', validateWhatsAppSignature, async (req, res) => {
      const startTime = Date.now();
      try {
      // Idempotência por message.id
      // OBS: req.body está em Buffer; precisamos parsear para extrair message/id
      const parsed = JSON.parse((req.body as Buffer).toString('utf8') || '{}');
      const entry = Array.isArray(parsed.entry) ? parsed.entry[0] : undefined;
      const change = entry && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
      const value = change?.value || {};
      const message = Array.isArray(value.messages) ? value.messages[0] : undefined;
      
      if (!message) return res.status(200).json({ status: 'ignored', reason: 'no_message' });
      
      const msgId = message?.id;
      if (msgId) {
      const dedupKey = `whatsapp:dedup:${msgId}`;
      const wasSet = await redis.set(dedupKey, '1', 'EX', 600, 'NX');
      if (!wasSet) return res.status(200).json({ status: 'ignored', reason: 'duplicate' });
    }
    
    const text = (message?.text?.body || '').trim();
    const userPhone = message?.from || '';
    const phoneNumberId = value?.metadata?.phone_number_id || '';
    const messageTimestamp = message?.timestamp; // WhatsApp timestamp em segundos
    
    // ✅ VALIDAÇÃO: Verificar se timestamp do WhatsApp é válido
    if (messageTimestamp) {
      const timestampNum = parseInt(messageTimestamp);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const maxAgeSeconds = 24 * 60 * 60; // 24 horas
      
      if (isNaN(timestampNum) || timestampNum < 0 || timestampNum > nowSeconds + maxAgeSeconds) {
        logger.warn('⚠️ Timestamp do WhatsApp inválido ou muito antigo', {
          messageTimestamp,
          timestampNum,
          nowSeconds,
          diffSeconds: nowSeconds - timestampNum
        });
      }
    }
    
    const sessionKey = `${phoneNumberId}:${userPhone}`;

    logger.info('Processing message', { from: userPhone, to: phoneNumberId, textLength: text.length, sessionKey });

    // 🚨 TENANT RESOLUTION: Usar tenant resolvido pelo middleware
    const resolvedTenantId = (req as any).tenant_id;
    const tenantResolutionWarning = (req as any).tenant_resolution_warning;
    
    if (!resolvedTenantId) {
      logger.error('❌ Nenhum tenant resolvido pelo middleware', { userPhone, phoneNumberId });
      return res.status(500).json({ error: 'tenant_resolution_failed' });
    }
    
    // Verificar se precisa notificar sobre resolução ambígua
    if (tenantResolutionWarning && tenantResolutionWarning === 'ambiguous_phone_multiple_tenants_fallback') {
      logger.warn('⚠️ Tenant resolvido via fallback devido a ambiguidade', { 
        userPhone, 
        resolvedTenantId,
        warning: tenantResolutionWarning 
      });
    }
    
    // LEGACY: Manter compatibilidade temporária
    const actualTenantId = resolvedTenantId;
    
    // Tenant já foi resolvido pelo middleware - remover código legacy
    
    // 🔧 CRITICAL FIX: Criar usuário antes do orchestrator para evitar loop de onboarding
    try {
      if (actualTenantId && actualTenantId !== phoneNumberId) {
        const emptySession: SessionData = {
          lastActivity: Date.now(),
          messageCount: 0,
          spamScore: 0,
          history: []
        };
        await DatabaseService.upsertUserForTenant(actualTenantId, userPhone, emptySession);
        logger.info('User created/updated before orchestrator call', { userPhone, tenantId: actualTenantId });
      }
    } catch (error) {
      logger.error('Failed to create user before orchestrator', { error, userPhone, actualTenantId });
    }

    // 🗓️ INTERCEPTAR MY_APPOINTMENTS para actionables estruturados (antes do orchestrator)
    const intentCheck = ValidationService.detectIntent(text);
    
    // Verificar se é uma ação de agendamento estruturada (cancelar_123, remarcar_456, etc.)
    const actionMatch = text.match(/^(cancelar|remarcar|detalhes|confirmar)_([a-f0-9-]{36})/i);
    if (actionMatch && actualTenantId) {
      const [, action, appointmentId] = actionMatch;
      logger.info('🎯 [APPOINTMENT_ACTION] Processando ação estruturada', { action, appointmentId, tenantId: actualTenantId });
      
      try {
        // Buscar usuário para esta ação
        const user = await DatabaseService.findUserByPhone(actualTenantId, userPhone);
        if (user?.id) {
          const actionablesService = new AppointmentActionablesService();
          const actionResult = await actionablesService.processSelectedAction(
            actualTenantId,
            user.id,
            appointmentId || '',
            (action || '').toLowerCase()
          );
          
          if (actionResult.success) {
            logger.info('✅ [APPOINTMENT_ACTION] Ação processada com sucesso', { action, appointmentId });
            return res.status(200).json({
              status: 'success',
              response: actionResult.message,
              telemetry: { 
                intent: `appointment_${action}`, 
                confidence: 1.0,
                decision_method: 'appointment_actionables',
                processingTime: Date.now() - startTime
              }
            });
          }
        }
      } catch (error) {
        logger.error('❌ [APPOINTMENT_ACTION] Erro ao processar ação', { error, action, appointmentId });
        // Continua para o orchestrator como fallback
      }
    }
    
    // Interceptar MY_APPOINTMENTS para listar agendamentos estruturados
    if (intentCheck === 'my_appointments' && actualTenantId) {
      logger.info('🗓️ [MY_APPOINTMENTS] Interceptado para actionables estruturados', { tenantId: actualTenantId });
      
      try {
        // Buscar usuário para listar agendamentos
        const user = await DatabaseService.findUserByPhone(actualTenantId, userPhone);
        if (user?.id) {
          const actionablesService = new AppointmentActionablesService();
          const actionablesResult = await actionablesService.getAppointmentsWithActionables(
            actualTenantId,
            user.id
          );
          
          if (actionablesResult.success) {
            logger.info('✅ [MY_APPOINTMENTS] Actionables gerados com sucesso', { appointmentCount: actionablesResult.appointments?.length || 0 });
            return res.status(200).json({
              status: 'success',
              response: actionablesResult.message,
              telemetry: { 
                intent: 'my_appointments', 
                confidence: 1.0,
                decision_method: 'appointment_actionables',
                processingTime: Date.now() - startTime
              }
            });
          }
        }
      } catch (error) {
        logger.error('❌ [MY_APPOINTMENTS] Erro ao processar actionables', { error });
        // Continua para o orchestrator como fallback
      }
    }

    // 🗺️ INTERCEPTAR ADDRESS para Maps funcionais
    if (intentCheck === 'address' && actualTenantId) {
      logger.info('📍 [ADDRESS] Interceptado para Maps funcionais', { tenantId: actualTenantId });
      
      try {
        const mapsService = new MapsLocationService();
        const locationResult = await mapsService.processLocationRequest(actualTenantId, text);
        
        if (locationResult.success) {
          logger.info('✅ [ADDRESS] Maps processado com sucesso', { hasLocation: locationResult.hasLocation });
          return res.status(200).json({
            status: 'success',
            response: locationResult.message,
            telemetry: { 
              intent: 'address', 
              confidence: 1.0,
              decision_method: 'maps_integration',
              processingTime: Date.now() - startTime
            }
          });
        }
      } catch (error) {
        logger.error('❌ [ADDRESS] Erro ao processar Maps', { error });
        // Continua para o orchestrator como fallback
      }
    }
    
    const result = await orchestrator.orchestrateWebhookFlow(
      text,
      userPhone,
      actualTenantId,
      { domain: 'whatsapp', services: [], policies: {} },
      { session_id: sessionKey, demoMode: null }
    );
    
    // 🚀 OTIMIZAÇÃO #1: RESPOSTA PRIMEIRO, BANCO DEPOIS
    const processingTime = Date.now() - startTime;
    const response = {
      success: true,
      message: result.aiResponse,
      intent: result.telemetryData?.intent ?? null,
      outcome: null,
      decision_method: result.telemetryData?.decision_method ?? 'unknown',
      flow_state: null,
    };
    
    // Enviar resposta IMEDIATAMENTE
    res.status(200).json(response);

    console.log('🔍 ANTES do setImmediate - sobre para executar persistência');
    console.log('🔍 [DEBUG] CHAT RESPONSE:', response.message.substring(0, 100) + '...');
    
    // Capturar variáveis antes do setImmediate para evitar problemas de escopo
    const messageText = text;
    const aiResponse = result.aiResponse; // ✅ INTERFACE: usar result.aiResponse conforme interface
    const messagePhone = userPhone;
    
    console.log('🔍 [DEBUG] PERSIST CAPTURE:', aiResponse.substring(0, 100) + '...');
    
    // ===== Persistência ASSÍNCRONA em conversation_history (fire-and-forget) =====
    // ===== Capturas para persistência assíncrona (evitar undefined em escopo) =====
    const __persist_userContent: string = (messageText ?? '').toString();
    const __persist_aiContent: string = (aiResponse ?? '').toString();
    const __persist_userPhone: string = (messagePhone ?? '').toString();

    // SEPARAÇÃO: Métricas de Intent Detection (para linha do usuário)
    const __persist_intentLlm = (result?.llmMetrics as any) || {};
    
    // 🔍 DEBUG: Log estrutura das métricas para identificar problemas
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [METRICS DEBUG] LLM Metrics:', {
        llmMetrics: result?.llmMetrics,
        telemetryData: result?.telemetryData,
        intentDetected: result?.telemetryData?.intent,
        decisionMethod: result?.telemetryData?.decision_method
      });
    }
    
    const __persist_intentTokens: number = __persist_intentLlm.total_tokens ?? 0;
    const __persist_intentApiCost: number = __persist_intentLlm.api_cost_usd ?? 0;
    const __persist_intentProcessingCost: number = __persist_intentLlm.processing_cost_usd ?? 0;
    const __persist_intentModelUsed: string | null = __persist_intentLlm.model_used ?? null;
    const __persist_aiConfidence: number = result?.telemetryData?.confidence ?? 0;
    // ✅ CORREÇÃO: Flow Lock não deve anular persistência de intent
    // Intent Detection e Flow Lock são sistemas separados com responsabilidades distintas
    const __persist_intent: string | undefined = result?.telemetryData?.intent ?? undefined;
    
    // ✅ ADICIONAL: Persiste flow_state separadamente para analytics de fluxo
    const __persist_flow_state: string | undefined = result?.updatedContext?.flow_lock?.active_flow ?? undefined;

    // SEPARAÇÃO: Métricas de Response Generation (para linha da IA) - IMPLEMENTADO
    const __persist_responseTokens: number = result.llmMetrics?.total_tokens || 0;
    const __persist_responseApiCost: number = result.llmMetrics?.api_cost_usd || 0;
    const __persist_responseProcessingCost: number = result.llmMetrics?.processing_cost_usd || 0.00003;
    const __persist_responseModelUsed: string | null = result.telemetryData?.model_used || config.openai.model;
    
    // DEBUG: Verificar se as métricas estão chegando
    console.log('🔍 [METRICS DEBUG] AI Response Metrics:', {
      responseTokens: __persist_responseTokens,
      responseApiCost: __persist_responseApiCost,
      responseProcessingCost: __persist_responseProcessingCost,
      responseModelUsed: __persist_responseModelUsed,
      llmMetrics: result.llmMetrics
    });
    
    // === Captura demo token payload para persistência assíncrona ===
    const __persist_demoPayload = (req as any)?.demoMode ?? undefined;

    setImmediate(async () => {
      console.log('🔍 setImmediate executado para persistência');
      try {
        // 1) Resolver tenantId com prioridade ao DEMO token
        let tenantId: string | undefined = undefined;
        // a) DEMO: se veio no token, usar sempre
        if (__persist_demoPayload?.tenantId) {
          tenantId = __persist_demoPayload.tenantId;
        }
        // b) Contexto atualizado pelo orchestrator
        if (!tenantId && result.updatedContext?.tenant_id) {
          tenantId = result.updatedContext.tenant_id;
        }
        // c) Fallback: descobrir pelo phoneNumberId real do WhatsApp
        if (!tenantId && phoneNumberId) {
          try {
            const t = await DatabaseService.findTenantByBusinessPhone(phoneNumberId);
            if (t?.id) tenantId = t.id;
          } catch {}
        }
        if (!tenantId) {
          logger.error('❌ Persistência abortada: tenantId indefinido (verifique x-demo-token.tenantId ou phone_number_id)');
          return;
        }

        // 2) Garantir userId pelo telefone
        let userId: string | null = null;
        try {
          const u = await DatabaseService.findUserByPhone(tenantId, __persist_userPhone);
          if (u?.id) userId = u.id;
        } catch {}
        if (!userId) {
          try {
            const ensuredId = await DatabaseService.upsertUserForTenant(tenantId, __persist_userPhone, {} as any);
            if (ensuredId) userId = ensuredId;
          } catch (e) {
            logger.error('Failed to ensure minimal user for demo', { tenantId, userPhone: __persist_userPhone, error: e });
          }
        }
        if (!userId) {
          logger.error('❌ Persistência abortada: userId indefinido');
          return;
        }

        // 3) Session + duration_minutes (usar tempos do servidor para evitar drift do WhatsApp)
        const sessionDataForContext = (await cache.getSession(sessionKey) as any) || {};
        if (!sessionDataForContext.sessionStartMs) {
          sessionDataForContext.sessionStartMs = Date.now();
          await cache.setSession(sessionKey, sessionDataForContext);
        }
        const startedAtMs = Number(sessionDataForContext.sessionStartMs);
        const currentMessageMs = Date.now();
        const durationMinutes = Math.max(0, Math.floor((currentMessageMs - startedAtMs) / 60000));

        // Backward-compat: manter conversationId (session UUID) se já existir; senão criar
        if (!sessionDataForContext.conversationId) {
          sessionDataForContext.conversationId = crypto.randomUUID();
          await cache.setSession(sessionKey, sessionDataForContext);
        }
        const sessionUuid = String(sessionDataForContext.conversationId);

        // 4) Bases (NÃO colocar content/is_from_user/message_type aqui)
        const commonBase = {
          tenant_id: tenantId,
          user_id: userId,
          message_source: __persist_demoPayload ? 'whatsapp_demo' : 'whatsapp',
          created_at: new Date().toISOString(),
          conversation_outcome: null, // outcome final é resolvido por analisador/cron
          conversation_context: { 
            session_id: sessionUuid, 
            duration_minutes: durationMinutes,
            flow_state: __persist_flow_state 
          }
        } as const;

        // Ajuste de custo de processamento para Intent Detection (linha usuário)
        let __effective_intentProcessingCost = __persist_intentProcessingCost;
        if (!__persist_intentTokens || __persist_intentTokens === 0) {
          // custo mínimo de infra + inserts no BD para intent determinística
          __effective_intentProcessingCost = 0.00003; // 0.00002 infra + 0.00001 DB
        }

        // Ajuste de custo de processamento para Response Generation (linha IA)
        let __effective_responseProcessingCost = __persist_responseProcessingCost;
        if (!__persist_responseTokens || __persist_responseTokens === 0) {
          // custo mínimo de infra + inserts no BD para resposta
          __effective_responseProcessingCost = 0.00003; // 0.00002 infra + 0.00001 DB
        }

        // 5) Compor linhas finais
        // LINHA USUÁRIO: Métricas de Intent Detection (3 camadas)
        const userRow = {
          ...commonBase,
          content: __persist_userContent,
          is_from_user: true,
          message_type: 'text',
          intent_detected: __persist_intent ?? null,
          tokens_used: __persist_intentTokens, // Tokens da detecção de intent
          api_cost_usd: __persist_intentApiCost, // Custo LLM da detecção
          processing_cost_usd: __effective_intentProcessingCost, // Custo processamento intent
          model_used: __persist_intentModelUsed,
          confidence_score: __persist_aiConfidence
        };

        // LINHA IA: Métricas de Response Generation
        console.log('🔍 [DEBUG] DB INSERT AI CONTENT:', __persist_aiContent.substring(0, 100) + '...');
        const aiRow = {
          ...commonBase,
          content: __persist_aiContent,
          is_from_user: false,
          message_type: 'text',
          intent_detected: null, // Intent não é detectada na resposta da IA
          tokens_used: __persist_responseTokens, // Tokens da geração da resposta (futuro)
          api_cost_usd: __persist_responseApiCost, // Custo LLM da resposta (futuro)
          processing_cost_usd: __effective_responseProcessingCost, // Custo processamento resposta
          model_used: __persist_responseModelUsed,
          confidence_score: null // Confidence não se aplica à resposta
        };

        // 6) Inserir com retorno do ID
        const { data: insertedRows, error: chError } = await supabaseAdmin
          .from('conversation_history')
          .insert([userRow, aiRow])
          .select('id');
        
        if (chError) {
          logger.error('🚨 Insert conversation_history falhou', { error: chError });
          return;
        }
        console.log('✅ INSERT SUCESSO - Conversation history salva');
        logger.info('Conversation history persisted successfully', {
          sessionKey,
          tenantId,
          userId,
          intent: __persist_intent,
          tokensUsed: __persist_intentTokens
        });

        // 🎯 FINALIZAR OUTCOME se conversa foi finalizada
        if (result.conversationOutcome && result.conversationOutcome !== null && insertedRows && insertedRows.length > 1) {
          try {
            console.log(`🎯 [OUTCOME] Finalizando conversa com outcome: ${result.conversationOutcome}`);
            
            // Usar sessionKey (session_id_uuid) para finalizar outcome
            const outcomeResult = await outcomeAnalyzer.finalizeOutcome(
              sessionKey,
              result.conversationOutcome as any // cast para o tipo esperado
            );

            if (outcomeResult.success) {
              console.log(`✅ [OUTCOME] Outcome finalizado: ${result.conversationOutcome}`);
            } else {
              console.error(`❌ [OUTCOME] Falha ao finalizar outcome: ${result.conversationOutcome}`);
            }
          } catch (outcomeError) {
            console.error('❌ [OUTCOME] Erro ao finalizar outcome:', outcomeError);
          }
        }
      } catch (e) {
        logger.error('Failed to persist conversation_history', { error: e });
      }

      // Log de processamento (assíncrono)
      logger.info('Message processed (async)', {
        sessionKey,
        success: true,
        shouldSendWhatsApp: result.shouldSendWhatsApp,
        intent: result.telemetryData?.decision_method === 'flow_lock' ? null : result.telemetryData?.intent,
        tenantId: result.updatedContext?.tenant_id,
        model: config.openai.model
      });
    });

    // Resposta já foi enviada acima - função não precisa retornar mais nada
    return;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Webhook processing error', { error, processingTime });
    return res.status(200).json({ status: 'error', response: 'Ocorreu um erro interno. Nossa equipe foi notificada.', metadata: { processingTime } });
  }
});

// ===== Graceful Shutdown =====
async function shutdown(code = 0) {
  logger.info('Shutting down gracefully...');
  try { await redis.quit(); } catch {}
  process.exit(code);
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// ===== Pre-flight Warm-up =====
setImmediate(async () => {
  try {
    console.log('🔥 Executando pré-aquecimento controlado...');
    const cache = new CacheService();
    
    // 3 operações sintéticas para aquecer conexões/cache
    const warmupTasks = ['cache', 'redis', 'openai'];
    
    for (const task of warmupTasks) {
      try {
        await cache.getSession(`warmup:${task}`);
        console.log(`✅ Warm-up: ${task} - aquecido`);
      } catch (e: any) {
        console.log(`⚠️ Warm-up ${task}: ${e.message || 'ok'}`);
      }
    }
    console.log('✅ Pré-aquecimento concluído');
  } catch (e) {
    console.warn('⚠️ Warm-up falhou:', e);
  }
});

export default router;

// (revertido) watchdog removido
/* setInterval(async () => {
  try {
    const nowIso = new Date().toISOString();
    const { data: expired, error } = await (supabaseAdmin as any)
      .from('conversation_states')
      .select('id, tenant_id, user_id, current_state, expires_at')
      .lte('expires_at', nowIso)
      .in('current_state', ['awaiting_user','pinged_wait'] as any);
    if (error || !expired || !expired.length) return;
    for (const st of expired) {
      const tenantId: string = st.tenant_id;
      const userId: string = st.user_id;
      const state: string = st.current_state;
      if (state === 'awaiting_user') {
        try {
          await supabaseAdmin.from('conversation_history').insert([{
            tenant_id: tenantId,
            user_id: userId,
            content: 'Você ainda está aí? Se preferir, posso encerrar por aqui e retomamos quando quiser.',
            is_from_user: false,
            message_type: 'text',
            intent_detected: 'general_inquiry',
            conversation_outcome: null, // OUTCOMES DETERMINADOS PELO ConversationOutcomeAnalyzerService
            message_source: 'whatsapp_demo',
            model_used: 'system',
            created_at: new Date().toISOString(),
            conversation_context: { hint: 'inactivity_ping' }
          }]);
        } catch {}
        await (supabaseAdmin as any)
          .from('conversation_states')
          .update({ current_state: 'pinged_wait', expires_at: new Date(Date.now()+PING_GRACE_MS).toISOString(), updated_at: new Date().toISOString() })
          .eq('id', st.id as any);
        continue;
      }
      if (state === 'pinged_wait') {
        try {
          await supabaseAdmin.from('conversation_history').insert([{
            tenant_id: tenantId,
            user_id: userId,
            content: 'Conversa encerrada por inatividade. Podemos retomar quando quiser.',
            is_from_user: false,
            message_type: 'text',
            intent_detected: 'general_inquiry',
            conversation_outcome: null, // OUTCOMES DETERMINADOS PELO ConversationOutcomeAnalyzerService
            message_source: 'whatsapp_demo',
            model_used: 'system',
            created_at: new Date().toISOString(),
            conversation_context: { hint: 'inactivity_timeout' }
          }]);
        } catch {}
        await (supabaseAdmin as any)
          .from('conversation_states')
          .update({ current_state: 'idle', expires_at: null, updated_at: new Date().toISOString() })
          .eq('id', st.id as any);
      }
    }
  } catch (e) {
    logger.error('Inactivity watchdog error', { error: e });
    }
*/
