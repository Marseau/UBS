/**
 * Test Script: Aceite de Proposta com Upload para B2
 *
 * Este script testa o fluxo completo:
 * 1. Cria uma jornada de teste
 * 2. Gera PDF da proposta
 * 3. Faz upload para B2
 * 4. Verifica URL retornada
 */

import { config } from 'dotenv';
config();

import { supabaseAdmin } from '../src/config/database';
import { proposalPDFService } from '../src/services/proposal-pdf.service';

async function testProposalAccept() {
  console.log('========================================');
  console.log('TESTE: Aceite de Proposta com Upload B2');
  console.log('========================================\n');

  const testId = Date.now();
  const proposalId = `PROPOSTA-TEST-${testId}`;

  try {
    // 1. Criar jornada de teste
    console.log('1. Criando jornada de teste...');
    const { data: journey, error: journeyError } = await supabaseAdmin
      .from('aic_client_journeys')
      .insert({
        client_name: 'Cliente Teste PDF',
        client_email: `teste.pdf.${testId}@exemplo.com`,
        client_company: 'Empresa Teste LTDA',
        current_step: 'proposta_enviada',
        next_action_message: 'Aguardando aceite da proposta',
        proposal_data: {
          project_name: 'Campanha Teste',
          contract_value: 4000,
          lead_value: 10
        },
        contract_value: 4000,
        lead_value: 10
      })
      .select()
      .single();

    if (journeyError) {
      throw new Error(`Erro ao criar jornada: ${journeyError.message}`);
    }

    console.log(`   Journey ID: ${journey.id}`);
    console.log(`   Cliente: ${journey.client_name}`);
    console.log(`   Step: ${journey.current_step}\n`);

    // 2. Gerar e fazer upload do PDF
    console.log('2. Gerando PDF da proposta e enviando para B2...');
    const acceptedAt = new Date().toISOString();

    const pdf = await proposalPDFService.generateAndUpload({
      client_name: journey.client_name,
      client_email: journey.client_email,
      client_company: journey.client_company,
      proposal_id: proposalId,
      contract_value: 4000,
      lead_value: 10,
      accepted_at: acceptedAt,
      accepted_ip: '127.0.0.1'
    });

    console.log(`   PDF Size: ${pdf.buffer.length} bytes (~${Math.round(pdf.buffer.length / 1024)} KB)`);
    console.log(`   Filename: ${pdf.filename}`);
    console.log(`   URL: ${pdf.url ? pdf.url.substring(0, 80) + '...' : 'N/A'}\n`);

    // 3. Atualizar jornada com URL do PDF
    console.log('3. Atualizando jornada com URL do PDF...');
    const { error: updateError } = await supabaseAdmin
      .from('aic_client_journeys')
      .update({
        proposal_pdf_url: pdf.url || null,
        proposta_aceita_at: acceptedAt,
        current_step: 'proposta_visualizada',
        next_action_message: 'Proposta aceita! Aguarde o envio do contrato.'
      })
      .eq('id', journey.id);

    if (updateError) {
      console.error(`   Erro ao atualizar: ${updateError.message}`);
    } else {
      console.log('   Jornada atualizada com sucesso!\n');
    }

    // 4. Verificar URL
    if (pdf.url) {
      console.log('4. Verificando URL do PDF...');
      try {
        const response = await fetch(pdf.url, { method: 'HEAD' });
        console.log(`   Status: ${response.status}`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
        console.log(`   Content-Length: ${response.headers.get('content-length')} bytes\n`);

        if (response.status === 200) {
          console.log('✅ SUCESSO! PDF da proposta gerado e acessível no B2.\n');
        } else {
          console.log(`⚠️ URL retornou status ${response.status}\n`);
        }
      } catch (fetchError) {
        console.error('   Erro ao verificar URL:', fetchError);
      }
    } else {
      console.log('⚠️ PDF gerado mas sem URL (erro no upload)\n');
    }

    // 5. Mostrar resultado final
    console.log('========== RESULTADO FINAL ==========');
    console.log(`Journey ID: ${journey.id}`);
    console.log(`Proposal ID: ${proposalId}`);
    console.log(`PDF URL: ${pdf.url || 'N/A'}`);
    console.log('=====================================\n');

    // Cleanup: Deletar jornada de teste
    console.log('Limpando jornada de teste...');
    await supabaseAdmin
      .from('aic_client_journeys')
      .delete()
      .eq('id', journey.id);
    console.log('Jornada de teste removida.\n');

  } catch (error) {
    console.error('❌ ERRO:', error);
  }

  // Fechar browser do Puppeteer
  await proposalPDFService.close();
  process.exit(0);
}

testProposalAccept();
