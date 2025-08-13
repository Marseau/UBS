/**
 * SUBSCRIPTION AUTHENTICATION MIDDLEWARE
 * 
 * Verifica se o tenant tem subscription ativa via Stripe
 * - subscription_status deve ser 'active' ou 'trialing'
 * - Trial deve estar dentro do período válido
 * - Super admins têm bypass
 */

const { supabaseAdmin } = require('../config/database');

class SubscriptionAuthMiddleware {
    constructor() {
        this.verifyActiveSubscription = this.verifyActiveSubscription.bind(this);
    }

    /**
     * Middleware principal para verificar subscription ativa
     */
    async verifyActiveSubscription(req, res, next) {
        try {
            // Super admin sempre tem acesso
            if (req.user?.role === 'super_admin' || req.admin?.role === 'super_admin') {
                console.log('🔓 Super admin bypass - subscription check skipped');
                return next();
            }

            // Verificar se temos tenant_id
            const tenantId = req.user?.tenant_id || req.admin?.tenantId;
            if (!tenantId) {
                return res.status(401).json({ 
                    error: 'Tenant ID required',
                    code: 'TENANT_ID_MISSING'
                });
            }

            console.log(`🔍 Verificando subscription para tenant: ${tenantId.substring(0, 8)}...`);

            // Buscar dados de subscription do tenant
            const { data: tenant, error } = await supabaseAdmin
                .from('tenants')
                .select(`
                    id,
                    subscription_status,
                    subscription_start_date,
                    trial_ends_at,
                    stripe_customer_id,
                    subscription_id
                `)
                .eq('id', tenantId)
                .single();

            if (error || !tenant) {
                console.error('❌ Erro ao buscar tenant:', error?.message);
                return res.status(404).json({ 
                    error: 'Tenant not found',
                    code: 'TENANT_NOT_FOUND'
                });
            }

            // Verificar status da subscription
            const subscriptionCheck = this.checkSubscriptionStatus(tenant);
            
            if (subscriptionCheck.valid) {
                console.log(`✅ Subscription válida: ${subscriptionCheck.reason}`);
                
                // Adicionar dados de subscription ao request para uso posterior
                req.subscription = {
                    status: tenant.subscription_status,
                    trial_ends_at: tenant.trial_ends_at,
                    subscription_start_date: tenant.subscription_start_date,
                    ...subscriptionCheck
                };
                
                return next();
            } else {
                console.log(`🚫 Subscription inválida: ${subscriptionCheck.reason}`);
                return res.status(402).json({
                    error: 'Active subscription required',
                    code: 'SUBSCRIPTION_REQUIRED',
                    reason: subscriptionCheck.reason,
                    redirect_url: '/billing-standardized.html',
                    subscription_status: tenant.subscription_status,
                    trial_ends_at: tenant.trial_ends_at
                });
            }

        } catch (error) {
            console.error('❌ Erro no middleware de subscription:', error);
            return res.status(500).json({ 
                error: 'Subscription verification failed',
                code: 'SUBSCRIPTION_CHECK_ERROR'
            });
        }
    }

    /**
     * Verifica se a subscription está válida
     */
    checkSubscriptionStatus(tenant) {
        const now = new Date();
        
        // 1. Subscription ativa via Stripe
        if (tenant.subscription_status === 'active') {
            return {
                valid: true,
                reason: 'Active Stripe subscription',
                type: 'active'
            };
        }

        // 2. Trial period válido
        if (tenant.subscription_status === 'trialing' && tenant.trial_ends_at) {
            const trialEnd = new Date(tenant.trial_ends_at);
            
            if (now <= trialEnd) {
                const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
                return {
                    valid: true,
                    reason: `Trial period active (${daysRemaining} days remaining)`,
                    type: 'trial',
                    days_remaining: daysRemaining,
                    trial_ends_at: tenant.trial_ends_at
                };
            } else {
                return {
                    valid: false,
                    reason: 'Trial period expired',
                    type: 'expired_trial'
                };
            }
        }

        // 3. Status inválidos
        const invalidStatuses = ['cancelled', 'expired', 'past_due', 'unpaid'];
        if (invalidStatuses.includes(tenant.subscription_status)) {
            return {
                valid: false,
                reason: `Subscription ${tenant.subscription_status}`,
                type: 'invalid_status'
            };
        }

        // 4. Sem subscription configurada
        if (!tenant.subscription_status) {
            return {
                valid: false,
                reason: 'No subscription configured',
                type: 'no_subscription'
            };
        }

        // 5. Status desconhecido
        return {
            valid: false,
            reason: `Unknown subscription status: ${tenant.subscription_status}`,
            type: 'unknown_status'
        };
    }

    /**
     * Middleware específico para APIs que precisam de subscription
     */
    requireActiveSubscription() {
        return this.verifyActiveSubscription;
    }

    /**
     * Middleware que permite trial mas alerta sobre expiração
     */
    allowTrialWithWarning() {
        return async (req, res, next) => {
            try {
                await this.verifyActiveSubscription(req, res, (error) => {
                    if (error) return next(error);
                    
                    // Se está em trial, adicionar warning header
                    if (req.subscription?.type === 'trial') {
                        res.set('X-Trial-Warning', 'true');
                        res.set('X-Trial-Days-Remaining', req.subscription.days_remaining.toString());
                    }
                    
                    next();
                });
            } catch (error) {
                next(error);
            }
        };
    }

    /**
     * Endpoint para verificar status da subscription
     */
    async getSubscriptionStatus(req, res) {
        try {
            const tenantId = req.user?.tenant_id || req.admin?.tenantId;
            
            if (!tenantId) {
                return res.status(401).json({ error: 'Tenant ID required' });
            }

            const { data: tenant, error } = await supabaseAdmin
                .from('tenants')
                .select(`
                    subscription_status,
                    subscription_start_date,
                    trial_ends_at,
                    stripe_customer_id,
                    plan_id
                `)
                .eq('id', tenantId)
                .single();

            if (error) {
                return res.status(404).json({ error: 'Tenant not found' });
            }

            const subscriptionCheck = this.checkSubscriptionStatus(tenant);

            return res.json({
                tenant_id: tenantId,
                subscription_status: tenant.subscription_status,
                subscription_valid: subscriptionCheck.valid,
                subscription_type: subscriptionCheck.type,
                reason: subscriptionCheck.reason,
                trial_ends_at: tenant.trial_ends_at,
                subscription_start_date: tenant.subscription_start_date,
                days_remaining: subscriptionCheck.days_remaining || null,
                has_stripe_customer: !!tenant.stripe_customer_id,
                plan_id: tenant.plan_id
            });

        } catch (error) {
            console.error('❌ Erro ao verificar subscription status:', error);
            return res.status(500).json({ error: 'Failed to check subscription status' });
        }
    }
}

// Export singleton instance
const subscriptionAuth = new SubscriptionAuthMiddleware();

module.exports = {
    SubscriptionAuthMiddleware,
    subscriptionAuth,
    verifyActiveSubscription: subscriptionAuth.verifyActiveSubscription,
    requireActiveSubscription: () => subscriptionAuth.requireActiveSubscription(),
    allowTrialWithWarning: () => subscriptionAuth.allowTrialWithWarning(),
    getSubscriptionStatus: subscriptionAuth.getSubscriptionStatus.bind(subscriptionAuth)
};