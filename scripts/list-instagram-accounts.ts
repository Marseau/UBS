#!/usr/bin/env node
// Script para listar contas Instagram vinculadas
import puppeteer from 'puppeteer';

(async () => {
  console.log('🔍 Listando contas Instagram vinculadas...\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  try {
    // Ir para Instagram
    console.log('📱 Abrindo Instagram...');
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n⏸️  INSTRUÇÕES:');
    console.log('1. Faça login com sua CONTA PESSOAL');
    console.log('2. Após logar, clique no seu perfil (canto inferior direito ou menu)');
    console.log('3. Clique em "Configurações"');
    console.log('4. Role até "Trocar de conta" ou "Adicionar conta"');
    console.log('5. Verá a lista de contas vinculadas');
    console.log('\n📋 ANOTE os @usernames que aparecerem');
    console.log('\n⏰ Aguardando 5 minutos para você verificar...\n');

    // Aguardar 5 minutos
    await new Promise(resolve => setTimeout(resolve, 300000));

    console.log('✅ Tempo esgotado. Fechando browser...');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await browser.close();
  }
})();
