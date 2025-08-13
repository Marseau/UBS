#!/usr/bin/env node

// COMPARAÇÃO: MÉTRICAS NECESSÁRIAS VS DISPONÍVEIS

console.log('📊 ANÁLISE COMPARATIVA: MÉTRICAS NECESSÁRIAS VS DISPONÍVEIS');
console.log('='.repeat(80));

const metricsNeeded = {
  'participation': {
    required: [
      'revenue.participation_pct',
      'revenue.participation_value',
      'appointments.participation_pct', 
      'appointments.count',
      'appointments.cancellation_rate_pct', // ❌ FALTANDO
      'appointments.rescheduling_rate_pct', // ❌ FALTANDO
      'customers.participation_pct',
      'customers.count',
      'ai_interactions.participation_pct',
      'ai_interactions.count',
      'ai_interactions.avg_chat_duration_minutes', // ❌ FALTANDO
      'business_intelligence.spam_detection_score', // ❌ FALTANDO
      'business_intelligence.risk_score', // ❌ FALTANDO
      'business_intelligence.efficiency_score', // ❌ FALTANDO
    ],
    available: [
      'revenue.participation_pct', // ✅ 
      'revenue.participation_value', // ✅
      'appointments.participation_pct', // ✅
      'appointments.count', // ✅
      'customers.participation_pct', // ✅
      'customers.count', // ✅
      'ai_interactions.participation_pct', // ✅
      'ai_interactions.count', // ✅
    ]
  },
  'ranking': {
    required: [
      'position',
      'total_tenants',
      'category',
      'percentile'
    ],
    available: [
      'position', // ✅
      'total_tenants', // ✅
      'category', // ✅
      'percentile' // ✅
    ]
  }
};

console.log('🔍 MÉTRICAS DE PARTICIPAÇÃO:');
console.log('✅ DISPONÍVEIS:');
metricsNeeded.participation.available.forEach(metric => {
  console.log(`   - ${metric}`);
});

console.log('\n❌ FALTANDO:');
const participationMissing = metricsNeeded.participation.required.filter(
  required => !metricsNeeded.participation.available.includes(required)
);
participationMissing.forEach(metric => {
  console.log(`   - ${metric}`);
});

console.log('\n🏆 MÉTRICAS DE RANKING:');
console.log('✅ TODAS DISPONÍVEIS:');
metricsNeeded.ranking.available.forEach(metric => {
  console.log(`   - ${metric}`);
});

console.log('\n📋 RESUMO EXECUTIVO:');
console.log('='.repeat(50));
console.log(`✅ Métricas básicas: FUNCIONAIS`);
console.log(`❌ Métricas avançadas: FALTANDO ${participationMissing.length} campos`);

console.log('\n🔧 CAMPOS QUE PRECISAM SER ADICIONADOS:');
console.log('='.repeat(50));

const fieldsToAdd = [
  {
    field: 'appointments.cancellation_rate_pct',
    description: 'Taxa de cancelamento de agendamentos',
    calculation: '(cancelled_appointments / total_appointments) * 100',
    frontend_usage: 'Card "Participação em Cancelamentos"'
  },
  {
    field: 'appointments.rescheduling_rate_pct', 
    description: 'Taxa de remarcação de agendamentos',
    calculation: '(rescheduled_appointments / total_appointments) * 100',
    frontend_usage: 'Card "Participação em Remarcações"'
  },
  {
    field: 'ai_interactions.avg_chat_duration_minutes',
    description: 'Tempo médio de duração das conversas em minutos',
    calculation: 'AVG(conversation_duration) from conversation_history',
    frontend_usage: 'Card "Tempo Médio de Chat"'
  },
  {
    field: 'business_intelligence.spam_detection_score',
    description: 'Score de qualidade das conversas (0-100)',
    calculation: '(valid_conversations / total_conversations) * 100',
    frontend_usage: 'Card "Qualidade do Número"'
  },
  {
    field: 'business_intelligence.risk_score',
    description: 'Score de risco do tenant (0-100)',
    calculation: 'Algoritmo baseado em múltiplos fatores',
    frontend_usage: 'Análise de risco e insights'
  }
];

fieldsToAdd.forEach((field, index) => {
  console.log(`\n${index + 1}. ${field.field}`);
  console.log(`   📝 Descrição: ${field.description}`);
  console.log(`   🧮 Cálculo: ${field.calculation}`);
  console.log(`   🎨 Uso no Frontend: ${field.frontend_usage}`);
});

console.log('\n🚀 PRÓXIMOS PASSOS:');
console.log('='.repeat(50));
console.log('1. ✅ Métricas básicas já funcionam (revenue, appointments, customers, ai_interactions)');
console.log('2. ❌ Adicionar campos faltantes no cron job');
console.log('3. ❌ Implementar cálculos para métricas avançadas');
console.log('4. ❌ Testar frontend com dados completos');

console.log('\n💡 CONCLUSÃO:');
console.log('='.repeat(50));
console.log('A tabela tenant_metrics tem a estrutura correta mas está INCOMPLETA.');
console.log('Tem 8/13 campos necessários (61% de completude).');
console.log('O frontend funciona parcialmente mas precisa dos campos faltantes para 100% de funcionalidade.');