/**
 * GERADOR CSV SIMPLES E FUNCIONAL
 * Context Engineering - Sem formatações complexas
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Env vars missing');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function cleanCSV(value) {
    if (value === null || value === undefined) return '';
    
    const str = String(value);
    
    // Se tem vírgula ou aspas, precisa escapar
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
}

async function generateSimpleCSV() {
    try {
        console.log('🔄 Gerando CSV completo...');
        
        // Paginação para buscar todos os dados
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
        
        const data = allData;
        console.log(`✅ Total coletado: ${data.length} registros`);

        const headers = [
            'id',
            'tenant_id', 
            'user_id',
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

        const csvLines = [headers.join(',')];

        for (const row of data) {
            const csvRow = [
                cleanCSV(row.id),
                cleanCSV(row.tenant_id),
                cleanCSV(row.user_id),
                cleanCSV(row.tenants?.name || ''),
                cleanCSV(row.tenants?.business_name || ''),
                cleanCSV(row.users?.name || ''),
                cleanCSV(row.content),
                row.is_from_user ? 'TRUE' : 'FALSE',
                cleanCSV(row.message_type),
                cleanCSV(row.intent_detected),
                row.confidence_score || '',
                cleanCSV(row.conversation_context ? JSON.stringify(row.conversation_context) : ''),
                cleanCSV(row.created_at),
                row.tokens_used || '',
                row.api_cost_usd || '',
                cleanCSV(row.model_used),
                cleanCSV(row.message_source),
                row.processing_cost_usd || '',
                cleanCSV(row.conversation_outcome)
            ];

            csvLines.push(csvRow.join(','));
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-history-complete-${timestamp}.csv`;
        fs.writeFileSync(filename, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV simples: ${filename}`);
        console.log(`📊 ${csvLines.length - 1} linhas + cabeçalho`);

        // Testar primeira linha
        const firstLine = csvLines[1];
        const fields = firstLine.split(',');
        
        // Contar campos corretamente respeitando aspas
        let realFieldCount = 0;
        let inQuotes = false;
        
        for (const char of firstLine) {
            if (char === '"') inQuotes = !inQuotes;
            if (char === ',' && !inQuotes) realFieldCount++;
        }
        realFieldCount++; // último campo
        
        console.log(`\n🧪 TESTE primeira linha:`);
        console.log(`   Campos esperados: ${headers.length}`);
        console.log(`   Campos encontrados: ${realFieldCount}`);
        console.log(`   Status: ${realFieldCount === headers.length ? '✅ CORRETO' : '❌ ERRO'}`);
        
        if (realFieldCount !== headers.length) {
            console.log(`   Primeira linha: ${firstLine.substring(0, 150)}...`);
        }

        return { filename, success: realFieldCount === headers.length };

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return { success: false };
    }
}

if (require.main === module) {
    generateSimpleCSV()
        .then(result => {
            process.exit(result.success ? 0 : 1);
        });
}