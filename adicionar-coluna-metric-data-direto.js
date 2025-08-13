require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function adicionarColunaMetricDataDireto() {
    console.log('🎯 SOLUÇÃO CERTA: ADICIONAR COLUNA metric_data DIRETAMENTE');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Primeiro, vamos verificar se já existe
        console.log('🔍 Verificando se a coluna já existe...');
        
        const { data: testData } = await client
            .from('platform_metrics')
            .select('metric_data')
            .limit(1);
            
        if (testData && testData.length > 0) {
            console.log('✅ Coluna metric_data já existe!');
            return true;
        }
        
        // 2. Tentar via RPC function (método mais provável de funcionar)
        console.log('🔧 Tentativa 1: Via RPC function...');
        
        try {
            // Criar função que adiciona a coluna
            const createFunctionQuery = `
                CREATE OR REPLACE FUNCTION add_metric_data_column()
                RETURNS text AS $$
                BEGIN
                    -- Verificar se a coluna já existe
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'platform_metrics' 
                        AND column_name = 'metric_data'
                    ) THEN
                        -- Adicionar a coluna
                        ALTER TABLE platform_metrics ADD COLUMN metric_data JSONB DEFAULT '{}'::jsonb;
                        RETURN 'Coluna metric_data adicionada com sucesso!';
                    ELSE
                        RETURN 'Coluna metric_data já existe.';
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RETURN 'Erro: ' || SQLERRM;
                END;
                $$ LANGUAGE plpgsql SECURITY DEFINER;
            `;
            
            // Tentar executar a função diretamente via SQL
            const { data: functionResult, error: functionError } = await client.rpc('sql', { 
                query: createFunctionQuery + ' SELECT add_metric_data_column();'
            });
            
            if (!functionError && functionResult) {
                console.log('✅ Função executada:', functionResult);
                
                // Verificar se funcionou
                const { data: verifyData } = await client
                    .from('platform_metrics')
                    .select('metric_data')
                    .limit(1);
                
                if (verifyData) {
                    console.log('🎉 SUCESSO! Coluna adicionada via RPC function!');
                    return true;
                }
            } else {
                console.log('❌ RPC function falhou:', functionError?.message);
            }
        } catch (rpcError) {
            console.log('❌ RPC function falhou:', rpcError.message);
        }
        
        // 3. Tentar via SQL direto (menos provável mas vale tentar)
        console.log('🔧 Tentativa 2: Via SQL direto...');
        
        const directSql = `
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'platform_metrics' 
                    AND column_name = 'metric_data'
                ) THEN
                    ALTER TABLE platform_metrics ADD COLUMN metric_data JSONB DEFAULT '{}'::jsonb;
                END IF;
            END $$;
        `;
        
        try {
            const { error: sqlError } = await client.rpc('exec', { sql: directSql });
            
            if (!sqlError) {
                console.log('✅ SQL direto funcionou!');
                
                // Verificar
                const { data: verifyData } = await client
                    .from('platform_metrics')
                    .select('metric_data')
                    .limit(1);
                
                if (verifyData) {
                    console.log('🎉 SUCESSO! Coluna adicionada via SQL direto!');
                    return true;
                }
            } else {
                console.log('❌ SQL direto falhou:', sqlError.message);
            }
        } catch (sqlDirectError) {
            console.log('❌ SQL direto falhou:', sqlDirectError.message);
        }
        
        // 4. Tentar diferentes RPCs que podem existir
        console.log('🔧 Tentativa 3: Testando RPCs disponíveis...');
        
        const possibleRpcs = [
            'execute_sql',
            'run_sql', 
            'exec_sql',
            'sql_exec',
            'raw_sql',
            'execute',
            'query'
        ];
        
        const ddlQuery = `ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS metric_data JSONB DEFAULT '{}'::jsonb;`;
        
        for (const rpcName of possibleRpcs) {
            try {
                console.log(`   Tentando ${rpcName}...`);
                
                const { data: rpcResult, error: rpcError } = await client.rpc(rpcName, { 
                    sql: ddlQuery,
                    query: ddlQuery,
                    statement: ddlQuery 
                });
                
                if (!rpcError) {
                    console.log(`✅ ${rpcName} funcionou!`);
                    
                    // Verificar
                    const { data: verifyData } = await client
                        .from('platform_metrics')
                        .select('metric_data')
                        .limit(1);
                    
                    if (verifyData) {
                        console.log('🎉 SUCESSO! Coluna adicionada via', rpcName);
                        return true;
                    }
                }
            } catch (rpcTestError) {
                // Continuar tentando
            }
        }
        
        // 5. Se nada funcionou, instruir o usuário
        console.log('\\n❌ TODAS AS TENTATIVAS PROGRAMÁTICAS FALHARAM');
        console.log('\\n📋 SOLUÇÃO MANUAL NECESSÁRIA:');
        console.log('\\n1. Acesse o Dashboard do Supabase:');
        console.log(`   https://supabase.com/dashboard/project/[SEU_PROJECT_ID]/editor`);
        console.log('\\n2. Vá na aba "SQL Editor"');
        console.log('\\n3. Execute este comando:');
        console.log("   ALTER TABLE platform_metrics ADD COLUMN metric_data JSONB DEFAULT '{}'::jsonb;");
        console.log('\\n4. Depois execute: node atualizar-servico-com-metric-data.js');
        
        return false;
        
    } catch (error) {
        console.error('💥 Erro crítico:', error.message);
        return false;
    }
}

adicionarColunaMetricDataDireto()
    .then(success => {
        if (success) {
            console.log('\\n🎉 COLUNA metric_data ADICIONADA COM SUCESSO!');
            console.log('✅ Agora platform_metrics tem 4 campos JSON nativos');
            console.log('🚀 Execute: node atualizar-servico-com-metric-data.js');
        } else {
            console.log('\\n⚠️ COLUNA NÃO PÔDE SER ADICIONADA PROGRAMATICAMENTE');
            console.log('📝 Use a solução manual descrita acima');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(console.error);