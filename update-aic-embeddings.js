#!/usr/bin/env node

/**
 * Update AIC Campaign Embeddings
 *
 * Gera embeddings OpenAI para documentos da AIC atualizados e
 * substitui embeddings existentes na campanha "AIC Teste Embedding"
 */

require('dotenv').config();
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Documentos a serem processados
const DOCUMENTS = [
  {
    path: 'src/frontend/aic-docs.html',
    title: 'AIC - Central de Documentação',
    description: 'Documentação completa da AIC incluindo agendamento automático via Google Calendar'
  },
  {
    path: 'src/frontend/aic-landing.html',
    title: 'AIC - Landing Page',
    description: 'Landing page da AIC com informações sobre prospecção inteligente e agendamento'
  },
  {
    path: 'docs/AIC-PROPOSTA-COMERCIAL.md',
    title: 'AIC - Proposta Comercial',
    description: 'Proposta comercial completa com metodologia em 7 etapas incluindo agendamento automático'
  },
  {
    path: 'docs/AIC-WHATSAPP-AGENT.md',
    title: 'AIC - WhatsApp AI Agent',
    description: 'Documentação técnica do AI Agent com sistema de agendamento Google Calendar OAuth'
  },
  {
    path: 'ONBOARDING_IMPLEMENTATION.md',
    title: 'Sistema de Onboarding e Agendamento',
    description: 'Implementação completa do sistema de onboarding UBS e agendamento automático AIC'
  },
  {
    path: 'GOOGLE_CALENDAR_OAUTH_SETUP.md',
    title: 'Google Calendar OAuth - Guia de Setup',
    description: 'Guia completo de configuração do Google Calendar OAuth para campanhas AIC'
  }
];

async function readDocument(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Arquivo não encontrado: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath, 'utf-8');

  // Se for HTML, extrair apenas o texto relevante (remover CSS, JS, tags)
  if (filePath.endsWith('.html')) {
    return extractTextFromHTML(content);
  }

  return content;
}

/**
 * Extrai texto relevante de HTML removendo CSS, JS e tags
 * Mantém apenas o conteúdo textual para embeddings mais eficientes
 */
function extractTextFromHTML(html) {
  let text = html;

  // Remover blocos de style
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remover blocos de script
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Remover comentários HTML
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Remover tags mantendo o conteúdo
  text = text.replace(/<[^>]+>/g, ' ');

  // Remover entidades HTML comuns
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#\d+;/g, '');

  // Normalizar espaços em branco
  text = text.replace(/\s+/g, ' ');

  // Remover linhas vazias múltiplas
  text = text.replace(/\n\s*\n/g, '\n');

  return text.trim();
}

async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000) // Limitar tamanho
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Erro ao gerar embedding:', error.message);
    throw error;
  }
}

async function findCampaign() {
  // Buscar campanha específica: Social Media BOOSTER 360
  const CAMPAIGN_ID = 'e14454d3-9c58-4607-9592-a590a5c807c7';

  const { data: campaign, error } = await supabase
    .from('cluster_campaigns')
    .select('id, campaign_name')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (error) {
    console.error('Erro ao buscar campanha:', error);
    throw error;
  }

  console.log(`\n✅ Campanha encontrada: ${campaign.campaign_name}`);
  console.log(`   ID: ${campaign.id}\n`);

  return campaign;
}

async function upsertDocument(doc, content, embedding, campaignId) {
  const docTitle = doc.title;

  // Deletar embeddings existentes deste documento (title + campaign_id)
  if (campaignId) {
    const { error: deleteError } = await supabase
      .from('campaign_documents')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('title', docTitle);

    if (deleteError) {
      console.warn(`⚠️  Aviso ao deletar embeddings antigos de ${docTitle}:`, deleteError.message);
    }
  }

  // Limitar tamanho do conteúdo (8000 chars ~= 2000 tokens)
  const limitedContent = content.substring(0, 8000);

  // Inserir novo embedding (chunk único)
  const { error: insertError } = await supabase
    .from('campaign_documents')
    .insert({
      campaign_id: campaignId,
      doc_type: 'knowledge',
      title: docTitle,
      content: limitedContent,
      content_chunk: 0,
      embedding: embedding,
      metadata: {
        description: doc.description,
        source_file: doc.path,
        total_chunks: 1,
        char_count: content.length,
        generated_at: new Date().toISOString()
      },
      is_active: true
    });

  if (insertError) {
    console.error(`❌ Erro ao inserir embedding de ${docTitle}:`, insertError);
    throw insertError;
  }

  console.log(`✅ Embedding atualizado: ${docTitle}`);
}

async function main() {
  console.log('🚀 Iniciando atualização de embeddings da AIC\n');

  try {
    // 1. Buscar campanha
    console.log('📋 Buscando campanha AIC Teste Embedding...');
    const campaign = await findCampaign();

    if (campaign) {
      console.log(`✅ Campanha encontrada: ${campaign.campaign_name} (${campaign.id})\n`);
    } else {
      console.log('ℹ️  Processando embeddings sem vínculo específico de campanha\n');
    }

    // 2. Processar cada documento
    let processed = 0;
    let errors = 0;

    for (const doc of DOCUMENTS) {
      try {
        console.log(`📄 Processando: ${doc.title}`);
        console.log(`   Arquivo: ${doc.path}`);

        // Ler conteúdo
        const content = await readDocument(doc.path);
        console.log(`   Tamanho: ${content.length} caracteres`);

        // Gerar embedding
        console.log(`   Gerando embedding via OpenAI...`);
        const embedding = await generateEmbedding(content);
        console.log(`   Embedding gerado: ${embedding.length} dimensões`);

        // Salvar no banco
        await upsertDocument(doc, content, embedding, campaign?.id);
        processed++;

        // Pequeno delay para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Erro ao processar ${doc.title}:`, error.message);
        errors++;
      }

      console.log('');
    }

    // 3. Resumo
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Atualização de embeddings concluída!');
    console.log(`✅ Processados com sucesso: ${processed}/${DOCUMENTS.length}`);
    console.log(`❌ Erros: ${errors}`);
    if (campaign) {
      console.log(`📊 Campanha: ${campaign.campaign_name}`);
    }
    console.log('═══════════════════════════════════════════════════════\n');

    if (errors > 0) {
      console.log('⚠️  Alguns documentos falharam. Verifique os erros acima.');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Erro fatal:', error.message);
    process.exit(1);
  }
}

main();
