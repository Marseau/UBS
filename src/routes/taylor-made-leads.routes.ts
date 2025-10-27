import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Helper function to send email notification
 */
async function sendEmailNotification(leadData: {
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
}): Promise<void> {
  const smtpUser = process.env.ZOHO_SMTP_USER;
  const smtpPassword = process.env.ZOHO_SMTP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    console.warn('📧 Email credentials not configured. Skipping notification.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
      port: parseInt(process.env.ZOHO_SMTP_PORT || '587', 10),
      secure: false,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });

    const emailHTML = `
      <h2>🎯 Novo Lead Taylor Made!</h2>
      <p><strong>Nome:</strong> ${leadData.name}</p>
      <p><strong>Email:</strong> ${leadData.email}</p>
      <p><strong>WhatsApp:</strong> <a href="https://wa.me/55${leadData.whatsapp}">+55 ${leadData.whatsapp}</a></p>
      <p><strong>Tipo:</strong> ${leadData.user_type}</p>
      <p><strong>Segmento:</strong> ${leadData.business_segment}</p>
      <p><strong>Desafio:</strong> ${leadData.main_challenge}</p>
      <p><strong>Volume:</strong> ${leadData.lead_volume}</p>
      <p><strong>Módulos:</strong> ${leadData.modules_interest.join(', ')}</p>
      ${leadData.source ? `<p><strong>Origem:</strong> ${leadData.source}</p>` : ''}
      <p><strong>ID:</strong> <code>${leadData.id}</code></p>
      <hr>
      <p><small>UBS Taylor Made - Sistema de Captação de Leads</small></p>
    `;

    await transporter.sendMail({
      from: `"UBS Taylor Made" <${smtpUser}>`,
      to: 'admin@stratfin.tec.br',
      subject: `🎯 Novo Lead: ${leadData.name} - ${leadData.business_segment}`,
      html: emailHTML,
    });

    console.log('✅ Email notification sent successfully');
  } catch (error: any) {
    console.error('❌ Failed to send email:', error.message);
  }
}

/**
 * Interface for Taylor Made lead submission
 */
interface TaylorMadeLead {
  name: string;
  email: string;
  whatsapp: string;
  user_type: 'agency' | 'local_business' | 'consultant' | 'other';
  business_segment: 'beauty' | 'healthcare' | 'education' | 'legal' | 'sports' | 'consulting' | 'other';
  main_challenge: 'lost_leads' | 'disorganized' | 'no_shows' | 'no_roi' | 'automation';
  lead_volume: 'less_50' | '50_200' | '200_500' | 'more_500';
  modules_interest: string[];
  source?: string | null;
  timestamp: string;
}

/**
 * Translation maps for Portuguese
 */
const translations = {
  userType: {
    'agency': 'Agência',
    'local_business': 'Negócio Local',
    'consultant': 'Consultor',
    'other': 'Outro'
  },
  businessSegment: {
    'beauty': 'Beleza & Estética',
    'healthcare': 'Saúde',
    'education': 'Educação',
    'legal': 'Jurídico',
    'sports': 'Esportes & Fitness',
    'consulting': 'Consultoria',
    'other': 'Outro'
  },
  mainChallenge: {
    'lost_leads': 'Perda de Leads',
    'disorganized': 'Desorganização',
    'no_shows': 'Faltas de Clientes',
    'no_roi': 'Sem ROI Claro',
    'automation': 'Falta de Automação'
  },
  leadVolume: {
    'less_50': 'Menos de 50/mês',
    '50_200': '50-200/mês',
    '200_500': '200-500/mês',
    'more_500': 'Mais de 500/mês'
  },
  modules: {
    'lead_capture': 'Captura de Leads',
    'scheduling': 'Agendamento Inteligente',
    'followup': 'Follow-up Automatizado',
    'ai_chat': 'IA Conversacional',
    'analytics': 'Analytics & Relatórios',
    'all': 'Todos os Módulos'
  }
};

/**
 * POST /api/leads/taylor-made
 * Submit Taylor Made lead for proposal
 */
