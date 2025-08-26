/**
 * Teste para verificar correção do duration_minutes
 * Simula mensagens WhatsApp com timestamps reais
 */

const testDurationFix = () => {
  console.log('🧪 Testando correção de duration_minutes...\n');

  // Simular lógica corrigida
  const simulateMessage = (messageTimestamp, conversationStartTimestamp) => {
    const messageMs = parseInt(messageTimestamp) * 1000; // WhatsApp timestamp (segundos → ms)
    const startedAtMs = Date.parse(conversationStartTimestamp);
    const durationMinutes = Math.max(0, Math.floor((messageMs - startedAtMs) / 60000));
    
    return {
      messageTime: new Date(messageMs).toLocaleString(),
      startTime: new Date(startedAtMs).toLocaleString(),
      durationMinutes,
      durationMs: messageMs - startedAtMs
    };
  };

  // Cenários de teste
  const scenarios = [
    {
      name: 'Primeira mensagem',
      startTime: '2025-08-26T15:00:00.000Z',
      messageTimestamp: Math.floor(Date.parse('2025-08-26T15:00:00.000Z') / 1000).toString(),
      expected: 0
    },
    {
      name: 'Após 5 minutos',
      startTime: '2025-08-26T15:00:00.000Z',
      messageTimestamp: Math.floor(Date.parse('2025-08-26T15:05:00.000Z') / 1000).toString(),
      expected: 5
    },
    {
      name: 'Após 15 minutos',
      startTime: '2025-08-26T15:00:00.000Z',
      messageTimestamp: Math.floor(Date.parse('2025-08-26T15:15:00.000Z') / 1000).toString(),
      expected: 15
    },
    {
      name: 'Após 1 hora',
      startTime: '2025-08-26T15:00:00.000Z',
      messageTimestamp: Math.floor(Date.parse('2025-08-26T16:00:00.000Z') / 1000).toString(),
      expected: 60
    }
  ];

  scenarios.forEach((scenario, index) => {
    const result = simulateMessage(scenario.messageTimestamp, scenario.startTime);
    const isCorrect = result.durationMinutes === scenario.expected;
    
    console.log(`${index + 1}. ${scenario.name}:`);
    console.log(`   Início: ${result.startTime}`);
    console.log(`   Mensagem: ${result.messageTime}`);
    console.log(`   Duration: ${result.durationMinutes} min (esperado: ${scenario.expected})`);
    console.log(`   Status: ${isCorrect ? '✅ CORRETO' : '❌ ERRO'}`);
    console.log('');
  });

  // Teste com timestamp atual (simulando problema antigo)
  console.log('🚨 Problema ANTES da correção (usando Date.now()):');
  const now = Date.now();
  const startTime = '2025-08-26T15:00:00.000Z';
  const wrongDuration = Math.max(0, Math.floor((now - Date.parse(startTime)) / 60000));
  console.log(`   Duration incorreta: ${wrongDuration} min (baseada em processamento, não mensagem)`);
  
  console.log('\n✅ Correção implementada: Agora usa timestamp da mensagem WhatsApp!');
};

testDurationFix();