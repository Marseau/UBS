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

// Função para gerar CSV unificado e completo
async function generateUnifiedConversationsCSV() {
  console.log('📊 Gerando CSV UNIFICADO com resumo completo das conversas...\n');

  try {
    console.log('🔍 Consultando dados completos das conversas...');
    
    // Query unificada para buscar todos os dados necessários
    const { data: conversationData, error } = await supabase
      .from('conversation_history')
      .select(`
        conversation_context,
        tenant_id,
        user_id,
        confidence_score,
        created_at,
        tokens_used,
        api_cost_usd,
        processing_cost_usd,
        conversation_outcome,
        model_used,
        message_source,
        tenants!inner(name, domain),
        users!inner(name, phone)
      `)
      .not('conversation_context->session_id', 'is', null)
      .not('conversation_outcome', 'is', null);

    if (error) {
      throw new Error(`Erro na query: ${error.message}`);
    }

    if (!conversationData || conversationData.length === 0) {
      console.log('❌ Nenhum dado de conversa encontrado.');
      return;
    }

    console.log(`✅ ${conversationData.length} mensagens carregadas`);

    // Processar dados e agrupar por sessão
    const sessionMap = new Map();
    
    conversationData.forEach(row => {
      const sessionId = row.conversation_context?.session_id;
      if (!sessionId) return;

      const user = row.users || { name: 'Unknown', phone: 'Unknown' };
      const tenant = row.tenants || { name: 'Unknown', domain: 'unknown' };

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, {
          session_id: sessionId,
          tenant_id: row.tenant_id,
          tenant_name: tenant.name,
          tenant_domain: tenant.domain,
          user_id: row.user_id,
          user_name: user.name,
          user_phone: user.phone,
          max_confidence_score: row.confidence_score || 0,
          avg_confidence_score: row.confidence_score || 0,
          duration_minutes: row.conversation_context?.duration_minutes || 0,
          first_message_at: row.created_at,
          last_message_at: row.created_at,
          total_tokens: row.tokens_used || 0,
          total_api_cost_usd: parseFloat(row.api_cost_usd || 0),
          total_processing_cost_usd: parseFloat(row.processing_cost_usd || 0),
          conversation_outcome: row.conversation_outcome,
          model_used: row.model_used || 'gpt-4',
          message_source: row.message_source || 'whatsapp',
          message_count: 1,
          confidence_scores: [row.confidence_score || 0].filter(s => s > 0)
        });
      } else {
        const session = sessionMap.get(sessionId);
        session.max_confidence_score = Math.max(session.max_confidence_score, row.confidence_score || 0);
        session.duration_minutes = Math.max(session.duration_minutes, row.conversation_context?.duration_minutes || 0);
        session.last_message_at = row.created_at > session.last_message_at ? row.created_at : session.last_message_at;
        session.first_message_at = row.created_at < session.first_message_at ? row.created_at : session.first_message_at;
        session.total_tokens += row.tokens_used || 0;
        session.total_api_cost_usd += parseFloat(row.api_cost_usd || 0);
        session.total_processing_cost_usd += parseFloat(row.processing_cost_usd || 0);
        session.message_count += 1;
        
        if (row.confidence_score && row.confidence_score > 0) {
          session.confidence_scores.push(row.confidence_score);
        }
        
        if (row.conversation_outcome) {
          session.conversation_outcome = row.conversation_outcome;
        }
      }
    });

    // Calcular confidence score médio para cada sessão
    sessionMap.forEach(session => {
      if (session.confidence_scores.length > 0) {
        session.avg_confidence_score = session.confidence_scores.reduce((a, b) => a + b, 0) / session.confidence_scores.length;
      }
      delete session.confidence_scores; // Remove array temporário
    });

    // Buscar dados de agendamentos relacionados
    console.log('🔍 Buscando agendamentos relacionados...');
    
    const sessionIds = Array.from(sessionMap.keys());
    // Buscar agendamentos em lotes menores para evitar erro de query
    const appointments = [];
    const batchSize = 50;
    
    for (let i = 0; i < sessionIds.length; i += batchSize) {
      const batch = sessionIds.slice(i, i + batchSize);
      
      const { data: batchAppointments } = await supabase
        .from('appointments')
        .select(`
          appointment_data,
          quoted_price,
          final_price,
          start_time,
          status,
          services!inner(name, duration_minutes),
          professionals!inner(name)
        `)
        .contains('appointment_data', { source: 'whatsapp_conversation' })
        .or(batch.map(id => `appointment_data->>session_id.eq.${id}`).join(','));
      
      if (batchAppointments) {
        appointments.push(...batchAppointments);
      }
    }

    // Adicionar dados de agendamento às sessões
    const appointmentMap = new Map();
    if (appointments) {
      appointments.forEach(apt => {
        const sessionId = apt.appointment_data?.session_id;
        if (sessionId) {
          appointmentMap.set(sessionId, {
            has_appointment: true,
            appointment_date: apt.start_time,
            appointment_status: apt.status,
            service_name: apt.services?.name || 'Unknown',
            service_duration: apt.services?.duration_minutes || 0,
            professional_name: apt.professionals?.name || 'Unknown',
            quoted_price: parseFloat(apt.quoted_price || 0),
            final_price: parseFloat(apt.final_price || 0)
          });
        }
      });
    }

    console.log(`✅ ${appointmentMap.size} agendamentos relacionados encontrados`);

    // Combinar dados de conversas com agendamentos
    const finalData = Array.from(sessionMap.values()).map(session => {
      const appointment = appointmentMap.get(session.session_id) || {
        has_appointment: false,
        appointment_date: null,
        appointment_status: null,
        service_name: null,
        service_duration: null,
        professional_name: null,
        quoted_price: 0,
        final_price: 0
      };

      return { ...session, ...appointment };
    }).sort((a, b) => new Date(b.first_message_at) - new Date(a.first_message_at));

    console.log(`✅ Processando ${finalData.length} conversas únicas`);

    // Cabeçalho do CSV UNIFICADO
    const csvHeader = [
      'session_id',
      'tenant_name',
      'tenant_domain', 
      'user_name',
      'user_phone',
      'conversation_outcome',
      'max_confidence_score',
      'avg_confidence_score',
      'duration_minutes',
      'message_count',
      'total_tokens',
      'total_api_cost_usd',
      'total_processing_cost_usd',
      'total_cost_usd',
      'cost_per_token',
      'first_message_at',
      'last_message_at',
      'conversation_duration_hours',
      'model_used',
      'message_source',
      'has_appointment',
      'appointment_date',
      'appointment_status',
      'service_name',
      'service_duration_minutes',
      'professional_name',
      'quoted_price_brl',
      'final_price_brl',
      'revenue_conversion_rate'
    ].join(',');

    // Gerar linhas do CSV
    const csvRows = finalData.map(conv => {
      const totalCost = conv.total_api_cost_usd + conv.total_processing_cost_usd;
      const costPerToken = conv.total_tokens > 0 ? (totalCost / conv.total_tokens) : 0;
      const conversationDurationHours = (new Date(conv.last_message_at) - new Date(conv.first_message_at)) / (1000 * 60 * 60);
      const revenueConversionRate = conv.has_appointment ? (conv.final_price / (totalCost * 5.5)) : 0; // Assumindo USD -> BRL = 5.5

      return [
        escapeCSVValue(conv.session_id),
        escapeCSVValue(conv.tenant_name),
        escapeCSVValue(conv.tenant_domain),
        escapeCSVValue(conv.user_name),
        escapeCSVValue(conv.user_phone),
        escapeCSVValue(conv.conversation_outcome),
        escapeCSVValue(conv.max_confidence_score?.toFixed(4) || '0.0000'),
        escapeCSVValue(conv.avg_confidence_score?.toFixed(4) || '0.0000'),
        escapeCSVValue(conv.duration_minutes || 0),
        escapeCSVValue(conv.message_count || 0),
        escapeCSVValue(conv.total_tokens || 0),
        escapeCSVValue(conv.total_api_cost_usd?.toFixed(6) || '0.000000'),
        escapeCSVValue(conv.total_processing_cost_usd?.toFixed(6) || '0.000000'),
        escapeCSVValue(totalCost.toFixed(6)),
        escapeCSVValue(costPerToken.toFixed(8)),
        escapeCSVValue(conv.first_message_at),
        escapeCSVValue(conv.last_message_at),
        escapeCSVValue(conversationDurationHours.toFixed(2)),
        escapeCSVValue(conv.model_used),
        escapeCSVValue(conv.message_source),
        escapeCSVValue(conv.has_appointment),
        escapeCSVValue(conv.appointment_date || ''),
        escapeCSVValue(conv.appointment_status || ''),
        escapeCSVValue(conv.service_name || ''),
        escapeCSVValue(conv.service_duration || ''),
        escapeCSVValue(conv.professional_name || ''),
        escapeCSVValue(conv.quoted_price || '0'),
        escapeCSVValue(conv.final_price || '0'),
        escapeCSVValue(revenueConversionRate.toFixed(2))
      ].join(',');
    });

    // Combinar cabeçalho e dados
    const csvContent = [csvHeader, ...csvRows].join('\n');

    // Salvar arquivo único
    const fileName = `conversations_complete_analysis_${new Date().toISOString().split('T')[0]}.csv`;
    const filePath = path.join(__dirname, fileName);
    
    fs.writeFileSync(filePath, csvContent, 'utf8');

    // Estatísticas avançadas
    const stats = {
      totalConversations: finalData.length,
      totalTokens: finalData.reduce((sum, c) => sum + (c.total_tokens || 0), 0),
      totalApiCost: finalData.reduce((sum, c) => sum + (c.total_api_cost_usd || 0), 0),
      totalProcessingCost: finalData.reduce((sum, c) => sum + (c.total_processing_cost_usd || 0), 0),
      totalCost: 0,
      avgDuration: finalData.reduce((sum, c) => sum + (c.duration_minutes || 0), 0) / finalData.length,
      avgConfidence: finalData.reduce((sum, c) => sum + (c.avg_confidence_score || 0), 0) / finalData.length,
      conversionsToAppointments: finalData.filter(c => c.has_appointment).length,
      totalRevenue: finalData.reduce((sum, c) => sum + (c.final_price || 0), 0),
      outcomeDistribution: {},
      domainDistribution: {},
      appointmentStatusDistribution: {}
    };

    stats.totalCost = stats.totalApiCost + stats.totalProcessingCost;
    stats.conversionRate = (stats.conversionsToAppointments / stats.totalConversations) * 100;
    stats.costPerConversion = stats.conversionsToAppointments > 0 ? (stats.totalCost / stats.conversionsToAppointments) : 0;
    stats.revenuePerDollar = stats.totalCost > 0 ? (stats.totalRevenue / (stats.totalCost * 5.5)) : 0; // USD to BRL

    // Distribuições
    finalData.forEach(c => {
      const outcome = c.conversation_outcome || 'null';
      const domain = c.tenant_domain || 'unknown';
      const appointmentStatus = c.appointment_status || 'no_appointment';
      
      stats.outcomeDistribution[outcome] = (stats.outcomeDistribution[outcome] || 0) + 1;
      stats.domainDistribution[domain] = (stats.domainDistribution[domain] || 0) + 1;
      stats.appointmentStatusDistribution[appointmentStatus] = (stats.appointmentStatusDistribution[appointmentStatus] || 0) + 1;
    });

    // Relatório final
    console.log('\n🎉 CSV UNIFICADO gerado com sucesso!');
    console.log(`📁 Arquivo: ${fileName}`);
    console.log(`📊 Estatísticas Completas:`);
    console.log(`   • Total de conversas: ${stats.totalConversations.toLocaleString()}`);
    console.log(`   • Total de tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`   • Custo total: $${stats.totalCost.toFixed(6)}`);
    console.log(`   • Custo médio/conversa: $${(stats.totalCost / stats.totalConversations).toFixed(6)}`);
    console.log(`   • Duração média: ${stats.avgDuration.toFixed(1)} minutos`);
    console.log(`   • Confidence média: ${stats.avgConfidence.toFixed(3)}`);
    console.log(`   • Taxa de conversão: ${stats.conversionRate.toFixed(1)}%`);
    console.log(`   • Receita total: R$ ${stats.totalRevenue.toFixed(2)}`);
    console.log(`   • ROI: R$ ${stats.revenuePerDollar.toFixed(2)} por USD gasto`);

    console.log('\n📈 Distribuição por outcome:');
    Object.entries(stats.outcomeDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([outcome, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${outcome}: ${count} (${percentage}%)`);
      });

    console.log('\n🏢 Distribuição por domínio:');
    Object.entries(stats.domainDistribution)
      .sort(([,a], [,b]) => b - a)
      .forEach(([domain, count]) => {
        const percentage = ((count / stats.totalConversations) * 100).toFixed(1);
        console.log(`   • ${domain}: ${count} (${percentage}%)`);
      });

    // Preview das primeiras linhas
    console.log('\n👀 Preview do CSV (primeiras 2 linhas):');
    console.log(csvHeader);
    csvRows.slice(0, 2).forEach(row => console.log(row));

    console.log(`\n✅ Arquivo UNIFICADO salvo em: ${filePath}`);
    console.log('📊 Análise completa com conversas + agendamentos + métricas financeiras!');

    return {
      fileName,
      filePath,
      stats,
      totalRows: finalData.length
    };

  } catch (error) {
    console.error('❌ Erro ao gerar CSV unificado:', error);
    throw error;
  }
}

// Executar script
async function main() {
  try {
    console.log('🚀 Iniciando geração de CSV UNIFICADO...\n');
    
    const result = await generateUnifiedConversationsCSV();
    
    console.log('\n🎉 CSV UNIFICADO gerado com sucesso!');
    console.log('📊 Arquivo único com análise completa pronto!');
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Verificar se foi chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { generateUnifiedConversationsCSV };