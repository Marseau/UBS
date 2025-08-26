const { supabaseAdmin } = require('./dist/config/database');

async function checkLatestAIMetrics() {
    console.log('🔍 Verificando métricas das mensagens AI mais recentes');
    console.log('='.repeat(60));
    
    const { data: messages, error } = await supabaseAdmin
        .from('conversation_history')
        .select('*')
        .eq('is_from_user', false)  // Apenas mensagens de AI
        .not('api_cost_usd', 'is', null)  // Com métricas preenchidas
        .not('processing_cost_usd', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error('❌ Erro:', error);
        return;
    }
    
    console.log(`📊 Encontradas ${messages.length} mensagens AI com métricas`);
    
    if (messages.length === 0) {
        console.log('⚠️ Nenhuma mensagem AI com métricas encontrada');
        return;
    }
    
    let newCalc = 0;
    let oldCalc = 0;
    
    messages.forEach((msg, i) => {
        const timestamp = new Date(msg.created_at).toLocaleString();
        const ratio = msg.processing_cost_usd / msg.api_cost_usd;
        const percentage = (ratio * 100).toFixed(1);
        
        console.log(`\n${i+1}. [AI] ${timestamp}`);
        console.log(`   Conteúdo: ${msg.content?.substring(0, 60)}...`);
        console.log(`   💰 API Cost: $${msg.api_cost_usd}`);
        console.log(`   🔧 Processing Cost: $${msg.processing_cost_usd}`);
        console.log(`   📊 Ratio: ${ratio.toFixed(6)} (${percentage}%)`);
        
        if (ratio < 0.08) {
            newCalc++;
            console.log(`   ✅ NOVO CÁLCULO CORRETO! (${percentage}% < 8%)`);
        } else if (Math.abs(ratio - 0.1) < 0.01) {
            oldCalc++;
            console.log(`   ❌ CÁLCULO ANTIGO (${percentage}% ≈ 10%)`);
        } else {
            console.log(`   🤔 CÁLCULO DIFERENTE: ${percentage}%`);
        }
    });
    
    console.log(`\n📋 === RESUMO ===`);
    console.log(`✅ Novo cálculo correto: ${newCalc}`);
    console.log(`❌ Cálculo antigo (10%): ${oldCalc}`);
    console.log(`📈 Taxa de correção: ${((newCalc / messages.length) * 100).toFixed(1)}%`);
    
    if (newCalc === messages.length) {
        console.log('🎉 CORREÇÃO 100% IMPLEMENTADA!');
    } else if (newCalc > oldCalc) {
        console.log('✅ CORREÇÃO PARCIALMENTE IMPLEMENTADA');
    } else {
        console.log('❌ AINDA USANDO CÁLCULO ANTIGO');
    }
}

checkLatestAIMetrics().catch(console.error);