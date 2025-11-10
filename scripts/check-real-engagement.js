const axios = require('axios');

async function checkRealEngagement() {
  console.log('🔍 Verificando engajamento REAL nas notificações do Instagram...\n');

  try {
    // Chamar API sem 'since' para pegar TODAS as notificações
    console.log('📡 Chamando /check-engagement (sem filtro de data)...\n');

    const response = await axios.post('http://localhost:3000/api/instagram/check-engagement', {});

    console.log(`✅ Total de interações encontradas: ${response.data.total_interactions}\n`);

    if (response.data.total_interactions === 0) {
      console.log('⚠️  Nenhuma interação encontrada nas notificações');
      return;
    }

    // Lista dos 10 perfis que estão no banco
    const perfisNoBanco = [
      'achado_especial',
      'gestor_dofuturo',
      'mineironouber',
      'trafegocomgabriell',
      'pedroviski_021',
      'homeangelsbrasiliasudoeste',
      'rosellivet',
      'clicachados.app',
      'marseaufranco',
      'roamhub24'
    ];

    console.log('📊 Verificando quais dos 10 perfis do banco aparecem nas notificações:\n');

    const interacoesEncontradas = [];
    const perfisNaoEncontrados = [];

    perfisNoBanco.forEach(username => {
      const interacoes = response.data.interactions.filter(i => i.username === username);

      if (interacoes.length > 0) {
        interacoesEncontradas.push({ username, interacoes });
      } else {
        perfisNaoEncontrados.push(username);
      }
    });

    // Mostrar perfis ENCONTRADOS nas notificações
    if (interacoesEncontradas.length > 0) {
      console.log(`✅ ${interacoesEncontradas.length} PERFIS ENCONTRADOS NAS NOTIFICAÇÕES:\n`);

      interacoesEncontradas.forEach(({ username, interacoes }) => {
        const liked = interacoes.some(i => i.liked);
        const commented = interacoes.some(i => i.commented);
        const followed = interacoes.some(i => i.is_new_follower);

        let score = 0;
        if (liked) score += 10;
        if (commented) score += 20;
        if (followed) score += 30;

        console.log(`👤 @${username}`);
        console.log(`   💬 Interações: ${interacoes.length}`);
        console.log(`   ❤️  Curtiu: ${liked ? 'SIM' : 'NÃO'}`);
        console.log(`   💬 Comentou: ${commented ? 'SIM' : 'NÃO'}`);
        console.log(`   👥 Seguiu: ${followed ? 'SIM' : 'NÃO'}`);
        console.log(`   📊 Score calculado: ${score} pontos`);
        const tipos = [];
        if (liked) tipos.push('like');
        if (commented) tipos.push('comment');
        if (followed) tipos.push('follow');
        console.log(`   📅 Tipos: ${tipos.join(', ')}`);
        console.log('');
      });

      console.log('💡 AÇÃO RECOMENDADA:');
      console.log('   Estes perfis DEVEM ser atualizados no banco com engagement_score correto!');
      console.log('   Use a API /scrape-input-users com engagement_data para atualizar\n');
    }

    // Mostrar perfis NÃO encontrados
    if (perfisNaoEncontrados.length > 0) {
      console.log(`⚠️  ${perfisNaoEncontrados.length} PERFIS NÃO ENCONTRADOS NAS NOTIFICAÇÕES:\n`);
      perfisNaoEncontrados.forEach(username => {
        console.log(`   ❌ @${username} - Sem interações registradas`);
      });
      console.log('');
      console.log('💡 POSSÍVEIS RAZÕES:');
      console.log('   - Notificações antigas já não aparecem mais');
      console.log('   - Perfis foram salvos por outro método (scrape manual)');
      console.log('   - Nunca interagiram realmente');
    }

    // Resumo
    console.log('\n📈 RESUMO:');
    console.log(`   Total de perfis verificados: 10`);
    console.log(`   ✅ Com interações reais: ${interacoesEncontradas.length}`);
    console.log(`   ❌ Sem interações: ${perfisNaoEncontrados.length}`);

  } catch (error) {
    if (error.response) {
      console.error('❌ Erro na API:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ Servidor não está rodando na porta 3000');
      console.error('   Execute: npm run dev');
    } else {
      console.error('❌ Erro:', error.message);
    }
  }
}

checkRealEngagement();
