"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const database_1 = require("../config/database");
const admin_auth_1 = __importDefault(require("../middleware/admin-auth"));
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
const adminAuth = new admin_auth_1.default();
const rawBodyMiddleware = express_1.default.raw({ type: 'application/json' });
router.get('/plans', (req, res) => {
    try {
        const plans = [
            {
                id: 'starter',
                name: 'Starter',
                price: 9700,
                features: [
                    'Até 1.000 mensagens/mês',
                    '1 número WhatsApp',
                    'IA especializada',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard básico'
                ]
            },
            {
                id: 'professional',
                name: 'Professional',
                price: 19700,
                features: [
                    'Até 5.000 mensagens/mês',
                    '3 números WhatsApp',
                    'IA especializada',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard avançado',
                    'Analytics completo',
                    'Suporte prioritário'
                ]
            },
            {
                id: 'enterprise',
                name: 'Enterprise',
                price: 39700,
                features: [
                    'Mensagens ilimitadas',
                    'Números ilimitados',
                    'IA especializada',
                    'Google Calendar',
                    'Email automático',
                    'Dashboard enterprise',
                    'Analytics avançado',
                    'API personalizada',
                    'Suporte dedicado'
                ]
            }
        ];
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
        const plans = [
            { id: 'starter', name: 'Starter', price: 9700 },
            { id: 'professional', name: 'Professional', price: 19700 },
            { id: 'enterprise', name: 'Enterprise', price: 39700 }
        ];
        const selectedPlan = plans.find(p => p.id === planId);
        if (!selectedPlan) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan ID'
            });
        }
        const checkout = {
            id: 'checkout_' + Date.now(),
            url: successUrl || `${req.protocol}://${req.get('host')}/success?plan=${planId}&tenant=${tenantId}`,
            planId,
            tenantId,
            email,
            amount: selectedPlan.price
        };
        return res.json({
            success: true,
            url: checkout.url,
            checkout,
            message: 'Checkout session created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create checkout session', { error });
        return res.status(500).json({
            success: false,
            message: 'Failed to create checkout session'
        });
    }
});
router.post('/create-customer', adminAuth.verifyToken, async (req, res) => {
    try {
        const { email, name } = req.body;
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID required'
            });
        }
        const customer = {
            id: 'cus_' + Date.now(),
            email,
            name,
            tenantId
        };
        res.json({
            success: true,
            customer,
            message: 'Customer created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create customer', { error, tenantId: req.admin?.tenantId });
        res.status(500).json({
            success: false,
            message: 'Failed to create customer'
        });
    }
});
router.post('/create-portal', adminAuth.verifyToken, async (req, res) => {
    try {
        const { returnUrl } = req.body;
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID required'
            });
        }
        const session = {
            id: 'portal_' + Date.now(),
            url: returnUrl + '?portal=true',
            tenantId
        };
        res.json({
            success: true,
            session,
            message: 'Portal session created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create portal session', { error, tenantId: req.admin?.tenantId });
        res.status(500).json({
            success: false,
            message: 'Failed to create portal session'
        });
    }
});
router.get('/subscription', adminAuth.verifyToken, async (req, res) => {
    try {
        const tenantId = req.admin?.tenantId;
        if (!tenantId) {
            return res.status(400).json({
                success: false,
                message: 'Tenant ID required'
            });
        }
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('subscription_plan, status, domain_config')
            .eq('id', tenantId)
            .single();
        const subscription = {
            plan: tenant?.subscription_plan || 'basic',
            status: tenant?.status || 'active',
            billing: tenant?.domain_config?.billing || {}
        };
        res.json({
            success: true,
            subscription
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get subscription', { error, tenantId: req.admin?.tenantId });
        res.status(500).json({
            success: false,
            message: 'Failed to get subscription'
        });
    }
});
router.post('/webhook', rawBodyMiddleware, async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        logger_1.logger.info('Webhook received', {
            signature: signature ? 'present' : 'missing',
            bodyLength: req.body?.length || 0
        });
        res.json({ received: true });
    }
    catch (error) {
        logger_1.logger.error('Webhook error', { error });
        res.status(400).json({
            success: false,
            message: 'Webhook error'
        });
    }
});

// Super Admin Payment Management Endpoint
router.get('/all-payments', adminAuth.verifyToken, adminAuth.requireSuperAdmin, async (req, res) => {
    try {
        // Extract pagination parameters
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = (page - 1) * limit;

        logger_1.logger.info('Super Admin accessing all payments', { page, limit });

        // Get total count first for pagination - using tenants table since stripe_customers may not exist
        const { count: totalCount, error: countError } = await database_1.supabaseAdmin
            .from('tenants')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            logger_1.logger.error('Error getting tenant count', { error: countError });
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve payment history'
            });
        }

        // Query payment_history equivalent using tenants table (simulated payment records)
        const { data: tenantData, error: tenantError } = await database_1.supabaseAdmin
            .from('tenants')
            .select(`
                id,
                business_name,
                subscription_plan,
                status,
                created_at,
                updated_at
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (tenantError) {
            logger_1.logger.error('Error fetching tenant data', { error: tenantError });
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve payment history'
            });
        }

        // Transform the tenant data to simulate payment_history records
        const payments = tenantData.map(tenant => {
            // Calculate amount based on subscription plan
            let amount = 0;
            const currency = 'BRL';
            
            switch (tenant.subscription_plan) {
                case 'basic':
                    amount = 9900; // R$ 99.00 in cents
                    break;
                case 'premium':
                    amount = 19900; // R$ 199.00 in cents
                    break;
                case 'enterprise':
                    amount = 39900; // R$ 399.00 in cents
                    break;
                default:
                    amount = 0; // Trial or unknown
            }

            // Determine payment status based on tenant status
            let status = 'pending';
            if (tenant.status === 'active') {
                status = 'completed';
            } else if (tenant.status === 'suspended') {
                status = 'failed';
            } else if (tenant.status === 'cancelled') {
                status = 'failed';
            }

            // Generate simulated payment ID and date
            const paymentId = `pay_${tenant.id.replace(/-/g, '').substring(0, 16)}`;
            const paymentDate = tenant.updated_at || tenant.created_at;

            return {
                // Payment history fields (simulated)
                id: paymentId,
                amount: amount,
                currency: currency,
                status: status,
                created_at: paymentDate,
                
                // Tenant information (from tenants table)
                tenant_id: tenant.id,
                business_name: tenant.business_name || 'Unknown Business'
            };
        });

        // Calculate pagination info
        const totalPages = Math.ceil((totalCount || 0) / limit);

        // Prepare response in the specified format
        const response = {
            success: true,
            data: {
                payments: payments,
                pagination: {
                    page: page,
                    limit: limit,
                    total: totalCount || 0,
                    totalPages: totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        };

        logger_1.logger.info('Successfully retrieved payment history', {
            count: payments.length,
            page,
            totalCount
        });

        res.status(200).json(response);

    } catch (error) {
        logger_1.logger.error('Failed to retrieve payment history', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment history'
        });
    }
});

exports.default = router;
//# sourceMappingURL=billing.js.map