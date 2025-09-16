/**
 * WhatsApp message parsing and extraction utilities
 */

import { logger } from './webhook-validation.middleware';
import { WebhookMessage } from '../../types';

export interface ParsedWebhookData {
    messageText: string;
    userPhone: string;
    whatsappNumber: string;
    isDemo: boolean;
    messageSource: 'whatsapp' | 'whatsapp_demo' | 'web' | 'api';
}

export interface SessionData {
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
        offers: any[];
        attempts: number;
    };
}

// ===== Validation / NLP =====
export class ValidationService {
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
        const m2 = text.match(/([A-ZÀ-Ú][\p{L}''´`-]+(?:\s+[A-ZÀ-Ú][\p{L}''´`-]+)+)/u);
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

/**
 * Parse incoming webhook data from WhatsApp or Demo
 */
export function parseWebhookData(req: any): ParsedWebhookData | null {
    try {
        const isDemo = !!(req as any).demoMode;

        if (isDemo) {
            // Demo mode parsing
            const body = req.body;
            return {
                messageText: body.message || body.text || '',
                userPhone: body.from || body.userPhone || '',
                whatsappNumber: body.to || body.whatsappNumber || '',
                isDemo: true,
                messageSource: 'whatsapp_demo'
            };
        }

        // WhatsApp webhook parsing
        const v = req.body || {};
        const entry = Array.isArray(v.entry) ? v.entry[0] : undefined;
        const change = entry && Array.isArray(entry.changes) ? entry.changes[0] : undefined;
        const value = change?.value || {};

        const msg = Array.isArray(value.messages) ? value.messages[0] : undefined;
        if (!msg) {
            logger.warn('No message found in webhook data');
            return null;
        }

        const messageText = msg.text?.body || msg.text || '';
        const userPhone = msg.from || '';
        const whatsappNumber = value.metadata?.phone_number_id || value.phone_number_id || '';

        if (!messageText || !userPhone) {
            logger.warn('Missing required message data', { messageText: !!messageText, userPhone: !!userPhone });
            return null;
        }

        return {
            messageText,
            userPhone,
            whatsappNumber,
            isDemo: false,
            messageSource: 'whatsapp'
        };

    } catch (error) {
        logger.error('Error parsing webhook data', { error });
        return null;
    }
}

/**
 * Validate that message contains required fields
 */
export function validateMessageData(data: ParsedWebhookData): boolean {
    return !!(data.messageText && data.userPhone);
}