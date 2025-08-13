require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarSchemaSimples() {
    console.log('🔍 VERIFICANDO SCHEMA TENANT_METRICS - MÉTODO SIMPLES');
    console.log('='.repeat(70));
    
    const client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    try {
        // 1. Buscar um registro da tabela para ver a estrutura real
        console.log('📊 BUSCANDO AMOSTRA DA TABELA tenant_metrics:');
        
        const { data: sample, error: sampleError } = await client
            .from('tenant_metrics')
            .select('*')
            .limit(1);
            
        if (sampleError) {
            console.error('❌ Erro ao buscar amostra:', sampleError);
            return;
        }
        
        if (!sample || sample.length === 0) {
            console.log('⚠️ Tabela tenant_metrics está vazia - vamos verificar estrutura vazia');
            
            // Tentar inserir um registro vazio temporário para ver estrutura
            const { error: insertError } = await client
                .from('tenant_metrics')
                .insert({
                    tenant_id: '00000000-0000-0000-0000-000000000000',
                    metric_type: 'test_structure',
                    period: '7d', 
                    metric_data: {}
                });
                
            if (insertError) {
                console.error('❌ Erro ao inserir teste:', insertError);
                console.log('📋 Estrutura inferida dos tipos TypeScript:');
                console.log('   - id (string)');
                console.log('   - tenant_id (string)');
                console.log('   - metric_type (string)');
                console.log('   - period (string)');
                console.log('   - metric_data (Json)');
                console.log('   - calculated_at (string)');
                console.log('   - created_at (string)');
                console.log('   - updated_at (string)');
            } else {
                console.log('✅ Registro teste inserido, buscando novamente...');
                const { data: newSample } = await client
                    .from('tenant_metrics')
                    .select('*')
                    .eq('metric_type', 'test_structure')
                    .limit(1);
                    
                if (newSample && newSample.length > 0) {
                    console.log('📊 Campos encontrados na tabela:');
                    Object.keys(newSample[0]).forEach(key => {
                        console.log(`   - ${key}: ${typeof newSample[0][key]}`);
                    });
                }
                
                // Limpar registro teste
                await client
                    .from('tenant_metrics')
                    .delete()
                    .eq('metric_type', 'test_structure');
            }
        } else {
            console.log('✅ Registro encontrado! Analisando estrutura:');
            const record = sample[0];
            
            console.log('📊 Campos encontrados na tabela:');
            Object.keys(record).forEach(key => {
                const value = record[key];
                const type = typeof value;
                const preview = type === 'object' && value ? 
                    ` (${Object.keys(value).length} propriedades)` : 
                    type === 'string' && value ? ` = "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}"` : '';
                console.log(`   - ${key}: ${type}${preview}`);
            });
        }
        
        // 2. Verificar especificamente os 4 campos JSON esperados
        console.log('\n🎯 VERIFICAÇÃO DOS 4 CAMPOS JSON NECESSÁRIOS:');
        const expectedFields = [
            'comprehensive_metrics',
            'participation_metrics', 
            'ranking_metrics',
            'metric_data'
        ];
        
        let missingFields = [];
        
        if (sample && sample.length > 0) {
            const record = sample[0];
            expectedFields.forEach(field => {
                if (record.hasOwnProperty(field)) {
                    console.log(`   ✅ ${field}: EXISTE`);
                } else {
                    console.log(`   ❌ ${field}: FALTANDO`);
                    missingFields.push(field);
                }
            });
        } else {
            console.log('   ⚠️ Não foi possível verificar - tabela vazia ou erro de acesso');
            console.log('   📋 Baseado nos tipos TypeScript, existem apenas:');
            console.log('     ✅ metric_data: EXISTE (campo genérico)');
            console.log('     ❌ comprehensive_metrics: FALTANDO');
            console.log('     ❌ participation_metrics: FALTANDO'); 
            console.log('     ❌ ranking_metrics: FALTANDO');
            
            missingFields = ['comprehensive_metrics', 'participation_metrics', 'ranking_metrics'];
        }
        
        // 3. Diagnóstico e recomendação
        console.log('\n' + '='.repeat(70));
        console.log('📋 DIAGNÓSTICO FINAL:');
        
        if (missingFields.length === 0) {
            console.log('✅ ESTRUTURA CORRETA: Todos os 4 campos JSON existem');
            console.log('💡 PRÓXIMO PASSO: Verificar se TenantMetricsCronService está populando todos os campos');
        } else {
            console.log('❌ ESTRUTURA INCOMPLETA: Campos JSON faltando');
            console.log(`🔧 CAMPOS FALTANTES: ${missingFields.join(', ')}`);
            console.log('💡 AÇÃO NECESSÁRIA: Executar migração SQL para adicionar campos');
            
            console.log('\n📝 SQL DE MIGRAÇÃO NECESSÁRIA:');
            missingFields.forEach(field => {
                console.log(`   ALTER TABLE tenant_metrics ADD COLUMN ${field} JSONB DEFAULT '{}'::jsonb;`);
            });
        }
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO na verificação:', error);
    }
}

verificarSchemaSimples().then(() => process.exit(0)).catch(console.error);