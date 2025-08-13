const { logger } = require('../utils/logger');
const { supabase } = require('../config/database');

/**
 * WhatsApp Billing Integration Service
 * Integrates conversation tracking with the new conversation-based billing model
 * Handles billing events, conversation counting, and plan enforcement
 */
class WhatsAppBillingIntegrationService {
    constructor() {
        // Billing plans based on conversation volume (from CLAUDE.md analysis)
        this.billingPlans = {
            basico: {
                price_usd: 8,
                price_brl: 58.00,
                conversations_included: 200,
                overage_price_brl: 0.25
            },
            profissional: {
                price_usd: 20,
                price_brl: 116.00,
                conversations_included: 400,
                overage_price_brl: 0.25
            },
            enterprise: {
                price_usd: 50,
                price_brl: 290.00,
                conversations_included: 1250,
                overage_price_brl: 0.25
            }
        };

        // Conversation billing tracking
        this.conversationTracker = new Map(); // tenant_id -> conversation data
        
        logger.info('WhatsApp Billing Integration Service initialized', {
            plans: Object.keys(this.billingPlans),
            overagePrice: this.billingPlans.basico.overage_price_brl
        });
    }

    /**
     * Track a billable conversation
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - Customer phone number
     * @param {object} conversationData - Conversation metadata
     * @returns {Promise<{billable: boolean, conversationType: string, planStatus: object}>}
     */
    async trackBillableConversation(tenantId, phoneNumber, conversationData = {}) {
        try {
            const {
                messageType = 'text',
                isBusinessInitiated = false,
                isTemplateMessage = false,
                isUserInitiated = true
            } = conversationData;

            // Determine conversation type for billing
            const conversationType = this.determineConversationType(
                messageType,
                isBusinessInitiated,
                isTemplateMessage,
                isUserInitiated
            );

            // Check if this creates a new 24-hour conversation window
            const isNewConversation = await this.isNewBillableConversation(
                tenantId,
                phoneNumber
            );

            if (!isNewConversation) {
                return {
                    billable: false,
                    reason: 'EXISTING_CONVERSATION_WINDOW',
                    conversationType
                };
            }

            // Get tenant's current billing plan
            const planStatus = await this.getTenantPlanStatus(tenantId);
            
            if (!planStatus.success) {
                logger.warn('Could not get tenant plan status', { tenantId });
                return {
                    billable: true,
                    conversationType,
                    planStatus: { error: planStatus.error }
                };
            }

            // Record the billable conversation
            const billingResult = await this.recordBillableConversation(
                tenantId,
                phoneNumber,
                conversationType,
                planStatus.plan
            );

            // Check if tenant exceeds plan limits
            const usageCheck = await this.checkPlanUsageAndLimits(tenantId, planStatus.plan);

            logger.info('Billable conversation tracked', {
                tenantId,
                phoneNumber: this.maskPhoneNumber(phoneNumber),
                conversationType,
                isNewConversation,
                planUsage: usageCheck.usage,
                planLimit: usageCheck.limit,
                willCauseOverage: usageCheck.willExceedLimit
            });

            return {
                billable: true,
                conversationType,
                planStatus: planStatus.plan,
                usage: usageCheck,
                billingResult
            };

        } catch (error) {
            logger.error('Error tracking billable conversation:', error);
            return {
                billable: false,
                error: error.message
            };
        }
    }

    /**
     * Determine conversation type for billing purposes
     */
    determineConversationType(messageType, isBusinessInitiated, isTemplateMessage, isUserInitiated) {
        if (isUserInitiated) {
            return 'user_initiated';
        }
        
        if (isTemplateMessage) {
            return 'business_initiated_template';
        }
        
        if (isBusinessInitiated) {
            return 'business_initiated';
        }
        
        return 'service_conversation';
    }

    /**
     * Check if this creates a new billable conversation window
     * @param {string} tenantId - Tenant ID
     * @param {string} phoneNumber - Customer phone number
     * @returns {Promise<boolean>} True if this starts a new billable conversation
     */
    async isNewBillableConversation(tenantId, phoneNumber) {
        try {
            // Check for existing conversation in the last 24 hours
            const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));
            
