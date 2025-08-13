const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Preços realísticos GPT-4 (por 1K tokens)
const GPT4_PRICING = {
  input: 0.03,   // $0.03 por 1K tokens de entrada
  output: 0.06,  // $0.06 por 1K tokens de saída
  turbo_input: 0.01,   // GPT-4 Turbo - mais barato
  turbo_output: 0.03
};

// Função para calcular tokens realísticos baseado no conteúdo
function calculateRealisticTokens(message, isFromUser, messageIndex, totalMessages) {
  const baseContent = message.content || '';
  const contentLength = baseContent.length;
  
  let tokens = 0;
  
  if (isFromUser) {
    // Mensagens do usuário: baseado no comprimento do texto
    tokens = Math.ceil(contentLength / 4); // ~4 chars por token
    tokens = Math.max(tokens, 10); // Mínimo 10 tokens
  } else {
    // Mensagens do bot: inclui system prompt + contexto + resposta
    const systemPromptTokens = 120; // Prompt do agente
    const contextTokens = messageIndex * 30; // Contexto cresce com a conversa
    const responseTokens = Math.ceil(contentLength / 4);
    const metadataTokens = 25; // Análise de intent, etc.
    
    tokens = systemPromptTokens + contextTokens + responseTokens + metadataTokens;
  }
  
  // Adicionar variação natural (+/- 20%)
  const variation = 0.8 + (Math.random() * 0.4); // 0.8 a 1.2
  tokens = Math.ceil(tokens * variation);
  
  return Math.max(tokens, 15);
}

// Função para calcular custo realístico
function calculateRealisticCost(tokens, isFromUser) {
  // Assumir 70% input, 30% output tokens para bot
  // Usuário só gera input tokens
  
  let inputTokens, outputTokens;
  
  if (isFromUser) {
    inputTokens = tokens;
    outputTokens = 0;
  } else {
    inputTokens = Math.ceil(tokens * 0.7);
    outputTokens = Math.ceil(tokens * 0.3);
  }
  
  // Usar GPT-4 Turbo (mais comum em produção)
  const inputCost = (inputTokens / 1000) * GPT4_PRICING.turbo_input;
  const outputCost = (outputTokens / 1000) * GPT4_PRICING.turbo_output;
  
  return inputCost + outputCost;
}

// Função para atualizar custos realísticos
async function updateRealisticCosts() {
  console.log('🚀 Atualizando tokens e custos para valores realísticos do GPT-4...\n');

  try {
    // Buscar todas as mensagens agrupadas por sessão
    console.log('📊 Carregando conversas para recalcular...');
    
    const { data: messages, error } = await supabase
      .from('conversation_history')
      .select('*')
      .not('conversation_context->session_id', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Erro ao carregar mensagens: ${error.message}`);
    }

    console.log(`✅ ${messages.length} mensagens carregadas`);

    // Agrupar por sessão para calcular contexto crescente
    const sessionMap = new Map();
    
    messages.forEach(msg => {
      const sessionId = msg.conversation_context?.session_id;
      if (!sessionId) return;

      if (!sessionMap.has(sessionId)) {
        sessionMap.set(sessionId, []);
      }
      sessionMap.get(sessionId).push(msg);
    });

    console.log(`📊 ${sessionMap.size} sessões encontradas`);

    let totalUpdated = 0;
    let totalTokensBefore = 0;
    let totalTokensAfter = 0;
    let totalCostBefore = 0;
    let totalCostAfter = 0;

    // Processar cada sessão
    for (const [sessionId, sessionMessages] of sessionMap) {
      const updates = [];

      sessionMessages.forEach((msg, index) => {
        // Calcular tokens realísticos
        const oldTokens = msg.tokens_used || 0;
        const oldCost = parseFloat(msg.api_cost_usd || 0);
        
        const newTokens = calculateRealisticTokens(
          msg, 
          msg.is_from_user, 
          index, 
          sessionMessages.length
        );
        
        const newCost = calculateRealisticCost(newTokens, msg.is_from_user);

        // Calcular processing cost (10% do API cost)
        const processingCost = newCost * 0.1;

        updates.push({
          id: msg.id,
          tokens_used: newTokens,
          api_cost_usd: newCost.toFixed(6),
          processing_cost_usd: processingCost.toFixed(6)
        });

        totalTokensBefore += oldTokens;
        totalTokensAfter += newTokens;
        totalCostBefore += oldCost;
        totalCostAfter += newCost;
      });

      // Atualizar mensagens da sessão em lote
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('conversation_history')
          .update({
            tokens_used: update.tokens_used,
            api_cost_usd: update.api_cost_usd,
            processing_cost_usd: update.processing_cost_usd
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar ${update.id}:`, updateError.message);
        } else {
          totalUpdated++;
        }
      }

      // Progress indicator
      if (totalUpdated % 100 === 0) {
        process.stdout.write('.');
      }
    }

    console.log('\n\n🎉 Atualização concluída!');
    console.log(`📊 Estatísticas:`);
    console.log(`   • ${totalUpdated} mensagens atualizadas`);
    console.log(`   • ${sessionMap.size} sessões processadas`);
    
    console.log('\n📈 Comparação de tokens:');
    console.log(`   • Antes: ${totalTokensBefore.toLocaleString()} tokens`);
    console.log(`   • Depois: ${totalTokensAfter.toLocaleString()} tokens`);
    console.log(`   • Diferença: ${((totalTokensAfter / totalTokensBefore - 1) * 100).toFixed(1)}%`);
    
    console.log('\n💰 Comparação de custos:');
    console.log(`   • Antes: $${totalCostBefore.toFixed(6)}`);
    console.log(`   • Depois: $${totalCostAfter.toFixed(6)}`);
    console.log(`   • Diferença: ${((totalCostAfter / totalCostBefore - 1) * 100).toFixed(1)}%`);

    return {
      totalUpdated,
      tokensBefore: totalTokensBefore,
      tokensAfter: totalTokensAfter,
      costBefore: totalCostBefore,
      costAfter: totalCostAfter
    };

  } catch (error) {
    console.error('❌ Erro durante atualização:', error);
    throw error;
  }
}

// Executar atualização
async function main() {
  try {
    await updateRealisticCosts();
    console.log('\n✅ Custos realísticos aplicados com sucesso!');
    console.log('🧪 Agora a base tem valores realísticos do GPT-4 Turbo');
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { updateRealisticCosts };