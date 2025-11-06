#!/usr/bin/env node
// Script para configurar sessão da conta @ubs.sistemas
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const USER_DATA_DIR = path.join(process.cwd(), 'puppeteer-data', 'instagram-official');

(async () => {
  console.log('🔐 Configurando sessão da conta @ubs.sistemas...\n');

  // Criar diretório se não existir
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      `--user-data-dir=${USER_DATA_DIR}`,
      '--profile-directory=Default'
    ]
  });

  const page = (await browser.pages())[0] || await browser.newPage();

  try {
    // Ir para Instagram
    console.log('📱 Abrindo Instagram...');
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verificar se já está logado
    const cookies = await page.cookies();
    const isLoggedIn = cookies.some(c => c.name === 'sessionid' && c.value);

    if (isLoggedIn) {
      // Verificar qual conta está logada
      const dsUser = cookies.find(c => c.name === 'ds_user');
      const currentUser = dsUser?.value;

      console.log(`\n✅ Já existe uma sessão logada: @${currentUser || 'desconhecido'}`);

      if (currentUser === 'ubs.sistemas') {
        console.log('🎉 Perfeito! Já está logado como @ubs.sistemas');
        console.log('✅ Sessão salva. Pode usar a API agora!\n');
        await browser.close();
        return;
      } else {
        console.log('\n⚠️  Está logado em outra conta.');
        console.log('📋 INSTRUÇÕES:');
        console.log('1. Clique no seu perfil (canto inferior direito)');
        console.log('2. Clique em "Trocar de conta"');
        console.log('3. Selecione @ubs.sistemas');
        console.log('4. Aguarde 30 segundos após trocar\n');
      }
    } else {
      console.log('\n📋 INSTRUÇÕES:');
      console.log('1. Faça login com sua CONTA PESSOAL');
      console.log('2. Clique no seu perfil (canto inferior direito)');
      console.log('3. Clique em "Trocar de conta"');
      console.log('4. Selecione @ubs.sistemas');
      console.log('5. Aguarde 30 segundos após trocar\n');
    }

    console.log('⏰ Aguardando 2 minutos para você fazer a troca...\n');

    // Aguardar 2 minutos
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Verificar novamente
    const finalCookies = await page.cookies();
    const finalDsUser = finalCookies.find(c => c.name === 'ds_user');
    const finalUser = finalDsUser?.value;

    if (finalUser === 'ubs.sistemas') {
      console.log('🎉 Sucesso! Logado como @ubs.sistemas');
      console.log('✅ Sessão salva em:', USER_DATA_DIR);
      console.log('\n📝 Agora adicione ao .env:');
      console.log('INSTAGRAM_OFFICIAL_USERNAME=ubs.sistemas');
      console.log('INSTAGRAM_OFFICIAL_PASSWORD=<deixe_vazio_ou_configure_depois>\n');
    } else {
      console.log('⚠️  Usuário detectado:', finalUser || 'nenhum');
      console.log('❌ Não consegui confirmar login como @ubs.sistemas');
      console.log('Tente executar o script novamente\n');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await browser.close();
  }
})();
