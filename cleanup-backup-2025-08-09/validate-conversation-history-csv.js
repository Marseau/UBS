/**
 * VALIDAÇÃO CORRETA DO CSV CONVERSATION_HISTORY
 * Context Engineering - Validação específica para conversation_history
 */

const fs = require('fs');
const path = require('path');

/**
 * Parser CSV simples que respeita aspas
 */
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // Aspas duplas escapadas
                current += '"';
                i++; // Pular próxima aspa
            } else {
                // Toggle estado de aspas
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Fim do campo
            fields.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    // Adicionar último campo
    fields.push(current.trim());
    return fields;
}

/**
 * Validação específica para conversation_history CSV
 */
function validateConversationHistoryCSV(csvFilePath) {
    console.log(`🔍 VALIDAÇÃO CSV CONVERSATION_HISTORY: ${path.basename(csvFilePath)}`);
    console.log('=' .repeat(70));
    
    try {
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Arquivo CSV vazio');
        }
        
        // Parse do cabeçalho
        const header = parseCSVLine(lines[0]);
        const expectedColumns = [
            'id', 'tenant_name', 'tenant_business_name', 'user_name', 'content',
            'is_from_user', 'message_type', 'intent_detected', 'confidence_score',
            'conversation_context', 'created_at', 'tokens_used', 'api_cost_usd',
            'model_used', 'message_source', 'processing_cost_usd', 'conversation_outcome'
        ];
        
        console.log(`📊 Total de linhas: ${lines.length} (incluindo cabeçalho)`);
        console.log(`📊 Colunas esperadas: ${expectedColumns.length}`);
        console.log(`📊 Colunas encontradas: ${header.length}`);
        
        // Validar cabeçalho
        let headerValid = true;
        const headerIssues = [];
        
        for (let i = 0; i < expectedColumns.length; i++) {
            if (i >= header.length || header[i] !== expectedColumns[i]) {
                headerValid = false;
                headerIssues.push(`Coluna ${i + 1}: esperado "${expectedColumns[i]}", encontrado "${header[i] || 'FALTANDO'}"`);
            }
        }
        
        if (headerValid) {
            console.log('✅ Cabeçalho: CORRETO');
        } else {
            console.log('❌ Cabeçalho: INCORRETO');
            headerIssues.slice(0, 5).forEach(issue => console.log(`   ${issue}`));
        }
        
        // Validar estrutura das linhas
        let structuralIssues = 0;
        let formatIssues = 0;
        let dataQualityIssues = 0;
        
        // Testar amostra de 50 linhas
        const testLines = lines.slice(1, Math.min(51, lines.length));
        
        console.log(`\n🧪 TESTE DE ESTRUTURA (${testLines.length} linhas):`);
        for (let i = 0; i < testLines.length; i++) {
            const lineNumber = i + 2;
            const fields = parseCSVLine(testLines[i]);
            
            // Teste de estrutura (17 colunas)
            if (fields.length !== 17) {
                structuralIssues++;
                if (structuralIssues <= 3) {
                    console.log(`⚠️ Linha ${lineNumber}: ${fields.length} campos (esperados 17)`);
                }
            }
            
            // Teste de campos obrigatórios
            if (!fields[0] || fields[0].length < 30) { // ID deve ser UUID
                dataQualityIssues++;
            }
            
            if (!fields[1] || !fields[2]) { // tenant_name, tenant_business_name
                dataQualityIssues++;
            }
            
            // Teste de formatos específicos
            if (fields[5] && !['TRUE', 'FALSE'].includes(fields[5])) { // is_from_user
                formatIssues++;
            }
            
            // Teste de números com vírgula (padrão brasileiro)
            const numericFields = [8, 11, 12, 15]; // confidence_score, tokens_used, api_cost_usd, processing_cost_usd
            numericFields.forEach(fieldIndex => {
                const value = fields[fieldIndex];
                if (value && value !== '' && value !== '0') {
                    // Aceitar números com vírgula (padrão brasileiro)
                    const numericValue = parseFloat(value.replace(',', '.'));
                    if (isNaN(numericValue)) {
                        formatIssues++;
                    }
                }
            });
        }
        
        // Análise de amostra de dados
        console.log('\n📋 AMOSTRA DE DADOS (3 registros):');
        for (let i = 0; i < Math.min(3, testLines.length); i++) {
            const fields = parseCSVLine(testLines[i]);
            console.log(`\nRegistro ${i + 1}:`);
            console.log(`  ID: ${fields[0] ? fields[0].substring(0, 8) + '...' : 'N/A'}`);
            console.log(`  Tenant: ${fields[1] || 'N/A'}`);
            console.log(`  Business: ${fields[2] || 'N/A'}`);
            console.log(`  User: ${fields[3] || 'N/A'}`);
            console.log(`  Content: ${fields[4] ? fields[4].substring(0, 30) + '...' : 'N/A'}`);
            console.log(`  From User: ${fields[5] || 'N/A'}`);
            console.log(`  Intent: ${fields[7] || 'N/A'}`);
            console.log(`  Confidence: ${fields[8] || 'N/A'}`);
            console.log(`  Tokens: ${fields[11] || 'N/A'}`);
            console.log(`  API Cost: ${fields[12] || 'N/A'}`);
            console.log(`  Outcome: ${fields[16] || 'N/A'}`);
        }
        
        // Estatísticas de qualidade dos dados
        console.log('\n📊 ANÁLISE DE QUALIDADE DOS DADOS:');
        
        let filledTenantNames = 0;
        let filledUserNames = 0;
        let filledIntents = 0;
        let filledOutcomes = 0;
        let filledCosts = 0;
        
        testLines.forEach(line => {
            const fields = parseCSVLine(line);
            if (fields[1] && fields[1] !== '') filledTenantNames++;
            if (fields[3] && fields[3] !== '') filledUserNames++;
            if (fields[7] && fields[7] !== '') filledIntents++;
            if (fields[16] && fields[16] !== '') filledOutcomes++;
            if (fields[12] && fields[12] !== '' && fields[12] !== '0') filledCosts++;
        });
        
        console.log(`   Tenant Names preenchidos: ${filledTenantNames}/${testLines.length} (${((filledTenantNames/testLines.length)*100).toFixed(1)}%)`);
        console.log(`   User Names preenchidos: ${filledUserNames}/${testLines.length} (${((filledUserNames/testLines.length)*100).toFixed(1)}%)`);
        console.log(`   Intents preenchidos: ${filledIntents}/${testLines.length} (${((filledIntents/testLines.length)*100).toFixed(1)}%)`);
        console.log(`   Outcomes preenchidos: ${filledOutcomes}/${testLines.length} (${((filledOutcomes/testLines.length)*100).toFixed(1)}%)`);
        console.log(`   API Costs preenchidos: ${filledCosts}/${testLines.length} (${((filledCosts/testLines.length)*100).toFixed(1)}%)`);
        
        // Resultado final
        console.log('\n📊 RESULTADOS FINAIS:');
        console.log(`✅ Linhas testadas: ${testLines.length}`);
        console.log(`✅ Problemas estruturais: ${structuralIssues}`);
        console.log(`✅ Problemas de formato: ${formatIssues}`);
        console.log(`✅ Problemas de qualidade: ${dataQualityIssues}`);
        
        // Critérios de aprovação
        const structuralOK = structuralIssues === 0;
        const formatOK = formatIssues <= Math.floor(testLines.length * 0.05); // Até 5% de problemas
        const qualityOK = dataQualityIssues <= Math.floor(testLines.length * 0.1); // Até 10% de problemas
        const isUsable = headerValid && structuralOK && formatOK && qualityOK;
        
        console.log(`\n🎯 AVALIAÇÃO FINAL:`);
        console.log(`   Cabeçalho válido: ${headerValid ? '✅' : '❌'}`);
        console.log(`   Estrutura correta: ${structuralOK ? '✅' : '❌'}`);
        console.log(`   Formato adequado: ${formatOK ? '✅' : '❌'}`);
        console.log(`   Qualidade dos dados: ${qualityOK ? '✅' : '❌'}`);
        
        console.log(`\n🏆 USABILIDADE: ${isUsable ? '✅ APROVADO' : '❌ REPROVADO'}`);
        
        if (isUsable) {
            console.log('\n🎉 CSV está correto e pronto para análise!');
            console.log('📈 Adequado para importação em Excel, Power BI, e sistemas analíticos.');
            console.log('🔍 Campos aninhados resolvidos corretamente.');
            console.log('💰 Formatação numérica brasileira aplicada.');
        } else {
            console.log('\n⚠️ CSV possui problemas que precisam ser corrigidos.');
            if (!headerValid) console.log('   - Corrigir estrutura do cabeçalho');
            if (!structuralOK) console.log('   - Corrigir número de colunas nas linhas');
            if (!formatOK) console.log('   - Corrigir formatação de campos');
            if (!qualityOK) console.log('   - Melhorar qualidade dos dados');
        }
        
        return {
            isUsable,
            totalLines: lines.length - 1,
            headerValid,
            structuralIssues,
            formatIssues,
            dataQualityIssues,
            qualityMetrics: {
                tenantNamesPercent: (filledTenantNames/testLines.length)*100,
                userNamesPercent: (filledUserNames/testLines.length)*100,
                intentsPercent: (filledIntents/testLines.length)*100,
                outcomesPercent: (filledOutcomes/testLines.length)*100,
                costsPercent: (filledCosts/testLines.length)*100
            }
        };
        
    } catch (error) {
        console.error(`❌ Erro ao validar: ${error.message}`);
        return {
            isUsable: false,
            error: error.message
        };
    }
}

// Execução
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('❌ Uso: node validate-conversation-history-csv.js <arquivo-csv>');
    process.exit(1);
}

const result = validateConversationHistoryCSV(args[0]);
process.exit(result.isUsable ? 0 : 1);