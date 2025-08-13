require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarSchemaTenantMetrics() {
    console.log('🔍 VERIFICANDO SCHEMA ATUAL DE TENANT_METRICS');
    console.log('='.repeat(70));
    
    const client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    try {
        // 1. Verificar estrutura atual da tabela
        console.log('📊 VERIFICANDO COLUNAS DA TABELA tenant_metrics:');
        const { data: columns, error: columnsError } = await client
            .rpc('exec_sql', {
                query: `
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_name = 'tenant_metrics' 
                    ORDER BY ordinal_position;
                `
            });
            
        if (columnsError) {
            console.error('❌ Erro ao verificar colunas:', columnsError);
            throw columnsError;
        }
        
        if (columns && columns.length > 0) {
            columns.forEach(col => {
                console.log(`   📋 ${col.column_name} (${col.data_type}) - Nullable: ${col.is_nullable}`);
            });
        } else {
            console.log('   ⚠️ Nenhuma coluna encontrada ou erro na consulta');
        }
        
        // 2. Verificar campos JSON existentes
        console.log('\n🔍 VERIFICANDO CAMPOS JSON ATUAIS:');
        const { data: sample, error: sampleError } = await client
            .from('tenant_metrics')
            .select('*')
            .limit(1);
            
        if (sampleError) {
            console.error('❌ Erro ao buscar amostra:', sampleError);
        } else if (sample && sample.length > 0) {
            const record = sample[0];
            console.log('   📊 Campos encontrados na tabela:');
            Object.keys(record).forEach(key => {
                console.log(`      - ${key}: ${typeof record[key]}`);
            });
            
            // Verificar especificamente os 4 campos JSON esperados
            const expectedFields = [
                'comprehensive_metrics',
                'participation_metrics', 
                'ranking_metrics',
                'metric_data'
            ];
            
            console.log('\n🎯 VERIFICAÇÃO DOS 4 CAMPOS JSON NECESSÁRIOS:');
            expectedFields.forEach(field => {
                if (record.hasOwnProperty(field)) {
                    console.log(`   ✅ ${field}: EXISTE`);
                } else {
                    console.log(`   ❌ ${field}: FALTANDO`);
                }
            });
        } else {
            console.log('   ⚠️ Tabela tenant_metrics está vazia');
        }
        
        // 3. Verificar constraints e índices
        console.log('\n🔧 VERIFICANDO CONSTRAINTS E ÍNDICES:');
        const { data: constraints, error: constraintsError } = await client
            .rpc('exec_sql', {
                query: `
                    SELECT 
                        tc.constraint_name, 
                        tc.constraint_type,
                        kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu 
                        ON tc.constraint_name = kcu.constraint_name
                    WHERE tc.table_name = 'tenant_metrics';
                `
            });
            
        if (!constraintsError && constraints) {
            constraints.forEach(constraint => {
                console.log(`   🔧 ${constraint.constraint_name} (${constraint.constraint_type}) - ${constraint.column_name}`);
            });
        }
        
        // 4. Diagnóstico final
        console.log('\n' + '='.repeat(70));
        console.log('📋 DIAGNÓSTICO FINAL:');
        
        const hasComprehensive = sample?.[0]?.hasOwnProperty('comprehensive_metrics');
        const hasParticipation = sample?.[0]?.hasOwnProperty('participation_metrics');
        const hasRanking = sample?.[0]?.hasOwnProperty('ranking_metrics');
        const hasMetricData = sample?.[0]?.hasOwnProperty('metric_data');
        
        if (hasComprehensive && hasParticipation && hasRanking && hasMetricData) {
            console.log('✅ ESTRUTURA CORRETA: Todos os 4 campos JSON existem');
            console.log('💡 AÇÃO NECESSÁRIA: Verificar se TenantMetricsCronService está populando todos os campos');
        } else {
            console.log('❌ ESTRUTURA INCOMPLETA: Campos JSON faltando');
            console.log('💡 AÇÃO NECESSÁRIA: Criar migração para adicionar campos faltantes');
            
            const missingFields = [];
            if (!hasComprehensive) missingFields.push('comprehensive_metrics');
            if (!hasParticipation) missingFields.push('participation_metrics'); 
            if (!hasRanking) missingFields.push('ranking_metrics');
            if (!hasMetricData) missingFields.push('metric_data');
            
            console.log(`🔧 CAMPOS FALTANTES: ${missingFields.join(', ')}`);
        }
        
    } catch (error) {
        console.error('💥 ERRO CRÍTICO na verificação do schema:', error);
    }
}

verificarSchemaTenantMetrics().then(() => process.exit(0)).catch(console.error);