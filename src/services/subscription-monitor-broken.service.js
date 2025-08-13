"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionMonitor = exports.SubscriptionMonitorService = void 0;
const database_1 = require("@/config/database");
const stripe_service_1 = require("./stripe.service");
const logger_1 = require("@/utils/logger");
const email_service_1 = require("./email.service");
const whatsapp_service_1 = require("./whatsapp.service");
class SubscriptionMonitorService {
    constructor() {
        this.isRunning = false;
        this.emailService = new email_service_1.EmailService();
        this.whatsappService = new whatsapp_service_1.WhatsAppService();
    }
    startMonitoring() {
        if (this.isRunning) {
            logger_1.logger.warn('Subscription monitoring already running');
            return;
        }
        logger_1.logger.info('Starting subscription monitoring service');
        this.isRunning = true;
        logger_1.logger.info('Subscription monitoring scheduled tasks disabled in development');
        cron.schedule('0 * * * *', async () => {
            await this.checkTrialSubscriptions();
            await this.checkActiveSubscriptions();
            await this.checkUsageLimits();
        });
        cron.schedule('0 9 * * *', async () => {
            await this.sendDailySummary();
        });
        cron.schedule('0 */6 * * *', async () => {
            await this.processFailedPayments();
        });
        logger_1.logger.info('Subscription monitoring cron jobs scheduled');
    }
    stopMonitoring() {
        this.isRunning = false;
        logger_1.logger.info('Subscription monitoring stopped');
    }
    async checkTrialSubscriptions() {
        try {
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select(`
          id, business_name, business_email, subscription_status, 
          trial_ends_at, plan_id, stripe_customer_id
        `)
                .eq('subscription_status', 'trialing')
                .not('trial_ends_at', 'is', null);
            if (error) {
                logger_1.logger.error('Error fetching trial subscriptions', { error });
                return;
            }
            for (const tenant of tenants || []) {
                await this.processTrialTenant(tenant);
            }
            logger_1.logger.info(`Processed ${tenants?.length || 0} trial subscriptions`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkTrialSubscriptions', { error });
        }
    }
    async processTrialTenant(tenant) {
        const trialEnd = new Date(tenant.trial_ends_at);
        const now = new Date();
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 0) {
            await this.handleTrialEnded(tenant);
            return;
        }
        if ([3, 1].includes(daysRemaining)) {
            await this.handleTrialEnding(tenant, daysRemaining);
        }
    }
    async handleTrialEnding(tenant, daysRemaining) {
        const alert = {
            id: `trial_ending_${tenant.id}_${daysRemaining}d`,
            tenantId: tenant.id,
            type: 'trial_ending',
            severity: daysRemaining <= 1 ? 'critical' : 'warning',
            title: `Teste gratuito termina em ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`,
            message: `Seu teste gratuito do UBS termina em ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}. Adicione um método de pagamento para continuar usando todas as funcionalidades.`,
            daysRemaining,
            actionRequired: true
        };
        const alertExists = await this.checkAlertExists(alert.id, new Date());
        if (alertExists)
            return;
        await Promise.all([
            this.sendEmailAlert(tenant, alert),
            this.sendWhatsAppAlert(tenant, alert),
            this.createBillingAlert(alert)
        ]);
        logger_1.logger.info('Trial ending notification sent', {
            tenantId: tenant.id,
            daysRemaining,
            businessName: tenant.business_name
        });
    }
    async handleTrialEnded(tenant) {
        const alert = {
            id: `trial_ended_${tenant.id}`,
            tenantId: tenant.id,
            type: 'trial_ended',
            severity: 'critical',
            title: 'Teste gratuito expirado',
            message: 'Seu teste gratuito do UBS expirou. Adicione um método de pagamento para reativar sua conta e continuar usando o sistema.',
            daysRemaining: 0,
            actionRequired: true
        };
        await database_1.supabaseAdmin
            .from('tenants')
            .update({
            subscription_status: 'incomplete',
            updated_at: new Date().toISOString()
        })
            .eq('id', tenant.id);
        await Promise.all([
            this.sendEmailAlert(tenant, alert),
            this.sendWhatsAppAlert(tenant, alert),
            this.createBillingAlert(alert)
        ]);
        logger_1.logger.info('Trial ended notification sent', {
            tenantId: tenant.id,
            businessName: tenant.business_name
        });
    }
    async checkActiveSubscriptions() {
        try {
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select(`
          id, business_name, business_email, subscription_status,
          subscription_id, plan_id, cancel_at_period_end
        `)
                .in('subscription_status', ['active', 'past_due']);
            if (error) {
                logger_1.logger.error('Error fetching active subscriptions', { error });
                return;
            }
            for (const tenant of tenants || []) {
                await this.processActiveTenant(tenant);
            }
            logger_1.logger.info(`Processed ${tenants?.length || 0} active subscriptions`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkActiveSubscriptions', { error });
        }
    }
    async processActiveTenant(tenant) {
        if (!tenant.subscription_id)
            return;
        try {
            const subscription = await stripe_service_1.stripeService.getSubscription(tenant.subscription_id);
            const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
            const now = new Date();
            const daysUntilRenewal = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (tenant.cancel_at_period_end && daysUntilRenewal <= 7) {
                await this.handleCancellationReminder(tenant, daysUntilRenewal);
            }
            if (tenant.subscription_status === 'past_due') {
                await this.handlePastDueSubscription(tenant);
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing active tenant', { error, tenantId: tenant.id });
        }
    }
    async handleCancellationReminder(tenant, daysRemaining) {
        const alert = {
            id: `cancellation_reminder_${tenant.id}_${daysRemaining}d`,
            tenantId: tenant.id,
            type: 'subscription_expired',
            severity: 'warning',
            title: `Assinatura será cancelada em ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}`,
            message: `Sua assinatura do UBS será cancelada em ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''}. Você pode reativar a qualquer momento antes dessa data.`,
            daysRemaining,
            actionRequired: true
        };
        const alertExists = await this.checkAlertExists(alert.id, new Date());
        if (alertExists)
            return;
        await Promise.all([
            this.sendEmailAlert(tenant, alert),
            this.sendWhatsAppAlert(tenant, alert),
            this.createBillingAlert(alert)
        ]);
    }
    async handlePastDueSubscription(tenant) {
        const alert = {
            id: `past_due_${tenant.id}`,
            tenantId: tenant.id,
            type: 'payment_failed',
            severity: 'critical',
            title: 'Pagamento em atraso',
            message: 'Seu pagamento não foi processado. Atualize seu método de pagamento para evitar a suspensão da conta.',
            actionRequired: true
        };
        await Promise.all([
            this.sendEmailAlert(tenant, alert),
            this.sendWhatsAppAlert(tenant, alert),
            this.createBillingAlert(alert)
        ]);
    }
    async checkUsageLimits() {
        try {
            const { data: usageData, error } = await database_1.supabaseAdmin
                .rpc('check_all_usage_limits');
            if (error) {
                logger_1.logger.error('Error checking usage limits', { error });
                return;
            }
            for (const usage of usageData || []) {
                if (usage.percentage_used >= 80) {
                    await this.handleUsageAlert(usage);
                }
            }
            logger_1.logger.info(`Checked usage limits for tenants`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkUsageLimits', { error });
        }
    }
    async handleUsageAlert(usage) {
        const isNearLimit = usage.percentage_used >= 90;
        const alert = {
            id: `usage_${usage.tenant_id}_${usage.usage_type}_${Math.floor(usage.percentage_used)}`,
            tenantId: usage.tenant_id,
            type: 'usage_limit',
            severity: isNearLimit ? 'critical' : 'warning',
            title: `Limite de ${usage.usage_type} em ${Math.floor(usage.percentage_used)}%`,
            message: `Você já utilizou ${Math.floor(usage.percentage_used)}% do seu limite de ${usage.usage_type}. ${isNearLimit ? 'Considere fazer upgrade do seu plano.' : ''}`,
            actionRequired: isNearLimit
        };
        const { data: tenant } = await database_1.supabaseAdmin
            .from('tenants')
            .select('business_name, business_email')
            .eq('id', usage.tenant_id)
            .single();
        if (tenant) {
            await Promise.all([
                this.sendEmailAlert(tenant, alert),
                this.sendWhatsAppAlert(tenant, alert),
                this.createBillingAlert(alert)
            ]);
        }
    }
    async processFailedPayments() {
        try {
            const { data: failedPayments, error } = await database_1.supabaseAdmin
                .from('payment_history')
                .select(`
          subscription_id,
          tenant_id,
          amount,
          created_at,
          tenants!inner(business_name, business_email)
        `)
                .eq('status', 'failed')
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
            if (error) {
                logger_1.logger.error('Error fetching failed payments', { error });
                return;
            }
            for (const payment of failedPayments || []) {
                await this.handleFailedPayment(payment);
            }
            logger_1.logger.info(`Processed ${failedPayments?.length || 0} failed payments`);
        }
        catch (error) {
            logger_1.logger.error('Error in processFailedPayments', { error });
        }
    }
    async handleFailedPayment(payment) {
        const alert = {
            id: `payment_failed_${payment.tenant_id}_${payment.subscription_id}`,
            tenantId: payment.tenant_id,
            type: 'payment_failed',
            severity: 'critical',
            title: 'Falha no pagamento',
            message: `Não conseguimos processar seu pagamento de R$ ${(payment.amount / 100).toFixed(2)}. Atualize seu método de pagamento para evitar a suspensão da conta.`,
            actionRequired: true
        };
        await Promise.all([
            this.sendEmailAlert(payment.tenants, alert),
            this.sendWhatsAppAlert(payment.tenants, alert),
            this.createBillingAlert(alert)
        ]);
    }
    async sendDailySummary() {
        try {
            const { data: summary } = await database_1.supabaseAdmin
                .rpc('get_subscription_summary');
            if (summary) {
                logger_1.logger.info('Daily subscription summary generated', { summary });
            }
        }
        catch (error) {
            logger_1.logger.error('Error sending daily summary', { error });
        }
    }
    async sendEmailAlert(tenant, alert) {
        try {
            if (!tenant.business_email)
                return;
            await this.emailService.sendSubscriptionAlert(tenant, alert);
            logger_1.logger.info('Email alert sent', { tenantId: alert.tenantId, type: alert.type });
        }
        catch (error) {
            logger_1.logger.error('Error sending email alert', { error, alert });
        }
    }
    async sendWhatsAppAlert(tenant, alert) {
        try {
            const { data: tenantData } = await database_1.supabaseAdmin
                .from('tenants')
                .select('whatsapp_number, business_name')
                .eq('id', alert.tenantId)
                .single();
            if (!tenantData?.whatsapp_number)
                return;
            const message = this.formatWhatsAppAlert(alert, tenantData.business_name);
            await this.whatsappService.sendTemplateMessage(tenantData.whatsapp_number, 'subscription_alert', {
                business_name: tenantData.business_name,
                alert_title: alert.title,
                alert_message: alert.message,
                action_url: `${process.env.FRONTEND_URL}/billing`
            });
            logger_1.logger.info('WhatsApp alert sent', { tenantId: alert.tenantId, type: alert.type });
        }
        catch (error) {
            logger_1.logger.error('Error sending WhatsApp alert', { error, alert });
        }
    }
    formatWhatsAppAlert(alert, businessName) {
        const emoji = alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️';
        return `${emoji} *${alert.title}*

Olá, ${businessName}!

${alert.message}

${alert.actionRequired ? `\n✅ *Ação necessária:* Acesse seu painel de billing para resolver esta questão.\n\n🔗 ${process.env.FRONTEND_URL}/billing` : ''}

---
_Mensagem automática do UBS_`;
    }
    async createBillingAlert(alert) {
        try {
            await database_1.supabaseAdmin
                .from('email_logs')
                .upsert({
                tenant_id: alert.tenantId,
                alert_type: alert.type,
                title: alert.title,
                message: alert.message,
                severity: alert.severity,
                action_url: '/billing',
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            }, {
                onConflict: 'tenant_id,alert_type',
                ignoreDuplicates: false
            });
            logger_1.logger.info('Billing alert created', { tenantId: alert.tenantId, type: alert.type });
        }
        catch (error) {
            logger_1.logger.error('Error creating billing alert', { error, alert });
        }
    }
    async checkAlertExists(alertId, date) {
        try {
            const today = date.toISOString().split('T')[0];
            const { data, error } = await database_1.supabaseAdmin
                .from('email_logs')
                .select('id')
                .ilike('title', `%${alertId}%`)
                .gte('created_at', `${today}T00:00:00.000Z`)
                .lt('created_at', `${today}T23:59:59.999Z`)
                .limit(1);
            return (data?.length || 0) > 0;
        }
        catch (error) {
            logger_1.logger.error('Error checking alert exists', { error, alertId });
            return false;
        }
    }
    async getSubscriptionInsights(tenantId) {
        try {
            const { data: tenant } = await database_1.supabaseAdmin
                .from('tenants')
                .select(`
          subscription_status, trial_ends_at, cancel_at_period_end,
          subscription_id, plan_id
        `)
                .eq('id', tenantId)
                .single();
            if (!tenant)
                return null;
            const insights = {
                status: tenant.subscription_status,
                alerts: []
            };
            if (tenant.subscription_status === 'trialing' && tenant.trial_ends_at) {
                const trialEnd = new Date(tenant.trial_ends_at);
                const daysRemaining = Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                insights.trial = {
                    daysRemaining: Math.max(0, daysRemaining),
                    endDate: trialEnd.toISOString()
                };
                if (daysRemaining <= 3) {
                    insights.alerts.push({
                        type: 'trial_ending',
                        severity: daysRemaining <= 1 ? 'critical' : 'warning',
                        message: `Teste termina em ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''}`
                    });
                }
            }
            if (tenant.cancel_at_period_end && tenant.subscription_id) {
                try {
                    const subscription = await stripe_service_1.stripeService.getSubscription(tenant.subscription_id);
                    const endDate = new Date(subscription.current_period_end * 1000);
                    const daysRemaining = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    insights.cancellation = {
                        daysRemaining: Math.max(0, daysRemaining),
                        endDate: endDate.toISOString()
                    };
                    insights.alerts.push({
                        type: 'cancellation_scheduled',
                        severity: 'warning',
                        message: `Assinatura será cancelada em ${daysRemaining} dia${daysRemaining !== 1 ? 's' : ''}`
                    });
                }
                catch (error) {
                    logger_1.logger.error('Error getting subscription for insights', { error });
                }
            }
            return insights;
        }
        catch (error) {
            logger_1.logger.error('Error getting subscription insights', { error, tenantId });
            return null;
        }
    }
}
exports.SubscriptionMonitorService = SubscriptionMonitorService;
exports.subscriptionMonitor = new SubscriptionMonitorService();
//# sourceMappingURL=subscription-monitor-broken.service.js.map