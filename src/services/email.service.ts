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

  /**
   * Send AIC Campaign Invitation Email
   * Envia convite para cliente iniciar jornada de campanha AIC
   */
  async sendCampaignInvitation(data: {
    clientEmail: string;
    clientName?: string;
    campaignName: string;
    loginUrl: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[Email] Service not initialized. Skipping campaign invitation.');
      return false;
    }

    const displayName = data.clientName || data.clientEmail.split('@')[0];

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0a1628 0%, #1a2d4a 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .header p { margin: 0; opacity: 0.9; font-size: 16px; }
    .content { background: #f8f9fa; padding: 40px 30px; }
    .message { background: white; padding: 25px; border-radius: 10px; margin-bottom: 25px; border-left: 4px solid #0ecc97; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #0ecc97 0%, #0ba77a 100%); color: #0a1628 !important; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
    .cta-button:hover { opacity: 0.9; }
    .steps { margin-top: 30px; }
    .step { display: flex; align-items: flex-start; margin-bottom: 15px; }
    .step-number { background: #0ecc97; color: #0a1628; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; }
    .step-text { flex: 1; }
    .footer { text-align: center; padding: 25px; color: #6c757d; font-size: 12px; background: #e9ecef; border-radius: 0 0 12px 12px; }
    .campaign-name { background: rgba(14, 204, 151, 0.1); border: 1px solid rgba(14, 204, 151, 0.3); padding: 10px 20px; border-radius: 6px; display: inline-block; color: #0a1628; font-weight: 600; }
    .note { font-size: 13px; color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Sua campanha esta pronta!</h1>
      <p>AIC - Applied Intelligence Clustering</p>
    </div>

    <div class="content">
      <div class="message">
        <p>Ola <strong>${displayName}</strong>,</p>
        <p>Temos otimas noticias! Sua campanha de prospeccao inteligente foi preparada e esta esperando por voce:</p>
        <p style="text-align: center; margin: 20px 0;">
          <span class="campaign-name">${data.campaignName}</span>
        </p>
        <p>Para acessar sua campanha e acompanhar os resultados, voce precisa primeiro completar seu cadastro e algumas etapas importantes.</p>
      </div>

      <div style="text-align: center;">
        <a href="${data.loginUrl}" class="cta-button">Iniciar Minha Jornada</a>
        <p class="note">Ao clicar, voce sera direcionado para criar sua conta no portal AIC.</p>
      </div>

      <div class="steps">
        <p style="font-weight: bold; margin-bottom: 15px;">Proximos passos:</p>
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-text">Cadastre-se ou faca login com este email</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-text">Revise e aceite a proposta comercial</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-text">Assine o contrato digitalmente</div>
        </div>
        <div class="step">
          <div class="step-number">4</div>
          <div class="step-text">Confirme o pagamento</div>
        </div>
        <div class="step">
          <div class="step-number">5</div>
          <div class="step-text">Complete o onboarding (dados da empresa, produto/servico e landing page)</div>
        </div>
        <div class="step">
          <div class="step-number">6</div>
          <div class="step-text">Configure as credenciais (WhatsApp + Instagram)</div>
        </div>
        <div class="step">
          <div class="step-number">7</div>
          <div class="step-text">Campanha ativada!</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>AIC - Applied Intelligence Clustering</strong></p>
      <p>Prospeccao outbound inteligente que transforma dados publicos em leads quentes.</p>
      <p style="margin-top: 15px; font-size: 11px;">Este email foi enviado para ${data.clientEmail} porque uma campanha foi preparada para voce.</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"AIC - Prospeccao Inteligente" <${process.env.ZOHO_SMTP_USER}>`,
        to: data.clientEmail,
        subject: `${displayName}, sua campanha "${data.campaignName}" esta esperando por voce!`,
        html: emailHtml,
      });

      console.log(`✅ [Email] Campaign invitation sent to ${data.clientEmail}:`, info.messageId);
      return true;
    } catch (error) {
      console.error(`❌ [Email] Failed to send campaign invitation to ${data.clientEmail}:`, error);
      return false;
    }
  }
}

export { EmailService };
export default EmailService;
export const emailService = new EmailService();
