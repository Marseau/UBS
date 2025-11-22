/**
 * Script de Limpeza de Emails @sentry Inválidos
 * Remove emails de rastreamento do Wix/Sentry capturados indevidamente pelo scraper
 *
 * Data: 2025-01-11
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface InstagramLead {
  id: string;
  username: string;
  email: string | null;
  additional_emails: string[];
  emails_normalized: string[];
}

async function cleanSentryEmails() {
  console.log('🧹 Iniciando limpeza de emails @sentry...\n');

  // Buscar todos os leads (vamos filtrar no código)
  const { data: allLeads, error: fetchError } = await supabase
    .from('instagram_leads')
    .select('id, username, email, additional_emails, emails_normalized');

  if (fetchError) {
    console.error('❌ Erro ao buscar leads:', fetchError);
    return;
  }

  // Filtrar leads que contêm @sentry
  const leadsWithSentry = (allLeads || []).filter(lead => {
    const hasInAdditional = JSON.stringify(lead.additional_emails || []).includes('sentry');
    const hasInNormalized = JSON.stringify(lead.emails_normalized || []).includes('sentry');
    return hasInAdditional || hasInNormalized;
  });

  console.log(`📊 Encontrados ${leadsWithSentry.length} leads com emails @sentry\n`);

  let cleanedCount = 0;
  let emailsRemoved = 0;

  for (const lead of leadsWithSentry) {
    const originalEmailsCount = (lead.emails_normalized || []).length;

    // Verificar se email principal é @sentry
    const emailIsSentry = lead.email && (lead.email.includes('@sentry') || lead.email.includes('@sentry-next'));

    // Limpar additional_emails
    const cleanedAdditionalEmails = (lead.additional_emails || []).filter(
      (email: string) => !email.includes('@sentry') && !email.includes('@sentry-next')
    );

    // Limpar emails_normalized
    const cleanedNormalizedEmails = (lead.emails_normalized || []).filter(
      (email: string) => !email.includes('@sentry') && !email.includes('@sentry-next')
    );

    const emailsRemovedFromLead = originalEmailsCount - cleanedNormalizedEmails.length;

    // Preparar update
    const updateData: any = {
      additional_emails: cleanedAdditionalEmails,
      emails_normalized: cleanedNormalizedEmails
    };

    // Se email principal é @sentry, setar como null
    if (emailIsSentry) {
      updateData.email = null;
    }

    // Atualizar no banco
    const { error: updateError } = await supabase
      .from('instagram_leads')
      .update(updateData)
      .eq('id', lead.id);

    if (updateError) {
      console.error(`❌ Erro ao atualizar lead ${lead.username}:`, updateError);
    } else {
      if (emailsRemovedFromLead > 0 || emailIsSentry) {
        const totalRemoved = emailsRemovedFromLead + (emailIsSentry ? 1 : 0);
        console.log(`✅ ${lead.username}: ${totalRemoved} email(s) @sentry removido(s)${emailIsSentry ? ' (incl. email principal)' : ''}`);
        cleanedCount++;
        emailsRemoved += totalRemoved;
      }
    }
  }

  console.log('\n📈 Relatório Final:');
  console.log(`   ✅ Leads limpos: ${cleanedCount}`);
  console.log(`   🗑️  Emails @sentry removidos: ${emailsRemoved}`);
  console.log('\n🎉 Limpeza concluída!');

  // Verificação final
  const { data: finalCheck } = await supabase
    .from('instagram_leads')
    .select('id, emails_normalized, additional_emails');

  const remaining = (finalCheck || []).filter(lead => {
    const hasInAdditional = JSON.stringify(lead.additional_emails || []).includes('sentry');
    const hasInNormalized = JSON.stringify(lead.emails_normalized || []).includes('sentry');
    return hasInAdditional || hasInNormalized;
  }).length;

  if (remaining > 0) {
    console.log(`\n⚠️  Ainda restam ${remaining} leads com @sentry. Execute o script novamente.`);
  } else {
    console.log('\n✅ Nenhum email @sentry restante no banco!');
  }
}

cleanSentryEmails().catch(console.error);
