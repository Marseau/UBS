"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const axios_1 = __importDefault(require("axios"));
class WhatsAppService {
    constructor() {
        this.apiVersion = 'v18.0';
        this.accessToken = process.env.WHATSAPP_TOKEN || '';
        this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
        this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
        if (!this.accessToken || !this.phoneNumberId) {
            console.warn('WhatsApp credentials not configured');
        }
    }
    async sendMessage(message) {
        try {
            const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
            const response = await axios_1.default.post(url, message, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('WhatsApp message sent:', response.data);
            return true;
        }
        catch (error) {
            console.error('Error sending WhatsApp message:', error);
            return false;
        }
    }
    async sendTextMessage(to, text, previewUrl = false) {
        const message = {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: {
                body: text,
                preview_url: previewUrl
            }
        };
        const success = await this.sendMessage(message);
        if (success) {
            await this.storeSystemMessage(to, text, 'text');
        }
        return success;
    }
    async sendButtonMessage(to, bodyText, buttons, headerText, footerText) {
        const message = {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: bodyText
                },
                action: {
                    buttons: buttons.map(btn => ({
                        type: 'reply',
                        reply: {
                            id: btn.id,
                            title: btn.title
                        }
                    }))
                }
            }
        };
        if (headerText) {
            message.interactive.header = {
                type: 'text',
                text: headerText
            };
        }
        if (footerText) {
            message.interactive.footer = {
                text: footerText
            };
        }
        return this.sendMessage(message);
    }
    async sendListMessage(to, bodyText, buttonText, sections, headerText, footerText) {
        const message = {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
                type: 'list',
                body: {
                    text: bodyText
                },
                action: {
                    button: buttonText,
                    sections: sections.map(section => ({
                        title: section.title,
                        rows: section.rows
                    }))
                }
            }
        };
        if (headerText) {
            message.interactive.header = {
                type: 'text',
                text: headerText
            };
        }
        if (footerText) {
            message.interactive.footer = {
                text: footerText
            };
        }
        return this.sendMessage(message);
    }
    verifyWebhook(mode, token, challenge) {
        const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('Webhook verified successfully');
            return challenge;
        }
        console.log('Webhook verification failed');
        return null;
    }
    async processWebhook(body) {
        try {
            console.log('Processing WhatsApp webhook:', JSON.stringify(body, null, 2));
            for (const entry of body.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'messages') {
                        const value = change.value;
                        if (value.messages) {
                            for (const message of value.messages) {
                                await this.handleIncomingMessage(message, value.contacts || []);
                            }
                        }
                        if (value.statuses) {
                            for (const status of value.statuses) {
                                await this.handleMessageStatus(status);
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error('Error processing WhatsApp webhook:', error);
            throw error;
        }
    }
    async handleIncomingMessage(message, contacts) {
        try {
            const contact = contacts.find(c => c.wa_id === message.from);
            const userName = contact?.profile?.name || 'Usuário';
            console.log(`New message from ${userName} (${message.from}):`, message);
            await this.storeConversationMessage(message, userName);
            const { onboardingFlowService } = await Promise.resolve().then(() => __importStar(require('./onboarding-flow.service')));
            const { phoneValidationService } = await Promise.resolve().then(() => __importStar(require('./phone-validation.service')));
            const defaultTenantId = process.env.DEFAULT_TENANT_ID;
            if (defaultTenantId) {
                const onboardingStatus = await phoneValidationService.getUserOnboardingStatus(message.from, defaultTenantId);
                if (onboardingStatus.needsOnboarding) {
                    if (!onboardingStatus.exists) {
                        await onboardingFlowService.startOnboarding(message.from, defaultTenantId, userName);
                        return;
                    }
                    else {
                        const messageText = this.extractMessageText(message);
                        const responseType = this.detectResponseType(message);
                        const onboardingResult = await onboardingFlowService.continueOnboarding(message.from, defaultTenantId, messageText, responseType);
                        if (onboardingResult.success && !onboardingResult.isCompleted) {
                            return;
                        }
                    }
                }
            }
            try {
                const aiService = new (await Promise.resolve().then(() => __importStar(require('./ai.service')))).AIService();
                await aiService.processIncomingMessage(message, contacts);
            }
            catch (aiError) {
                console.log('AI service not available, using basic response');
                await this.sendTextMessage(message.from, 'Olá! Recebi sua mensagem. Em que posso ajudar você?');
            }
        }
        catch (error) {
            console.error('Error handling incoming message:', error);
            await this.sendTextMessage(message.from, 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente em alguns instantes.');
        }
    }
    async handleMessageStatus(status) {
        console.log('Message status update:', status);
    }
    async storeConversationMessage(message, userName, tenantId, userId, intentDetected, confidenceScore, conversationContext) {
        try {
            const { conversationHistoryService } = await Promise.resolve().then(() => __importStar(require('./conversation-history.service')));
            const effectiveTenantId = tenantId || process.env.DEFAULT_TENANT_ID;
            if (!effectiveTenantId) {
                console.warn('No tenant ID available for storing conversation');
                return;
            }
            await conversationHistoryService.storeMessage(message, effectiveTenantId, userName, userId, intentDetected, confidenceScore, conversationContext);
        }
        catch (error) {
            console.error('Error storing conversation message:', error);
        }
    }
    async getConversationState(phoneNumber) {
        try {
            console.log('Getting conversation state for:', phoneNumber);
            return null;
        }
        catch (error) {
            console.error('Error getting conversation state:', error);
            return null;
        }
    }
    async updateConversationState(phoneNumber, step, context) {
        try {
            console.log('Updating conversation state:', {
                phone: phoneNumber,
                step,
                context
            });
        }
        catch (error) {
            console.error('Error updating conversation state:', error);
        }
    }
    async getMediaUrl(mediaId) {
        try {
            const url = `${this.baseUrl}/${mediaId}`;
            const response = await axios_1.default.get(url, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            return response.data.url || null;
        }
        catch (error) {
            console.error('Error getting media URL:', error);
            return null;
        }
    }
    async downloadMedia(mediaUrl) {
        try {
            const response = await axios_1.default.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        }
        catch (error) {
            console.error('Error downloading media:', error);
            return null;
        }
    }
    async sendTemplateMessage(to, templateName, templateData) {
        try {
            const message = {
                messaging_product: 'whatsapp',
                to,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: 'pt_BR'
                    },
                    components: [
                        {
                            type: 'body',
                            parameters: Object.values(templateData).map(value => ({
                                type: 'text',
                                text: value
                            }))
                        }
                    ]
                }
            };
            return this.sendMessage(message);
        }
        catch (error) {
            console.error('Error sending template message:', error);
            const fallbackMessage = this.buildFallbackBillingMessage(templateName, templateData);
            return this.sendTextMessage(to, fallbackMessage);
        }
    }
    buildFallbackBillingMessage(templateName, data) {
        const businessName = data.business_name || 'Sua empresa';
        const alertTitle = data.alert_title || 'Alerta de Assinatura';
        const alertMessage = data.alert_message || 'Verifique sua assinatura';
        const actionUrl = data.action_url || 'https://ubs.com/billing';
        const emoji = alertTitle.includes('🚨') ? '🚨' :
            alertTitle.includes('⚠️') ? '⚠️' : 'ℹ️';
        return `${emoji} *${alertTitle}*

Olá, ${businessName}!

${alertMessage}

✅ *Ação necessária:* Acesse seu painel de billing para resolver esta questão.

🔗 ${actionUrl}

---
_Mensagem automática do UBS_`;
    }
    extractMessageText(message) {
        switch (message.type) {
            case 'text':
                return message.text?.body || '';
            case 'button':
                return message.button?.payload || message.button?.text || '';
            case 'interactive':
                if (message.interactive?.button_reply) {
                    return message.interactive.button_reply.id;
                }
                else if (message.interactive?.list_reply) {
                    return message.interactive.list_reply.id;
                }
                return '';
            default:
                return `[${message.type.toUpperCase()}]`;
        }
    }
    detectResponseType(message) {
        switch (message.type) {
            case 'text':
                return 'text';
            case 'button':
            case 'interactive':
                if (message.interactive?.button_reply) {
                    return 'button';
                }
                else if (message.interactive?.list_reply) {
                    return 'list';
                }
                return 'button';
            default:
                return 'text';
        }
    }
    async storeSystemMessage(phoneNumber, messageContent, messageType = 'text', conversationContext) {
        try {
            const { conversationHistoryService } = await Promise.resolve().then(() => __importStar(require('./conversation-history.service')));
            const tenantId = process.env.DEFAULT_TENANT_ID;
            if (!tenantId) {
                console.warn('No tenant ID available for storing system message');
                return;
            }
            await conversationHistoryService.storeSystemMessage(tenantId, phoneNumber, messageContent, messageType, conversationContext);
        }
        catch (error) {
            console.error('Error storing system message:', error);
        }
    }
}
exports.WhatsAppService = WhatsAppService;
exports.default = WhatsAppService;
//# sourceMappingURL=whatsapp.service.js.map