/**
 * Script de teste para o sistema de classificação de intent em 3 camadas
 */

const axios = require('axios');

const HOST = process.env.HOST || 'http://localhost:3000';
const DEMO_TOKEN = process.env.DEMO_MODE_TOKEN || 'dev-secret';

// Mensagens de teste para cada camada
const TEST_MESSAGES = [
  // Camada 1: Determinístico (deve funcionar)
  { text: 'oi, bom dia', expected_layer: 1, expected_intent: 'greeting' },
  { text: 'quero ver os serviços disponíveis', expected_layer: 1, expected_intent: 'services' },
  { text: 'quanto custa', expected_layer: 1, expected_intent: 'pricing' },
  
  // Camada 2: LLM (mensagens que regex não pega mas LLM sim)  
  { text: 'me mostre o que vocês fazem', expected_layer: 2, expected_intent: 'services' },
  { text: 'preciso saber valores', expected_layer: 2, expected_intent: 'pricing' },
  { text: 'quando vocês atendem', expected_layer: 2, expected_intent: 'business_hours' },
  
  // Camada 3: Desambiguação (mensagens muito vagas)
  { text: 'preciso de ajuda', expected_layer: 3, expected_intent: null },
  { text: 'oi', expected_layer: 1, expected_intent: 'greeting' }, // Na verdade é camada 1
  { text: 'não entendi nada', expected_layer: 3, expected_intent: null }
];

async function testIntentSystem() {
  console.log('🧪 TESTE: Sistema de Classificação de Intent em 3 Camadas');
  console.log('=' .repeat(60));
  
  for (const [index, test] of TEST_MESSAGES.entries()) {
    console.log(`\\n📝 Teste ${index + 1}: "${test.text}"`);
    console.log(`   Esperado: Camada ${test.expected_layer}, Intent: ${test.expected_intent || 'null'}`);
    
    try {
      // Enviar mensagem via webhook
      const response = await axios.post(`${HOST}/api/whatsapp/webhook`, {
        entry: [{
          id: 'test_entry',
          changes: [{
            value: {
              messages: [{
                id: `test_msg_${index}`,
                from: '5511999999999',
                timestamp: Math.floor(Date.now() / 1000).toString(),
                type: 'text',
                text: { body: test.text }
              }],
              contacts: [{
                profile: { name: 'Teste User' },
                wa_id: '5511999999999'
              }]
            }
          }]
        }]
      }, {
        headers: {
          'Authorization': `Bearer ${DEMO_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        console.log('   ✅ Resposta recebida com sucesso');
        
        // Verificar se foi desambiguação (Camada 3)
        const responseText = response.data?.response || '';
        const isDisambiguation = responseText.includes('Não consegui entender') || 
                                 responseText.includes('Poderia me dizer se você quer');
        
        if (test.expected_layer === 3 && isDisambiguation) {
          console.log('   🎯 CORRETO: Camada 3 (desambiguação) ativada');
        } else if (test.expected_layer !== 3 && !isDisambiguation) {
          console.log(`   🎯 CORRETO: Intent detectada sem desambiguação`);
        } else {
          console.log('   ⚠️  RESULTADO INESPERADO');
        }
        
        // Mostrar resposta
        console.log(`   💬 Resposta: "${responseText.substring(0, 100)}..."`);
        
      } else {
        console.log(`   ❌ Erro HTTP: ${response.status}`);
      }
      
    } catch (error) {
      console.error(`   🚨 Erro: ${error.message}`);
    }
    
    // Pausa entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\\n✅ Teste concluído!');
}

async function testLLMClassifierDirect() {
  console.log('\\n🤖 TESTE DIRETO: LLM Classifier Service');
  console.log('=' .repeat(40));
  
  try {
    // Importar e testar o service diretamente
    const { LLMIntentClassifierService } = require('./src/services/llm-intent-classifier.service.ts');
    const classifier = new LLMIntentClassifierService();
    
    const testMessages = [
      'me mostre o que vocês fazem',
      'preciso saber valores', 
      'quando vocês atendem',
      'blablabla sem sentido'
    ];
    
    for (const message of testMessages) {
      console.log(`\\n📝 Testando: "${message}"`);
      const result = await classifier.classifyIntent(message);
      console.log(`   🎯 Resultado: ${result.intent || 'null'} (${result.confidence}, ${result.processing_time_ms}ms)`);
    }
    
  } catch (error) {
    console.error('🚨 Erro no teste direto:', error.message);
  }
}

// Executar testes
if (require.main === module) {
  testIntentSystem()
    .then(() => process.exit(0))
    .catch(console.error);
}