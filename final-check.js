const { supabaseAdmin } = require('./dist/config/database');

async function finalCheck() {
    console.log('🔍 VERIFICAÇÃO FINAL: Todas as mensagens AI ordenadas por data');
    console.log('='.repeat(80));
    
    const { data: messages, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .eq('is_from_user', false)
        .not('api_cost_usd', 'is', null)
        .not('processing_cost_usd', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
        
    if (error) {
        console.error('❌ Erro:', error);
        return;
    }
    
    console.log(`📊 Total encontrado: ${messages.length} mensagens AI com métricas`);
    
    let newCalc = 0;
    let oldCalc = 0;
    let firstNewMessage = null;
    
    messages.forEach((msg, i) => {
        const timestamp = new Date(msg.created_at);
        const ratio = msg.processing_cost_usd / msg.api_cost_usd;
        const percentage = (ratio * 100).toFixed(1);
        
        if (ratio < 0.08) {
            newCalc++;
            if (!firstNewMessage) firstNewMessage = { index: i + 1, timestamp, ratio: percentage };
        } else if (Math.abs(ratio - 0.1) < 0.01) {
            oldCalc++;
        }
        
        if (i < 15) {  // Mostrar primeiras 15
            console.log(`${i+1}. [AI] ${timestamp.toLocaleString('pt-BR')}`);
            console.log(`   Ratio: ${ratio.toFixed(6)} (${percentage}%) - ${ratio < 0.08 ? '✅ NOVO' : '❌ ANTIGO'}`);
            if (i === 0 || i === 4 || i === 9) console.log(''); // Espaçamento
        }
    });
    
    console.log('📋 === RESUMO FINAL ===');
    console.log(`✅ Novo cálculo correto (< 8%): ${newCalc}`);
    console.log(`❌ Cálculo antigo (~10%): ${oldCalc}`);
    console.log(`📈 Taxa de correção: ${((newCalc / messages.length) * 100).toFixed(1)}%`);
    
    if (firstNewMessage) {
        console.log(`\n🎯 PRIMEIRA MENSAGEM COM NOVO CÁLCULO:`);
        console.log(`   Posição: #${firstNewMessage.index}`);
        console.log(`   Data: ${firstNewMessage.timestamp.toLocaleString('pt-BR')}`);
        console.log(`   Ratio: ${firstNewMessage.ratio}%`);
        console.log('   ✅ CORREÇÃO APLICADA COM SUCESSO!');
    } else {
        console.log('\n⚠️ Nenhuma mensagem com novo cálculo encontrada');
    }
}

finalCheck().catch(console.error);