/**
 * Contract Email Service using SendGrid
 * Sends contract PDFs and notifications to clients
 */

import sgMail from '@sendgrid/mail';

interface ContractEmailData {
  to: string;
  toName: string;
  contractId: string;
  campaignName: string;
  contractValue: number;
  leadValue: number;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

interface ContractSignedNotificationData {
  clientName: string;
  clientEmail: string;
  contractId: string;
  campaignName: string;
  signedAt: string;
  signatureIp: string;
  pdfUrl?: string;
}

interface ContractLinkEmailData {
  to: string;
  toName: string;
  contractLink: string;
  campaignName: string;
  expiresInDays?: number;
}

class ContractEmailService {
  private initialized = false;
  private fromEmail = 'contratos@aic.ubs.app.br';
  private fromName = 'AIC - Applied Intelligence Clustering';

  constructor() {
    this.initialize();
  }

  private initialize() {
    const apiKey = process.env.SENDGRID_API_KEY;

    if (!apiKey) {
      console.warn('⚠️ [ContractEmail] SendGrid API key not configured. Email service disabled.');
      return;
    }

    try {
      sgMail.setApiKey(apiKey);
      this.initialized = true;
      console.log('✅ [ContractEmail] SendGrid initialized successfully');
    } catch (error) {
      console.error('❌ [ContractEmail] Failed to initialize SendGrid:', error);
    }
  }

  /**
   * Send contract PDF to client for review and signature
   */
  async sendContractForSignature(data: ContractEmailData): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[ContractEmail] Service not initialized. Skipping email.');
      return false;
    }

    const formatCurrency = (value: number) =>
      value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0C1B33 0%, #1a365d 100%); padding: 40px; text-align: center;">
              <h1 style="color: #0ECC97; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 2px;">AIC</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Applied Intelligence Clustering</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #0C1B33; margin: 0 0 20px; font-size: 24px;">Olá ${data.toName}!</h2>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Segue em anexo o contrato de prestação de serviços para a campanha de prospecção inteligente <strong>"${data.campaignName}"</strong>.
              </p>

              <div style="background: #f0fdf4; border: 1px solid #0ECC97; border-radius: 12px; padding: 24px; margin: 24px 0;">
                <h3 style="color: #0ECC97; margin: 0 0 16px; font-size: 16px; text-transform: uppercase;">Resumo do Investimento</h3>
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #666; font-size: 14px;">Valor Base da Campanha:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-weight: 600; text-align: right;">${formatCurrency(data.contractValue)}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">Valor por Lead Qualificado:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-weight: 600; text-align: right;">${formatCurrency(data.leadValue)} / lead</td>
                  </tr>
                </table>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Por favor, revise atentamente todas as cláusulas. Caso tenha dúvidas, estamos à disposição para esclarecimentos.
              </p>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                  <strong>Importante:</strong> Após a revisão, você poderá assinar o contrato eletronicamente através do nosso portal seguro.
                </p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 30px 0 0;">
                Atenciosamente,<br>
                <strong style="color: #0C1B33;">Equipe AIC</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                AIC - Applied Intelligence Clustering<br>
                Este email foi enviado automaticamente. Por favor, não responda diretamente.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      const msg = {
        to: data.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `📄 Contrato AIC - Campanha "${data.campaignName}"`,
        html: emailHtml,
        attachments: [
          {
            content: data.pdfBuffer.toString('base64'),
            filename: data.pdfFilename,
            type: 'application/pdf',
            disposition: 'attachment' as const,
          },
        ],
      };

