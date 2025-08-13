require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateAICostsAndOutcomes() {
  console.log('🔍 INVESTIGANDO CUSTOS DE IA E CONVERSATION OUTCOMES');
  console.log('===================================================\n');
  
  // 1. Check for AI costs data
  console.log('💰 1. CUSTOS DE IA:');
  console.log('==================');
  
  // Check whatsapp_conversations for AI cost fields
  const { data: conversationsSample } = await client
    .from('whatsapp_conversations')
    .select('*')
    .limit(3);
    
  if (conversationsSample && conversationsSample.length > 0) {
    console.log('✅ whatsapp_conversations table found');
    const sample = conversationsSample[0];
    const fields = Object.keys(sample);
    console.log('Campos disponíveis:', fields.length);
    
    // Look for cost-related fields
    const costFields = fields.filter(field => 
      field.includes('cost') || field.includes('token') || 
      field.includes('price') || field.includes('usage') ||
      field.includes('openai') || field.includes('gpt')
    );
    console.log('Cost fields encontrados:', costFields);
    
    // Look for outcome fields
    const outcomeFields = fields.filter(field =>
      field.includes('outcome') || field.includes('result') ||
      field.includes('success') || field.includes('resolution') ||
      field.includes('satisfaction') || field.includes('rating') ||
      field.includes('status')
    );
    console.log('Outcome fields encontrados:', outcomeFields);
    
    // Show sample data
    console.log('\nSample conversation record:');
    console.log('ID:', sample.id);
    console.log('Status:', sample.status || 'N/A');
    console.log('Created:', sample.created_at ? sample.created_at.split('T')[0] : 'N/A');
    
    // Check for JSON fields that might contain cost/outcome data
    const jsonFields = fields.filter(field => {
      const value = sample[field];
      return typeof value === 'object' && value !== null;
    });
    
    if (jsonFields.length > 0) {
      console.log('\nJSON fields que podem conter custos/outcomes:');
      jsonFields.forEach(field => {
        const data = sample[field];
        if (data && typeof data === 'object') {
          console.log(`  ${field}:`, Object.keys(data));
        }
      });
    }
  }
  
  // 2. Check conversation_context for outcomes
  console.log('\n📊 2. CONVERSATION OUTCOMES:');
  console.log('============================');
  
  const { data: contextSample } = await client
    .from('whatsapp_conversations')
    .select('conversation_context, conversation_history')
    .not('conversation_context', 'is', null)
    .limit(3);
    
  if (contextSample && contextSample.length > 0) {
    console.log('✅ Conversation context data found');
    
    contextSample.forEach((record, index) => {
      console.log(`\nContext ${index + 1}:`);
      
      if (record.conversation_context) {
        const context = record.conversation_context;
        console.log('Context fields:', Object.keys(context));
        
        // Look for outcome/success indicators
        Object.entries(context).forEach(([key, value]) => {
          if (key.includes('outcome') || key.includes('success') || 
              key.includes('result') || key.includes('satisfaction') ||
              key.includes('rating') || key.includes('resolution')) {
            console.log(`  ${key}: ${value}`);
          }
        });
      }
      
      if (record.conversation_history) {
        const history = record.conversation_history;
        if (Array.isArray(history) && history.length > 0) {
          console.log('History entries:', history.length);
          
          // Look for cost or outcome data in history
          const lastEntry = history[history.length - 1];
          if (lastEntry && typeof lastEntry === 'object') {
            console.log('Last history entry fields:', Object.keys(lastEntry));
          }
        }
      }
    });
  }
  
  // 3. Calculate conversation success metrics
  console.log('\n📈 3. CONVERSATION SUCCESS METRICS:');
  console.log('===================================');
  
  const { data: allConversations } = await client
    .from('whatsapp_conversations')
    .select('status, conversation_context, created_at')
    .gte('created_at', '2025-02-01'); // Last 6 months
    
  if (allConversations && allConversations.length > 0) {
    console.log(`✅ Total conversations (6 months): ${allConversations.length}`);
    
    // Analyze status distribution
    const statusCounts = {};
    let conversationsWithOutcomes = 0;
    let successfulOutcomes = 0;
    
    allConversations.forEach(conv => {
      const status = conv.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      
      // Check for outcomes in context
      if (conv.conversation_context) {
        conversationsWithOutcomes++;
        
        const context = conv.conversation_context;
        // Look for success indicators
        const hasSuccess = Object.keys(context).some(key =>
          key.includes('success') || key.includes('completed') ||
          key.includes('resolved') || key.includes('booked')
        );
        
        if (hasSuccess) successfulOutcomes++;
      }
    });
    
    console.log('\nStatus distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      const percentage = ((count / allConversations.length) * 100).toFixed(1);
      console.log(`  ${status}: ${count} (${percentage}%)`);
    });
    
    if (conversationsWithOutcomes > 0) {
      const successRate = ((successfulOutcomes / conversationsWithOutcomes) * 100).toFixed(1);
      console.log(`\nOutcome analysis:`);
      console.log(`  Conversations with outcomes: ${conversationsWithOutcomes}`);
      console.log(`  Successful outcomes: ${successfulOutcomes}`);
      console.log(`  Success rate: ${successRate}%`);
    }
  }
  
  console.log('\n💡 PRÓXIMAS IMPLEMENTAÇÕES NECESSÁRIAS:');
  console.log('=======================================');
  console.log('1. 💰 AI Costs Integration:');
  console.log('   • Adicionar tracking de tokens OpenAI por conversa');
  console.log('   • Calcular custo por tenant baseado no uso de IA');
  console.log('   • Integrar com platform_costs no sistema de métricas');
  
  console.log('\n2. 📊 Enhanced Conversation Outcomes:');
  console.log('   • Extrair métricas de sucesso do conversation_context');
  console.log('   • Criar KPIs: resolution rate, satisfaction score, booking rate');
  console.log('   • Adicionar aos gráficos: success rate trends');
  
  console.log('\n3. 🎯 Dashboard Implementation:');
  console.log('   • Implementar os 6 gráficos solicitados');
  console.log('   • Adicionar AI cost tracking');
  console.log('   • Enhanced conversation analytics');
  console.log('   • Interactive hover effects com business names');
}

investigateAICostsAndOutcomes().catch(console.error);