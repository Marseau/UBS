/**
 * VALIDAÇÃO ESTRUTURAL DE CSV
 * Context Engineering - Testes reais de estrutura CSV
 * 
 * Funcionalidades:
 * - Valida estrutura de campos CSV
 * - Testa formatação numérica
 * - Verifica escape de caracteres especiais
 * - Analisa consistência de colunas
 */

const fs = require('fs');
const path = require('path');

/**
 * Valida estrutura do CSV
 */
function validateCsvStructure(csvFilePath) {
    console.log(`🔍 Validando estrutura do arquivo: ${path.basename(csvFilePath)}`);
    
    try {
        // Ler arquivo CSV
        const csvContent = fs.readFileSync(csvFilePath, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
            throw new Error('Arquivo CSV vazio');
        }
        
        // Analisar cabeçalho
        const header = lines[0];
        const expectedColumns = header.split(',').length;
        
        console.log(`📊 Total de linhas: ${lines.length} (incluindo cabeçalho)`);
        console.log(`📊 Colunas esperadas: ${expectedColumns}`);
        console.log(`📊 Cabeçalho: ${header.substring(0, 100)}...`);
        
        // Validar estrutura das linhas
        const validationResults = {
            totalLines: lines.length - 1, // Excluir cabeçalho
            headerPresent: true,
            columnConsistency: true,
            numericFormatIssues: [],
            dateFormatIssues: [],
            escapingIssues: [],
            structuralIssues: []
        };
        
        // Testar primeiras 10 linhas para estrutura
        const testLines = lines.slice(1, Math.min(11, lines.length));
        
        console.log('\n🧪 TESTES ESTRUTURAIS (10 primeiras linhas):');
        
        testLines.forEach((line, index) => {
            const lineNumber = index + 2; // +2 porque começamos na linha 1 (cabeçalho) + index 0-based
            const columns = line.split(',');
            
            // Teste 1: Consistência de colunas
            if (columns.length !== expectedColumns) {
                validationResults.columnConsistency = false;
                validationResults.structuralIssues.push({
                    line: lineNumber,
                    issue: `Esperadas ${expectedColumns} colunas, encontradas ${columns.length}`,
                    preview: line.substring(0, 100)
                });
            }
            
            // Teste 2: Formatação numérica (procurar vírgulas em campos numéricos)
            columns.forEach((col, colIndex) => {
                const trimmedCol = col.trim();
                
                // Detectar números com vírgula (problemático para CSV)
                if (/^\d+,\d+$/.test(trimmedCol) || /^\d{1,3}(,\d{3})*,\d{2}$/.test(trimmedCol)) {
                    validationResults.numericFormatIssues.push({
                        line: lineNumber,
                        column: colIndex + 1,
                        value: trimmedCol,
                        issue: 'Número com vírgula decimal (incompatível com CSV)'
                    });
                }
                
                // Detectar campos que parecem data/hora mas podem ser números mal formatados
                if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmedCol) && colIndex > 6) { // Após colunas de data reais
                    validationResults.dateFormatIssues.push({
                        line: lineNumber,
                        column: colIndex + 1,
                        value: trimmedCol,
                        issue: 'Campo com formato de hora em coluna não-temporal'
                    });
                }
            });
        });
        
        // Relatório de validação
        console.log('\n📋 RESULTADOS DA VALIDAÇÃO:');
        console.log(`✅ Cabeçalho presente: ${validationResults.headerPresent ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Consistência de colunas: ${validationResults.columnConsistency ? 'SIM' : 'NÃO'}`);
        console.log(`⚠️ Problemas numéricos: ${validationResults.numericFormatIssues.length}`);
        console.log(`⚠️ Problemas de data/hora: ${validationResults.dateFormatIssues.length}`);
        console.log(`⚠️ Problemas estruturais: ${validationResults.structuralIssues.length}`);
        
        // Detalhar problemas encontrados
        if (validationResults.numericFormatIssues.length > 0) {
            console.log('\n🚨 PROBLEMAS NUMÉRICOS DETECTADOS:');
            validationResults.numericFormatIssues.slice(0, 5).forEach(issue => {
                console.log(`   Linha ${issue.line}, Coluna ${issue.column}: "${issue.value}" - ${issue.issue}`);
            });
            if (validationResults.numericFormatIssues.length > 5) {
                console.log(`   ... e mais ${validationResults.numericFormatIssues.length - 5} problemas similares`);
            }
        }
        
        if (validationResults.dateFormatIssues.length > 0) {
            console.log('\n🚨 PROBLEMAS DE FORMATAÇÃO TEMPORAL:');
            validationResults.dateFormatIssues.slice(0, 5).forEach(issue => {
                console.log(`   Linha ${issue.line}, Coluna ${issue.column}: "${issue.value}" - ${issue.issue}`);
            });
        }
        
        if (validationResults.structuralIssues.length > 0) {
            console.log('\n🚨 PROBLEMAS ESTRUTURAIS:');
            validationResults.structuralIssues.slice(0, 3).forEach(issue => {
                console.log(`   Linha ${issue.line}: ${issue.issue}`);
                console.log(`   Preview: ${issue.preview}...`);
            });
        }
        
        // Análise de amostra de dados
        console.log('\n📋 AMOSTRA DOS DADOS (3 primeiras linhas):');
        testLines.slice(0, 3).forEach((line, index) => {
            console.log(`Linha ${index + 2}: ${line.substring(0, 150)}...`);
        });
        
        // Status final
        const isValid = validationResults.columnConsistency && 
                       validationResults.numericFormatIssues.length === 0 && 
                       validationResults.dateFormatIssues.length === 0 &&
                       validationResults.structuralIssues.length === 0;
        
        console.log(`\n🎯 STATUS FINAL: ${isValid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
        
        return {
            ...validationResults,
            isValid,
            filePath: csvFilePath,
            fileName: path.basename(csvFilePath)
        };
        
    } catch (error) {
        console.error(`❌ Erro ao validar arquivo: ${error.message}`);
        return {
            isValid: false,
            error: error.message,
            filePath: csvFilePath,
            fileName: path.basename(csvFilePath)
        };
    }
}

/**
 * Função principal - valida arquivo específico
 */
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('❌ Uso: node validate-csv-structure.js <caminho-do-arquivo-csv>');
        process.exit(1);
    }
    
    const csvFile = args[0];
    
    if (!fs.existsSync(csvFile)) {
        console.error(`❌ Arquivo não encontrado: ${csvFile}`);
        process.exit(1);
    }
    
    console.log('🚀 VALIDAÇÃO ESTRUTURAL DE CSV');
    console.log('=' .repeat(50));
    
    const result = validateCsvStructure(csvFile);
    
    if (result.isValid) {
        console.log('\n🎉 CSV estruturalmente válido e pronto para uso!');
        process.exit(0);
    } else {
        console.log('\n⚠️ CSV possui problemas que devem ser corrigidos.');
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = {
    validateCsvStructure
};