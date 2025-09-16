#!/usr/bin/env node

/**
 * Script para replicar a credencial Google Calendar válida para todos os profissionais
 * Isso permite testar o fluxo de agendamento completo com Google Calendar
 */

const { supabaseAdmin } = require('../src/config/database');

async function replicateValidCredentials() {
  console.log('🔄 Replicando credencial válida para todos os profissionais...');

  try {
    // 1. Buscar a credencial válida
    const validProfessionalId = '24071185-89a5-4b7a-bc87-feff4f3f2f81';

    const { data: validProfessional, error: validError } = await supabaseAdmin
      .from('professionals')
      .select('google_calendar_credentials')
      .eq('id', validProfessionalId)
      .single();

    if (validError || !validProfessional?.google_calendar_credentials) {
      console.error('❌ Erro ao buscar credencial válida:', validError);
      return;
    }

    console.log('✅ Credencial válida encontrada');

    // 2. Buscar todos os profissionais sem credenciais
    const { data: professionalsWithoutCredentials, error: profError } = await supabaseAdmin
      .from('professionals')
      .select('id, name, tenant_id')
      .is('google_calendar_credentials', null);

    if (profError) {
      console.error('❌ Erro ao buscar profissionais:', profError);
      return;
    }

    console.log(`📊 Profissionais sem credenciais: ${professionalsWithoutCredentials.length}`);

    if (professionalsWithoutCredentials.length === 0) {
      console.log('✅ Todos os profissionais já têm credenciais!');
      return;
    }

    // 3. Replicar credencial válida para todos
    const validCredentials = validProfessional.google_calendar_credentials;

    console.log('🔄 Replicando credenciais...');

    let successCount = 0;
    let errorCount = 0;

    for (const prof of professionalsWithoutCredentials) {
      try {
        const { error: updateError } = await supabaseAdmin
          .from('professionals')
          .update({
            google_calendar_credentials: validCredentials,
            google_calendar_id: 'primary',
            updated_at: new Date().toISOString()
          })
          .eq('id', prof.id);

        if (updateError) {
          console.error(`❌ Erro ao replicar para ${prof.name}:`, updateError.message);
          errorCount++;
        } else {
          console.log(`✅ Credencial replicada para: ${prof.name} (${prof.id})`);
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Erro inesperado para ${prof.name}:`, error.message);
        errorCount++;
      }
    }

    console.log(`\n📋 Resumo:`);
    console.log(`- Credenciais replicadas com sucesso: ${successCount}`);
    console.log(`- Erros: ${errorCount}`);
    console.log(`- Total processado: ${successCount + errorCount}`);

    if (successCount > 0) {
      console.log('\n✅ Replicação concluída!');
      console.log('🧪 Agora todos os profissionais podem sincronizar com Google Calendar');
      console.log('⚠️  IMPORTANTE: Estas são credenciais compartilhadas para teste');
      console.log('💡 Em produção, cada profissional deve ter suas próprias credenciais OAuth');
    }

  } catch (error) {
    console.error('❌ Erro durante replicação:', error);
  }
}

// Função para verificar quantos profissionais agora têm credenciais
async function verifyReplication() {
  try {
    const { data: allProfessionals, error } = await supabaseAdmin
      .from('professionals')
      .select('id, name, google_calendar_credentials')
      .not('google_calendar_credentials', 'is', null);

    if (error) {
      console.error('❌ Erro na verificação:', error);
      return;
    }

    console.log(`\n🔍 Verificação pós-replicação:`);
    console.log(`📊 Profissionais com credenciais Google Calendar: ${allProfessionals.length}`);

    // Mostrar alguns exemplos
    const sample = allProfessionals.slice(0, 5);
    console.log('📝 Exemplos:');
    sample.forEach(prof => {
      console.log(`  - ${prof.name} (ID: ${prof.id})`);
    });

    if (allProfessionals.length > 5) {
      console.log(`  ... e mais ${allProfessionals.length - 5} profissionais`);
    }

  } catch (error) {
    console.error('❌ Erro na verificação:', error);
  }
}

// Executar script
if (require.main === module) {
  replicateValidCredentials()
    .then(() => verifyReplication())
    .then(() => {
      console.log('\n🎉 Script de replicação concluído!');
      console.log('🚀 Agora você pode testar agendamentos com Google Calendar');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Script falhou:', error);
      process.exit(1);
    });
}

module.exports = { replicateValidCredentials, verifyReplication };