/**
 * Core webhook routes - modular refactoring of whatsapp-webhook-v3.routes.ts
 * Preserves ALL functionality while breaking into manageable modules
 */

import express from 'express';
import path from 'path';
import OpenAI from 'openai';
import crypto from 'crypto';

// External services
import { RealAvailabilityService } from '../../services/real-availability.service';
import { BusinessHoursService } from '../../services/business-hours.service';
import { ContextualUpsellService } from '../../services/contextual-upsell.service';
import { RetentionStrategyService, RetentionOffer } from '../../services/retention-strategy.service';
import { ContextualSuggestionsService, SuggestionContext } from '../../services/contextual-suggestions.service';
import { finalizeAndRespond } from '../../core/finalize';
import { AppointmentActionablesService } from '../../services/appointment-actionables.service';
import { MapsLocationService } from '../../services/maps-location.service';
import { handleIncomingMessage } from "../../services/message-handler";
import { WebhookV3FlowIntegrationService } from '../../services/webhook-v3-flow-integration.service';
import { WebhookFlowOrchestratorService } from '../../services/webhook-flow-orchestrator-refactored.service';
import { ConversationOutcomeAnalyzerService } from '../../services/conversation-outcome-analyzer.service';
import { VALID_CONVERSATION_OUTCOMES } from '../../types/billing-cron.types';

// Modular imports
import {
    config,
    logger,
    DEMO_PARITY,
    rateLimiter,
    validateDemoToken,
    validateWhatsAppSignature,
    handleWebhookVerification
} from './webhook-validation.middleware';
import {
    determineUserContext,
    mapIntentToConversationOutcome,
    ALLOWED_INTENTS,
    WebhookMessage,
    WebhookResponse
} from './webhook.types';
import {
    parseWebhookData,
    validateMessageData,
    ValidationService,
    SessionData,
    ParsedWebhookData
} from './webhook-message-parser';
import { cacheService, CacheService, TenantCache } from './webhook-cache.service';
import { DatabaseService } from './webhook-database.service';

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
        const distAgentsDir = path.join(__dirname, '../../services/agents');
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

interface ProcessingResult {
    success: boolean;
    response: string;
    action?: 'direct_response'|'llm_required'|'spam_detected'|'rate_limited'|'contextual_suggestion';
    metadata?: Record<string, any>;
}

// ===== Init =====
const router = express.Router();
const openai = new OpenAI({ apiKey: config.openai.apiKey });

// ===== Routes =====

// GET webhook verification
router.get('/webhook/whatsapp', handleWebhookVerification);

