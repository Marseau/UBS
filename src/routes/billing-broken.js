"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const stripe_service_1 = require("@/services/stripe.service");
const database_1 = require("@/config/database");
const admin_auth_1 = __importDefault(require("../middleware/admin-auth"));
const logger_1 = require("@/utils/logger");
const router = express_1.default.Router();
const rawBodyMiddleware = express_1.default.raw({ type: 'application/json' });
const adminAuth = new admin_auth_1.default();
router.use(adminAuth.verifyToken);
router.get('/plans', (req, res) => {
    try {
        const plans = stripe_service_1.stripeService.getPlans();
        res.json({ success: true, plans });
    }
    catch (error) {
        logger_1.logger.error('Failed to get plans', { error });
        res.status(500).json({ success: false, message: 'Failed to get plans' });
    }
});
router.post('/create-checkout', async (req, res) => {
    try {
        const { planId, email, tenantId, successUrl, cancelUrl } = req.body;
        if (!planId || !email) {
            return res.status(400).json({
                success: false,
                message: 'Plan ID and email are required'
            });
        }
        const plan = stripe_service_1.stripeService.getPlan(planId);
        if (!plan) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan ID'
            });
        }
        const session = await stripe_service_1.stripeService.createCheckoutSession(planId, email, tenantId, successUrl, cancelUrl);
        res.json({
            success: true,
            sessionId: session.id,
            url: session.url
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create checkout session', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to create checkout session'
        });
    }
});
router.post('/create-customer', async (req, res) => {
    try {
        const { email, name, metadata } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        const customer = await stripe_service_1.stripeService.createCustomer(email, name, metadata);
        res.json({
            success: true,
            customer: {
                id: customer.id,
                email: customer.email,
                name: customer.name
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create customer', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to create customer'
        });
    }
});
router.post('/create-portal', async (req, res) => {
    try {
        const { returnUrl } = req.body;
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('domain_config')
            .eq('id', tenantId)
            .single();
        if (!tenant?.domain_config) {
            return res.status(400).json({
                success: false,
                message: 'No Stripe customer found for this tenant'
            });
        }
        const session = await stripe_service_1.stripeService.createBillingPortalSession(tenant.domain_config, returnUrl);
        res.json({
            success: true,
            url: session.url
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create billing portal session', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to create billing portal session'
        });
    }
});
router.post('/cancel-subscription', async (req, res) => {
    try {
        const { reason, immediately } = req.body;
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('domain_config')
            .eq('id', tenantId)
            .single();
        if (!tenant?.domain_config) {
            return res.status(400).json({
                success: false,
                message: 'No active subscription found'
            });
        }
        let subscription;
        if (immediately) {
            subscription = await stripe_service_1.stripeService.cancelSubscriptionImmediately(tenant.domain_config, reason);
        }
        else {
            subscription = await stripe_service_1.stripeService.cancelSubscription(tenant.domain_config, reason);
        }
        await database_1.supabaseAdmin
            .from('tenants')
            .update({
            status: immediately ? 'canceled' : 'active',
            cancellation_reason: reason,
            canceled_at: immediately ? new Date().toISOString() : null,
            domain_config: !immediately,
            updated_at: new Date().toISOString(),
        })
            .eq('id', tenantId);
        res.json({
            success: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                domain_config: subscription.domain_config,
                current_period_end: subscription.current_period_end
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to cancel subscription', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to cancel subscription'
        });
    }
});
router.post('/reactivate-subscription', async (req, res) => {
    try {
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('domain_config')
            .eq('id', tenantId)
            .single();
        if (!tenant?.domain_config) {
            return res.status(400).json({
                success: false,
                message: 'No subscription found'
            });
        }
        const subscription = await stripe_service_1.stripeService.reactivateSubscription(tenant.domain_config);
        await database_1.supabaseAdmin
            .from('tenants')
            .update({
            status: 'active',
            cancellation_reason: null,
            canceled_at: null,
            domain_config: false,
            updated_at: new Date().toISOString(),
        })
            .eq('id', tenantId);
        res.json({
            success: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                domain_config: subscription.domain_config
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to reactivate subscription', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to reactivate subscription'
        });
    }
});
router.post('/change-plan', async (req, res) => {
    try {
        const { newPlanId } = req.body;
        const tenantId = req.admin?.tenantId;
        if (!tenantId || !newPlanId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID and new plan ID are required'
            });
        }
        const newPlan = stripe_service_1.stripeService.getPlan(newPlanId);
        if (!newPlan) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan ID'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('domain_config, subscription_plan')
            .eq('id', tenantId)
            .single();
        if (!tenant?.domain_config) {
            return res.status(400).json({
                success: false,
                message: 'No active subscription found'
            });
        }
        if (tenant.subscription_plan === newPlanId) {
            return res.status(400).json({
                success: false,
                message: 'Already on this plan'
            });
        }
        const subscription = await stripe_service_1.stripeService.changeSubscriptionPlan(tenant.domain_config, newPlanId);
        await database_1.supabaseAdmin
            .from('tenants')
            .update({
            subscription_plan: newPlanId,
            updated_at: new Date().toISOString(),
        })
            .eq('id', tenantId);
        res.json({
            success: true,
            subscription: {
                id: subscription.id,
                status: subscription.status,
                plan: newPlan
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to change plan', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to change plan'
        });
    }
});
router.get('/subscription', async (req, res) => {
    try {
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select(`
        domain_config,
        domain_config,
        subscription_plan,
        status,
        domain_config,
        domain_config,
        cancellation_reason,
        canceled_at
      `)
            .eq('id', tenantId)
            .single();
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }
        let subscriptionDetails = null;
        let plan = null;
        if (tenant.domain_config) {
            try {
                const stripeSubscription = await stripe_service_1.stripeService.getSubscription(tenant.domain_config);
                subscriptionDetails = {
                    id: stripeSubscription.id,
                    status: stripeSubscription.status,
                    current_period_start: stripeSubscription.current_period_start,
                    current_period_end: stripeSubscription.current_period_end,
                    trial_end: stripeSubscription.trial_end,
                    domain_config: stripeSubscription.domain_config,
                    canceled_at: stripeSubscription.canceled_at,
                };
            }
            catch (error) {
                logger_1.logger.error('Failed to get Stripe subscription', { error, subscriptionId: tenant.domain_config });
            }
        }
        if (tenant.subscription_plan) {
            plan = stripe_service_1.stripeService.getPlan(tenant.subscription_plan);
        }
        res.json({
            success: true,
            tenant: {
                domain_config: tenant.domain_config,
                domain_config: tenant.domain_config,
                subscription_plan: tenant.subscription_plan,
                status: tenant.status,
                domain_config: tenant.domain_config,
                domain_config: tenant.domain_config,
                cancellation_reason: tenant.cancellation_reason,
                canceled_at: tenant.canceled_at
            },
            subscription: subscriptionDetails,
            plan
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get subscription', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to get subscription'
        });
    }
});
router.get('/payment-history', async (req, res) => {
    try {
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID is required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('domain_config')
            .eq('id', tenantId)
            .single();
        if (!tenant?.domain_config) {
            return res.json({
                success: true,
                payments: []
            });
        }
        const { data: payments } = await database_1.supabaseAdmin
            .from('payment_history')
            .select('*')
            .eq('domain_config', tenant.domain_config)
            .order('created_at', { ascending: false });
        res.json({
            success: true,
            payments: payments || []
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get payment history', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to get payment history'
        });
    }
});
router.post('/webhook', rawBodyMiddleware, async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        if (!signature) {
            return res.status(400).send('Missing Stripe signature');
        }
        await stripe_service_1.stripeService.handleWebhook(req.body, signature);
        res.status(200).send('Webhook processed successfully');
    }
    catch (error) {
        logger_1.logger.error('Webhook processing failed', { error });
        res.status(400).send('Webhook processing failed');
    }
});
exports.default = router;
//# sourceMappingURL=billing-broken.js.map