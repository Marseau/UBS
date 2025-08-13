"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionMonitor = exports.SubscriptionMonitorService = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
class SubscriptionMonitorService {
    constructor() {
        this.isRunning = false;
    }
    startMonitoring() {
        if (this.isRunning) {
            logger_1.logger.warn('Subscription monitoring already running');
            return;
        }
        logger_1.logger.info('Starting subscription monitoring service');
        this.isRunning = true;
        logger_1.logger.info('Subscription monitoring service started (simplified mode)');
    }
    stopMonitoring() {
        if (!this.isRunning) {
            logger_1.logger.warn('Subscription monitoring not running');
            return;
        }
        logger_1.logger.info('Stopping subscription monitoring service');
        this.isRunning = false;
    }
    async checkTrialSubscriptions() {
        try {
            logger_1.logger.info('Checking trial subscriptions...');
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select('id, business_name, email, status, created_at')
                .eq('status', 'trial');
            if (error) {
                logger_1.logger.error('Error fetching trial subscriptions', { error });
                return;
            }
            for (const tenant of tenants || []) {
                await this.processTrial(tenant);
            }
            logger_1.logger.info(`Processed ${tenants?.length || 0} trial subscriptions`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkTrialSubscriptions', { error });
        }
    }
    async processTrial(tenant) {
        try {
            const trialStart = new Date(tenant.created_at || '');
            const trialEnd = new Date(trialStart);
            trialEnd.setDate(trialEnd.getDate() + 15);
            const now = new Date();
            const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysRemaining <= 0) {
                await this.handleTrialExpired(tenant);
            }
            else if (daysRemaining <= 3) {
                await this.handleTrialEnding(tenant, daysRemaining);
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing trial', { error, tenantId: tenant.id });
        }
    }
    async handleTrialEnding(tenant, daysRemaining) {
        const alert = {
            id: `trial_ending_${tenant.id}_${Date.now()}`,
            tenantId: tenant.id,
            type: 'trial_ending',
            severity: 'warning',
            title: 'Trial Ending Soon',
            message: `Your trial expires in ${daysRemaining} day(s). Please upgrade to continue using the service.`,
            daysRemaining,
            actionRequired: true
        };
        await this.createAlert(alert);
        logger_1.logger.info('Trial ending alert created', { tenantId: tenant.id, daysRemaining });
    }
    async handleTrialExpired(tenant) {
        const alert = {
            id: `trial_expired_${tenant.id}_${Date.now()}`,
            tenantId: tenant.id,
            type: 'trial_ended',
            severity: 'critical',
            title: 'Trial Expired',
            message: 'Your trial has expired. Please upgrade to continue using the service.',
            actionRequired: true
        };
        await this.createAlert(alert);
        await database_1.supabaseAdmin
            .from('tenants')
            .update({ status: 'expired' })
            .eq('id', tenant.id);
        logger_1.logger.info('Trial expired - tenant suspended', { tenantId: tenant.id });
    }
    async checkActiveSubscriptions() {
        try {
            logger_1.logger.info('Checking active subscriptions...');
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select('id, business_name, email, status, subscription_plan')
                .in('status', ['active', 'past_due']);
            if (error) {
                logger_1.logger.error('Error fetching active subscriptions', { error });
                return;
            }
            for (const tenant of tenants || []) {
                await this.processActiveSubscription(tenant);
            }
            logger_1.logger.info(`Processed ${tenants?.length || 0} active subscriptions`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkActiveSubscriptions', { error });
        }
    }
    async processActiveSubscription(tenant) {
        try {
            if (tenant.status === 'past_due') {
                const alert = {
                    id: `payment_failed_${tenant.id}_${Date.now()}`,
                    tenantId: tenant.id,
                    type: 'payment_failed',
                    severity: 'critical',
                    title: 'Payment Failed',
                    message: 'Your payment failed. Please update your payment method.',
                    actionRequired: true
                };
                await this.createAlert(alert);
                logger_1.logger.info('Payment failed alert created', { tenantId: tenant.id });
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing active subscription', { error, tenantId: tenant.id });
        }
    }
    async checkUsageLimits() {
        try {
            logger_1.logger.info('Checking usage limits...');
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select('id, business_name, subscription_plan, domain_config')
                .eq('status', 'active');
            if (error) {
                logger_1.logger.error('Error fetching tenants for usage check', { error });
                return;
            }
            for (const tenant of tenants || []) {
                await this.processUsageLimit(tenant);
            }
            logger_1.logger.info(`Processed usage limits for ${tenants?.length || 0} tenants`);
        }
        catch (error) {
            logger_1.logger.error('Error in checkUsageLimits', { error });
        }
    }
    async processUsageLimit(tenant) {
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const { count: appointmentCount } = await database_1.supabaseAdmin
                .from('appointments')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .gte('created_at', startOfMonth.toISOString());
            const limits = {
                basic: 100,
                pro: 500,
                enterprise: 2000
            };
            const planLimit = limits[tenant.subscription_plan] || 100;
            const usagePercentage = ((appointmentCount || 0) / planLimit) * 100;
            if (usagePercentage >= 90) {
                const alert = {
                    id: `usage_limit_${tenant.id}_${Date.now()}`,
                    tenantId: tenant.id,
                    type: 'usage_limit',
                    severity: usagePercentage >= 100 ? 'critical' : 'warning',
                    title: usagePercentage >= 100 ? 'Usage Limit Exceeded' : 'Usage Limit Warning',
                    message: `You have used ${Math.round(usagePercentage)}% of your monthly appointment limit.`,
                    actionRequired: usagePercentage >= 100
                };
                await this.createAlert(alert);
                logger_1.logger.info('Usage limit alert created', {
                    tenantId: tenant.id,
                    usagePercentage,
                    appointmentCount,
                    planLimit
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing usage limit', { error, tenantId: tenant.id });
        }
    }
    async createAlert(alert) {
        try {
            await database_1.supabaseAdmin
                .from('email_logs')
                .insert({
                tenant_id: alert.tenantId,
                recipient_email: 'admin@system.com',
                subject: alert.title,
                template_name: alert.type,
                status: 'pending'
            });
            logger_1.logger.info('Alert created', { alertId: alert.id, type: alert.type });
        }
        catch (error) {
            logger_1.logger.error('Error creating alert', { error, alertId: alert.id });
        }
    }
    async getAlertsForTenant(tenantId) {
        try {
            const { data: logs, error } = await database_1.supabaseAdmin
                .from('email_logs')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) {
                logger_1.logger.error('Error fetching alerts', { error, tenantId });
                return [];
            }
            return (logs || []).map(log => ({
                id: log.id,
                tenantId: log.tenant_id || '',
                type: log.template_name || 'info',
                severity: 'info',
                title: log.subject || 'Alert',
                message: log.subject || '',
                actionRequired: false
            }));
        }
        catch (error) {
            logger_1.logger.error('Error getting alerts for tenant', { error, tenantId });
            return [];
        }
    }
    async getHealthSummary() {
        try {
            const { data: tenants, error } = await database_1.supabaseAdmin
                .from('tenants')
                .select('status')
                .order('created_at', { ascending: false });
            if (error) {
                throw error;
            }
            const summary = {
                total: tenants?.length || 0,
                active: tenants?.filter(t => t.status === 'active').length || 0,
                trial: tenants?.filter(t => t.status === 'trial').length || 0,
                expired: tenants?.filter(t => t.status === 'expired').length || 0,
                suspended: tenants?.filter(t => t.status === 'suspended').length || 0
            };
            return summary;
        }
        catch (error) {
            logger_1.logger.error('Error getting health summary', { error });
            return {
                total: 0,
                active: 0,
                trial: 0,
                expired: 0,
                suspended: 0
            };
        }
    }
}
exports.SubscriptionMonitorService = SubscriptionMonitorService;
exports.subscriptionMonitor = new SubscriptionMonitorService();
//# sourceMappingURL=subscription-monitor.service.js.map