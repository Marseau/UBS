const { supabaseAdmin } = require('./dist/config/database');

async function checkProcessingCost() {
    try {
        console.log('🔍 Verificando últimas mensagens no banco...');
        
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('content, is_from_user, tokens_used, api_cost_usd, processing_cost_usd, confidence_score, created_at')
            .order('created_at', { ascending: false })
            .limit(10);
            
        if (error) {
            console.error('❌ Erro ao consultar BD:', error);
            return;
        }
        
        console.log(`📊 Últimas ${data.length} mensagens:`);
        console.log('='.repeat(80));
        
        data.forEach((row, i) => {
            const userType = row.is_from_user ? 'USER' : 'AI  ';
            console.log(`${i+1}. [${userType}] ${row.content?.substring(0, 50)}...`);
            console.log(`   📊 tokens: ${row.tokens_used}`);
            console.log(`   💰 api_cost: ${row.api_cost_usd}`);  
            console.log(`   ⚙️  processing_cost: ${row.processing_cost_usd}`);
            console.log(`   🎯 confidence: ${row.confidence_score}`);
            console.log(`   🕒 ${row.created_at}`);
            
            // Verificar se é mensagem AI com métricas
            if (!row.is_from_user && row.processing_cost_usd !== null) {
                const ratio = row.processing_cost_usd / row.api_cost_usd;
                console.log(`   📈 Ratio processing/api: ${ratio.toFixed(4)} (${ratio < 0.05 ? '✅ NOVO CÁLCULO' : ratio === 0.1 ? '❌ CÁLCULO ANTIGO 10%' : '🤔 OUTRO'})`);
            }
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

checkProcessingCost();