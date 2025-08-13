/**
 * Aplicar formatação brasileira SELETIVA no CSV
 * Trocar pontos por vírgulas APENAS nos campos numéricos específicos
 */

const fs = require('fs');

function applyBrazilianFormattingSelective(inputFile) {
    console.log('🇧🇷 Aplicando formatação brasileira seletiva...');
    
    const content = fs.readFileSync(inputFile, 'utf8');
    const lines = content.split('\n');
    
    console.log(`📄 Processando ${lines.length} linhas...`);
    
    const processedLines = lines.map((line, index) => {
        if (index === 0 || line.trim() === '') return line; // Header ou linha vazia
        
        const fields = line.split(',');
        
        if (fields.length === 17) {
            // Aplicar formatação brasileira APENAS nos campos numéricos específicos:
            // Campo 6: duration_minutes
            // Campo 9: total_api_cost_usd  
            // Campo 10: total_processing_cost_usd
            // Campo 11: total_cost_usd
            // Campo 15: avg_confidence_score
            
            if (fields[6] && fields[6].includes('.')) {
                fields[6] = fields[6].replace('.', ',');
            }
            
            if (fields[9] && fields[9].includes('.')) {
                fields[9] = fields[9].replace('.', ',');
            }
            
            if (fields[10] && fields[10].includes('.')) {
                fields[10] = fields[10].replace('.', ',');
            }
            
            if (fields[11] && fields[11].includes('.')) {
                fields[11] = fields[11].replace('.', ',');
            }
            
            if (fields[15] && fields[15].includes('.')) {
                fields[15] = fields[15].replace('.', ',');
            }
        }
        
        return fields.join(',');
    });
    
    const outputFile = inputFile.replace('standard', 'brazilian-corrected');
    fs.writeFileSync(outputFile, processedLines.join('\n'), 'utf8');
    
    console.log(`✅ Arquivo brasileiro gerado: ${outputFile}`);
    
    return outputFile;
}

function validateBrazilianCSV(filename) {
    console.log('🔍 Validação do CSV brasileiro...');
    
    const content = fs.readFileSync(filename, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📄 Total de linhas: ${lines.length}`);
    
    // Verificar estrutura das primeiras 3 linhas
    let isValid = true;
    
    for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
        const fields = lines[i].split(',');
        console.log(`📊 Linha ${i}: ${fields.length} campos`);
        
        if (fields.length !== 17) {
            isValid = false;
        }
        
        console.log(`   Session: ${fields[0]}`);
        console.log(`   Duration: ${fields[6]} min`);
        console.log(`   Messages: ${fields[7]} msgs`);
        console.log(`   API Cost: ${fields[9]}`);
        console.log(`   Confidence: ${fields[15]}`);
        console.log(`   Outcomes: ${fields[16]}`);
    }
    
    return {
        isValid,
        totalLines: lines.length - 1,
        expectedLines: 1041
    };
}

async function main() {
    try {
        console.log('🎯 Aplicação de Formatação Brasileira');
        console.log('='.repeat(40));
        
        const inputFile = 'conversations-standard-2025-08-01T17-16-56.csv';
        
        if (!fs.existsSync(inputFile)) {
            console.error(`❌ Arquivo não encontrado: ${inputFile}`);
            process.exit(1);
        }
        
        const brazilianFile = applyBrazilianFormattingSelective(inputFile);
        const validation = validateBrazilianCSV(brazilianFile);
        
        console.log('\n📋 RESULTADO FINAL');
        console.log('='.repeat(30));
        console.log(`✅ Arquivo brasileiro: ${brazilianFile}`);
        console.log(`✅ Linhas: ${validation.totalLines} (esperado: ${validation.expectedLines})`);
        console.log(`✅ Estrutura válida: ${validation.isValid ? 'SIM' : 'NÃO'}`);
        
        if (validation.isValid && validation.totalLines === validation.expectedLines) {
            console.log('\n🎉 SUCCESS! CSV BRASILEIRO CORRETO!');
            console.log('✅ 1041 conversas');
            console.log('✅ 17 campos por linha');
            console.log('✅ Formatação brasileira aplicada nos campos corretos');
            console.log('✅ conversation_outcomes na posição 17');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { applyBrazilianFormattingSelective, validateBrazilianCSV };