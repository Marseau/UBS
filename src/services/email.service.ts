import nodemailer from 'nodemailer';

/**
 * Email Service using Zoho SMTP
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const smtpHost = process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com';
    const smtpPort = parseInt(process.env.ZOHO_SMTP_PORT || '587', 10);
    const smtpUser = process.env.ZOHO_SMTP_USER;
    const smtpPassword = process.env.ZOHO_SMTP_PASSWORD;

    console.log('📧 [Email Service] Initializing with:', {
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      hasPassword: !!smtpPassword
    });

    if (!smtpUser || !smtpPassword) {
      console.warn('⚠️ Zoho SMTP credentials not configured. Email service disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: false, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
        tls: {
          rejectUnauthorized: false, // Accept self-signed certificates
        },
      });

      console.log('✅ Email service initialized with Zoho SMTP');
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
    }
  }

  /**
   * Send Taylor Made lead notification email
   */
  async sendTaylorMadeLeadNotification(leadData: {
    id: string;
    name: string;
    email: string;
    whatsapp: string;
    user_type: string;
    business_segment: string;
    main_challenge: string;
    lead_volume: string;
    modules_interest: string[];
    source?: string | null;
    timestamp: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.warn('Email service not initialized. Skipping notification.');
      return false;
    }

    // Format user type labels
    const userTypeLabels: Record<string, string> = {
      agency: 'Agência Digital',
      local_business: 'Negócio Local',
      consultant: 'Consultor/Freelancer',
      other: 'Outro',
    };

    // Format business segment labels
    const segmentLabels: Record<string, string> = {
      beauty: 'Beleza (salão, estética)',
      healthcare: 'Saúde (clínica, terapias)',
      education: 'Educação (aulas, cursos)',
      legal: 'Jurídico (advocacia)',
      sports: 'Esportes (personal, academia)',
      consulting: 'Consultoria/Coaching',
      other: 'Outro',
    };

    // Format challenge labels
    const challengeLabels: Record<string, string> = {
      lost_leads: 'Perco leads que chegam via WhatsApp',
      disorganized: 'Agenda desorganizada, muitos conflitos',
      no_shows: 'Muitas faltas e cancelamentos',
      no_roi: 'Não consigo medir ROI de marketing',
      automation: 'Preciso automatizar atendimento',
    };

    // Format volume labels
    const volumeLabels: Record<string, string> = {
      less_50: 'Menos de 50',
      '50_200': '50 a 200',
      '200_500': '200 a 500',
      more_500: 'Mais de 500',
    };

    // Format modules labels
    const moduleLabels: Record<string, string> = {
      lead_capture: 'Captação & Qualificação de Leads',
      scheduling: 'Agendamento Inteligente',
      followup: 'Follow-up Automático',
      all: 'Todos os módulos',
    };

    const modulesFormatted = leadData.modules_interest
      .map((m) => moduleLabels[m] || m)
      .join(', ');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2D5A9B 0%, #4A7BC8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
    .field { margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #2D5A9B; }
    .field-label { font-weight: bold; color: #2D5A9B; margin-bottom: 5px; }
    .field-value { color: #333; }
    .footer { text-align: center; margin-top: 30px; padding: 20px; color: #6c757d; font-size: 12px; }
    .badge { display: inline-block; background: #28A745; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Novo Lead Taylor Made!</h1>
      <p style="margin: 0; opacity: 0.9;">Um novo cliente solicitou proposta personalizada</p>
    </div>

    <div class="content">
      <div class="field">
        <div class="field-label">📋 ID do Lead</div>
        <div class="field-value"><code>${leadData.id}</code></div>
      </div>

      <div class="field">
        <div class="field-label">👤 Nome Completo</div>
        <div class="field-value">${leadData.name}</div>
      </div>

      <div class="field">
        <div class="field-label">📧 Email</div>
        <div class="field-value"><a href="mailto:${leadData.email}">${leadData.email}</a></div>
      </div>

      <div class="field">
        <div class="field-label">📱 WhatsApp</div>
        <div class="field-value"><a href="https://wa.me/55${leadData.whatsapp}">+55 ${leadData.whatsapp}</a></div>
      </div>

      <div class="field">
        <div class="field-label">🏢 Tipo de Cliente</div>
        <div class="field-value">${userTypeLabels[leadData.user_type] || leadData.user_type}</div>
      </div>

      <div class="field">
        <div class="field-label">🎯 Segmento do Negócio</div>
        <div class="field-value">${segmentLabels[leadData.business_segment] || leadData.business_segment}</div>
      </div>

      <div class="field">
        <div class="field-label">🚧 Principal Desafio</div>
        <div class="field-value">${challengeLabels[leadData.main_challenge] || leadData.main_challenge}</div>
      </div>

      <div class="field">
        <div class="field-label">📊 Volume de Leads/Mês</div>
        <div class="field-value">${volumeLabels[leadData.lead_volume] || leadData.lead_volume}</div>
      </div>

      <div class="field">
        <div class="field-label">✅ Módulos de Interesse</div>
        <div class="field-value">${modulesFormatted}</div>
      </div>

      ${leadData.source ? `
      <div class="field">
        <div class="field-label">🌐 Como Conheceu</div>
        <div class="field-value">${leadData.source}</div>
      </div>
      ` : ''}

      <div class="field">
        <div class="field-label">🕐 Data/Hora da Solicitação</div>
        <div class="field-value">${new Date(leadData.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
      </div>

      <div style="text-align: center; margin-top: 30px;">
        <span class="badge">⏰ Responder em até 24h</span>
      </div>
    </div>

    <div class="footer">
      <p><strong>UBS Taylor Made</strong> - Sistema de Captação de Leads</p>
      <p>Este é um email automático do sistema de landing page Taylor Made.</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"UBS Taylor Made" <${process.env.ZOHO_SMTP_USER}>`,
        to: 'admin@stratfin.tec.br',
        subject: `🎯 Novo Lead Taylor Made: ${leadData.name} - ${segmentLabels[leadData.business_segment]}`,
        html: emailHtml,
      });

      console.log('✅ Email notification sent:', info.messageId);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email notification:', error);
      return false;
    }
  }
}

export { EmailService };
export default EmailService;
export const emailService = new EmailService();
