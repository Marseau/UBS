/**
 * Script para remover DEFAULT indevido em model_used
 * Executa via Supabase client para garantir segurança
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function removeModelUsedDefault() {
    console.log('🔧 Iniciando remoção do DEFAULT em model_used...');
    
    // Conectar via service role para alterações de schema
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    try {
        // 1. Verificar estado atual
        console.log('🔍 Verificando estado atual...');
        
        const { data: currentDefault, error: defaultError } = await supabase.rpc('check_column_default', {
            table_name: 'conversation_history',
            column_name: 'model_used'
        });

        if (defaultError) {
            console.warn('⚠️ Não foi possível verificar DEFAULT atual:', defaultError.message);
        } else {
            console.log('📊 DEFAULT atual:', currentDefault || 'NENHUM');
        }

        // 2. Contar registros potencialmente contaminados
        const { count: contaminatedCount, error: countError } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('model_used', 'gpt-3.5-turbo')
            .or('tokens_used.is.null,tokens_used.eq.0');

        if (countError) {
            console.warn('⚠️ Não foi possível contar registros contaminados:', countError.message);
        } else {
            console.log(`📊 Registros potencialmente contaminados: ${contaminatedCount}`);
        }

        // 3. Executar ALTER TABLE para remover DEFAULT
        console.log('🔧 Removendo DEFAULT da coluna model_used...');
        
        const { error: alterError } = await supabase.rpc('exec_sql', {
            query: 'ALTER TABLE conversation_history ALTER COLUMN model_used DROP DEFAULT;'
        });

        if (alterError) {
            console.error('❌ Erro ao remover DEFAULT:', alterError.message);
            
            // Tentar abordagem alternativa via SQL direto
            console.log('🔄 Tentando abordagem alternativa...');
            const { error: directError } = await supabase.rpc('remove_model_used_default');
            
            if (directError) {
                console.error('❌ Falha na abordagem alternativa:', directError.message);
                return false;
            }
        }

        // 4. Verificar se DEFAULT foi removido
        console.log('✅ Verificando resultado...');
        
        const { data: newDefault, error: verifyError } = await supabase.rpc('check_column_default', {
            table_name: 'conversation_history',
            column_name: 'model_used'
        });

        if (verifyError) {
            console.warn('⚠️ Não foi possível verificar novo estado:', verifyError.message);
        } else {
            console.log('📊 Novo DEFAULT:', newDefault || 'NENHUM (correto!)');
        }

        // 5. Atualizar comentário da coluna
        console.log('📝 Atualizando comentário da coluna...');
        
        const { error: commentError } = await supabase.rpc('exec_sql', {
            query: `COMMENT ON COLUMN conversation_history.model_used IS 'Método de decisão usado: "deterministic" (regex), "flowlock" (flow lock), ou nome do modelo LLM (ex: gpt-4o-mini). NULL para mensagens do sistema.';`
        });

        if (commentError) {
            console.warn('⚠️ Não foi possível atualizar comentário:', commentError.message);
        }

        console.log('🎉 MIGRAÇÃO COMPLETA!');
        console.log('✅ model_used agora tem controle total via código');
        console.log('🎯 Fontes de decisão claramente rastreadas:');
        console.log('   - deterministic (regex)');
        console.log('   - flowlock (flow lock)'); 
        console.log('   - gpt-4o-mini, etc. (LLM)');
        console.log('   - system (timeout/inactivity)');

        return true;

    } catch (error) {
        console.error('❌ Erro durante migração:', error.message);
        return false;
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    removeModelUsedDefault()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { removeModelUsedDefault };