router.post('/taylor-made', async (req: Request, res: Response) => {
  try {
    const leadData: TaylorMadeLead = req.body;

    // Validation
    if (!leadData.name || !leadData.email || !leadData.whatsapp) {
      return res.status(400).json({
        success: false,
        error: 'Nome, email e WhatsApp são obrigatórios'
      });
    }

    if (!leadData.modules_interest || leadData.modules_interest.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Selecione pelo menos um módulo de interesse'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      return res.status(400).json({
        success: false,
        error: 'Email inválido'
      });
    }

    // WhatsApp validation (Brazilian format)
    const cleanWhatsApp = leadData.whatsapp.replace(/\D/g, '');
    if (cleanWhatsApp.length < 10 || cleanWhatsApp.length > 11) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp inválido. Use formato brasileiro: (00) 00000-0000'
      });
    }

    // Prepare data for Supabase (KEEP IN ENGLISH for database constraints)
    const dbData = {
      name: leadData.name,
      email: leadData.email.toLowerCase(),
      whatsapp: cleanWhatsApp,
      user_type: leadData.user_type,
      business_segment: leadData.business_segment,
      main_challenge: leadData.main_challenge,
      lead_volume: leadData.lead_volume,
      modules_interest: leadData.modules_interest,
      source: leadData.source || null,
      timestamp: leadData.timestamp || new Date().toISOString(),
      status: 'new', // Default status: new, contacted, proposal_sent, converted, lost
      created_at: new Date().toISOString()
    };

    // Insert into Supabase
    const { data, error } = await supabase
      .from('taylor_made_leads')
      .insert([dbData])
      .select();

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao salvar lead. Tente novamente.'
      });
    }

    console.log('Taylor Made lead captured:', {
      id: data[0].id,
      name: dbData.name,
      email: dbData.email,
      user_type: dbData.user_type,
      modules: dbData.modules_interest
    });

    // Trigger N8N webhook for lead automation (non-blocking)
    // Translate data to Portuguese for N8N/email templates
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.stratfin.tec.br';
    const capturedAt = new Date().toISOString();
    const formattedDate = new Date(capturedAt).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Translate modules to Portuguese
    const translatedModules = dbData.modules_interest.map(
      mod => translations.modules[mod as keyof typeof translations.modules] || mod
    );

    const webhookPayload = {
      lead_id: data[0].id,
      name: dbData.name,
      email: dbData.email,
      whatsapp: dbData.whatsapp,
      user_type: translations.userType[dbData.user_type as keyof typeof translations.userType] || dbData.user_type,
      business_segment: translations.businessSegment[dbData.business_segment as keyof typeof translations.businessSegment] || dbData.business_segment,
      main_challenge: translations.mainChallenge[dbData.main_challenge as keyof typeof translations.mainChallenge] || dbData.main_challenge,
      lead_volume: translations.leadVolume[dbData.lead_volume as keyof typeof translations.leadVolume] || dbData.lead_volume,
      modules_interest: translatedModules.join(', '),
      source: dbData.source || 'Website',
      timestamp: dbData.timestamp,
      captured_at: capturedAt,
      formatted_date: formattedDate
    };

    fetch(`${n8nWebhookUrl}/webhook/lead-capturado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }).catch((err: any) => console.error('🔗 N8N webhook error:', err));

    console.log('✅ N8N webhook triggered for lead automation');

    return res.status(201).json({
      success: true,
      message: 'Proposta solicitada com sucesso! Entraremos em contato em até 24h.',
      lead_id: data[0].id
    });

  } catch (error) {
    console.error('Error processing Taylor Made lead:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno do servidor. Tente novamente.'
    });
  }
});

/**
 * GET /api/leads/:leadId/authorize-whatsapp
 * Register WhatsApp authorization from lead (via email link click)
 */
router.get('/:leadId/authorize-whatsapp', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { auth } = req.query;

    if (!leadId || !auth) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Erro - UBS</title>
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f4f4; }
              .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Erro</h1>
              <p>Link inválido ou expirado.</p>
            </div>
          </body>
        </html>
      `);
    }

    const authorized = auth === 'yes';

    // Update database
    const { data, error } = await supabase
      .from('taylor_made_leads')
      .update({
        whatsapp_authorized: authorized,
        whatsapp_authorized_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select();

    if (error || !data || data.length === 0) {
      console.error('Error updating WhatsApp authorization:', error);
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Erro - UBS</title>
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f4f4; }
              .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
              h1 { color: #e74c3c; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ Lead não encontrado</h1>
              <p>Não foi possível processar sua solicitação.</p>
            </div>
          </body>
        </html>
      `);
    }

    const leadName = data[0].name;

    console.log(`✅ WhatsApp authorization ${authorized ? 'granted' : 'denied'} for lead: ${leadName} (${leadId})`);

    // Success page
    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${authorized ? 'Autorização Confirmada' : 'Preferência Registrada'} - UBS</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              text-align: center;
              background: white;
              padding: 50px 40px;
              border-radius: 15px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
              max-width: 500px;
            }
            .icon {
              font-size: 80px;
              margin-bottom: 20px;
            }
            h1 {
              color: ${authorized ? '#27ae60' : '#667eea'};
              margin: 0 0 20px 0;
              font-size: 28px;
            }
            p {
              color: #555;
              font-size: 16px;
              line-height: 1.6;
              margin: 15px 0;
            }
            .highlight {
              background: #f8f9fa;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
            }
            .button {
              display: inline-block;
              margin-top: 20px;
              padding: 15px 35px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-decoration: none;
              border-radius: 50px;
              font-weight: 600;
              transition: transform 0.2s;
            }
            .button:hover {
              transform: translateY(-2px);
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #999;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">${authorized ? '✅' : '📧'}</div>
            <h1>${authorized ? 'Autorização Confirmada!' : 'Preferência Registrada!'}</h1>

            ${authorized ? `
              <p>Obrigado, <strong>${leadName}</strong>!</p>
              <div class="highlight">
                <p><strong>Você autorizou o contato via WhatsApp.</strong></p>
                <p>Nossa equipe poderá entrar em contato pelo WhatsApp para:</p>
                <ul style="text-align: left; display: inline-block;">
                  <li>Tirar dúvidas sobre a proposta</li>
                  <li>Agendar demonstração da plataforma</li>
                  <li>Agilizar o processo de onboarding</li>
                </ul>
              </div>
              <p>Em até <strong>24 horas</strong> você receberá nossa proposta completa por email.</p>
            ` : `
              <p>Obrigado, <strong>${leadName}</strong>!</p>
              <div class="highlight">
                <p><strong>Sua preferência foi registrada.</strong></p>
                <p>Toda a comunicação será feita exclusivamente por email.</p>
              </div>
              <p>Em até <strong>24 horas</strong> você receberá nossa proposta completa.</p>
            `}

            <a href="https://ubs.app.br" class="button">Visitar nosso site</a>

            <div class="footer">
              <p>Universal Booking System</p>
              <p>📧 admin@stratfin.tec.br | 🌐 ubs.app.br</p>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error processing WhatsApp authorization:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Erro - UBS</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f4f4; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: #e74c3c; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Erro Interno</h1>
            <p>Ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/leads/taylor-made/stats
 * Get Taylor Made leads statistics (Admin only)
 * TODO: Add authentication middleware
 */
router.get('/taylor-made/stats', async (req: Request, res: Response) => {
  try {
    // Count total leads
    const { count: totalLeads, error: countError } = await supabase
      .from('taylor_made_leads')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw countError;
    }

    // Count by status
    const { data: statusData, error: statusError } = await supabase
      .from('taylor_made_leads')
      .select('status');

    if (statusError) {
      throw statusError;
    }

    const statusCounts = statusData?.reduce((acc: any, lead: any) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});

    // Count by user type
    const { data: userTypeData, error: userTypeError } = await supabase
      .from('taylor_made_leads')
      .select('user_type');

    if (userTypeError) {
      throw userTypeError;
    }

    const userTypeCounts = userTypeData?.reduce((acc: any, lead: any) => {
      acc[lead.user_type] = (acc[lead.user_type] || 0) + 1;
      return acc;
    }, {});

    // Count by modules interest
    const { data: modulesData, error: modulesError } = await supabase
      .from('taylor_made_leads')
      .select('modules_interest');

    if (modulesError) {
      throw modulesError;
    }

    const modulesCounts: any = {};
    modulesData?.forEach((lead: any) => {
      lead.modules_interest?.forEach((module: string) => {
        modulesCounts[module] = (modulesCounts[module] || 0) + 1;
      });
    });

    return res.json({
      success: true,
      stats: {
        total_leads: totalLeads,
        by_status: statusCounts,
        by_user_type: userTypeCounts,
        by_modules: modulesCounts
      }
    });

  } catch (error) {
    console.error('Error fetching Taylor Made stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatísticas'
    });
  }
});

export default router;
