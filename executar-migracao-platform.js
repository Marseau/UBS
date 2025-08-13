require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function executarMigracaoPlatform() {
    console.log('🔧 EXECUTANDO MIGRAÇÃO PLATFORM_METRICS');
    console.log('='.repeat(60));
    console.log('Adicionando 5 campos faltantes para igualar tenant_metrics');
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    // Comandos SQL individuais (mais compatível)
    const sqlCommands = [
        "ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ;",
        "ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS metric_data JSONB;",
        "ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS metric_type TEXT DEFAULT 'platform_aggregated';",
        "ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS tenant_id UUID;",
        "ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS tenant_name TEXT;"
    ];
    
    try {
        console.log('📋 Executando comandos SQL...');
        
        for (let i = 0; i < sqlCommands.length; i++) {
            const sql = sqlCommands[i];
            const fieldName = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/)[1];
            
            console.log(`   ${i+1}/5 Adicionando campo: ${fieldName}`);
            
            try {
                // Tentar executar usando query raw
                const { error } = await client
                    .from('platform_metrics')
                    .select('id')
                    .limit(0); // Só para verificar conexão
                    
                // Como não podemos executar DDL diretamente, vamos tentar uma abordagem diferente
                console.log(`   ⚠️ Não posso executar DDL via cliente Supabase`);
                
            } catch (fieldError) {
                console.log(`   ❌ Erro no campo ${fieldName}:`, fieldError.message);
            }
        }
        
        console.log('\\n💡 SOLUÇÃO MANUAL NECESSÁRIA:');
        console.log('Execute este SQL no painel do Supabase (SQL Editor):');
        console.log('\\n' + '='.repeat(60));
        sqlCommands.forEach((cmd, i) => {
            console.log(`-- ${i+1}. Adicionar campo`);
            console.log(cmd);
            console.log('');
        });
        
        console.log('\\n🎯 APÓS EXECUTAR O SQL, EXECUTE:');
        console.log('   node repovoar-platform-com-campos-completos.js');
        
        return false; // Indica que precisa de execução manual
        
    } catch (error) {
        console.error('💥 Erro na migração:', error.message);
        return false;
    }
}

executarMigracaoPlatform()
    .then(success => {
        if (success) {
            console.log('\\n✅ MIGRAÇÃO CONCLUÍDA AUTOMATICAMENTE!');
        } else {
            console.log('\\n⚠️ MIGRAÇÃO MANUAL NECESSÁRIA - Veja as instruções acima');
        }
        process.exit(0);
    })
    .catch(console.error);