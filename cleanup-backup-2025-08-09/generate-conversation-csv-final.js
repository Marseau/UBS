/**
 * GERADOR CSV CONVERSATION_HISTORY - VERSÃO FINAL
 * Context Engineering - CSV perfeitamente alinhado com schema real
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variáveis de ambiente obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Formatar valor para CSV
 */
function formatValue(value, type = 'string') {
    if (value === null || value === undefined) return '';
    
    if (type === 'number') {
        const num = parseFloat(value);
        if (isNaN(num)) return '';
        return num === 0 ? '0' : num.toString().replace('.', ',');
    }
    
    if (type === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    
    if (type === 'json') {
        return JSON.stringify(value);
    }
    
    return String(value);
}

/**
 * Escapar campo CSV
 */
function escapeCSV(value) {
    if (!value && value !== 0) return '';
    
    const str = String(value);
    
    // Se contém vírgula, quebra de linha ou aspas
    if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

async function generateFinalCSV() {
    try {
        console.log('🔄 Gerando CSV conversation_history FINAL...');
        
        // Schema exato baseado no debug
        const SCHEMA = [
            'id',                    // string
            'tenant_id',            // string  
            'user_id',              // string
            'tenant_name',          // join tenants.name
            'tenant_business_name', // join tenants.business_name
            'user_name',            // join users.name
            'content',              // string
            'is_from_user',         // boolean
            'message_type',         // string
            'intent_detected',      // string nullable
            'confidence_score',     // number nullable
            'conversation_context', // json
            'created_at',           // timestamp
            'tokens_used',          // number nullable
            'api_cost_usd',         // number nullable
            'model_used',           // string nullable
            'message_source',       // string nullable
            'processing_cost_usd',  // number nullable
            'conversation_outcome'  // string nullable
        ];
        
        console.log(`📋 Schema definido: ${SCHEMA.length} campos`);
        
        // Buscar dados
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
            console.log(`📄 Coletados ${allData.length} registros...`);
            
            if (data.length < pageSize) break;
            page++;
        }

        console.log(`✅ Total: ${allData.length} registros`);

        // Gerar CSV
        const csvLines = [];
        
        // Cabeçalho
        csvLines.push(SCHEMA.join(','));
        
        // Dados
        for (const row of allData) {
            const csvRow = [
                escapeCSV(row.id),
                escapeCSV(row.tenant_id),
                escapeCSV(row.user_id),
                escapeCSV(row.tenants?.name || ''),
                escapeCSV(row.tenants?.business_name || ''),
                escapeCSV(row.users?.name || ''),
                escapeCSV(row.content),
                formatValue(row.is_from_user, 'boolean'),
                escapeCSV(row.message_type),
                escapeCSV(row.intent_detected),
                formatValue(row.confidence_score, 'number'),
                escapeCSV(formatValue(row.conversation_context, 'json')),
                escapeCSV(row.created_at ? new Date(row.created_at).toISOString() : ''),
                formatValue(row.tokens_used, 'number'),
                formatValue(row.api_cost_usd, 'number'),
                escapeCSV(row.model_used),
                escapeCSV(row.message_source),
                formatValue(row.processing_cost_usd, 'number'),
                escapeCSV(row.conversation_outcome)
            ];
            
            // Verificar exatamente 19 campos
            if (csvRow.length !== SCHEMA.length) {
                console.error(`❌ Erro: ${csvRow.length} campos, esperados ${SCHEMA.length}`);
                console.error(`   Row ID: ${row.id}`);
                continue;
            }
            
            csvLines.push(csvRow.join(','));
        }

        // Salvar
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-history-final-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);

        fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV FINAL: ${filename}`);
        console.log(`📊 Linhas: ${csvLines.length - 1} + cabeçalho`);

        // Validação final
        console.log('\n🧪 VALIDAÇÃO FINAL:');
        const testLines = csvLines.slice(1, 4);
        
        for (let i = 0; i < testLines.length; i++) {
            // Usar regex para contar campos respeitando aspas
            const matches = testLines[i].match(/(?:^|,)(?:"(?:[^"]|"")*"|[^,]*)/g);
            const fieldCount = matches ? matches.length : 0;
            
            console.log(`   Linha ${i + 1}: ${fieldCount} campos ${fieldCount === SCHEMA.length ? '✅' : '❌'}`);
            
            if (fieldCount !== SCHEMA.length) {
                console.log(`      Conteúdo: ${testLines[i].substring(0, 100)}...`);
            }
        }

        return { filename, filepath, success: true };

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { success: false, error: error.message };
    }
}

// Executar
if (require.main === module) {
    generateFinalCSV()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 CSV FINAL gerado com SUCESSO TOTAL!');
                process.exit(0);
            } else {
                console.log('\n❌ Falha na geração');
                process.exit(1);
            }
        });
}

module.exports = { generateFinalCSV };