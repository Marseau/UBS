"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppAIAdapter = void 0;

const ai_complex_service_1 = require("../ai-complex.service");
const memory_service_1 = require("../memory.service");
const whatsapp_service_1 = require("../whatsapp.service");
const database_1 = require("../../config/database");

/**
 * WhatsApp AI Adapter
 * 
 * Professional adapter that bridges WhatsApp Business API with AI Complex Service.
 * Implements clean architecture patterns and enterprise-grade error handling.
 * 
 * Responsibilities:
 * - Convert WhatsApp message format to AI Complex format
 * - Build conversation context from WhatsApp data
 * - Execute AI actions (send messages, create appointments, etc.)
 * - Handle media processing and downloads
 * - Maintain conversation memory and state
 */
class WhatsAppAIAdapter {
    constructor() {
        this.aiService = new ai_complex_service_1.AIService();
        this.memoryService = new memory_service_1.MemoryService();
        this.whatsappService = new whatsapp_service_1.WhatsAppService();
        
        console.log('🤖 WhatsApp AI Adapter initialized with AI Complex Service');
    }

    /**
     * Main entry point for processing WhatsApp messages
     * Replaces the simple AI service with sophisticated AI processing
     */
    async processIncomingMessage(message, contacts, tenantId) {
        try {
            console.log('🔄 Processing WhatsApp message through AI Complex Adapter');
            
            // 1. Build conversation context
            const context = await this.buildConversationContext(message, tenantId);
            
            // 2. Extract message content and media
            const { messageText, mediaContent } = await this.extractMessageContent(message);
            
            // 3. Process through AI Complex Service
            const aiResult = await this.aiService.processMessage(messageText, context, mediaContent);
            
            // 4. Execute AI-generated actions
            await this.executeActions(aiResult.actions, message.from);
            
            // 5. Update conversation state
            await this.updateConversationState(message.from, tenantId, aiResult.updatedContext);
            
            console.log('✅ WhatsApp message processed successfully through AI Complex');
            return {
                success: true,
                response: aiResult.response,
                actions: aiResult.actions
            };
            
        } catch (error) {
            console.error('❌ Error in WhatsApp AI Adapter:', error);
            await this.handleAdapterError(error, message.from);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Build comprehensive conversation context for AI Complex Service
     */
    async buildConversationContext(message, tenantId) {
        try {
            const sessionId = `whatsapp_${message.from}_${tenantId}`;
            
            // Load tenant configuration
            const tenantConfig = await this.loadTenantConfig(tenantId);
            
            // Load user profile
            const userProfile = await this.loadUserProfile(message.from, tenantId);
            
            // Get conversation history
            const conversationHistory = await this.getConversationHistory(sessionId);
            
            // Get current intent from memory
            const memory = await this.memoryService.getMemoryManager(sessionId);
            const currentIntent = await memory.getContext('currentIntent');
            
            return {
                sessionId,
                userId: message.from,
                tenantId,
                phoneNumber: message.from,
                conversationHistory,
                userProfile,
                tenantConfig,
                currentIntent,
                lastInteraction: new Date(),
                messageTimestamp: new Date(parseInt(message.timestamp) * 1000),
                messageId: message.id
            };
            
        } catch (error) {
            console.error('Error building conversation context:', error);
            // Return minimal context as fallback
            return {
                sessionId: `whatsapp_${message.from}_${tenantId}`,
                userId: message.from,
                tenantId,
                phoneNumber: message.from,
                conversationHistory: [],
                lastInteraction: new Date()
            };
        }
    }

    /**
     * Extract message text and media content from WhatsApp message
     */
    async extractMessageContent(message) {
        let messageText = '';
        let mediaContent = [];

        try {
            // Extract text based on message type
            switch (message.type) {
                case 'text':
                    messageText = message.text?.body || '';
                    break;
                
                case 'button':
                    messageText = message.button?.payload || message.button?.text || '';
                    break;
                
                case 'interactive':
                    if (message.interactive?.type === 'button_reply') {
                        messageText = message.interactive.button_reply.title || '';
                    } else if (message.interactive?.type === 'list_reply') {
                        messageText = message.interactive.list_reply.title || '';
                    }
                    break;
                
                case 'image':
                    messageText = message.image?.caption || 'Imagem enviada';
                    if (message.image?.id) {
                        const mediaUrl = await this.whatsappService.getMediaUrl(message.image.id);
                        if (mediaUrl) {
                            const mediaBuffer = await this.whatsappService.downloadMedia(mediaUrl);
                            if (mediaBuffer) {
                                mediaContent.push({
                                    type: 'image',
                                    content: mediaBuffer,
                                    mimeType: message.image.mime_type || 'image/jpeg',
                                    caption: message.image.caption
                                });
                            }
                        }
                    }
                    break;
                
                case 'audio':
                    messageText = 'Áudio enviado';
                    if (message.audio?.id) {
                        const mediaUrl = await this.whatsappService.getMediaUrl(message.audio.id);
                        if (mediaUrl) {
                            const mediaBuffer = await this.whatsappService.downloadMedia(mediaUrl);
                            if (mediaBuffer) {
                                mediaContent.push({
                                    type: 'audio',
                                    content: mediaBuffer,
                                    mimeType: message.audio.mime_type || 'audio/ogg',
                                    duration: message.audio.duration
                                });
                            }
                        }
                    }
                    break;
                
                case 'document':
                    messageText = message.document?.caption || `Documento: ${message.document?.filename}`;
                    if (message.document?.id) {
                        const mediaUrl = await this.whatsappService.getMediaUrl(message.document.id);
                        if (mediaUrl) {
                            const mediaBuffer = await this.whatsappService.downloadMedia(mediaUrl);
                            if (mediaBuffer) {
                                mediaContent.push({
                                    type: 'document',
                                    content: mediaBuffer,
                                    mimeType: message.document.mime_type,
                                    filename: message.document.filename
                                });
                            }
                        }
                    }
                    break;
                
                default:
                    messageText = `Mensagem do tipo ${message.type} recebida`;
            }

            return { messageText, mediaContent };
            
        } catch (error) {
            console.error('Error extracting message content:', error);
            return { 
                messageText: 'Erro ao processar mensagem',
                mediaContent: [] 
            };
        }
    }

    /**
     * Execute actions generated by AI Complex Service
     */
    async executeActions(actions, phoneNumber) {
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'send_message':
                        await this.whatsappService.sendTextMessage(
                            phoneNumber,
                            action.payload.message
                        );
                        break;
                    
                    case 'send_button_message':
                        await this.whatsappService.sendButtonMessage(
                            phoneNumber,
                            action.payload.message,
                            action.payload.buttons,
                            action.payload.header,
                            action.payload.footer
                        );
                        break;
                    
                    case 'send_list_message':
                        await this.whatsappService.sendListMessage(
                            phoneNumber,
                            action.payload.message,
                            action.payload.buttonText,
                            action.payload.sections,
                            action.payload.headerText,
                            action.payload.footerText
                        );
                        break;
                    
                    case 'create_appointment':
                        // Integration with appointment service would go here
                        console.log('📅 Creating appointment:', action.payload);
                        break;
                    
                    case 'escalate_to_human':
                        console.log('👤 Escalating to human:', action.payload);
                        await this.whatsappService.sendTextMessage(
                            phoneNumber,
                            '👤 Transferindo para atendimento humano. Aguarde um momento...'
                        );
                        break;
                    
                    case 'log_interaction':
                        // Log interaction for analytics
                        console.log('📊 Logging interaction:', action.payload);
                        break;
                    
                    default:
                        console.warn('Unknown action type:', action.type);
                }
                
            } catch (actionError) {
                console.error(`Error executing action ${action.type}:`, actionError);
                // Continue with other actions even if one fails
            }
        }
    }

    /**
     * Load tenant configuration for AI context
     */
    async loadTenantConfig(tenantId) {
        try {
            const { data: tenant, error } = await database_1.supabase
                .from('tenants')
                .select(`
                    id, slug, business_name, domain, 
                    ai_settings, business_hours, email, phone, whatsapp_phone
                `)
                .eq('id', tenantId)
                .eq('status', 'active')
                .single();

            if (error || !tenant) {
                console.warn('Tenant not found or inactive:', tenantId);
                return null;
            }

            return {
                id: tenant.id,
                slug: tenant.slug,
                businessName: tenant.business_name,
                domain: tenant.domain,
                aiSettings: tenant.ai_settings || {},
                businessHours: tenant.business_hours || {},
                email: tenant.email,
                phone: tenant.phone,
                whatsappPhone: tenant.whatsapp_phone
            };
            
        } catch (error) {
            console.error('Error loading tenant config:', error);
            return null;
        }
    }

    /**
     * Load user profile for AI context
     */
    async loadUserProfile(phoneNumber, tenantId) {
        try {
            const { data: user, error } = await database_1.supabase
                .from('users')
                .select('id, name, email, preferences, created_at')
                .eq('phone', phoneNumber)
                .single();

            if (error || !user) {
                return {
                    isNewUser: true,
                    phoneNumber,
                    name: 'Usuário',
                    language: 'pt-BR',
                    timezone: 'America/Sao_Paulo',
                    previousAppointments: []
                };
            }

            // Get user's appointment history with this tenant
            const { data: appointments } = await database_1.supabase
                .from('appointments')
                .select('id, service_name, status, start_time')
                .eq('user_id', user.id)
                .eq('tenant_id', tenantId)
                .order('start_time', { ascending: false })
                .limit(5);

            return {
                id: user.id,
                name: user.name || 'Usuário',
                email: user.email,
                phoneNumber,
                language: 'pt-BR',
                timezone: 'America/Sao_Paulo',
                preferences: user.preferences || {},
                previousAppointments: appointments || [],
                createdAt: user.created_at,
                isNewUser: false
            };
            
        } catch (error) {
            console.error('Error loading user profile:', error);
            return {
                isNewUser: true,
                phoneNumber,
                name: 'Usuário',
                language: 'pt-BR',
                timezone: 'America/Sao_Paulo',
                previousAppointments: []
            };
        }
    }

    /**
     * Get conversation history for AI context
     */
    async getConversationHistory(sessionId) {
        try {
            const memory = await this.memoryService.getMemoryManager(sessionId);
            const context = await memory.getContext();
            return context.conversationHistory || [];
        } catch (error) {
            console.error('Error getting conversation history:', error);
            return [];
        }
    }

    /**
     * Update conversation state after AI processing
     */
    async updateConversationState(phoneNumber, tenantId, updatedContext) {
        try {
            const sessionId = `whatsapp_${phoneNumber}_${tenantId}`;
            const memory = await this.memoryService.getMemoryManager(sessionId);
            await memory.updateContext(updatedContext);
        } catch (error) {
            console.error('Error updating conversation state:', error);
        }
    }

    /**
     * Handle adapter errors gracefully
     */
    async handleAdapterError(error, phoneNumber) {
        try {
            let errorMessage = 'Desculpe, nosso sistema está temporariamente indisponível. ';
            
            // Provide specific error messages for common issues
            if (error.message?.includes('OpenAI')) {
                errorMessage += 'Nosso assistente de IA está sendo atualizado. Tente novamente em alguns minutos.';
            } else if (error.message?.includes('media')) {
                errorMessage += 'Houve um problema ao processar sua mídia. Pode tentar enviar novamente?';
            } else if (error.message?.includes('tenant')) {
                errorMessage += 'Verifique se você está usando o número correto para contato.';
            } else {
                errorMessage += 'Tente novamente em alguns instantes ou entre em contato diretamente conosco.';
            }
            
            await this.whatsappService.sendTextMessage(phoneNumber, errorMessage);
            
        } catch (fallbackError) {
            console.error('Error in adapter error handler:', fallbackError);
        }
    }

    /**
     * Health check for adapter components
     */
    async healthCheck() {
        try {
            const checks = {
                adapter: 'healthy',
                aiComplex: await this.aiService.healthCheck(),
                memory: await this.memoryService.healthCheck(),
                whatsapp: 'healthy'
            };
            
            const isHealthy = checks.aiComplex.status === 'healthy';
            
            return {
                status: isHealthy ? 'healthy' : 'degraded',
                details: checks,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

exports.WhatsAppAIAdapter = WhatsAppAIAdapter;
exports.default = WhatsAppAIAdapter;
//# sourceMappingURL=whatsapp-ai-adapter.js.map