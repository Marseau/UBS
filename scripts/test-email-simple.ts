/**
 * Simple test for Zoho SMTP
 */
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

async function testEmail() {
  console.log('🧪 Testing Zoho SMTP...\n');

  const config = {
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.ZOHO_SMTP_PORT || '587', 10),
    user: process.env.ZOHO_SMTP_USER,
    pass: process.env.ZOHO_SMTP_PASSWORD,
  };

  console.log('📋 Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   User: ${config.user}`);
  console.log(`   Pass: ${config.pass ? '***' + config.pass.slice(-4) : '❌ Missing'}\n`);

  if (!config.user || !config.pass) {
    console.error('❌ Missing SMTP credentials');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  console.log('📧 Sending test email...');

  try {
    const info = await transporter.sendMail({
      from: `"UBS Taylor Made TEST" <${config.user}>`,
      to: 'admin@stratfin.tec.br',
      subject: '🧪 Teste de Email - UBS Taylor Made',
      html: `
        <h2>✅ Email de Teste Funcionando!</h2>
        <p>Este é um email de teste do sistema UBS Taylor Made.</p>
        <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        <p>Se você está lendo isso, o sistema de notificação de leads está funcionando corretamente.</p>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    console.log('\n📬 Check your inbox: admin@stratfin.tec.br');
  } catch (error: any) {
    console.error('❌ Failed to send email:', error.message);
    if (error.code) console.error(`   Error code: ${error.code}`);
    process.exit(1);
  }
}

testEmail();
