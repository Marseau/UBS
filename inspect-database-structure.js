/**
 * INSPEÇÃO COMPLETA DA ESTRUTURA DO BANCO
 * 
 * Identifica todas as tabelas disponíveis e sua estrutura
 * para adaptar o script de comparação de métricas
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDatabaseStructure() {
    console.log('🔍 INSPECIONANDO ESTRUTURA COMPLETA DO BANCO DE DADOS\n');
    
    // Lista de tabelas possíveis para testar
    const possibleTables = [
        'tenants',
        'user_tenants', 
        'users',
        'conversations',
        'appointments',
        'services',
        'professionals',
        'customers',
        'metrics',
        'metric_data',
        'metricas_validadas',
        'tenant_metrics',
        'platform_metrics',
        'ubs_metric_system',
        'tenant_platform_metrics',
        'conversation_history',
        'whatsapp_messages',
        'subscription_payments',
        'billing',
        'chat_sessions',
        'ai_interactions'
    ];

    const availableTables = [];
    const tableStructures = {};

    console.log('📊 TESTANDO ACESSO ÀS TABELAS:\n');

    for (const tableName of possibleTables) {
        try {
            // Testar acesso básico
            const { data, error } = await supabase
                .from(tableName)
                .select('*')
                .limit(1);

            if (!error) {
                availableTables.push(tableName);
                
                // Analisar estrutura se há dados
                if (data && data.length > 0) {
                    const columns = Object.keys(data[0]);
                    tableStructures[tableName] = {
                        columns,
                        sampleRow: data[0],
                        hasData: true
                    };
                    console.log(`✅ ${tableName}: ${columns.length} colunas, COM DADOS`);
                } else {
                    // Mesmo sem dados, tenta descobrir colunas via erro controlado
                    try {
                        await supabase.from(tableName).insert({});
                    } catch (insertError) {
                        // Extrai colunas do erro de inserção
                        const errorMsg = insertError.message || '';
                        tableStructures[tableName] = {
                            columns: ['unknown'],
                            sampleRow: null,
                            hasData: false,
                            errorHint: errorMsg
                        };
                    }
                    console.log(`⚠️  ${tableName}: sem dados`);
                }
            } else {
                console.log(`❌ ${tableName}: ${error.message}`);
            }
        } catch (error) {
            console.log(`❌ ${tableName}: ${error.message}`);
        }
    }

    console.log(`\n📋 RESUMO: ${availableTables.length} tabelas acessíveis\n`);

    // Análise detalhada das tabelas com dados
    const tablesWithData = availableTables.filter(table => 
        tableStructures[table]?.hasData
    );

    if (tablesWithData.length > 0) {
        console.log('🔍 ANÁLISE DETALHADA DAS TABELAS COM DADOS:\n');
        
        for (const tableName of tablesWithData) {
            const structure = tableStructures[tableName];
            console.log(`\n📊 TABELA: ${tableName.toUpperCase()}`);
            console.log('─'.repeat(50));
            
            console.log(`Colunas (${structure.columns.length}):`, structure.columns.join(', '));
            
            // Mostrar estrutura da primeira linha
            console.log('\nEstrutura do primeiro registro:');
            Object.entries(structure.sampleRow).forEach(([key, value]) => {
                const valuePreview = value === null ? 'NULL' : 
                    typeof value === 'string' ? `"${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"` :
                    String(value);
                console.log(`  ${key}: ${valuePreview}`);
            });

            // Contar registros total
            try {
                const { count, error } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact', head: true });
                
                if (!error) {
                    console.log(`\nTotal de registros: ${count}`);
                }
            } catch (error) {
                console.log(`\nErro contando registros: ${error.message}`);
            }

            // Se contém tenant_id, mostrar tenants únicos
            if (structure.columns.includes('tenant_id')) {
                try {
                    const { data: tenantData } = await supabase
                        .from(tableName)
                        .select('tenant_id')
                        .limit(100);
                    
                    const uniqueTenants = [...new Set(tenantData?.map(row => row.tenant_id) || [])];
                    console.log(`Tenant IDs únicos: ${uniqueTenants.length}`);
                    console.log(`Exemplos: ${uniqueTenants.slice(0, 3).join(', ')}`);
                } catch (error) {
                    console.log(`Erro analisando tenant_ids: ${error.message}`);
                }
            }
        }
    }

    // Identificar tabelas de métricas
    console.log('\n🎯 IDENTIFICAÇÃO DE TABELAS DE MÉTRICAS:\n');
    
    const metricTables = availableTables.filter(table => 
        table.toLowerCase().includes('metric') || 
        table.toLowerCase().includes('platform') ||
        table.toLowerCase().includes('ubs')
    );

    if (metricTables.length > 0) {
        console.log('📊 Tabelas de métricas encontradas:');
        metricTables.forEach(table => {
            const structure = tableStructures[table];
            if (structure?.hasData) {
                console.log(`✅ ${table}: ${structure.columns.join(', ')}`);
            } else {
                console.log(`⚠️  ${table}: sem dados ou inacessível`);
            }
        });
    } else {
        console.log('❌ Nenhuma tabela de métricas identificada');
    }

    // Sugerir estratégia para comparação
    console.log('\n💡 ESTRATÉGIA SUGERIDA PARA COMPARAÇÃO DE MÉTRICAS:\n');
    
    const dataSourceTables = tablesWithData.filter(table => 
        !table.toLowerCase().includes('metric') && 
        !table.toLowerCase().includes('platform')
    );

    if (dataSourceTables.length > 0) {
        console.log('📋 Tabelas fonte de dados (para cálculo bruto):');
        dataSourceTables.forEach(table => {
            console.log(`  • ${table}: ${tableStructures[table].columns.length} colunas`);
        });
    }

    if (metricTables.length > 0) {
        console.log('\n📊 Tabelas de métricas (para comparação):');
        metricTables.forEach(table => {
            console.log(`  • ${table}: ${tableStructures[table]?.columns.length || 0} colunas`);
        });
    }

    // Salvar análise em arquivo
    const analysis = {
        timestamp: new Date().toISOString(),
        availableTables,
        tableStructures,
        metricTables,
        dataSourceTables,
        summary: {
            totalTables: availableTables.length,
            tablesWithData: tablesWithData.length,
            metricTables: metricTables.length,
            dataSourceTables: dataSourceTables.length
        }
    };

    const filename = `database-structure-analysis-${new Date().toISOString().split('T')[0]}.json`;
    require('fs').writeFileSync(filename, JSON.stringify(analysis, null, 2));
    
    console.log(`\n💾 Análise salva em: ${filename}`);
    
    return analysis;
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 INICIANDO INSPEÇÃO DO BANCO DE DADOS\n');
        
        const analysis = await inspectDatabaseStructure();
        
        console.log('\n✅ INSPEÇÃO COMPLETA FINALIZADA!');
        console.log(`📊 ${analysis.summary.totalTables} tabelas encontradas`);
        console.log(`📋 ${analysis.summary.tablesWithData} com dados`);
        console.log(`🎯 ${analysis.summary.metricTables} tabelas de métricas`);
        
    } catch (error) {
        console.error('❌ Erro na inspeção:', error.message);
        console.error(error.stack);
    }
}

if (require.main === module) {
    main();
}