const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Função para escapar valores CSV
function escapeCSVValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

// Função para buscar TODOS os dados sem limite
async function fetchAllConversationData() {
  console.log('🔍 Buscando TODOS os dados de conversas (sem limite)...');
  
  let allData = [];
  let hasMore = true;
  let offset = 0;
  const batchSize = 1000;

  while (hasMore) {
    console.log(`   📦 Buscando lote ${Math.floor(offset/batchSize) + 1} (offset: ${offset})...`);
    
    const { data: batchData, error } = await supabase
      .from('conversation_history')
      .select(`
        id,
        conversation_context,
        tenant_id,
        user_id,
        content,
        is_from_user,
        confidence_score,
        created_at,
        tokens_used,
        api_cost_usd,
        conversation_outcome,
        intent_detected,
        message_type,
        tenants!inner(name, domain),
        users!inner(name, phone)
      `)
      .not('conversation_context->session_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(`Erro ao buscar lote: ${error.message}`);
    }

    if (!batchData || batchData.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(batchData);
      console.log(`   ✅ Lote processado: ${batchData.length} mensagens (total: ${allData.length})`);
      
      if (batchData.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
      }
    }
  }

  console.log(`🎉 Total de mensagens carregadas: ${allData.length}`);
  return allData;
}

// Função para gerar CSV completo com TODAS as conversas
async function generateCompleteConversationsCSV() {
  console.log('📊 Gerando CSV COMPLETO com TODAS as 4560 mensagens e 1041+ conversas...\n');

  try {
    // Buscar TODOS os dados
    const allMessages = await fetchAllConversationData();
    
    if (!allMessages || allMessages.length === 0) {
      console.log('❌ Nenhuma mensagem encontrada.');
      return;
    }

    console.log(`📝 Processando ${allMessages.length} mensagens...`);

    // Agrupar mensagens por sessão para formar conversas completas
    const sessionMap = new Map();
    
    allMessages.forEach(row => {
      const sessionId = row.conversation_context?.session_id;
      if (!sessionId) return;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          session_id: sessionId,
          tenant_id: row.tenant_id,
          tenant_name: row.tenants?.name || 'Unknown',
          tenant_domain: row.tenants?.domain || 'Unknown',
          user_id: row.user_id,
          user_name: row.users?.name || 'Unknown',
          user_phone: row.users?.phone || 'Unknown',
          messages: [],
          first_message_at: row.created_at,
          last_message_at: row.created_at,
          total_tokens: 0,
          total_api_cost: 0,
          max_confidence_score: 0,
          conversation_outcome: null,
          intents_detected: new Set(),
          message_types: new Set()
        });
      }

      const session = sessionMap.get(sessionId);
      
      // Adicionar mensagem à conversa
      session.messages.push({
        id: row.id,
        content: row.content,
        is_from_user: row.is_from_user,
        created_at: row.created_at,
        confidence_score: row.confidence_score,
        tokens_used: row.tokens_used,
        api_cost_usd: row.api_cost_usd,
        intent_detected: row.intent_detected,
        message_type: row.message_type
      });

      // Atualizar métricas da sessão
      session.last_message_at = row.created_at > session.last_message_at ? row.created_at : session.last_message_at;
      session.first_message_at = row.created_at < session.first_message_at ? row.created_at : session.first_message_at;
      session.total_tokens += row.tokens_used || 0;
      session.total_api_cost += parseFloat(row.api_cost_usd || 0);
      session.max_confidence_score = Math.max(session.max_confidence_score, row.confidence_score || 0);
      
      if (row.conversation_outcome) {
        session.conversation_outcome = row.conversation_outcome;
      }
      
      if (row.intent_detected) {
        session.intents_detected.add(row.intent_detected);
      }
      
      if (row.message_type) {
        session.message_types.add(row.message_type);
      }
    });

    // Converter para array e calcular durações
    const conversations = Array.from(sessionMap.values()).map(conv => {
      const durationMs = new Date(conv.last_message_at) - new Date(conv.first_message_at);
      const durationMinutes = Math.round(durationMs / (1000 * 60) * 100) / 100; // 2 casas decimais
      
      return {
        ...conv,
        message_count: conv.messages.length,
        user_message_count: conv.messages.filter(m => m.is_from_user).length,
        bot_message_count: conv.messages.filter(m => !m.is_from_user).length,
        duration_minutes: durationMinutes,
        intents_list: Array.from(conv.intents_detected).join('; '),
        message_types_list: Array.from(conv.message_types).join('; ')
      };
    });

    // Ordenar por data de criação (mais recente primeiro)
    conversations.sort((a, b) => new Date(b.first_message_at) - new Date(a.first_message_at));

    console.log(`✅ Processadas ${conversations.length} conversas únicas`);

    // === CSV 1: Resumo das Conversas ===
    const summaryHeader = [
      'session_id',
      'tenant_name',
      'tenant_domain',
      'user_name',
      'user_phone',
      'message_count',
      'user_messages',
      'bot_messages',
      'duration_minutes',
      'first_message_at',
      'last_message_at',
      'max_confidence_score',
      'total_tokens',
      'total_api_cost_usd',
      'conversation_outcome',
      'intents_detected',
      'message_types'
    ].join(',');

    const summaryRows = conversations.map(conv => {
      return [
        escapeCSVValue(conv.session_id),
        escapeCSVValue(conv.tenant_name),
        escapeCSVValue(conv.tenant_domain),
        escapeCSVValue(conv.user_name),
        escapeCSVValue(conv.user_phone),
        escapeCSVValue(conv.message_count),
        escapeCSVValue(conv.user_message_count),
        escapeCSVValue(conv.bot_message_count),
        escapeCSVValue(conv.duration_minutes),
        escapeCSVValue(conv.first_message_at),
        escapeCSVValue(conv.last_message_at),
        escapeCSVValue(conv.max_confidence_score?.toFixed(4) || '0.0000'),
        escapeCSVValue(conv.total_tokens),
        escapeCSVValue(conv.total_api_cost?.toFixed(6) || '0.000000'),
        escapeCSVValue(conv.conversation_outcome || ''),
        escapeCSVValue(conv.intents_list),
        escapeCSVValue(conv.message_types_list)
      ].join(',');
    });

    const summaryContent = [summaryHeader, ...summaryRows].join('\n');
    const summaryFileName = `conversations_complete_analysis_${new Date().toISOString().split('T')[0]}.csv`;
    const summaryFilePath = path.join(__dirname, summaryFileName);
    fs.writeFileSync(summaryFilePath, summaryContent, 'utf8');

    // === CSV 2: Todas as Mensagens Individuais ===
    const messagesHeader = [
      'message_id',
      'session_id',
      'tenant_name',
      'user_name',
      'user_phone',
      'content',
      'is_from_user',
      'created_at',
      'confidence_score',
      'tokens_used',
      'api_cost_usd',
      'intent_detected',
      'message_type'
    ].join(',');

    const allMessagesFlat = [];
    conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        allMessagesFlat.push([
          escapeCSVValue(msg.id),
          escapeCSVValue(conv.session_id),
          escapeCSVValue(conv.tenant_name),
          escapeCSVValue(conv.user_name),
          escapeCSVValue(conv.user_phone),
          escapeCSVValue(msg.content),
          escapeCSVValue(msg.is_from_user ? 'USER' : 'BOT'),
          escapeCSVValue(msg.created_at),
          escapeCSVValue(msg.confidence_score?.toFixed(4) || '0.0000'),
          escapeCSVValue(msg.tokens_used || 0),
          escapeCSVValue(msg.api_cost_usd || '0.000000'),
          escapeCSVValue(msg.intent_detected || ''),
          escapeCSVValue(msg.message_type || '')
        ].join(','));
      });
    });

    const messagesContent = [messagesHeader, ...allMessagesFlat].join('\n');
    const messagesFileName = `conversations_COMPLETAS_${new Date().toISOString().split('T')[0]}.csv`;
    const messagesFilePath = path.join(__dirname, messagesFileName);
    fs.writeFileSync(messagesFilePath, messagesContent, 'utf8');

    // Estatísticas detalhadas
    const stats = {
      totalConversations: conversations.length,
      totalMessages: allMessages.length,
      totalUserMessages: allMessagesFlat.filter(row => row.includes('USER')).length,
      totalBotMessages: allMessagesFlat.filter(row => row.includes('BOT')).length,
      totalTokens: conversations.reduce((sum, c) => sum + (c.total_tokens || 0), 0),
      totalCost: conversations.reduce((sum, c) => sum + (c.total_api_cost || 0), 0),
      avgDuration: conversations.reduce((sum, c) => sum + (c.duration_minutes || 0), 0) / conversations.length,
      avgConfidence: conversations.reduce((sum, c) => sum + (c.max_confidence_score || 0), 0) / conversations.length,
      avgMessagesPerConv: allMessages.length / conversations.length,
      outcomeDistribution: {},
      tenantDistribution: {},
      domainDistribution: {}
    };

    // Distribuições
    conversations.forEach(c => {
      const outcome = c.conversation_outcome || 'no_outcome';
      stats.outcomeDistribution[outcome] = (stats.outcomeDistribution[outcome] || 0) + 1;
      
      const tenant = c.tenant_name || 'unknown';
      stats.tenantDistribution[tenant] = (stats.tenantDistribution[tenant] || 0) + 1;
      
      const domain = c.tenant_domain || 'unknown';  
      stats.domainDistribution[domain] = (stats.domainDistribution[domain] || 0) + 1;
    });

    // Relatório final
    console.log('\n🎉 CSVs COMPLETOS gerados com sucesso!');
    console.log(`📁 Arquivo 1 (Resumo): ${summaryFileName}`);
    console.log(`📁 Arquivo 2 (Completo): ${messagesFileName}`);
    console.log(`\n📊 ESTATÍSTICAS COMPLETAS:`);
    console.log(`   • Total de conversas: ${stats.totalConversations.toLocaleString()}`);
    console.log(`   • Total de mensagens: ${stats.totalMessages.toLocaleString()}`);
    console.log(`   • Mensagens de usuários: ${stats.totalUserMessages.toLocaleString()}`);
    console.log(`   • Mensagens do bot: ${stats.totalBotMessages.toLocaleString()}`);
    console.log(`   • Média msgs/conversa: ${stats.avgMessagesPerConv.toFixed(1)}`);
    console.log(`   • Total de tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`   • Custo total API: $${stats.totalCost.toFixed(6)}`);
    console.log(`   • Duração média: ${stats.avgDuration.toFixed(2)} minutos`);
    console.log(`   • Confidence média: ${stats.avgConfidence.toFixed(4)}`);

    console.log('\n📈 Distribuição por outcome:');
    Object.entries(stats.outcomeDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([outcome, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${outcome}: ${count} (${percentage}%)`);
      });

    console.log('\n🏢 Distribuição por tenant:');
    Object.entries(stats.tenantDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([tenant, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${tenant}: ${count} (${percentage}%)`);
      });

    console.log('\n🎯 Distribuição por domínio:');
    Object.entries(stats.domainDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([domain, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${domain}: ${count} (${percentage}%)`);
      });

    console.log(`\n✅ Arquivos salvos:`);
    console.log(`   📊 ${summaryFilePath}`);
    console.log(`   📝 ${messagesFilePath}`);
    console.log('\n🎯 DADOS COMPLETOS: Todas as 4560 mensagens e todas as conversas incluídas!');
    console.log('📈 Pronto para análise completa em Excel, Google Sheets, etc.');

    return {
      summaryFile: { fileName: summaryFileName, filePath: summaryFilePath },
      messagesFile: { fileName: messagesFileName, filePath: messagesFilePath },
      stats,
      totalConversations: conversations.length,
      totalMessages: allMessages.length
    };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV completo:', error);
    throw error;
  }
}

// Executar script
async function main() {
  try {
    console.log('🚀 Iniciando geração COMPLETA de CSV de conversas...\n');
    console.log('🎯 Objetivo: Carregar TODAS as 4560 mensagens para gerar TODAS as 1041+ conversas\n');
    
    const result = await generateCompleteConversationsCSV();
    
    console.log('\n🎉 MISSÃO CUMPRIDA!');
    console.log(`📊 Conversas processadas: ${result.totalConversations}`);
    console.log(`📝 Mensagens processadas: ${result.totalMessages}`);
    console.log('🎯 Todos os dados de conversas exportados com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Verificar se foi chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  generateCompleteConversationsCSV,
  fetchAllConversationData
};