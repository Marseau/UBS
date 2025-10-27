/**
 * Test script for Zoho SMTP email service
 * Usage: npx ts-node scripts/test-email-zoho.ts
 */

import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

// Import after loading env vars
import { emailService } from '../src/services/email.service';

async function testEmailService() {
  console.log('🧪 Testing Zoho SMTP Email Service...\n');

  console.log('📋 Configuration:');
  console.log(`   Host: ${process.env.ZOHO_SMTP_HOST}`);
  console.log(`   Port: ${process.env.ZOHO_SMTP_PORT}`);
  console.log(`   User: ${process.env.ZOHO_SMTP_USER}`);
  console.log(`   Password: ${process.env.ZOHO_SMTP_PASSWORD ? '✅ Configured' : '❌ Missing'}\n`);

  if (!process.env.ZOHO_SMTP_USER || !process.env.ZOHO_SMTP_PASSWORD) {
    console.error('❌ Missing ZOHO_SMTP_USER or ZOHO_SMTP_PASSWORD in .env file');
    process.exit(1);
  }

  // Mock lead data for testing
  const testLead = {
    id: 'test-' + Date.now(),
    name: 'João da Silva (TESTE)',
    email: 'teste@exemplo.com',
    whatsapp: '11987654321',
    user_type: 'agency',
    business_segment: 'beauty',
    main_challenge: 'lost_leads',
    lead_volume: '50_200',
    modules_interest: ['lead_capture', 'scheduling', 'followup'],
    source: 'instagram',
    timestamp: new Date().toISOString(),
  };

  console.log('📧 Sending test email notification...');
  console.log(`   Lead: ${testLead.name}`);
  console.log(`   Email: ${testLead.email}`);
  console.log(`   To: admin@stratfin.tec.br\n`);

  try {
    const success = await emailService.sendTaylorMadeLeadNotification(testLead);

    if (success) {
      console.log('✅ Email sent successfully!');
      console.log('📬 Check inbox: admin@stratfin.tec.br');
    } else {
      console.log('❌ Failed to send email (check logs above)');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error sending email:', error);
    process.exit(1);
  }
}

// Run test
testEmailService()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
