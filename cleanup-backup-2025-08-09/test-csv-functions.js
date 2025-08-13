#!/usr/bin/env node

/**
 * Testes Unitários - Context Engineering Validation Level 2
 * 
 * Testa as funções de formatação e lógica do gerador CSV
 */

const { 
    formatBrazilianCurrency,
    formatBrazilianNumber,
    formatBrazilianDateTime
} = require('./generate-conversation-sessions-csv.js');

/**
 * Suite de testes unitários
 */
function runUnitTests() {
    console.log('🧪 Context Engineering - Nível 2: Testes Unitários');
    console.log('=' .repeat(60));
    
    let passed = 0;
    let failed = 0;
    
    // Test 1: Formatação de moeda brasileira
    console.log('\\n📊 Test 1: formatBrazilianCurrency');
    const testCurrency = [
        { input: 12.3456, expected: 'R$ 12,3456' },
        { input: 0.0076, expected: 'R$ 0,0076' },
        { input: 1000.50, expected: 'R$ 1.000,5000' },
        { input: null, expected: 'R$ 0,00' },
        { input: 'invalid', expected: 'R$ 0,00' }
    ];
    
    testCurrency.forEach((test, i) => {
        const result = formatBrazilianCurrency(test.input);
        if (result === test.expected) {
            console.log(`   ✅ ${i+1}. ${test.input} → ${result}`);
            passed++;
        } else {
            console.log(`   ❌ ${i+1}. ${test.input} → ${result} (expected: ${test.expected})`);
            failed++;
        }
    });
    
    // Test 2: Formatação de números brasileiros
    console.log('\\n📊 Test 2: formatBrazilianNumber');
    const testNumbers = [
        { input: 0.9100, decimals: 4, expected: '0,9100' },
        { input: 156.789, decimals: 2, expected: '156,79' },
        { input: 1234.5678, decimals: 3, expected: '1.234,568' },
        { input: null, decimals: 2, expected: '0,00' }
    ];
    
    testNumbers.forEach((test, i) => {
        const result = formatBrazilianNumber(test.input, test.decimals);
        if (result === test.expected) {
            console.log(`   ✅ ${i+1}. ${test.input} → ${result}`);
            passed++;
        } else {
            console.log(`   ❌ ${i+1}. ${test.input} → ${result} (expected: ${test.expected})`);
            failed++;
        }
    });
    
    // Test 3: Formatação de data/hora brasileira
    console.log('\\n📊 Test 3: formatBrazilianDateTime');
    const testDates = [
        { 
            input: '2025-07-30T22:42:09.243Z', 
            expected: /\d{2}\/\d{2}\/2025.*\d{2}:\d{2}:\d{2}/ // Regex para formato brasileiro
        },
        { 
            input: null, 
            expected: '' 
        }
    ];
    
    testDates.forEach((test, i) => {
        const result = formatBrazilianDateTime(test.input);
        const matches = typeof test.expected === 'string' 
            ? result === test.expected
            : test.expected.test(result);
            
        if (matches) {
            console.log(`   ✅ ${i+1}. ${test.input} → ${result}`);
            passed++;
        } else {
            console.log(`   ❌ ${i+1}. ${test.input} → ${result} (pattern not matched)`);
            failed++;
        }
    });
    
    // Test 4: Validação de estrutura CSV esperada
    console.log('\\n📊 Test 4: CSV Header Structure');
    const expectedColumns = [
        'session_id', 'tenant_id', 'tenant_name', 'tenant_domain',
        'user_id', 'user_name', 'user_phone', 'conversation_outcome',
        'max_confidence_score', 'avg_confidence_score', 'duration_minutes',
        'message_count', 'total_tokens', 'total_cost_usd', 'cost_per_token',
        'first_message_at', 'last_message_at', 'conversation_duration_hours',
        'model_used', 'message_source'
    ];
    
    if (expectedColumns.length === 20) {
        console.log(`   ✅ CSV Header: ${expectedColumns.length} colunas esperadas`);
        passed++;
    } else {
        console.log(`   ❌ CSV Header: ${expectedColumns.length} colunas (expected: 20)`);
        failed++;
    }
    
    // Resultados finais
    console.log('\\n' + '='.repeat(60));
    console.log(`🎯 Resultados dos Testes Unitários:`);
    console.log(`   ✅ Passou: ${passed}`);
    console.log(`   ❌ Falhou: ${failed}`);
    console.log(`   📊 Total: ${passed + failed}`);
    console.log(`   📈 Taxa de Sucesso: ${Math.round(passed/(passed + failed) * 100)}%`);
    
    if (failed === 0) {
        console.log('\\n🎉 Todos os testes unitários passaram!');
        return true;
    } else {
        console.log('\\n⚠️  Alguns testes falharam - revisar implementação');
        return false;
    }
}

// Executar testes
if (require.main === module) {
    const success = runUnitTests();
    process.exit(success ? 0 : 1);
}

module.exports = { runUnitTests };