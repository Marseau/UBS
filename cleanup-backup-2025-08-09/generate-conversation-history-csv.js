/**
 * Gerador de CSV da tabela conversation_history
 * Context Engineering - Validação completa de dados
 * 
 * Funcionalidades:
 * - Substitui IDs por nomes (tenant_id -> tenant_name, user_id -> user_name)
 * - Formatação brasileira para decimais (vírgula)
 * - Exportação completa de todos os registros
 * - Validação de integridade dos dados
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
 * Formata número para padrão brasileiro (vírgula como decimal)
 */
function formatBrazilianNumber(number) {
    if (number === null || number === undefined) return '';
    if (typeof number === 'string') return number;
    // Remove zeros à esquerda e formata corretamente
    const numValue = parseFloat(number);
    if (isNaN(numValue)) return '';
    return numValue.toString().replace('.', ',');
}

/**
 * Formata data para ISO string
 */
function formatDate(date) {
    if (!date) return '';
    return new Date(date).toISOString();
}

/**
 * Escapa aspas duplas no CSV e garante formatacao correta
 */
function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const stringField = String(field);
    
    // Sempre colocar entre aspas se contém vírgula, quebra de linha, ou aspas
    if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n') || stringField.includes('\r')) {
        // Escapar aspas duplas
        const escaped = stringField.replace(/"/g, '""');
        return `"${escaped}"`;
    }
    
    return stringField;
}

/**
 * Gera CSV completo da conversation_history
 */
