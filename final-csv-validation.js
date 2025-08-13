/**
 * VALIDAÇÃO FINAL DE CSV - TESTE REAL DE USABILIDADE
 * Context Engineering - Validação prática com parser CSV real
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
 * Validação prática de usabilidade
 */
function validateCsvUsability(csvFilePath) {
    console.log(`🔍 TESTE DE USABILIDADE: ${path.basename(csvFilePath)}`);
    console.log('=' .repeat(60));
    
    try {
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Arquivo CSV vazio');
        }
        
        // Parse do cabeçalho
        const header = parseCSVLine(lines[0]);
        const expectedColumns = header.length;
        
        console.log(`📊 Total de linhas: ${lines.length} (incluindo cabeçalho)`);
        console.log(`📊 Colunas no cabeçalho: ${expectedColumns}`);
        console.log(`📊 Primeiras 5 colunas: ${header.slice(0, 5).join(', ')}`);
        
        // Validar estrutura
        let structuralIssues = 0;
        let numericFormatIssues = 0;
        let dataIssues = 0;
        
        // Testar primeiras 20 linhas
        const testLines = lines.slice(1, Math.min(21, lines.length));
        
        console.log('\n🧪 TESTE DE PARSING (20 primeiras linhas):');
        
        for (let i = 0; i < testLines.length; i++) {
            const lineNumber = i + 2;
            const fields = parseCSVLine(testLines[i]);
            
            // Teste de estrutura
            if (fields.length !== expectedColumns) {
                structuralIssues++;
                if (structuralIssues <= 3) {
                    console.log(`⚠️ Linha ${lineNumber}: ${fields.length} campos (esperados ${expectedColumns})`);
                }
            }
            
            // Teste de formato numérico (campos específicos que devem ser números)
            const numericColumnIndices = [7, 13, 14, 15, 20, 21, 22, 23]; // duration_minutes, total_messages, etc.
            numericColumnIndices.forEach(colIndex => {
                if (colIndex < fields.length) {
                    const value = fields[colIndex];
                    if (value && value !== '' && isNaN(parseFloat(value))) {
                        numericFormatIssues++;
                        if (numericFormatIssues <= 3) {
                            console.log(`⚠️ Linha ${lineNumber}, Coluna ${colIndex + 1}: "${value}" não é numérico`);
                        }
                    }
                }
            });
        }
        
        // Teste de amostragem de dados
        console.log('\\n📋 AMOSTRA DE DADOS (3 registros):');
        for (let i = 0; i < Math.min(3, testLines.length); i++) {
            const fields = parseCSVLine(testLines[i]);
            console.log(`\\nRegistro ${i + 1}:`);
            console.log(`  Session ID: ${fields[0] || 'N/A'}`);
            console.log(`  Tenant: ${fields[1] || 'N/A'}`);
            console.log(`  Usuário: ${fields[4] || 'N/A'}`);
            console.log(`  Duração: ${fields[7] || 'N/A'} min`);
            console.log(`  Mensagens: ${fields[13] || 'N/A'}`);
            console.log(`  Outcome: ${fields[18] || 'N/A'}`);
        }
        
        // Estatísticas finais
        console.log('\\n📊 RESULTADOS DO TESTE:');
        console.log(`✅ Linhas processadas: ${testLines.length}`);
        console.log(`✅ Problemas estruturais: ${structuralIssues}`);
        console.log(`✅ Problemas numéricos: ${numericFormatIssues}`);
        
        // Teste de importação simulada
        console.log('\\n🚀 TESTE DE IMPORTAÇÃO SIMULADA:');
        let importSuccess = true;
        let importErrors = [];
        
        // Simular importação dos primeiros 5 registros
        for (let i = 0; i < Math.min(5, testLines.length); i++) {
            const fields = parseCSVLine(testLines[i]);
            
            try {
                // Teste de parsing de dados críticos
                const sessionId = fields[0];
                const duration = parseFloat(fields[7] || '0');
                const totalMessages = parseInt(fields[13] || '0');
                const apiCost = parseFloat(fields[22] || '0');
                
                if (!sessionId || sessionId.length < 10) {
                    throw new Error(`Session ID inválido: ${sessionId}`);
                }
                
                if (isNaN(duration) || duration < 0) {
                    throw new Error(`Duração inválida: ${fields[7]}`);
                }
                
                if (isNaN(totalMessages) || totalMessages < 0) {
                    throw new Error(`Total de mensagens inválido: ${fields[13]}`);
                }
                
                if (isNaN(apiCost) || apiCost < 0) {
                    throw new Error(`Custo API inválido: ${fields[22]}`);
                }
                
            } catch (error) {
                importSuccess = false;
                importErrors.push({
                    line: i + 2,
                    error: error.message
                });
            }
        }
        
        if (importSuccess) {
            console.log('✅ Importação simulada: SUCESSO');
        } else {
            console.log('❌ Importação simulada: FALHOU');
            importErrors.forEach(err => {
                console.log(`   Linha ${err.line}: ${err.error}`);
            });
        }
        
        // Resultado final
        const isUsable = structuralIssues === 0 && numericFormatIssues === 0 && importSuccess;
        
        console.log(`\\n🎯 USABILIDADE: ${isUsable ? '✅ APROVADO' : '❌ REPROVADO'}`);
        
        if (isUsable) {
            console.log('\\n🎉 CSV está estruturalmente correto e pronto para uso!');
            console.log('📈 Pode ser importado em Excel, Power BI, ou sistemas de análise.');
        } else {
            console.log('\\n⚠️ CSV possui problemas que impedem uso adequado.');
        }
        
        return {
            isUsable,
            totalLines: lines.length - 1,
            structuralIssues,
            numericFormatIssues,
            importSuccess,
            importErrors
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
    console.error('❌ Uso: node final-csv-validation.js <arquivo-csv>');
    process.exit(1);
}

const result = validateCsvUsability(args[0]);
process.exit(result.isUsable ? 0 : 1);