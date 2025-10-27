/**
 * Script para testar notificações Telegram de ações da conta Instagram
 *
 * Uso: ts-node scripts/test-telegram-notification.ts
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testFollowNotification() {
  console.log('🧪 Teste 1: Notificação de FOLLOW');

  const response = await fetch(`${API_URL}/api/instagram/account-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'teste_usuario',
      action_type: 'follow',
      execution_method: 'puppeteer',
      success: true,
    }),
  });

  const result = await response.json();
  console.log('✅ Resposta:', result);
  console.log('');
}

async function testCommentNotification() {
  console.log('🧪 Teste 2: Notificação de COMMENT');

  const response = await fetch(`${API_URL}/api/instagram/account-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'profissional_saude',
      action_type: 'comment',
      comment_text: 'Ótimo conteúdo! 👏',
      post_id: '123456789',
      execution_method: 'puppeteer',
      success: true,
    }),
  });

  const result = await response.json();
  console.log('✅ Resposta:', result);
  console.log('');
}

async function testDMNotification() {
  console.log('🧪 Teste 3: Notificação de DM');

  const response = await fetch(`${API_URL}/api/instagram/account-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'lead_qualificado',
      action_type: 'dm',
      dm_text: 'Olá! Vi seu perfil e gostaria de conversar sobre uma parceria.',
      execution_method: 'manual',
      success: true,
    }),
  });

  const result = await response.json();
  console.log('✅ Resposta:', result);
  console.log('');
}

async function testFailedAction() {
  console.log('🧪 Teste 4: Notificação de ação FALHA');

  const response = await fetch(`${API_URL}/api/instagram/account-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'usuario_bloqueado',
      action_type: 'follow',
      execution_method: 'puppeteer',
      success: false,
      error_message: 'Instagram bloqueou temporariamente esta ação (rate limit)',
    }),
  });

  const result = await response.json();
  console.log('✅ Resposta:', result);
  console.log('');
}

async function testLikeNotification() {
  console.log('🧪 Teste 5: Notificação de LIKE');

  const response = await fetch(`${API_URL}/api/instagram/account-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'influencer_parceiro',
      action_type: 'like',
      post_id: '987654321',
      execution_method: 'puppeteer',
      success: true,
    }),
  });

  const result = await response.json();
  console.log('✅ Resposta:', result);
  console.log('');
}

async function checkTodayStats() {
  console.log('📊 Verificando estatísticas de hoje...');

  const response = await fetch(`${API_URL}/api/instagram/account-actions/today`);
  const result = await response.json();

  console.log('✅ Estatísticas:', JSON.stringify(result.data, null, 2));
  console.log('');
}

async function runAllTests() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 INICIANDO TESTES DE NOTIFICAÇÕES TELEGRAM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`📍 API URL: ${API_URL}`);
  console.log('');

  try {
    await testFollowNotification();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Aguardar 2s entre testes

    await testCommentNotification();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testDMNotification();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testLikeNotification();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await testFailedAction();
    await new Promise(resolve => setTimeout(resolve, 2000));

    await checkTodayStats();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TODOS OS TESTES CONCLUÍDOS COM SUCESSO!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📱 Verifique seu Telegram para as notificações!');
    console.log('');
  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
    process.exit(1);
  }
}

// Executar testes
runAllTests();
