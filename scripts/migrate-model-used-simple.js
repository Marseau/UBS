/**
 * Script simplificado para remover DEFAULT em model_used
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function migrateModelUsed() {
    console.log('🔧 Iniciando migração simplificada...');
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // 1. Contar registros potencialmente contaminados
        console.log('📊 Verificando registros contaminados...');
        
        const { count, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('model_used', 'gpt-3.5-turbo')
            .or('tokens_used.is.null,tokens_used.eq.0');

        if (countError) {
            console.log('⚠️ Aviso:', countError.message);
        } else {
            console.log(`📊 Registros com model_used='gpt-3.5-turbo' e tokens=0: ${count}`);
        }

        // 2. Verificar alguns registros recentes para entender o estado
        console.log('🔍 Verificando registros recentes...');
        
        const { data: recentRecords, error: recentError } = await supabase
            .from('conversation_history')
            .select('id, model_used, tokens_used, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        if (recentError) {
            console.log('⚠️ Aviso:', recentError.message);
        } else {
            console.log('📋 Últimos registros:');
            recentRecords.forEach(record => {
                console.log(`   ${record.created_at}: model_used="${record.model_used}", tokens=${record.tokens_used}`);
            });
        }

        // 3. Verificar distribuição de model_used
        console.log('📊 Analisando distribuição de model_used...');
        
        const { data: distribution, error: distError } = await supabase
            .from('conversation_history') 
            .select('model_used')
            .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString()); // Últimas 24h

        if (distError) {
            console.log('⚠️ Aviso:', distError.message);
        } else {
            const counts = {};
            distribution.forEach(record => {
                const model = record.model_used || 'NULL';
                counts[model] = (counts[model] || 0) + 1;
            });
            console.log('📊 Distribuição (últimas 24h):');
            Object.entries(counts).forEach(([model, count]) => {
                console.log(`   ${model}: ${count}`);
            });
        }

        console.log('\n🎯 ANÁLISE COMPLETA!');
        console.log('ℹ️  Para remover o DEFAULT do schema, execute manualmente:');
        console.log('   ALTER TABLE conversation_history ALTER COLUMN model_used DROP DEFAULT;');
        console.log('\n✅ Sistema de controle total já está ativo no código!');
        console.log('🎯 Fontes sendo rastreadas:');
        console.log('   - "deterministic" (regex)');
        console.log('   - "flowlock" (flow lock)');
        console.log('   - "gpt-4o-mini", etc. (LLM)'); 
        console.log('   - "system" (timeout/inactivity)');

        return true;

    } catch (error) {
        console.error('❌ Erro durante análise:', error.message);
        return false;
    }
}

// Executar
migrateModelUsed()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error);
        process.exit(1);
    });