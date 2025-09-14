/**
 * Webhook validation and security middleware
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { demoTokenValidator } from '../../utils/demo-token-validator';

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

export const config = {
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
export const DEMO_PARITY = false;

// ===== Security: Rate Limit =====
export const rateLimiter = rateLimit({
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

// ===== Security: Demo Token Validation =====
export function validateDemoToken(req: express.Request, res: express.Response, next: express.NextFunction) {
    const demoToken = req.headers['x-demo-token'] as string;

    if (!demoToken) {
        // No demo token, proceed normally
        return next();
    }

    const payload = demoTokenValidator.validateToken(demoToken);
    if (!payload) {
        logger.warn('Invalid demo token provided');
        return res.status(401).json({
            error: 'Invalid demo token',
            code: 'DEMO_TOKEN_INVALID'
        });
    }

    // Attach demo mode to request
    (req as any).demoMode = payload;
    logger.info('🎭 Demo mode activated:', payload.source);
    return next();
}

// ===== Security: Signature Validation (uses raw body) =====
export function validateWhatsAppSignature(req: express.Request, res: express.Response, next: express.NextFunction) {
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

// ===== Webhook Verification (GET request) =====
export function handleWebhookVerification(req: express.Request, res: express.Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
        logger.info('WhatsApp webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        logger.warn('WhatsApp webhook verification failed');
        res.sendStatus(403);
    }
}

export { logger };