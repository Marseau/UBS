import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  name: string
  email: string
  whatsapp?: string
  company?: string
  country?: string
  lang?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, email, whatsapp, company, country, lang = 'pt' }: EmailRequest = await req.json()

    // Validate input
    if (!name || !email) {
      return new Response(
        JSON.stringify({ error: 'Nome e email são obrigatórios' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Email templates
    const templates = {
      pt: {
        subject: '🎉 Bem-vindo ao UBS App - Pré-lançamento!',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://diversos-stratfin.s3.us-east-005.backblazeb2.com/UBS_NAC_BRANCO.png" 
                   alt="UBS App" style="max-width: 150px; height: auto;">
            </div>
            
            <h1 style="color: #2D5A9B; text-align: center; font-size: 24px; margin-bottom: 20px;">
              Obrigado por se inscrever, ${name}! 🚀
            </h1>
            
            <div style="background: #f8f9fb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #2D5A9B; font-size: 18px; margin-bottom: 15px;">
                ✅ Sua inscrição foi confirmada!
              </h2>
              <p style="color: #333; line-height: 1.6; margin-bottom: 15px;">
                Você está entre os primeiros a conhecer o <strong>UBS App</strong> - a plataforma definitiva 
                de agendamento e gestão via WhatsApp.
              </p>
              <p style="color: #333; line-height: 1.6;">
                <strong>🎁 Benefícios exclusivos para você:</strong>
              </p>
              <ul style="color: #333; line-height: 1.6; margin-left: 20px;">
                <li>30 dias grátis na plataforma</li>
                <li>Acesso prioritário ao beta</li>
                <li>Suporte dedicado durante o teste</li>
                <li>Feedback direto com nossa equipe</li>
              </ul>
            </div>
            
            <div style="background: #2D5A9B; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; font-size: 16px;">🚀 Próximos passos:</h3>
              <p style="margin: 0; line-height: 1.6;">
                Em breve entraremos em contato via WhatsApp para agendar uma demonstração 
                personalizada e configurar sua conta.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Universal Booking System<br>
                <a href="https://landing-worker.marseaufranco.workers.dev" style="color: #2D5A9B;">
                  landing-worker.marseaufranco.workers.dev
                </a>
              </p>
            </div>
          </div>
        `
      },
      en: {
        subject: '🎉 Welcome to UBS App - Pre-launch!',
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="https://Diversos-Stratfin.s3.us-east-005.backblazeb2.com/UBS_INT_BRANCO.png" 
                   alt="UBS App" style="max-width: 150px; height: auto;">
            </div>
            
            <h1 style="color: #2D5A9B; text-align: center; font-size: 24px; margin-bottom: 20px;">
              Thank you for signing up, ${name}! 🚀
            </h1>
            
            <div style="background: #f8f9fb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="color: #2D5A9B; font-size: 18px; margin-bottom: 15px;">
                ✅ Your registration is confirmed!
              </h2>
              <p style="color: #333; line-height: 1.6; margin-bottom: 15px;">
                You're among the first to discover <strong>UBS App</strong> - the ultimate platform 
                for scheduling and management via WhatsApp.
              </p>
              <p style="color: #333; line-height: 1.6;">
                <strong>🎁 Exclusive benefits for you:</strong>
              </p>
              <ul style="color: #333; line-height: 1.6; margin-left: 20px;">
                <li>30 days free on the platform</li>
                <li>Priority access to beta</li>
                <li>Dedicated support during testing</li>
                <li>Direct feedback with our team</li>
              </ul>
            </div>
            
            <div style="background: #2D5A9B; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
              <h3 style="margin: 0 0 10px 0; font-size: 16px;">🚀 Next steps:</h3>
              <p style="margin: 0; line-height: 1.6;">
                We'll soon contact you via WhatsApp to schedule a personalized demo 
                and set up your account.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Universal Booking System<br>
                <a href="https://landing-worker.marseaufranco.workers.dev" style="color: #2D5A9B;">
                  landing-worker.marseaufranco.workers.dev
                </a>
              </p>
            </div>
          </div>
        `
      }
    }

    // Get template based on language
    const template = templates[lang as keyof typeof templates] || templates.pt

    // Configure SMTP client
    const client = new SmtpClient()
    
    await client.connectTLS({
      hostname: "smtp.zoho.com",
      port: 587,
      username: "admin@stratfin.tec.br",
      password: "mEESSa34JJeu",
    })

    // Send email to lead
    await client.send({
      from: "admin@stratfin.tec.br",
      to: email,
      subject: template.subject,
      content: template.html,
      html: template.html,
    })

    // Send notification to admin
    const adminSubject = `Novo lead cadastrado: ${name}`
    const adminHtml = `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2D5A9B;">Novo lead cadastrado na landing page</h2>
        <ul style="color: #333; font-size: 1.1em;">
          <li><strong>Nome:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>WhatsApp:</strong> ${whatsapp || '-'} </li>
          <li><strong>Empresa:</strong> ${company || '-'} </li>
          <li><strong>País:</strong> ${country || '-'} </li>
          <li><strong>Idioma:</strong> ${lang}</li>
          <li><strong>Data:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</li>
        </ul>
      </div>
    `
    await client.send({
      from: "admin@stratfin.tec.br",
      to: "marseaufranco@stratfin.tec.br",
      subject: adminSubject,
      content: adminHtml,
      html: adminHtml,
    })

    await client.close()

    console.log(`Email sent successfully to ${email} and notification sent to admin`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email enviado com sucesso!' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Error sending email:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao enviar email', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}) 