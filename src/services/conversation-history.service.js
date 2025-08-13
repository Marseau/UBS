"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationHistoryService = exports.ConversationHistoryService = void 0;
const database_1 = require("@/config/database");
const logger_1 = require("@/utils/logger");
class ConversationHistoryService {
    async storeMessage(message, tenantId, userName, userId, intentDetected, confidenceScore, conversationContext) {
        try {
            const messageContent = this.extractMessageContent(message);
            const displayContent = this.formatDisplayContent(message, messageContent);
            const conversationRecord = {
                tenant_id: tenantId,
                user_id: userId || null,
                phone_number: message.from,
                user_name: userName,
                is_from_user: true,
                message_type: message.type,
                message_content: messageContent,
                content: displayContent,
                raw_message: JSON.stringify(message),
                intent_detected: intentDetected || null,
                confidence_score: confidenceScore || null,
                conversation_context: conversationContext || null,
                message_id: message.id,
                created_at: new Date().toISOString()
            };
            const { error } = await database_1.supabaseAdmin
                .from('conversation_history')
                .insert(conversationRecord);
            if (error) {
                logger_1.logger.error('Error storing conversation message', { error, messageId: message.id });
                throw error;
            }
            logger_1.logger.info('Conversation message stored', {
                messageId: message.id,
                tenantId,
                phone: message.from,
                type: message.type
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to store conversation message', { error, messageId: message.id });
            throw error;
        }
    }
    async storeSystemMessage(tenantId, phoneNumber, messageContent, messageType = 'text', conversationContext, relatedMessageId) {
        try {
            const conversationRecord = {
                tenant_id: tenantId,
                user_id: null,
                phone_number: phoneNumber,
                user_name: 'Sistema UBS',
                is_from_user: false,
                message_type: messageType,
                message_content: messageContent,
                content: messageContent,
                raw_message: {
                    type: messageType,
                    content: messageContent,
                    timestamp: Date.now(),
                    system_generated: true
                },
                intent_detected: null,
                confidence_score: null,
                conversation_context: conversationContext || null,
                message_id: relatedMessageId || `system_${Date.now()}`,
                created_at: new Date().toISOString()
            };
            const { error } = await database_1.supabaseAdmin
                .from('conversation_history')
                .insert(conversationRecord);
            if (error) {
                logger_1.logger.error('Error storing system message', { error, phoneNumber });
                throw error;
            }
            logger_1.logger.info('System message stored', { tenantId, phoneNumber, type: messageType });
        }
        catch (error) {
            logger_1.logger.error('Failed to store system message', { error, phoneNumber });
            throw error;
        }
    }
    async getConversationByPhone(phoneNumber, tenantId, limit = 50, beforeDate) {
        try {
            let query = database_1.supabaseAdmin
                .from('conversation_history')
                .select('*')
                .eq('phone_number', phoneNumber)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (beforeDate) {
                query = query.lt('created_at', beforeDate);
            }
            const { data, error } = await query;
            if (error) {
                logger_1.logger.error('Error retrieving conversation history', { error, phoneNumber });
                throw error;
            }
            return (data || []).reverse();
        }
        catch (error) {
            logger_1.logger.error('Failed to retrieve conversation history', { error, phoneNumber });
            throw error;
        }
    }
    async searchConversations(params) {
        try {
            let query = database_1.supabaseAdmin
                .from('conversation_history')
                .select('*', { count: 'exact' });
            if (params.phone_number) {
                query = query.eq('phone_number', params.phone_number);
            }
            if (params.tenant_id) {
                query = query.eq('tenant_id', params.tenant_id);
            }
            if (params.user_id) {
                query = query.eq('user_id', params.user_id);
            }
            if (params.start_date) {
                query = query.gte('created_at', params.start_date);
            }
            if (params.end_date) {
                query = query.lte('created_at', params.end_date);
            }
            if (params.message_type) {
                query = query.eq('message_type', params.message_type);
            }
            if (params.intent_detected) {
                query = query.eq('intent_detected', params.intent_detected);
            }
            if (params.is_from_user !== undefined) {
                query = query.eq('is_from_user', params.is_from_user);
            }
            const limit = params.limit || 50;
            const offset = params.offset || 0;
            query = query
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);
            const { data, error, count } = await query;
            if (error) {
                logger_1.logger.error('Error searching conversations', { error, params });
                throw error;
            }
            return {
                messages: data || [],
                total: count || 0,
                hasMore: (count || 0) > offset + limit
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to search conversations', { error, params });
            throw error;
        }
    }
    async getConversationSummary(phoneNumber, tenantId) {
        try {
            const { data, error } = await database_1.supabaseAdmin
                .rpc('get_conversation_summary', {
                p_phone_number: phoneNumber,
                p_tenant_id: tenantId
            });
            if (error) {
                logger_1.logger.error('Error getting conversation summary', { error, phoneNumber });
                throw error;
            }
            return data || {
                total_messages: 0,
                first_interaction: '',
                last_interaction: '',
                message_types: {},
                intents: {},
                user_messages: 0,
                system_messages: 0
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get conversation summary', { error, phoneNumber });
            throw error;
        }
    }
    async getConversationsForCleanup(retentionDays = 60) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const { data, error } = await database_1.supabaseAdmin
                .rpc('get_conversations_for_cleanup', {
                p_cutoff_date: cutoffDate.toISOString()
            });
            if (error) {
                logger_1.logger.error('Error getting conversations for cleanup', { error });
                throw error;
            }
            return data || {
                phone_numbers: [],
                message_count: 0,
                oldest_date: '',
                newest_date: ''
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get conversations for cleanup', { error });
            throw error;
        }
    }
    async cleanupOldConversations(retentionDays = 60) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            logger_1.logger.info('Starting conversation cleanup', {
                retentionDays,
                cutoffDate: cutoffDate.toISOString()
            });
            const { data, error } = await database_1.supabaseAdmin
                .rpc('cleanup_old_conversations', {
                p_cutoff_date: cutoffDate.toISOString()
            });
            if (error) {
                logger_1.logger.error('Error cleaning up conversations', { error });
                throw error;
            }
            const result = data || {
                deleted_count: 0,
                deleted_conversations: 0,
                cleanup_date: new Date().toISOString()
            };
            logger_1.logger.info('Conversation cleanup completed', result);
            return result;
        }
        catch (error) {
            logger_1.logger.error('Failed to cleanup conversations', { error });
            throw error;
        }
    }
    async getConversationStats(tenantId, startDate, endDate) {
        try {
            const { data, error } = await database_1.supabaseAdmin
                .rpc('get_conversation_stats', {
                p_tenant_id: tenantId || null,
                p_start_date: startDate || null,
                p_end_date: endDate || null
            });
            if (error) {
                logger_1.logger.error('Error getting conversation stats', { error });
                throw error;
            }
            return data || {
                total_messages: 0,
                total_conversations: 0,
                messages_by_type: {},
                intents_detected: {},
                average_messages_per_conversation: 0,
                most_active_hours: {},
                retention_summary: {
                    total_stored: 0,
                    messages_last_30_days: 0,
                    messages_last_60_days: 0,
                    eligible_for_cleanup: 0
                }
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get conversation stats', { error });
            throw error;
        }
    }
    async exportConversationHistory(params) {
        try {
            const exportParams = { ...params, limit: undefined, offset: undefined };
            const { messages, total } = await this.searchConversations(exportParams);
            if (params.format === 'csv') {
                const csvData = messages.map(msg => ({
                    timestamp: msg.created_at,
                    phone_number: msg.phone_number,
                    user_name: msg.user_name,
                    direction: msg.is_from_user ? 'incoming' : 'outgoing',
                    message_type: msg.message_type,
                    content: msg.content,
                    intent: msg.intent_detected || '',
                    confidence: msg.confidence_score || ''
                }));
                return { data: csvData, format: 'csv', total };
            }
            return { data: messages, format: 'json', total };
        }
        catch (error) {
            logger_1.logger.error('Failed to export conversation history', { error, params });
            throw error;
        }
    }
    async getRecentContext(phoneNumber, tenantId, messageLimit = 10) {
        try {
            const messages = await this.getConversationByPhone(phoneNumber, tenantId, messageLimit);
            return messages.map(msg => ({
                role: msg.is_from_user ? 'user' : 'assistant',
                content: msg.content,
                timestamp: msg.created_at
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get recent context', { error, phoneNumber });
            return [];
        }
    }
    extractMessageContent(message) {
        switch (message.type) {
            case 'text':
                return message.text?.body || '';
            case 'image':
                return message.image?.caption || '[Imagem]';
            case 'audio':
                return '[Áudio]';
            case 'video':
                return message.video?.caption || '[Vídeo]';
            case 'document':
                return `[Documento: ${message.document?.filename || 'arquivo'}]`;
            case 'location':
                return `[Localização: ${message.location?.latitude || 'N/A'}, ${message.location?.longitude || 'N/A'}]`;
            case 'button':
                return message.button?.text || message.button?.payload || '[Botão]';
            case 'interactive':
                if (message.interactive?.button_reply) {
                    return message.interactive.button_reply.title;
                }
                else if (message.interactive?.list_reply) {
                    return message.interactive.list_reply.title;
                }
                return '[Interativo]';
            case 'contacts':
                return `[Contato: ${(message.contacts)?.[0]?.name?.formatted_name || 'contato'}]`;
            default:
                return `[${message.type.toUpperCase()}]`;
        }
    }
    formatDisplayContent(message, content) {
        const timestamp = new Date().toLocaleString('pt-BR');
        const messageType = message.type.toUpperCase();
        if (content.length > 500) {
            content = content.substring(0, 500) + '...';
        }
        return content;
    }
    startAutomaticCleanup(retentionDays = 60, intervalHours = 24) {
        const intervalMs = intervalHours * 60 * 60 * 1000;
        setInterval(async () => {
            try {
                logger_1.logger.info('Starting scheduled conversation cleanup');
                const result = await this.cleanupOldConversations(retentionDays);
                logger_1.logger.info('Scheduled cleanup completed', result);
            }
            catch (error) {
                logger_1.logger.error('Scheduled cleanup failed', { error });
            }
        }, intervalMs);
        logger_1.logger.info('Automatic conversation cleanup scheduled', {
            retentionDays,
            intervalHours
        });
    }
}
exports.ConversationHistoryService = ConversationHistoryService;
exports.conversationHistoryService = new ConversationHistoryService();
//# sourceMappingURL=conversation-history.service.js.map