            const { data, error } = await supabase
                .from('conversation_billing_tracking')
                .select('id, created_at')
                .eq('tenant_id', tenantId)
                .eq('phone_number', phoneNumber)
                .gte('created_at', twentyFourHoursAgo.toISOString())
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) {
                logger.error('Error checking existing conversation:', error);
                // Fail safe - assume new conversation to ensure billing
                return true;
            }

            // If no recent conversation found, this is a new billable conversation
            return !data || data.length === 0;

        } catch (error) {
            logger.error('Error checking billable conversation window:', error);
            return true; // Fail safe
        }
    }

    /**
     * Record a billable conversation in the database
     */
    async recordBillableConversation(tenantId, phoneNumber, conversationType, planData) {
        try {
            const { data, error } = await supabase
                .from('conversation_billing_tracking')
                .insert({
                    tenant_id: tenantId,
                    phone_number: phoneNumber,
                    conversation_type: conversationType,
                    billing_plan: planData.name || 'basico',
                    plan_limit: planData.conversations_included || 200,
                    is_overage: false, // Will be updated if exceeds plan
                    billing_amount: 0, // Base plan covers included conversations
                    billing_period_start: this.getBillingPeriodStart(),
                    billing_period_end: this.getBillingPeriodEnd(),
                    metadata: {
                        plan_price: planData.price_brl || this.billingPlans.basico.price_brl,
                        overage_rate: this.billingPlans.basico.overage_price_brl,
                        tracked_at: new Date().toISOString()
                    }
                })
                .select()
                .single();

            if (error) {
                logger.error('Error recording billable conversation:', error);
                throw error;
            }

            return {
                success: true,
                conversationId: data.id,
                billingPeriod: {
                    start: data.billing_period_start,
                    end: data.billing_period_end
                }
            };

        } catch (error) {
            logger.error('Error recording billable conversation:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get tenant's current billing plan and status
     */
    async getTenantPlanStatus(tenantId) {
        try {
            // Get tenant billing information
            const { data: tenant, error } = await supabase
                .from('tenants')
                .select('id, billing_plan, billing_status, subscription_data')
                .eq('id', tenantId)
                .single();

            if (error) {
                logger.error('Error getting tenant plan status:', error);
                throw error;
            }

            const billingPlan = tenant.billing_plan || 'basico';
            const planConfig = this.billingPlans[billingPlan] || this.billingPlans.basico;

            return {
                success: true,
                plan: {
                    name: billingPlan,
                    status: tenant.billing_status || 'active',
                    ...planConfig,
                    subscription_data: tenant.subscription_data || {}
                }
            };

        } catch (error) {
            logger.error('Error getting tenant plan status:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Check current plan usage and limits
     */
    async checkPlanUsageAndLimits(tenantId, planData) {
        try {
            const billingPeriodStart = this.getBillingPeriodStart();
            const billingPeriodEnd = this.getBillingPeriodEnd();

            // Count conversations in current billing period
            const { data, error } = await supabase
                .from('conversation_billing_tracking')
                .select('id, is_overage, billing_amount')
                .eq('tenant_id', tenantId)
                .gte('created_at', billingPeriodStart)
                .lte('created_at', billingPeriodEnd);

            if (error) {
                logger.error('Error checking plan usage:', error);
                throw error;
            }

            const totalConversations = data.length;
            const overageConversations = data.filter(c => c.is_overage).length;
            const includedConversations = Math.min(totalConversations, planData.conversations_included);
            const plannedOverage = Math.max(0, totalConversations - planData.conversations_included);
            
            const basePlanCost = planData.price_brl;
            const overageCost = plannedOverage * this.billingPlans.basico.overage_price_brl;
            const totalCost = basePlanCost + overageCost;

            const usagePercentage = (totalConversations / planData.conversations_included) * 100;
            const willExceedLimit = totalConversations >= planData.conversations_included;

            return {
                usage: totalConversations,
                limit: planData.conversations_included,
                included: includedConversations,
                overage: plannedOverage,
                usagePercentage: Math.min(usagePercentage, 100),
                willExceedLimit,
                costs: {
                    basePlan: basePlanCost,
                    overage: overageCost,
                    total: totalCost
                },
                billingPeriod: {
                    start: billingPeriodStart,
                    end: billingPeriodEnd
                }
            };

        } catch (error) {
            logger.error('Error checking plan usage and limits:', error);
            return {
                usage: 0,
                limit: planData.conversations_included || 200,
                error: error.message
            };
        }
    }

    /**
     * Process overage billing when plan limits are exceeded
     */
    async processOverageBilling(tenantId) {
        try {
            const planStatus = await this.getTenantPlanStatus(tenantId);
            if (!planStatus.success) {
                throw new Error('Could not get tenant plan status');
            }

            const usageCheck = await this.checkPlanUsageAndLimits(tenantId, planStatus.plan);
            
            if (usageCheck.overage > 0) {
                // Mark overage conversations for billing
                const billingPeriodStart = this.getBillingPeriodStart();
                
                const { error } = await supabase
                    .from('conversation_billing_tracking')
                    .update({
                        is_overage: true,
                        billing_amount: this.billingPlans.basico.overage_price_brl
                    })
                    .eq('tenant_id', tenantId)
                    .gte('created_at', billingPeriodStart)
                    .order('created_at', { ascending: true })
                    .range(planStatus.plan.conversations_included, usageCheck.usage - 1);

                if (error) {
                    logger.error('Error processing overage billing:', error);
                    throw error;
                }

                // Send billing notification
                await this.sendOverageNotification(tenantId, usageCheck);

                logger.info('Overage billing processed', {
                    tenantId,
                    overageConversations: usageCheck.overage,
                    overageCost: usageCheck.costs.overage
                });
            }

            return {
                success: true,
                overage: usageCheck.overage,
                costs: usageCheck.costs
            };

        } catch (error) {
            logger.error('Error processing overage billing:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send overage notification to tenant
     */
    async sendOverageNotification(tenantId, usageData) {
        try {
            // This would integrate with the email service
            logger.info('Overage notification triggered', {
                tenantId,
                usage: usageData.usage,
                limit: usageData.limit,
                overageCost: usageData.costs.overage
            });

            // TODO: Integrate with email service to send notification
            // await emailService.sendOverageNotification(tenantId, usageData);

        } catch (error) {
            logger.error('Error sending overage notification:', error);
        }
    }

    /**
     * Get billing period start (first day of current month)
     */
    getBillingPeriodStart() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    }

    /**
     * Get billing period end (last day of current month)
     */
    getBillingPeriodEnd() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    }

    /**
     * Get conversation billing analytics for tenant
     */
    async getConversationBillingAnalytics(tenantId, startDate, endDate) {
        try {
            const { data, error } = await supabase
                .from('conversation_billing_tracking')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .order('created_at', { ascending: true });

            if (error) {
                logger.error('Error getting billing analytics:', error);
                throw error;
            }

            // Process analytics
            const analytics = {
                totalConversations: data.length,
                conversationsByType: {},
                conversationsByDay: {},
                billingBreakdown: {
                    included: 0,
                    overage: 0,
                    totalCost: 0
                }
            };

            data.forEach(conversation => {
                // By type
                const type = conversation.conversation_type;
                analytics.conversationsByType[type] = (analytics.conversationsByType[type] || 0) + 1;

                // By day
                const day = conversation.created_at.split('T')[0];
                analytics.conversationsByDay[day] = (analytics.conversationsByDay[day] || 0) + 1;

                // Billing
                if (conversation.is_overage) {
                    analytics.billingBreakdown.overage += 1;
                    analytics.billingBreakdown.totalCost += conversation.billing_amount || 0;
                } else {
                    analytics.billingBreakdown.included += 1;
                }
            });

            return {
                success: true,
                analytics,
                period: { startDate, endDate }
            };

        } catch (error) {
            logger.error('Error getting conversation billing analytics:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Enforce plan limits by blocking messages when quota exceeded
     */
    async enforcePlanLimits(tenantId) {
        try {
            const planStatus = await this.getTenantPlanStatus(tenantId);
            if (!planStatus.success) {
                return { allowed: true, warning: 'Could not check plan limits' };
            }

            const usageCheck = await this.checkPlanUsageAndLimits(tenantId, planStatus.plan);
            
            // For now, allow overage but track it for billing
            // In future versions, could implement hard limits based on plan type
            if (usageCheck.willExceedLimit) {
                logger.warn('Tenant approaching/exceeding plan limits', {
                    tenantId,
                    usage: usageCheck.usage,
                    limit: usageCheck.limit,
                    usagePercentage: usageCheck.usagePercentage
                });

                // Process overage billing
                await this.processOverageBilling(tenantId);
            }

            return {
                allowed: true,
                planStatus: planStatus.plan,
                usage: usageCheck,
                warning: usageCheck.willExceedLimit ? 'Plan limit exceeded - overage charges apply' : null
            };

        } catch (error) {
            logger.error('Error enforcing plan limits:', error);
            return { allowed: true, error: error.message };
        }
    }

    /**
     * Mask phone number for privacy
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
            billingPlans: Object.keys(this.billingPlans),
            trackingEntries: this.conversationTracker.size,
            currentBillingPeriod: {
                start: this.getBillingPeriodStart(),
                end: this.getBillingPeriodEnd()
            },
            uptime: process.uptime()
        };
    }
}

// Export singleton instance
module.exports = new WhatsAppBillingIntegrationService();