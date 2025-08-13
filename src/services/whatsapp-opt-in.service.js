const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');

/**
 * WhatsApp Opt-in Management Service
 * Handles user consent and opt-in status according to Meta compliance requirements
 */
class WhatsAppOptInService {
    constructor() {
        this.defaultExpiry = 365; // days
        this.requireDoubleOptIn = true;
        
        logger.info('WhatsApp Opt-in Service initialized');
    }

    /**
     * Check if user has valid opt-in for receiving messages
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @returns {Promise<{isOptedIn: boolean, status: string, requiresOptIn: boolean}>}
     */
    async checkOptInStatus(tenantId, phoneNumber) {
        try {
            const { data, error } = await supabase.rpc('get_whatsapp_opt_in_status', {
                p_tenant_id: tenantId,
                p_phone_number: phoneNumber
            });

            if (error) {
                logger.error('Error checking opt-in status:', error);
                throw error;
            }

            const status = data[0] || {};
            
            return {
                isOptedIn: status.is_opted_in || false,
                status: status.opt_in_status || 'pending',
                marketingConsent: status.marketing_consent || false,
                lastInteraction: status.last_interaction,
                requiresDoubleOptIn: status.requires_double_opt_in || false,
                doubleOptInConfirmed: status.double_opt_in_confirmed || false,
                requiresOptIn: !status.is_opted_in
            };

        } catch (error) {
            logger.error('Error checking WhatsApp opt-in status:', error);
            // Fail safe - assume opt-in required
            return {
                isOptedIn: false,
                status: 'pending',
                marketingConsent: false,
                requiresOptIn: true,
                error: error.message
            };
        }
    }