      await sgMail.send(msg);
      console.log(`✅ [ContractEmail] Contract sent to ${data.to}`);
      return true;
    } catch (error: any) {
      console.error('❌ [ContractEmail] Failed to send contract:', error.response?.body || error);
      return false;
    }
  }

  /**
   * Send contract signature link to client
   */
  async sendContractLink(data: ContractLinkEmailData): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[ContractEmail] Service not initialized. Skipping email.');
      return false;
    }

    const expiresText = data.expiresInDays ? `Este link expira em ${data.expiresInDays} dias.` : '';

    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0C1B33 0%, #1a365d 100%); padding: 40px; text-align: center;">
              <h1 style="color: #0ECC97; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 2px;">AIC</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Applied Intelligence Clustering</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #0C1B33; margin: 0 0 20px; font-size: 24px;">Olá ${data.toName}!</h2>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Estamos muito felizes em avançar com a campanha <strong>"${data.campaignName}"</strong>!
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                Para formalizar nossa parceria, preparamos o contrato de prestação de serviços para sua assinatura eletrônica.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.contractLink}"
                   style="display: inline-block; background: linear-gradient(135deg, #0ECC97 0%, #0ba578 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(14, 204, 151, 0.3);">
                  📝 Assinar Contrato
                </a>
              </div>

              <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #0C1B33; margin: 0 0 12px; font-size: 14px;">Como funciona:</h4>
                <ol style="color: #4a5568; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Clique no botão acima para acessar o contrato</li>
                  <li>Revise todas as cláusulas e condições</li>
                  <li>Preencha seus dados e aceite os termos</li>
                  <li>Sua assinatura eletrônica será registrada automaticamente</li>
                  <li>Você receberá uma cópia do contrato assinado por email</li>
                </ol>
              </div>

              ${expiresText ? `
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #92400e; font-size: 14px; margin: 0;">
                  <strong>Atenção:</strong> ${expiresText}
                </p>
              </div>
              ` : ''}

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 30px 0 0;">
                Qualquer dúvida, estamos à disposição!<br><br>
                Atenciosamente,<br>
                <strong style="color: #0C1B33;">Equipe AIC</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                AIC - Applied Intelligence Clustering<br>
                Este email foi enviado automaticamente. Por favor, não responda diretamente.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      const msg = {
        to: data.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `📝 Assine seu Contrato AIC - Campanha "${data.campaignName}"`,
        html: emailHtml,
      };

      await sgMail.send(msg);
      console.log(`✅ [ContractEmail] Contract link sent to ${data.to}`);
      return true;
    } catch (error: any) {
      console.error('❌ [ContractEmail] Failed to send contract link:', error.response?.body || error);
      return false;
    }
  }

  /**
   * Send signed contract notification to admin
   */
  async sendSignedNotification(data: ContractSignedNotificationData): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[ContractEmail] Service not initialized. Skipping notification.');
      return false;
    }

    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0ECC97 0%, #0ba578 100%); padding: 40px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">✅ Contrato Assinado!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Um novo contrato foi assinado eletronicamente. Confira os detalhes:
              </p>

              <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
                <table width="100%" cellpadding="8" cellspacing="0">
                  <tr>
                    <td style="color: #666; font-size: 14px; width: 40%;">Cliente:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-weight: 600;">${data.clientName}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">Email:</td>
                    <td style="color: #0C1B33; font-size: 14px;">${data.clientEmail}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">Campanha:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-weight: 600;">${data.campaignName}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">ID do Contrato:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-family: monospace;">${data.contractId}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">Assinado em:</td>
                    <td style="color: #0C1B33; font-size: 14px;">${new Date(data.signedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                  </tr>
                  <tr>
                    <td style="color: #666; font-size: 14px;">IP:</td>
                    <td style="color: #0C1B33; font-size: 14px; font-family: monospace;">${data.signatureIp}</td>
                  </tr>
                </table>
              </div>

              ${data.pdfUrl ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.pdfUrl}"
                   style="display: inline-block; background: #0C1B33; color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-size: 14px; font-weight: 600;">
                  📥 Baixar Contrato Assinado
                </a>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                AIC - Applied Intelligence Clustering<br>
                Notificação automática de contrato assinado
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      const msg = {
        to: 'admin@stratfin.tec.br',
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `✅ Contrato Assinado - ${data.clientName} - ${data.campaignName}`,
        html: emailHtml,
      };

      await sgMail.send(msg);
      console.log(`✅ [ContractEmail] Signed notification sent to admin`);
      return true;
    } catch (error: any) {
      console.error('❌ [ContractEmail] Failed to send signed notification:', error.response?.body || error);
      return false;
    }
  }

  /**
   * Send signed contract copy to client
   */
  async sendSignedContractToClient(data: {
    to: string;
    toName: string;
    campaignName: string;
    pdfBuffer: Buffer;
    pdfFilename: string;
    pdfUrl?: string;
  }): Promise<boolean> {
    if (!this.initialized) {
      console.warn('[ContractEmail] Service not initialized. Skipping email.');
      return false;
    }

    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0ECC97 0%, #0ba578 100%); padding: 40px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Contrato Assinado com Sucesso!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #0C1B33; margin: 0 0 20px; font-size: 24px;">Olá ${data.toName}!</h2>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Seu contrato para a campanha <strong>"${data.campaignName}"</strong> foi assinado com sucesso!
              </p>

              <div style="background: #f0fdf4; border: 1px solid #0ECC97; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
                <span style="font-size: 48px;">✅</span>
                <h3 style="color: #0ECC97; margin: 16px 0 8px; font-size: 18px;">Tudo certo!</h3>
                <p style="color: #4a5568; font-size: 14px; margin: 0;">
                  Sua assinatura eletrônica foi registrada com sucesso.
                </p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                Segue em anexo uma cópia do contrato assinado para seus arquivos.
              </p>

              <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 30px 0;">
                <h4 style="color: #0C1B33; margin: 0 0 12px; font-size: 14px;">Próximos passos:</h4>
                <ol style="color: #4a5568; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  <li>Nossa equipe entrará em contato em até 24 horas</li>
                  <li>Iniciaremos a fase de diagnóstico e briefing</li>
                  <li>Você receberá acesso ao dashboard de acompanhamento</li>
                </ol>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 30px 0 0;">
                Obrigado pela confiança!<br><br>
                Atenciosamente,<br>
                <strong style="color: #0C1B33;">Equipe AIC</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0; text-align: center;">
                AIC - Applied Intelligence Clustering<br>
                Guarde este email como comprovante da sua assinatura eletrônica.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      const msg = {
        to: data.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: `✅ Contrato Assinado - Campanha "${data.campaignName}"`,
        html: emailHtml,
        attachments: [
          {
            content: data.pdfBuffer.toString('base64'),
            filename: data.pdfFilename,
            type: 'application/pdf',
            disposition: 'attachment' as const,
          },
        ],
      };

      await sgMail.send(msg);
      console.log(`✅ [ContractEmail] Signed contract copy sent to ${data.to}`);
      return true;
    } catch (error: any) {
      console.error('❌ [ContractEmail] Failed to send signed contract:', error.response?.body || error);
      return false;
    }
  }
}

export const contractEmailService = new ContractEmailService();
export default contractEmailService;
