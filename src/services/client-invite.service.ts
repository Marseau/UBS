/**
 * Client Invite Service
 * Servico para enviar convites por email aos clientes AIC
 */

import { supabaseAdmin } from '../config/database';
import { clientJourneyService } from './client-journey.service';

// Interface para dados do convite
export interface InviteData {
  client_name: string;
  client_email: string;
  access_token: string;
  journey_id: string;
  project_name?: string;
  company_name?: string;
}

// Interface para resultado do envio
export interface InviteResult {
  success: boolean;
  message: string;
  invite_link?: string;
  email_sent?: boolean;
  error?: string;
}

class ClientInviteService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.APP_URL || 'https://dev.ubs.app.br';
  }

  /**
   * Gera o link de convite para o cliente
   */
  generateInviteLink(accessToken: string): string {
    return `${this.baseUrl}/cliente/login?invite=${accessToken}`;
  }

  /**
   * Envia email de convite para o cliente
   */
  async sendInviteEmail(data: InviteData): Promise<InviteResult> {
    const inviteLink = this.generateInviteLink(data.access_token);

    try {
      // Tentar enviar via Resend (se configurado)
      if (process.env.RESEND_API_KEY) {
        return await this.sendViaResend(data, inviteLink);
      }

      // Tentar enviar via SMTP (se configurado)
      if (process.env.SMTP_HOST) {
        return await this.sendViaSMTP(data, inviteLink);
      }

      // Fallback: apenas logar e retornar link
      console.log('[ClientInvite] Email service not configured. Invite link:', inviteLink);
      return {
        success: true,
        message: 'Email service nao configurado. Use o link de convite.',
        invite_link: inviteLink,
        email_sent: false
      };
    } catch (error) {
      console.error('[ClientInvite] Error sending email:', error);
      return {
        success: true,
        message: 'Erro ao enviar email. Use o link de convite.',
        invite_link: inviteLink,
        email_sent: false,
        error: String(error)
      };
    }
  }

  /**
   * Envia email via Resend API
   */
  private async sendViaResend(data: InviteData, inviteLink: string): Promise<InviteResult> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'AIC <noreply@aic.com.br>',
        to: [data.client_email],
        subject: `${data.client_name}, sua proposta AIC esta pronta!`,
        html: this.generateEmailHTML(data, inviteLink)
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }

    console.log(`[ClientInvite] Email sent via Resend to ${data.client_email}`);

    return {
      success: true,
      message: 'Convite enviado por email',
      invite_link: inviteLink,
      email_sent: true
    };
  }

  /**
   * Envia email via SMTP (nodemailer)
   */
  private async sendViaSMTP(data: InviteData, inviteLink: string): Promise<InviteResult> {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'AIC <noreply@aic.com.br>',
      to: data.client_email,
      subject: `${data.client_name}, sua proposta AIC esta pronta!`,
      html: this.generateEmailHTML(data, inviteLink)
    });

    console.log(`[ClientInvite] Email sent via SMTP to ${data.client_email}`);

    return {
      success: true,
      message: 'Convite enviado por email',
      invite_link: inviteLink,
      email_sent: true
    };
  }

  /**
   * Gera o HTML do email de convite
   */
  private generateEmailHTML(data: InviteData, inviteLink: string): string {
    const projectName = data.project_name || 'sua campanha AIC';
    const companyName = data.company_name || 'AIC';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #0C1B33;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0C1B33; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #122444; border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <img src="https://qsdfyffuonywmtnlycri.supabase.co/storage/v1/object/public/aic-assets/logo-aic-white.png" alt="AIC" style="height: 48px; width: auto;">
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px 40px;">
              <h1 style="color: #FDFDFD; font-size: 28px; font-weight: 700; margin: 0 0 16px; text-align: center;">
                Ola, ${data.client_name}!
              </h1>

              <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
                Uma proposta personalizada para <strong style="color: #0ECC97;">${projectName}</strong> foi criada especialmente para voce.
              </p>

              <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 32px; text-align: center;">
                Clique no botao abaixo para criar sua conta e visualizar todos os detalhes da proposta:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #0ECC97 0%, #0BA578 100%); color: #0C1B33; font-size: 16px; font-weight: 600; text-decoration: none; padding: 16px 40px; border-radius: 12px;">
                      Acessar Minha Proposta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 32px 0 0; text-align: center;">
                Se o botao nao funcionar, copie e cole este link no navegador:<br>
                <a href="${inviteLink}" style="color: #60a5fa; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #0C1B33; border-top: 1px solid #1e3a5f;">
              <p style="color: #64748b; font-size: 12px; margin: 0; text-align: center;">
                Este email foi enviado por ${companyName}.<br>
                Se voce nao solicitou esta proposta, ignore este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Cria jornada e envia convite (metodo combinado)
   */
  async createJourneyAndSendInvite(
    clientData: {
      client_name: string;
      client_email: string;
      client_phone?: string;
      client_document?: string;
      client_company?: string;
      proposal_data?: Record<string, unknown>;
    },
    sendEmail: boolean = true
  ): Promise<InviteResult & { journey_id?: string }> {
    try {
      // 1. Criar a jornada
      const journeyResult = await clientJourneyService.createJourney({
        client_name: clientData.client_name,
        client_email: clientData.client_email,
        client_phone: clientData.client_phone,
        client_document: clientData.client_document,
        client_company: clientData.client_company,
        proposal_data: clientData.proposal_data
      });

      if (!journeyResult.success || !journeyResult.journey) {
        return {
          success: false,
          message: journeyResult.message || 'Erro ao criar jornada',
          error: journeyResult.error
        };
      }

      const journey = journeyResult.journey;
      const inviteLink = this.generateInviteLink(journey.access_token);

      // 2. Enviar email se solicitado
      let emailResult: InviteResult = {
        success: true,
        message: 'Jornada criada. Email nao solicitado.',
        invite_link: inviteLink,
        email_sent: false
      };

      if (sendEmail) {
        emailResult = await this.sendInviteEmail({
          client_name: clientData.client_name,
          client_email: clientData.client_email,
          access_token: journey.access_token,
          journey_id: journey.id,
          project_name: clientData.proposal_data?.project_name as string,
          company_name: clientData.client_company
        });
      }

      return {
        ...emailResult,
        journey_id: journey.id
      };
    } catch (error) {
      console.error('[ClientInvite] Error creating journey and sending invite:', error);
      return {
        success: false,
        message: 'Erro ao criar jornada e enviar convite',
        error: String(error)
      };
    }
  }

  /**
   * Reenviar convite para uma jornada existente
   */
  async resendInvite(journeyId: string): Promise<InviteResult> {
    try {
      const journey = await clientJourneyService.getJourneyById(journeyId);

      if (!journey) {
        return {
          success: false,
          message: 'Jornada nao encontrada'
        };
      }

      return this.sendInviteEmail({
        client_name: journey.client_name,
        client_email: journey.client_email,
        access_token: journey.access_token,
        journey_id: journey.id,
        project_name: journey.proposal_data?.project_name as string,
        company_name: journey.client_company
      });
    } catch (error) {
      console.error('[ClientInvite] Error resending invite:', error);
      return {
        success: false,
        message: 'Erro ao reenviar convite',
        error: String(error)
      };
    }
  }
}

export const clientInviteService = new ClientInviteService();
export default clientInviteService;