    /**
     * Create initial opt-in record when user first contacts business
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @param {object} optInData - Opt-in details
     */
    async createOptIn(tenantId, phoneNumber, optInData = {}) {
        try {
            const {
                source = 'whatsapp_business_button',
                consentText = 'User initiated conversation via WhatsApp',
                ipAddress = null,
                userAgent = null,
                businessCategory = null,
                specificServices = [],
                requiresDoubleOptIn = this.requireDoubleOptIn
            } = optInData;

            // Check if opt-in already exists
            const existingOptIn = await this.checkOptInStatus(tenantId, phoneNumber);
            
            if (existingOptIn.status !== 'pending' && !existingOptIn.error) {
                logger.info('Opt-in already exists', {
                    tenantId,
                    phoneNumber: this.maskPhoneNumber(phoneNumber),
                    status: existingOptIn.status
                });
                return existingOptIn;
            }

            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + this.defaultExpiry);

            const { data, error } = await supabase
                .from('whatsapp_opt_ins')
                .insert({
                    tenant_id: tenantId,
                    phone_number: phoneNumber,
                    opt_in_status: 'opted_in', // Auto opt-in for user-initiated contact
                    opt_in_source: source,
                    opt_in_timestamp: new Date().toISOString(),
                    consent_text: consentText,
                    consent_ip_address: ipAddress,
                    consent_user_agent: userAgent,
                    requires_double_opt_in: requiresDoubleOptIn,
                    opt_in_expires_at: expiryDate.toISOString(),
                    last_interaction_at: new Date().toISOString(),
                    business_category: businessCategory,
                    specific_services: specificServices,
                    source_metadata: {
                        created_via: 'api',
                        auto_created: true,
                        user_initiated: true
                    }
                })
                .select()
                .single();

            if (error) {
                logger.error('Error creating WhatsApp opt-in:', error);
                throw error;
            }

            logger.info('WhatsApp opt-in created successfully', {
                tenantId,
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                source,
                requiresDoubleOptIn
            });

            return {
                isOptedIn: true,
                status: 'opted_in',
                created: true,
                optInId: data.id
            };

        } catch (error) {
            logger.error('Error creating WhatsApp opt-in:', error);
            return {
                isOptedIn: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Handle user opt-out request
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @param {string} reason - Reason for opt-out
     */
    async processOptOut(tenantId, phoneNumber, reason = 'User requested opt-out') {
        try {
            const { data, error } = await supabase
                .from('whatsapp_opt_ins')
                .update({
                    opt_in_status: 'opted_out',
                    opt_out_timestamp: new Date().toISOString(),
                    compliance_notes: reason,
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', tenantId)
                .eq('phone_number', phoneNumber)
                .select()
                .single();

            if (error) {
                logger.error('Error processing opt-out:', error);
                throw error;
            }

            logger.info('User opted out successfully', {
                tenantId,
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                reason
            });

            return {
                success: true,
                status: 'opted_out',
                message: 'Opt-out processed successfully'
            };

        } catch (error) {
            logger.error('Error processing WhatsApp opt-out:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send double opt-in confirmation message
     * @param {string} tenantId - Tenant ID  
     * @param {string} phoneNumber - User's phone number
     * @param {object} whatsappService - WhatsApp service instance
     */
    async sendDoubleOptInConfirmation(tenantId, phoneNumber, whatsappService) {
        try {
            // Check if double opt-in is required and not yet confirmed
            const optInStatus = await this.checkOptInStatus(tenantId, phoneNumber);
            
            if (!optInStatus.requiresDoubleOptIn || optInStatus.doubleOptInConfirmed) {
                return { success: true, message: 'Double opt-in not required or already confirmed' };
            }

            // Send confirmation message with buttons
            const confirmationMessage = {
                messaging_product: 'whatsapp',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: {
                        text: '📱 *Confirmação de Cadastro WhatsApp*\n\nPara começar a receber nossas mensagens, confirme seu interesse clicando no botão abaixo.\n\n✅ Suas informações estão seguras\n🔒 Você pode cancelar a qualquer momento'
                    },
                    action: {
                        buttons: [
                            {
                                type: 'reply',
                                reply: {
                                    id: 'confirm_opt_in',
                                    title: '✅ Confirmar'
                                }
                            },
                            {
                                type: 'reply',
                                reply: {
                                    id: 'cancel_opt_in',
                                    title: '❌ Cancelar'
                                }
                            }
                        ]
                    }
                }
            };

            const success = await whatsappService.sendMessage(confirmationMessage, {
                isTemplateMessage: false,
                isUserInitiated: false
            });

            if (success) {
                // Update record to mark double opt-in sent
                await supabase
                    .from('whatsapp_opt_ins')
                    .update({
                        double_opt_in_sent_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('tenant_id', tenantId)
                    .eq('phone_number', phoneNumber);

                logger.info('Double opt-in confirmation sent', {
                    tenantId,
                    phoneNumber: this.maskPhoneNumber(phoneNumber)
                });
            }

            return { success, message: success ? 'Confirmation sent' : 'Failed to send confirmation' };

        } catch (error) {
            logger.error('Error sending double opt-in confirmation:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process double opt-in confirmation response
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @param {string} response - User's response (confirm_opt_in or cancel_opt_in)
     */
    async processDoubleOptInResponse(tenantId, phoneNumber, response) {
        try {
            if (response === 'confirm_opt_in') {
                // Confirm the opt-in
                const { data, error } = await supabase
                    .from('whatsapp_opt_ins')
                    .update({
                        double_opt_in_confirmed_at: new Date().toISOString(),
                        opt_in_status: 'opted_in',
                        updated_at: new Date().toISOString()
                    })
                    .eq('tenant_id', tenantId)
                    .eq('phone_number', phoneNumber)
                    .select()
                    .single();

                if (error) throw error;

                logger.info('Double opt-in confirmed', {
                    tenantId,
                    phoneNumber: this.maskPhoneNumber(phoneNumber)
                });

                return {
                    success: true,
                    confirmed: true,
                    message: '✅ Cadastro confirmado! Agora você receberá nossas mensagens.'
                };

            } else if (response === 'cancel_opt_in') {
                // Cancel the opt-in
                return await this.processOptOut(tenantId, phoneNumber, 'User declined double opt-in');
            }

            return { success: false, message: 'Invalid response' };

        } catch (error) {
            logger.error('Error processing double opt-in response:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Record user interaction to maintain active status
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @param {string} interactionType - Type of interaction
     */
    async recordInteraction(tenantId, phoneNumber, interactionType = 'message') {
        try {
            const { data, error } = await supabase.rpc('record_whatsapp_interaction', {
                p_tenant_id: tenantId,
                p_phone_number: phoneNumber,
                p_interaction_type: interactionType
            });

            if (error) {
                logger.error('Error recording interaction:', error);
                return false;
            }

            return data; // Returns true if interaction was recorded

        } catch (error) {
            logger.error('Error recording WhatsApp interaction:', error);
            return false;
        }
    }

    /**
     * Update marketing consent
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     * @param {boolean} marketingConsent - Marketing consent status
     */
    async updateMarketingConsent(tenantId, phoneNumber, marketingConsent) {
        try {
            const { data, error } = await supabase
                .from('whatsapp_opt_ins')
                .update({
                    marketing_consent: marketingConsent,
                    marketing_consent_timestamp: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('tenant_id', tenantId)
                .eq('phone_number', phoneNumber)
                .select()
                .single();

            if (error) {
                logger.error('Error updating marketing consent:', error);
                throw error;
            }

            logger.info('Marketing consent updated', {
                tenantId,
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                marketingConsent
            });

            return { success: true, consent: marketingConsent };

        } catch (error) {
            logger.error('Error updating marketing consent:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get compliance report for tenant
     * @param {string} tenantId - Tenant ID
     */
    async getComplianceReport(tenantId) {
        try {
            const { data, error } = await supabase
                .from('whatsapp_opt_in_compliance_report')
                .select('*')
                .eq('id', tenantId) // Assuming tenant id maps to business
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                logger.error('Error getting compliance report:', error);
                throw error;
            }

            return data || {
                total_opt_ins: 0,
                active_opt_ins: 0,
                opted_out: 0,
                pending_opt_ins: 0,
                expired_opt_ins: 0,
                marketing_consents: 0
            };

        } catch (error) {
            logger.error('Error getting WhatsApp compliance report:', error);
            return { error: error.message };
        }
    }

    /**
     * Get opt-in history for a user
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - User's phone number
     */
    async getOptInHistory(tenantId, phoneNumber) {
        try {
            // First get the opt-in record
            const { data: optIn, error: optInError } = await supabase
                .from('whatsapp_opt_ins')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('phone_number', phoneNumber)
                .single();

            if (optInError) {
                return { history: [] };
            }

            // Get history for this opt-in
            const { data: history, error } = await supabase
                .from('whatsapp_opt_in_history')
                .select('*')
                .eq('opt_in_id', optIn.id)
                .order('created_at', { ascending: false });

            if (error) {
                logger.error('Error getting opt-in history:', error);
                throw error;
            }

            return { history: history || [] };

        } catch (error) {
            logger.error('Error getting WhatsApp opt-in history:', error);
            return { error: error.message };
        }
    }

    /**
     * Process opt-out keywords in messages
     * @param {string} message - Message text
     * @returns {boolean} True if message contains opt-out keywords
     */
    isOptOutMessage(message) {
        const optOutKeywords = [
            'STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT',
            'PARAR', 'CANCELAR', 'SAIR', 'DESCADASTRAR', 'REMOVER',
            'PARE', 'INTERROMPER', 'DESINSCREVER'
        ];

        const messageUpper = message.toUpperCase().trim();
        return optOutKeywords.some(keyword => messageUpper === keyword);
    }

    /**
     * Mask phone number for privacy in logs
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.slice(0, 3) + '*'.repeat(phoneNumber.length - 6) + phoneNumber.slice(-3);
    }

    /**
     * Health check for the service
     */
    healthCheck() {
        return {
            status: 'healthy',
            defaultExpiry: this.defaultExpiry,
            requireDoubleOptIn: this.requireDoubleOptIn,
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WhatsAppOptInService();