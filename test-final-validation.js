const { supabaseAdmin } = require('./dist/config/database');

async function testAndValidate() {
    console.log('🔍 TESTE FINAL: Validação da correção processing_cost_usd');
    console.log('='.repeat(80));
    
    // 1. Enviar mensagem via demo API
    console.log('📤 Enviando mensagem via API demo...');
    
    const response = await fetch('http://localhost:3000/api/demo/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            tenantId: '62727346-9068-4b22-b6bb-34bfffd29d45',
            message: 'Teste final de validação de métricas processing cost corrigidas - análise completa',
            domain: 'healthcare'
        })
    });
    
    const result = await response.json();
    console.log('📊 Resposta da API:', result.success ? '✅ Sucesso' : '❌ Falha');
    
    // 2. Aguardar persistência
    console.log('⏳ Aguardando persistência (3s)...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Buscar mensagens mais recentes (sem filtro de data específico)
    console.log('🔍 Buscando mensagens mais recentes...');
    
    const { data: messages, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${messages.length} mensagens totais`);
    
    // 4. Filtrar mensagens dos últimos 5 minutos
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentMessages = messages.filter(msg => new Date(msg.created_at) > fiveMinutesAgo);
    
    console.log(`📊 Mensagens dos últimos 5 minutos: ${recentMessages.length}`);
    
    if (recentMessages.length === 0) {
        console.log('⚠️ Nenhuma mensagem recente encontrada');
        
        // Mostrar as 5 mensagens mais recentes para debug
        console.log('\n🔍 DEBUG - 5 mensagens mais recentes:');
        messages.slice(0, 5).forEach((msg, i) => {
            console.log(`${i+1}. [${msg.is_from_user ? 'USER' : 'AI  '}] ${new Date(msg.created_at).toLocaleString()}`);
            console.log(`   ${msg.content?.substring(0, 80)}...`);
        });
        
        return;
    }
    
    // 5. Analisar mensagens recentes
    console.log('\n📋 ANÁLISE DAS MENSAGENS RECENTES:');
    console.log('='.repeat(80));
    
    let aiMessages = 0;
    let newCalc = 0;
    let oldCalc = 0;
    
    recentMessages.forEach((msg, i) => {
        const userType = msg.is_from_user ? 'USER' : 'AI  ';
        const timestamp = new Date(msg.created_at).toLocaleString();
        console.log(`${i+1}. [${userType}] ${timestamp}`);
        console.log(`   ${msg.content?.substring(0, 80)}...`);
        
        if (!msg.is_from_user && msg.processing_cost_usd && msg.api_cost_usd) {
            aiMessages++;
            const ratio = msg.processing_cost_usd / msg.api_cost_usd;
            const percentage = (ratio * 100).toFixed(1);
            
            console.log(`   💰 API: $${msg.api_cost_usd} | Processing: $${msg.processing_cost_usd}`);
            console.log(`   📊 Ratio: ${ratio.toFixed(4)} (${percentage}%)`);
            
            if (ratio < 0.08) {
                newCalc++;
                console.log(`   ✅ NOVO CÁLCULO CORRETO! (${percentage}% < 8%)`);
            } else if (Math.abs(ratio - 0.1) < 0.01) {
                oldCalc++;
                console.log(`   ❌ AINDA USANDO CÁLCULO ANTIGO (${percentage}% ≈ 10%)`);
            } else {
                console.log(`   🤔 CÁLCULO DIFERENTE: ${percentage}%`);
            }
        } else if (!msg.is_from_user) {
            console.log(`   ⚠️ MENSAGEM AI SEM MÉTRICAS`);
        } else {
            console.log(`   ✅ MENSAGEM USER (métricas NULL corretas)`);
        }
        console.log('');
    });
    
    // 6. Resultado final
    console.log('📋 === RESULTADO FINAL ===');
    console.log(`🤖 Mensagens de IA analisadas: ${aiMessages}`);
    console.log(`✅ Com novo cálculo correto: ${newCalc}`);
    console.log(`❌ Com cálculo antigo: ${oldCalc}`);
    
    if (aiMessages > 0) {
        const correctionRate = ((newCalc / aiMessages) * 100).toFixed(1);
        console.log(`📈 Taxa de correção: ${correctionRate}%`);
        
        if (correctionRate === '100.0') {
            console.log('🎉 CORREÇÃO IMPLEMENTADA COM SUCESSO!');
        } else if (correctionRate >= '80.0') {
            console.log('✅ CORREÇÃO FUNCIONANDO ADEQUADAMENTE');
        } else {
            console.log('⚠️ CORREÇÃO PARCIAL - PRECISA INVESTIGAÇÃO');
        }
    } else {
        console.log('⚠️ Nenhuma mensagem de IA com métricas encontrada');
    }
}

testAndValidate()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('💥 ERRO:', error);
        process.exit(1);
    });