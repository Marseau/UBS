/**
 * GERADOR CSV CONVERSATION_HISTORY - VERSÃO CORRIGIDA
 * Context Engineering - CSV totalmente funcional
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Formata número corretamente (sem zeros à esquerda, formato brasileiro)
 */
function formatNumber(number) {
    if (number === null || number === undefined || number === '') return '';
    
    // Converter para número
    const numValue = parseFloat(number);
    if (isNaN(numValue)) return '';
    
    // Se for zero, retornar zero simples
    if (numValue === 0) return '0';
    
    // Converter para string e substituir ponto por vírgula
    return numValue.toString().replace('.', ',');
}

/**
 * Escapa campo CSV corretamente
 */
function escapeCSV(field) {
    if (field === null || field === undefined) return '';
    
    const str = String(field);
    
    // Se contém vírgula, quebra de linha ou aspas, precisa ser escapado
    if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        // Escapa aspas duplas duplicando-as
        const escaped = str.replace(/"/g, '""');
        return `"${escaped}"`;
    }
    
    return str;
}

/**
 * Gera CSV corrigido
 */
async function generateFixedConversationCSV() {
    try {
        console.log('🔄 Gerando CSV conversation_history CORRIGIDO...');
        
        // Buscar todos os dados
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        
        while (true) {
            const { data, error } = await supabase
                .from('conversation_history')
                .select(`
                    id,
                    tenant_id,
                    user_id,
                    content,
                    is_from_user,
                    message_type,
                    intent_detected,
                    confidence_score,
                    conversation_context,
                    created_at,
                    tokens_used,
                    api_cost_usd,
                    model_used,
                    message_source,
                    processing_cost_usd,
                    conversation_outcome,
                    tenants(name, business_name),
                    users(name)
                `)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;
            
            if (!data || data.length === 0) break;
            
            allData = allData.concat(data);
            console.log(`📄 Processadas ${allData.length} conversas...`);
            
            if (data.length < pageSize) break;
            page++;
        }

        console.log(`✅ Total coletado: ${allData.length} conversas`);

        // Cabeçalho
        const headers = [
            'id',
            'tenant_name', 
            'tenant_business_name',
            'user_name',
            'content',
            'is_from_user',
            'message_type',
            'intent_detected',
            'confidence_score',
            'conversation_context',
            'created_at',
            'tokens_used',
            'api_cost_usd',
            'model_used',
            'message_source',
            'processing_cost_usd',
            'conversation_outcome'
        ];

        // Construir CSV linha por linha
        const csvLines = [headers.join(',')];

        for (const row of allData) {
            // Construir linha garantindo exatamente 17 campos
            const csvRow = [
                escapeCSV(row.id),                                      // 1
                escapeCSV(row.tenants?.name || ''),                     // 2
                escapeCSV(row.tenants?.business_name || ''),            // 3
                escapeCSV(row.users?.name || ''),                       // 4
                escapeCSV(row.content),                                 // 5
                row.is_from_user ? 'TRUE' : 'FALSE',                   // 6
                escapeCSV(row.message_type),                            // 7
                escapeCSV(row.intent_detected),                         // 8
                formatNumber(row.confidence_score),                     // 9
                escapeCSV(row.conversation_context ? JSON.stringify(row.conversation_context) : ''), // 10
                row.created_at ? new Date(row.created_at).toISOString() : '', // 11
                row.tokens_used || '',                                  // 12
                formatNumber(row.api_cost_usd),                         // 13
                escapeCSV(row.model_used),                              // 14
                escapeCSV(row.message_source),                          // 15
                formatNumber(row.processing_cost_usd),                  // 16
                escapeCSV(row.conversation_outcome)                     // 17
            ];

            // Verificar se temos exatamente 17 campos
            if (csvRow.length !== 17) {
                console.error(`❌ Erro: linha tem ${csvRow.length} campos, esperados 17`);
                console.error(`   ID: ${row.id}`);
                continue;
            }

            csvLines.push(csvRow.join(','));
        }

        // Salvar arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-history-fixed-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);

        fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV CORRIGIDO gerado: ${filename}`);
        console.log(`📊 Total de linhas: ${csvLines.length - 1} (+ cabeçalho)`);
        console.log(`📁 Localização: ${filepath}`);

        // Validar rapidamente
        console.log('\n🔍 VALIDAÇÃO RÁPIDA:');
        const sampleLines = csvLines.slice(1, 4); // 3 primeiras linhas de dados
        
        for (let i = 0; i < sampleLines.length; i++) {
            const fields = sampleLines[i].split(',');
            let fieldCount = 0;
            let inQuotes = false;
            
            // Contar campos respeitando aspas
            for (let j = 0; j < sampleLines[i].length; j++) {
                const char = sampleLines[i][j];
                if (char === '"') inQuotes = !inQuotes;
                if (char === ',' && !inQuotes) fieldCount++;
            }
            fieldCount++; // Último campo
            
            console.log(`   Linha ${i + 1}: ${fieldCount} campos ${fieldCount === 17 ? '✅' : '❌'}`);
        }

        return {
            filename,
            filepath,
            totalRecords: allData.length,
            success: true
        };

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { success: false, error: error.message };
    }
}

// Executar
if (require.main === module) {
    generateFixedConversationCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSV corrigido gerado com SUCESSO!');
                process.exit(0);
            } else {
                console.log('\n❌ Falha na geração do CSV');
                process.exit(1);
            }
        });
}

module.exports = { generateFixedConversationCSV };