async function generateConversationHistoryCSV() {
    try {
        console.log('🔄 Iniciando geração do CSV conversation_history...');
        
        // Query principal com joins para substituir IDs por nomes
        // Buscar TODOS os registros usando paginação
        let allConversations = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: conversations, error } = await supabase
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
                    tenants(
                        name,
                        business_name
                    ),
                    users(
                        name
                    )
                `)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) {
                throw new Error(`Erro ao buscar dados na página ${page}: ${error.message}`);
            }

            if (!conversations || conversations.length === 0) {
                hasMore = false;
            } else {
                allConversations = allConversations.concat(conversations);
                console.log(`📄 Página ${page + 1} processada: ${conversations.length} registros (Total: ${allConversations.length})`);
                
                if (conversations.length < pageSize) {
                    hasMore = false;
                }
                page++;
            }
        }

        const conversations = allConversations;

        console.log(`📊 Total de conversas encontradas: ${conversations.length}`);

        // Cabeçalho do CSV
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

        // Construir linhas do CSV
        const csvLines = [headers.join(',')];

        for (const conv of conversations) {
            const row = [
                escapeCsvField(conv.id),
                escapeCsvField(conv.tenants?.name || ''),
                escapeCsvField(conv.tenants?.business_name || ''),
                escapeCsvField(conv.users?.name || ''),
                escapeCsvField(conv.content),
                conv.is_from_user ? 'TRUE' : 'FALSE',
                escapeCsvField(conv.message_type),
                escapeCsvField(conv.intent_detected),
                formatBrazilianNumber(conv.confidence_score),
                escapeCsvField(conv.conversation_context ? JSON.stringify(conv.conversation_context).replace(/\n/g, ' ').replace(/\r/g, ' ') : ''),
                formatDate(conv.created_at),
                conv.tokens_used || '',
                formatBrazilianNumber(conv.api_cost_usd),
                escapeCsvField(conv.model_used),
                escapeCsvField(conv.message_source),
                formatBrazilianNumber(conv.processing_cost_usd),
                escapeCsvField(conv.conversation_outcome)
            ];

            csvLines.push(row.join(','));
        }

        // Gerar nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `conversation-history-complete-${timestamp}.csv`;
        const filepath = path.join(process.cwd(), filename);

        // Escrever arquivo CSV
        fs.writeFileSync(filepath, csvLines.join('\n'), 'utf8');

        console.log(`✅ CSV gerado com sucesso: ${filename}`);
        console.log(`📁 Localização: ${filepath}`);
        console.log(`📈 Total de linhas: ${csvLines.length - 1} (+ 1 cabeçalho)`);

        return {
            filename,
            filepath,
            totalRecords: conversations.length,
            totalLines: csvLines.length
        };

    } catch (error) {
        console.error('❌ Erro na geração do CSV:', error.message);
        throw error;
    }
}

/**
 * Validação do CSV versus dados originais
 */
async function validateCSV(csvInfo) {
    try {
        console.log('\n🔍 Iniciando validação do CSV...');

        // Ler CSV gerado
        const csvContent = fs.readFileSync(csvInfo.filepath, 'utf8');
        const csvLines = csvContent.split('\n').filter(line => line.trim());
        const csvDataLines = csvLines.slice(1); // Remove header

        // Buscar contagem original na tabela
        const { count: originalCount, error } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true });

        if (error) {
            throw new Error(`Erro na validação: ${error.message}`);
        }

        console.log(`📊 Registros na tabela original: ${originalCount}`);
        console.log(`📊 Linhas no CSV (sem cabeçalho): ${csvDataLines.length}`);

        // Validação básica
        const validation = {
            recordCountMatch: originalCount === csvDataLines.length,
            hasHeader: csvLines[0].includes('id,tenant_name,tenant_business_name'),
            hasData: csvDataLines.length > 0,
            validFormat: csvLines.every(line => line.split(',').length >= 17)
        };

        // Teste de amostragem - validar 3 registros específicos
        console.log('\n🧪 Validação por amostragem (3 registros mais recentes)...');
        
        const { data: sampleData, error: sampleError } = await supabase
            .from('conversation_history')
            .select(`
                id,
                tenants(name, business_name),
                users(name),
                api_cost_usd,
                confidence_score,
                processing_cost_usd
            `)
            .order('created_at', { ascending: false })
            .limit(3);

        if (sampleError) {
            throw new Error(`Erro na amostragem: ${sampleError.message}`);
        }

        // Verificar se os 3 primeiros registros do CSV correspondem
        let sampleValidation = true;
        for (let i = 0; i < Math.min(3, sampleData.length); i++) {
            const csvRow = csvDataLines[i].split(',');
            const dbRecord = sampleData[i];
            
            const csvId = csvRow[0];
            const dbId = dbRecord.id;
            
            if (csvId !== dbId) {
                console.warn(`⚠️ Divergência encontrada no registro ${i + 1}: CSV ID=${csvId}, DB ID=${dbId}`);
                sampleValidation = false;
            }
        }

        validation.sampleMatch = sampleValidation;

        return {
            ...validation,
            csvInfo,
            summary: {
                originalRecords: originalCount,
                csvRecords: csvDataLines.length,
                headerPresent: validation.hasHeader,
                formatValid: validation.validFormat,
                dataIntegrity: validation.recordCountMatch && validation.sampleMatch
            }
        };

    } catch (error) {
        console.error('❌ Erro na validação:', error.message);
        throw error;
    }
}

/**
 * Função principal
 */
async function main() {
    try {
        console.log('🚀 Context Engineering - Geração de CSV conversation_history');
        console.log('=' .repeat(60));

        // Gerar CSV
        const csvInfo = await generateConversationHistoryCSV();

        // Validar CSV
        const validation = await validateCSV(csvInfo);

        // Relatório final
        console.log('\n📋 RELATÓRIO DE VALIDAÇÃO');
        console.log('=' .repeat(40));
        console.log(`✅ Arquivo gerado: ${validation.csvInfo.filename}`);
        console.log(`✅ Registros originais: ${validation.summary.originalRecords}`);
        console.log(`✅ Registros no CSV: ${validation.summary.csvRecords}`);
        console.log(`✅ Contagem correspondente: ${validation.summary.originalRecords === validation.summary.csvRecords ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Cabeçalho presente: ${validation.summary.headerPresent ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Formato válido: ${validation.summary.formatValid ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Integridade dos dados: ${validation.summary.dataIntegrity ? 'SIM' : 'NÃO'}`);

        if (validation.summary.dataIntegrity) {
            console.log('\n🎉 CSV gerado e validado com SUCESSO!');
            console.log('📈 Pronto para análise de métricas e criação de jobs.');
        } else {
            console.log('\n⚠️ CSV gerado mas com inconsistências detectadas.');
            console.log('🔧 Verifique os logs acima para detalhes.');
        }

    } catch (error) {
        console.error('\n💥 ERRO CRÍTICO:', error.message);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = {
    generateConversationHistoryCSV,
    validateCSV,
    formatBrazilianNumber,
    escapeCsvField
};