// POST webhook message handling
router.post('/webhook/whatsapp',
    validateDemoToken,
    validateWhatsAppSignature,
    rateLimiter,
    async (req: express.Request, res: express.Response) => {

    const startTime = Date.now();
    let sessionKey: string = '';
    let userPhone = '';
    let phoneNumberId = '';
    let messageText = '';
    let session: SessionData | null = null;
    let tenant: TenantCache | null = null;

    try {
        // ===== 1. PARSE WEBHOOK DATA =====
        const parsedData = parseWebhookData(req);
        if (!parsedData || !validateMessageData(parsedData)) {
            logger.warn('Invalid webhook data received');
            return res.status(200).json({ status: 'ignored' });
        }

        messageText = parsedData.messageText;
        userPhone = parsedData.userPhone;
        phoneNumberId = parsedData.whatsappNumber;
        const isDemo = parsedData.isDemo;
        const messageSource = parsedData.messageSource;

        sessionKey = `${phoneNumberId}:${userPhone}`;
        logger.info('Processing message', {
            phoneNumberId,
            userPhone,
            messageText: messageText.substring(0, 50) + '...',
            isDemo
        });

        // ===== 2. LOAD SESSION =====
        session = await cacheService.getSession(sessionKey) || {
            lastActivity: 0,
            messageCount: 0,
            spamScore: 0,
            history: [],
            demoMode: isDemo ? (req as any).demoMode : undefined
        };

        // Update session activity
        session.messageCount = (session.messageCount || 0) + 1;
        session.lastActivity = Date.now();

        // ===== 3. SPAM DETECTION =====
        if (ValidationService.detectSpam(messageText, session)) {
            session.spamScore = (session.spamScore || 0) + 1;
            await cacheService.setSession(sessionKey, session);

            if (session.spamScore > config.rateLimit.spamThreshold) {
                logger.warn('Spam detected', { userPhone, spamScore: session.spamScore });
                return res.status(200).json({
                    status: 'spam_detected',
                    response: 'Mensagem identificada como spam.'
                });
            }
        }

        // ===== 4. LOAD TENANT =====
        tenant = await cacheService.getTenant(phoneNumberId);
        if (!tenant) {
            const tenantData = await DatabaseService.findTenantByBusinessPhone(phoneNumberId);
            if (!tenantData) {
                logger.warn('Tenant not found', { phoneNumberId });
                return res.status(200).json({
                    status: 'tenant_not_found',
                    response: 'Estabelecimento não encontrado.'
                });
            }

            // Build tenant cache
            const services = await DatabaseService.listServices(tenantData.id);
            tenant = {
                id: tenantData.id,
                business_name: tenantData.business_name || 'Estabelecimento',
                domain: tenantData.domain || 'general',
                address: tenantData.address,
                payment_methods: tenantData.payment_methods,
                policies: tenantData.policies || {
                    reschedule: 'Política de remarcação não definida.',
                    cancel: 'Política de cancelamento não definida.',
                    no_show: 'Política de no-show não definida.'
                },
                business_description: tenantData.business_description,
                services
            };

            await cacheService.setTenant(phoneNumberId, tenant);
        }

        // ===== 5. INTENT DETECTION =====
        const detectedIntent = ValidationService.detectIntent(messageText);
        logger.info('Intent detected', { intent: detectedIntent, messageText });

        // ===== 6. USE WEBHOOK FLOW ORCHESTRATOR =====
        const orchestrator = new WebhookFlowOrchestratorService();

        const orchestratorInput = {
            messageText,
            userPhone,
            whatsappNumber: phoneNumberId,
            tenantId: tenant.id,
            messageSource: messageSource
        };

        logger.info('🚀 Calling WebhookFlowOrchestratorService', orchestratorInput);

        const result = await orchestrator.orchestrateWebhookFlow(orchestratorInput);

        logger.info('✅ WebhookFlowOrchestratorService completed', {
            success: result.success,
            responseLength: result.response?.length,
            shouldSendWhatsApp: result.shouldSendWhatsApp,
            error: result.error
        });

        if (!result.success) {
            logger.error('Orchestrator failed', { error: result.error });
            return res.status(200).json({
                status: 'error',
                response: 'Desculpe, ocorreu um erro interno. Tente novamente.'
            });
        }

        // ===== 7. UPDATE SESSION =====
        session.history.push(
            { role: 'user', content: messageText, timestamp: Date.now() },
            { role: 'assistant', content: result.response || '', timestamp: Date.now() }
        );

        // Keep last 10 messages
        if (session.history.length > 10) {
            session.history = session.history.slice(-10);
        }

        await cacheService.setSession(sessionKey, session);

        // ===== 8. DETERMINE CONVERSATION OUTCOME =====
        const conversationOutcome = mapIntentToConversationOutcome(
            detectedIntent || undefined,
            messageText,
            result.shouldSendWhatsApp || false
        );

        // ===== 9. RETURN RESPONSE =====
        const responseData = {
            status: 'success',
            response: result.response,
            shouldSendWhatsApp: result.shouldSendWhatsApp,
            conversationOutcome,
            processingTimeMs: Date.now() - startTime,
            metadata: {
                intent: detectedIntent,
                tenant: tenant.business_name,
                messageCount: session.messageCount,
                isDemo
            }
        };

        logger.info('Response sent', responseData);
        return res.status(200).json(responseData);

    } catch (error) {
        logger.error('Webhook processing error', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            sessionKey,
            userPhone,
            phoneNumberId,
            messageText: messageText?.substring(0, 100)
        });

        return res.status(200).json({
            status: 'error',
            response: 'Desculpe, ocorreu um erro interno. Tente novamente em alguns instantes.'
        });
    }
});

export default router;