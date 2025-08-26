const { supabaseAdmin } = require('./dist/config/database');

async function checkRecent() {
    console.log('🔍 Verificando mensagens com processing_cost_usd corrigido...');
    
    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // última hora
    
    const { data: messages, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .gte('created_at', startTime)
        .order('created_at', { ascending: false })
        .limit(50);
        
    if (error) {
        console.error('❌ Erro ao consultar BD:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${messages.length} mensagens na última hora`);
    
    if (messages.length === 0) {
        console.log('⚠️ Nenhuma mensagem encontrada na última hora');
        return;
    }
    
    let userMessages = 0;
    let aiMessages = 0;
    let newCalc = 0;
    let oldCalc = 0;
    let otherCalc = 0;
    
    console.log('\n📋 ANÁLISE DAS MENSAGENS:');
    console.log('='.repeat(80));
    
    messages.slice(0, 20).forEach((msg, i) => {
        const userType = msg.is_from_user ? 'USER' : 'AI  ';
        console.log(`${i+1}. [${userType}] ${msg.content?.substring(0, 60)}...`);
        
        if (msg.is_from_user) {
            userMessages++;
            // Verificar se mensagem de usuário tem métricas NULL
            const hasNullMetrics = msg.tokens_used === null && 
                                 msg.api_cost_usd === null && 
                                 msg.processing_cost_usd === null;
            console.log(`   👤 Métricas NULL: ${hasNullMetrics ? '✅' : '❌'}`);
        } else {
            aiMessages++;
            
            if (msg.processing_cost_usd && msg.api_cost_usd) {
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
                    otherCalc++;
                    console.log(`   🤔 CÁLCULO DIFERENTE: ${percentage}%`);
                }
            } else {
                console.log(`   ⚠️ MENSAGEM AI SEM MÉTRICAS COMPLETAS`);
            }
        }
        console.log('');
    });
    
    // Resumo final
    console.log('\n📋 === RESUMO DA VALIDAÇÃO ===');
    console.log(`👤 Mensagens de usuário: ${userMessages}`);
    console.log(`🤖 Mensagens de IA: ${aiMessages}`);
    console.log(`✅ Novo cálculo correto: ${newCalc}`);
    console.log(`❌ Cálculo antigo (10%): ${oldCalc}`);
    console.log(`🤔 Outros cálculos: ${otherCalc}`);
    
    if (aiMessages > 0) {
        const correctionRate = ((newCalc / aiMessages) * 100).toFixed(1);
        console.log(`📈 Taxa de correção: ${correctionRate}%`);
        
        if (correctionRate >= 80) {
            console.log('🎉 CORREÇÃO FUNCIONANDO PERFEITAMENTE!');
        } else if (correctionRate >= 50) {
            console.log('⚠️ CORREÇÃO PARCIALMENTE IMPLEMENTADA');
        } else {
            console.log('❌ CORREÇÃO NECESSITA INVESTIGAÇÃO');
        }
    }
}

checkRecent()
    .then(() => process.exit(0))
    .catch(error => {
        console.error('💥 ERRO:', error);
        process.exit(1);
    });