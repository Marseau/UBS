"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeService = exports.StripeService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const database_1 = require("@/config/database");
const logger_1 = require("@/utils/logger");
class StripeService {
    constructor() {
        this.plans = {
            basico: {
                id: 'basico',
                name: 'Básico',
                priceId: process.env.STRIPE_BASICO_PRICE_ID || '',
                price: 5800,
                currency: 'brl',
                interval: 'month',
                features: [
                    'Até 200 conversas/mês',
                    'WhatsApp ilimitado',
                    'Mensagens ilimitadas',
                    'IA especializada (6 segmentos)',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard básico'
                ],
                maxConversations: 200,
                autoUpgradeTo: 'profissional',
                overagePrice: null,
                trialDays: 15
            },
            profissional: {
                id: 'profissional',
                name: 'Profissional',
                priceId: process.env.STRIPE_PROFISSIONAL_PRICE_ID || '',
                price: 11600,
                currency: 'brl',
                interval: 'month',
                features: [
                    'Até 400 conversas/mês',
                    'WhatsApp ilimitado',
                    'Mensagens ilimitadas',
                    'IA especializada (6 segmentos)',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard avançado',
                    'Analytics completo',
                    'Suporte prioritário'
                ],
                maxConversations: 400,
                autoUpgradeTo: 'enterprise',
                overagePrice: null,
                trialDays: 15
            },
            enterprise: {
                id: 'enterprise',
                name: 'Enterprise',
                priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
                price: 29000,
                currency: 'brl',
                interval: 'month',
                features: [
                    'Até 1250 conversas/mês',
                    'WhatsApp ilimitado',
                    'Mensagens ilimitadas',
                    'IA especializada (6 segmentos)',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard enterprise',
                    'Analytics avançado',
                    'API personalizada',
                    'Suporte dedicado',
                    'Excedentes: R$ 0,25/conversa'
                ],
                maxConversations: 1250,
                autoUpgradeTo: null,
                overagePrice: 25,
                trialDays: 15
            }
        };
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (!stripeSecretKey) {
            throw new Error('STRIPE_SECRET_KEY environment variable is required');
        }
        this.stripe = new stripe_1.default(stripeSecretKey, {
            apiVersion: '2023-10-16',
            typescript: true,
        });
    }
    getPlans() {
        return Object.values(this.plans);
    }
    getPlan(planId) {
        return this.plans[planId] || null;
    }
    async createCustomer(email, name, metadata) {
        try {
            const customer = await this.stripe.customers.create({
                email,
                name,
                metadata: {
                    source: 'ubs_registration',
                    ...metadata
                }
            });
            logger_1.logger.info('Stripe customer created', { customerId: customer.id, email });
            return customer;
        }
        catch (error) {
            logger_1.logger.error('Failed to create Stripe customer', { error, email });
            throw new Error('Failed to create customer');
        }
    }
    async createCheckoutSession(planId, customerEmail, tenantId, successUrl, cancelUrl) {
        const plan = this.getPlan(planId);
        if (!plan) {
            throw new Error(`Invalid plan: ${planId}`);
        }
        try {
            const session = await this.stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card', 'boleto'],
                customer_email: customerEmail,
                line_items: [
                    {
                        price: plan.priceId,
                        quantity: 1,
                    },
                ],
                subscription_data: {
                    trial_period_days: plan.trialDays,
                    metadata: {
                        plan_id: planId,
                        tenant_id: tenantId || '',
                    },
                },
                metadata: {
                    plan_id: planId,
                    tenant_id: tenantId || '',
                },
                success_url: successUrl || `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/pricing`,
                locale: 'pt-BR',
                billing_address_collection: 'required',
                allow_promotion_codes: true,
            });
            logger_1.logger.info('Checkout session created', {
                sessionId: session.id,
                planId,
                customerEmail,
                tenantId
            });
            return session;
        }
        catch (error) {
            logger_1.logger.error('Failed to create checkout session', { error, planId, customerEmail });
            throw new Error('Failed to create checkout session');
        }
    }
    async createBillingPortalSession(customerId, returnUrl) {
        try {
            const session = await this.stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl || `${process.env.FRONTEND_URL}/settings`,
            });
            logger_1.logger.info('Billing portal session created', { customerId, sessionId: session.id });
            return session;
        }
        catch (error) {
            logger_1.logger.error('Failed to create billing portal session', { error, customerId });
            throw new Error('Failed to create billing portal session');
        }
    }
    async cancelSubscription(subscriptionId, reason) {
        try {
            const subscription = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true,
                metadata: {
                    cancellation_reason: reason || 'user_requested',
                    cancelled_at: new Date().toISOString(),
                },
            });
            logger_1.logger.info('Subscription cancelled', { subscriptionId, reason });
            return subscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel subscription', { error, subscriptionId });
            throw new Error('Failed to cancel subscription');
        }
    }
    async cancelSubscriptionImmediately(subscriptionId, reason) {
        try {
            const subscription = await this.stripe.subscriptions.cancel(subscriptionId, {
                invoice_now: false,
                prorate: true,
            });
            logger_1.logger.info('Subscription cancelled immediately', { subscriptionId, reason });
            return subscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel subscription immediately', { error, subscriptionId });
            throw new Error('Failed to cancel subscription immediately');
        }
    }
    async reactivateSubscription(subscriptionId) {
        try {
            const subscription = await this.stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false,
            });
            logger_1.logger.info('Subscription reactivated', { subscriptionId });
            return subscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to reactivate subscription', { error, subscriptionId });
            throw new Error('Failed to reactivate subscription');
        }
    }
    async changeSubscriptionPlan(subscriptionId, newPlanId) {
        const newPlan = this.getPlan(newPlanId);
        if (!newPlan) {
            throw new Error(`Invalid plan: ${newPlanId}`);
        }
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['items.data.price'],
            });
            const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
                items: [
                    {
                        id: subscription.items.data[0].id,
                        price: newPlan.priceId,
                    },
                ],
                proration_behavior: 'always_invoice',
                metadata: {
                    ...subscription.metadata,
                    plan_id: newPlanId,
                    plan_changed_at: new Date().toISOString(),
                },
            });
            logger_1.logger.info('Subscription plan changed', { subscriptionId, newPlanId });
            return updatedSubscription;
        }
        catch (error) {
            logger_1.logger.error('Failed to change subscription plan', { error, subscriptionId, newPlanId });
            throw new Error('Failed to change subscription plan');
        }
    }
    async getSubscription(subscriptionId) {
        try {
            return await this.stripe.subscriptions.retrieve(subscriptionId, {
                expand: ['customer', 'items.data.price'],
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to get subscription', { error, subscriptionId });
            throw new Error('Failed to get subscription');
        }
    }
    async getCustomerSubscriptions(customerId) {
        try {
            const subscriptions = await this.stripe.subscriptions.list({
                customer: customerId,
                expand: ['data.items.data.price'],
            });
            return subscriptions.data;
        }
        catch (error) {
            logger_1.logger.error('Failed to get customer subscriptions', { error, customerId });
            throw new Error('Failed to get customer subscriptions');
        }
    }
    async handleWebhook(body, signature) {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET environment variable is required');
        }
        let event;
        try {
            event = this.stripe.webhooks.constructEvent(body, signature, webhookSecret);
        }
        catch (error) {
            logger_1.logger.error('Webhook signature verification failed', { error });
            throw new Error('Webhook signature verification failed');
        }
        logger_1.logger.info('Processing Stripe webhook', { eventType: event.type, eventId: event.id });
        switch (event.type) {
            case 'checkout.session.completed':
                await this.handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await this.handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
            default:
                logger_1.logger.info('Unhandled webhook event type', { eventType: event.type });
        }
    }
    async handleCheckoutCompleted(session) {
        try {
            const { plan_id: planId, tenant_id: tenantId } = session.metadata || {};
            const customerId = session.customer;
            const subscriptionId = session.subscription;
            if (!planId || !tenantId) {
                logger_1.logger.error('Missing metadata in checkout session', { sessionId: session.id });
                return;
            }
            await database_1.supabaseAdmin
                .from('tenants')
                .update({
                stripe_customer_id: customerId,
                subscription_id: subscriptionId,
                plan_id: planId,
                subscription_status: 'trialing', // Começa em trial após Stripe checkout
                subscription_start_date: new Date().toISOString().split('T')[0], // Data real da assinatura Stripe
                trial_ends_at: session.subscription
                    ? new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                    : null,
                updated_at: new Date().toISOString(),
            })
                .eq('id', tenantId);
            const subscriptionData = {
                tenant_id: tenantId,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: customerId,
                plan_id: planId,
                status: 'trialing',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                trial_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            };
            await database_1.supabaseAdmin
                .from('subscriptions')
                .insert(subscriptionData);
            logger_1.logger.info('Checkout completed and tenant updated', { tenantId, planId, subscriptionId });
        }
        catch (error) {
            logger_1.logger.error('Failed to handle checkout completed', { error, sessionId: session.id });
        }
    }
    async handleSubscriptionUpdated(subscription) {
        try {
            const subscriptionUpdate = {
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                trial_end: subscription.trial_end
                    ? new Date(subscription.trial_end * 1000).toISOString()
                    : null,
                cancel_at_period_end: subscription.cancel_at_period_end,
                canceled_at: subscription.canceled_at
                    ? new Date(subscription.canceled_at * 1000).toISOString()
                    : null,
                updated_at: new Date().toISOString(),
            };
            await database_1.supabaseAdmin
                .from('subscriptions')
                .update(subscriptionUpdate)
                .eq('stripe_subscription_id', subscription.id);
            await database_1.supabaseAdmin
                .from('tenants')
                .update({
                subscription_status: subscription.status,
                updated_at: new Date().toISOString(),
            })
                .eq('subscription_id', subscription.id);
            logger_1.logger.info('Subscription updated', { subscriptionId: subscription.id, status: subscription.status });
        }
        catch (error) {
            logger_1.logger.error('Failed to handle subscription updated', { error, subscriptionId: subscription.id });
        }
    }
    async handleSubscriptionDeleted(subscription) {
        try {
            await database_1.supabaseAdmin
                .from('subscriptions')
                .update({
                status: 'canceled',
                canceled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq('stripe_subscription_id', subscription.id);
            await database_1.supabaseAdmin
                .from('tenants')
                .update({
                subscription_status: 'canceled',
                updated_at: new Date().toISOString(),
            })
                .eq('subscription_id', subscription.id);
            logger_1.logger.info('Subscription deleted', { subscriptionId: subscription.id });
        }
        catch (error) {
            logger_1.logger.error('Failed to handle subscription deleted', { error, subscriptionId: subscription.id });
        }
    }
    async handlePaymentSucceeded(invoice) {
        try {
            const subscriptionId = invoice.subscription;
            if (subscriptionId) {
                await database_1.supabaseAdmin
                    .from('payment_history')
                    .insert({
                    subscription_id: subscriptionId,
                    stripe_invoice_id: invoice.id,
                    amount: invoice.amount_paid,
                    currency: invoice.currency,
                    status: 'succeeded',
                    paid_at: new Date(invoice.status_transitions.paid_at * 1000).toISOString(),
                });
                logger_1.logger.info('Payment succeeded', { subscriptionId, invoiceId: invoice.id, amount: invoice.amount_paid });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to handle payment succeeded', { error, invoiceId: invoice.id });
        }
    }
    async handlePaymentFailed(invoice) {
        try {
            const subscriptionId = invoice.subscription;
            if (subscriptionId) {
                await database_1.supabaseAdmin
                    .from('payment_history')
                    .insert({
                    subscription_id: subscriptionId,
                    stripe_invoice_id: invoice.id,
                    amount: invoice.amount_due,
                    currency: invoice.currency,
                    status: 'failed',
                    failed_at: new Date().toISOString(),
                });
                const subscription = await this.getSubscription(subscriptionId);
                if (subscription.status === 'past_due') {
                    await database_1.supabaseAdmin
                        .from('tenants')
                        .update({
                        subscription_status: 'past_due',
                        updated_at: new Date().toISOString(),
                    })
                        .eq('subscription_id', subscriptionId);
                }
                logger_1.logger.info('Payment failed', { subscriptionId, invoiceId: invoice.id, amount: invoice.amount_due });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to handle payment failed', { error, invoiceId: invoice.id });
        }
    }
}
exports.StripeService = StripeService;
exports.stripeService = new StripeService();
//# sourceMappingURL=stripe.service.js.map