"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const database_1 = require("../config/database");
class EmailService {
    constructor() {
        this.isConfigured = false;
        this.initializeTransporter();
    }
    async initializeTransporter() {
        try {
            this.transporter = nodemailer_1.default.createTransporter({
                host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
                port: parseInt(process.env.ZOHO_SMTP_PORT || '587'),
                secure: false,
                auth: {
                    user: process.env.ZOHO_SMTP_USER,
                    pass: process.env.ZOHO_SMTP_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            await this.transporter.verify();
            this.isConfigured = true;
            console.log('✅ Zoho SMTP connection established');
        }
        catch (error) {
            console.error('❌ Failed to initialize Zoho SMTP:', error);
            this.isConfigured = false;
        }
    }
    async sendAppointmentConfirmation(appointmentId) {
        try {
            const appointmentData = await this.getAppointmentData(appointmentId);
            if (!appointmentData) {
                throw new Error('Appointment not found');
            }
            const { appointment, tenant, user, service } = appointmentData;
            const emailTemplate = this.buildConfirmationTemplate(appointment, tenant, user, service);
            const mailOptions = {
                from: {
                    name: process.env.EMAIL_FROM_NAME || 'Universal Booking System',
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [
                    {
                        name: user.name || 'Cliente',
                        address: user.email || user.phone + '@whatsapp.temp'
                    }
                ],
                cc: tenant.email ? [{
                        name: tenant.business_name,
                        address: tenant.email
                    }] : [],
                subject: `✅ Agendamento Confirmado - ${service.name} | ${tenant.business_name}`,
                html: emailTemplate,
                attachments: [
                    {
                        filename: 'calendar-event.ics',
                        content: this.generateICalEvent(appointment, tenant, service, user)
                    }
                ]
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                appointmentId,
                tenantId: appointment.tenant_id,
                userId: appointment.user_id,
                type: 'confirmation',
                recipient: user.email || user.phone,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Confirmation email sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send confirmation email:', error);
            return {
                success: false,
                message: `Failed to send confirmation email: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async sendAppointmentReminder(appointmentId, reminderType) {
        try {
            const appointmentData = await this.getAppointmentData(appointmentId);
            if (!appointmentData) {
                throw new Error('Appointment not found');
            }
            const { appointment, tenant, user, service } = appointmentData;
            const emailTemplate = this.buildReminderTemplate(appointment, tenant, user, service, reminderType);
            const subject = reminderType === 'day_before'
                ? `🔔 Lembrete: Agendamento amanhã - ${service.name}`
                : `⏰ Seu agendamento é em 1 hora - ${service.name}`;
            const mailOptions = {
                from: {
                    name: process.env.EMAIL_FROM_NAME || tenant.business_name,
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [{
                        name: user.name || 'Cliente',
                        address: user.email || user.phone + '@whatsapp.temp'
                    }],
                subject,
                html: emailTemplate
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                appointmentId,
                tenantId: appointment.tenant_id,
                userId: appointment.user_id,
                type: `reminder_${reminderType}`,
                recipient: user.email || user.phone,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Reminder email sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send reminder email:', error);
            return {
                success: false,
                message: `Failed to send reminder email: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async sendAppointmentCancellation(appointmentId, reason) {
        try {
            const appointmentData = await this.getAppointmentData(appointmentId);
            if (!appointmentData) {
                throw new Error('Appointment not found');
            }
            const { appointment, tenant, user, service } = appointmentData;
            const emailTemplate = this.buildCancellationTemplate(appointment, tenant, user, service, reason);
            const mailOptions = {
                from: {
                    name: process.env.EMAIL_FROM_NAME || tenant.business_name,
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [{
                        name: user.name || 'Cliente',
                        address: user.email || user.phone + '@whatsapp.temp'
                    }],
                cc: tenant.email ? [{
                        name: tenant.business_name,
                        address: tenant.email
                    }] : [],
                subject: `❌ Agendamento Cancelado - ${service.name} | ${tenant.business_name}`,
                html: emailTemplate
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                appointmentId,
                tenantId: appointment.tenant_id,
                userId: appointment.user_id,
                type: 'cancellation',
                recipient: user.email || user.phone,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Cancellation email sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send cancellation email:', error);
            return {
                success: false,
                message: `Failed to send cancellation email: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async sendWelcomeEmail(userId, tenantId) {
        try {
            const { data: user } = await database_1.supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            const { data: tenant } = await database_1.supabase
                .from('tenants')
                .select('*')
                .eq('id', tenantId)
                .single();
            if (!user || !tenant) {
                throw new Error('User or tenant not found');
            }
            const emailTemplate = this.buildWelcomeTemplate(user, tenant);
            const mailOptions = {
                from: {
                    name: tenant.business_name,
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [{
                        name: user.name || 'Cliente',
                        address: user.email || user.phone + '@whatsapp.temp'
                    }],
                subject: `🎉 Bem-vindo(a) ao ${tenant.business_name}!`,
                html: emailTemplate
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                tenantId,
                userId,
                type: 'welcome',
                recipient: user.email || user.phone,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Welcome email sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send welcome email:', error);
            return {
                success: false,
                message: `Failed to send welcome email: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async sendDailySummary(tenantId, date) {
        try {
            const { data: tenant } = await database_1.supabase
                .from('tenants')
                .select('*')
                .eq('id', tenantId)
                .single();
            if (!tenant || !tenant.email) {
                throw new Error('Tenant email not configured');
            }
            const { data: appointments } = await database_1.supabase
                .from('appointments')
                .select(`
          *,
          services (name),
          users (name, phone)
        `)
                .eq('tenant_id', tenantId)
                .gte('start_time', `${date}T00:00:00`)
                .lt('start_time', `${date}T23:59:59`)
                .order('start_time');
            const emailTemplate = this.buildDailySummaryTemplate(tenant, appointments || [], date);
            const mailOptions = {
                from: {
                    name: 'Universal Booking System',
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [{
                        name: tenant.business_name,
                        address: tenant.email
                    }],
                subject: `📊 Resumo do Dia - ${new Date(date).toLocaleDateString('pt-BR')} | ${tenant.business_name}`,
                html: emailTemplate
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                tenantId,
                type: 'daily_summary',
                recipient: tenant.email,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Daily summary sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send daily summary:', error);
            return {
                success: false,
                message: `Failed to send daily summary: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    async scheduleReminders() {
        try {
            const dayBeforeDate = new Date();
            dayBeforeDate.setDate(dayBeforeDate.getDate() + 1);
            const dayBeforeDateStr = dayBeforeDate.toISOString().split('T')[0];
            const { data: dayBeforeAppointments } = await database_1.supabase
                .from('appointments')
                .select('id')
                .eq('status', 'confirmed')
                .gte('start_time', `${dayBeforeDateStr}T00:00:00`)
                .lt('start_time', `${dayBeforeDateStr}T23:59:59`);
            const hourBefore = new Date();
            hourBefore.setHours(hourBefore.getHours() + 1);
            const hourBeforeStart = hourBefore.toISOString();
            hourBefore.setMinutes(hourBefore.getMinutes() + 30);
            const hourBeforeEnd = hourBefore.toISOString();
            const { data: hourBeforeAppointments } = await database_1.supabase
                .from('appointments')
                .select('id')
                .eq('status', 'confirmed')
                .gte('start_time', hourBeforeStart)
                .lt('start_time', hourBeforeEnd);
            for (const appointment of dayBeforeAppointments || []) {
                await this.sendAppointmentReminder(appointment.id, 'day_before');
            }
            for (const appointment of hourBeforeAppointments || []) {
                await this.sendAppointmentReminder(appointment.id, 'hour_before');
            }
            console.log(`Sent ${dayBeforeAppointments?.length || 0} day-before and ${hourBeforeAppointments?.length || 0} hour-before reminders`);
        }
        catch (error) {
            console.error('Failed to schedule reminders:', error);
        }
    }
    buildConfirmationTemplate(appointment, tenant, user, service) {
        const appointmentDate = new Date(appointment.start_time).toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const appointmentTime = new Date(appointment.start_time).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Agendamento Confirmado</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745; }
            .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Agendamento Confirmado!</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${user.name || 'Cliente'}</strong>!</p>
                <p>Seu agendamento foi confirmado com sucesso. Confira os detalhes:</p>
                
                <div class="info-box">
                    <h3>📋 Detalhes do Agendamento</h3>
                    <p><strong>Serviço:</strong> ${service.name}</p>
                    <p><strong>Data:</strong> ${appointmentDate}</p>
                    <p><strong>Horário:</strong> ${appointmentTime}</p>
                    <p><strong>Duração:</strong> ${service.duration_minutes} minutos</p>
                    <p><strong>Valor:</strong> R$ ${appointment.quoted_price || 'A combinar'}</p>
                    <p><strong>Local:</strong> ${tenant.business_name}</p>
                    ${tenant.business_address ? `<p><strong>Endereço:</strong> ${this.formatBusinessAddress(tenant.business_address)}</p>` : ''}
                </div>

                <div class="info-box">
                    <h3>📞 Contato</h3>
                    <p><strong>Telefone:</strong> ${tenant.phone}</p>
                    ${tenant.email ? `<p><strong>Email:</strong> ${tenant.email}</p>` : ''}
                </div>

                <p><strong>Importante:</strong></p>
                <ul>
                    <li>Chegue 10 minutos antes do horário agendado</li>
                    <li>Em caso de cancelamento, avise com pelo menos 24 horas de antecedência</li>
                    <li>Traga um documento com foto</li>
                </ul>

                <p>Em caso de dúvidas, entre em contato conosco pelo WhatsApp ou telefone.</p>
                
                <p>Atenciosamente,<br><strong>${tenant.business_name}</strong></p>
            </div>
            <div class="footer">
                <p>Este email foi enviado automaticamente pelo sistema de agendamentos.<br>
                Não responda este email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    buildReminderTemplate(appointment, tenant, user, service, reminderType) {
        const appointmentDate = new Date(appointment.start_time).toLocaleDateString('pt-BR');
        const appointmentTime = new Date(appointment.start_time).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const reminderText = reminderType === 'day_before'
            ? 'seu agendamento é amanhã!'
            : 'seu agendamento é em 1 hora!';
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Lembrete de Agendamento</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ffc107; color: #333; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffc107; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔔 Lembrete</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${user.name || 'Cliente'}</strong>!</p>
                <p>Este é um lembrete de que <strong>${reminderText}</strong></p>
                
                <div class="info-box">
                    <h3>📋 Seu Agendamento</h3>
                    <p><strong>Serviço:</strong> ${service.name}</p>
                    <p><strong>Data:</strong> ${appointmentDate}</p>
                    <p><strong>Horário:</strong> ${appointmentTime}</p>
                    <p><strong>Local:</strong> ${tenant.business_name}</p>
                </div>

                <p>Aguardamos você!</p>
                
                <p>Atenciosamente,<br><strong>${tenant.business_name}</strong></p>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    buildCancellationTemplate(appointment, tenant, user, service, reason) {
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Agendamento Cancelado</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>❌ Agendamento Cancelado</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${user.name || 'Cliente'}</strong>!</p>
                <p>Informamos que seu agendamento foi cancelado.</p>
                
                <div class="info-box">
                    <h3>📋 Agendamento Cancelado</h3>
                    <p><strong>Serviço:</strong> ${service.name}</p>
                    <p><strong>Data:</strong> ${new Date(appointment.start_time).toLocaleDateString('pt-BR')}</p>
                    <p><strong>Horário:</strong> ${new Date(appointment.start_time).toLocaleTimeString('pt-BR')}</p>
                    ${reason ? `<p><strong>Motivo:</strong> ${reason}</p>` : ''}
                </div>

                <p>Para reagendar, entre em contato conosco pelo WhatsApp.</p>
                
                <p>Atenciosamente,<br><strong>${tenant.business_name}</strong></p>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    buildWelcomeTemplate(user, tenant) {
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Bem-vindo!</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Bem-vindo(a)!</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${user.name || 'Cliente'}</strong>!</p>
                <p>Seja bem-vindo(a) ao <strong>${tenant.business_name}</strong>!</p>
                
                <p>Agora você pode agendar nossos serviços diretamente pelo WhatsApp de forma rápida e fácil.</p>
                
                <p>Nossa equipe está sempre pronta para atendê-lo(a) com excelência e qualidade.</p>
                
                <p>Atenciosamente,<br><strong>${tenant.business_name}</strong></p>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    buildDailySummaryTemplate(tenant, appointments, date) {
        const totalAppointments = appointments.length;
        const confirmedAppointments = appointments.filter(a => a.status === 'confirmed').length;
        const totalRevenue = appointments.reduce((sum, a) => sum + (a.quoted_price || 0), 0);
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Resumo do Dia</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .stats { display: flex; justify-content: space-around; margin: 20px 0; }
            .stat { text-align: center; background: white; padding: 15px; border-radius: 8px; margin: 0 10px; }
            .appointments { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📊 Resumo do Dia</h1>
                <p>${new Date(date).toLocaleDateString('pt-BR')}</p>
            </div>
            <div class="content">
                <div class="stats">
                    <div class="stat">
                        <h3>${totalAppointments}</h3>
                        <p>Total de Agendamentos</p>
                    </div>
                    <div class="stat">
                        <h3>${confirmedAppointments}</h3>
                        <p>Confirmados</p>
                    </div>
                    <div class="stat">
                        <h3>R$ ${totalRevenue.toFixed(2)}</h3>
                        <p>Receita Esperada</p>
                    </div>
                </div>

                <div class="appointments">
                    <h3>📅 Agendamentos do Dia</h3>
                    ${appointments.length > 0 ?
            appointments.map(apt => `
                        <p><strong>${new Date(apt.start_time).toLocaleTimeString('pt-BR')}</strong> - 
                        ${apt.services?.name} - ${apt.users?.name || apt.users?.phone} - 
                        <span style="color: ${this.getStatusColor(apt.status)}">${apt.status}</span></p>
                      `).join('') :
            '<p>Nenhum agendamento para hoje.</p>'}
                </div>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    async getAppointmentData(appointmentId) {
        const { data: appointment } = await database_1.supabase
            .from('appointments')
            .select(`
        *,
        tenants (*),
        users (*),
        services (*)
      `)
            .eq('id', appointmentId)
            .single();
        if (!appointment)
            return null;
        return {
            appointment,
            tenant: appointment.tenants,
            user: appointment.users,
            service: appointment.services
        };
    }
    formatBusinessAddress(address) {
        if (typeof address === 'string')
            return address;
        const parts = [
            address.street,
            address.number,
            address.neighborhood,
            address.city,
            address.state
        ].filter(Boolean);
        return parts.join(', ');
    }
    getStatusColor(status) {
        const colors = {
            'confirmed': '#28a745',
            'pending': '#ffc107',
            'cancelled': '#dc3545',
            'completed': '#6f42c1',
            'no_show': '#fd7e14'
        };
        return colors[status] || '#6c757d';
    }
    getAlertEmoji(severity) {
        const emojis = {
            'critical': '🚨',
            'warning': '⚠️',
            'info': 'ℹ️'
        };
        return emojis[severity] || 'ℹ️';
    }
    buildSubscriptionAlertTemplate(tenant, alert) {
        const severityColor = alert.severity === 'critical' ? '#dc3545' :
            alert.severity === 'warning' ? '#ffc107' : '#17a2b8';
        return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>${alert.title}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${severityColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid ${severityColor}; }
            .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${this.getAlertEmoji(alert.severity)} ${alert.title}</h1>
            </div>
            <div class="content">
                <p>Olá, <strong>${tenant.business_name}</strong>!</p>
                
                <div class="info-box">
                    <p>${alert.message}</p>
                    ${alert.daysRemaining !== undefined ? `<p><strong>Dias restantes:</strong> ${alert.daysRemaining}</p>` : ''}
                </div>

                ${alert.actionRequired ? `
                <div class="info-box">
                    <h3>⚡ Ação Necessária</h3>
                    <p>Acesse seu painel de billing para resolver esta questão:</p>
                    <a href="${process.env.FRONTEND_URL}/billing" class="button">Acessar Painel de Billing</a>
                </div>
                ` : ''}

                <p>Em caso de dúvidas, entre em contato com nosso suporte.</p>
                
                <p>Atenciosamente,<br><strong>Equipe UBS</strong></p>
            </div>
            <div class="footer">
                <p>Este email foi enviado automaticamente pelo sistema de monitoramento de assinaturas.<br>
                Universal Booking System - UBS</p>
            </div>
        </div>
    </body>
    </html>
    `;
    }
    generateICalEvent(appointment, tenant, service, user) {
        const startDate = new Date(appointment.start_time).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const endDate = new Date(appointment.end_time).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        return [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Universal Booking System//PT',
            'BEGIN:VEVENT',
            `UID:${appointment.id}@universal-booking-system.com`,
            `DTSTAMP:${now}`,
            `DTSTART:${startDate}`,
            `DTEND:${endDate}`,
            `SUMMARY:${service.name} - ${tenant.business_name}`,
            `DESCRIPTION:Agendamento confirmado\\nCliente: ${user.name || 'N/A'}\\nTelefone: ${user.phone}`,
            `LOCATION:${tenant.business_name}`,
            'STATUS:CONFIRMED',
            'BEGIN:VALARM',
            'TRIGGER:-PT15M',
            'ACTION:DISPLAY',
            'DESCRIPTION:Lembrete: Agendamento em 15 minutos',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');
    }
    async logEmailSent(logData) {
        try {
            console.log('Email sent:', logData);
        }
        catch (error) {
            console.error('Failed to log email:', error);
        }
    }
    async sendSubscriptionAlert(tenant, alert) {
        try {
            if (!tenant.business_email) {
                return {
                    success: false,
                    message: 'No email address configured for tenant'
                };
            }
            const emailTemplate = this.buildSubscriptionAlertTemplate(tenant, alert);
            const mailOptions = {
                from: {
                    name: 'Universal Booking System',
                    address: process.env.EMAIL_FROM_ADDRESS || process.env.ZOHO_SMTP_USER
                },
                to: [{
                        name: tenant.business_name,
                        address: tenant.business_email
                    }],
                subject: `${this.getAlertEmoji(alert.severity)} ${alert.title} - UBS`,
                html: emailTemplate
            };
            const result = await this.transporter.sendMail(mailOptions);
            await this.logEmailSent({
                tenantId: alert.tenantId,
                type: `subscription_${alert.type}`,
                recipient: tenant.business_email,
                messageId: result.messageId,
                status: 'sent'
            });
            return {
                success: true,
                messageId: result.messageId,
                message: 'Subscription alert sent successfully'
            };
        }
        catch (error) {
            console.error('Failed to send subscription alert:', error);
            return {
                success: false,
                message: `Failed to send subscription alert: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    isReady() {
        return this.isConfigured;
    }
    async testConfiguration() {
        try {
            await this.transporter.verify();
            return {
                success: true,
                message: 'Email configuration is working correctly'
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Email configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
}
exports.EmailService = EmailService;
exports.default = EmailService;
//# sourceMappingURL=email.service.js.map