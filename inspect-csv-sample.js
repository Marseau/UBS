/**
 * Inspecionar amostra do CSV para verificar formatação
 */

require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');

function readCsvSample(filename, limit = 5) {
    return new Promise((resolve, reject) => {
        const results = [];
        let count = 0;
        
        fs.createReadStream(filename)
            .pipe(csv())
            .on('data', (data) => {
                if (count < limit) {
                    results.push(data);
                    count++;
                }
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

async function main() {
    try {
        const csvFilename = 'appointments-complete-2025-08-01T12-23-48.csv';
        console.log(`📖 Lendo amostra do CSV: ${csvFilename}...`);
        
        const sample = await readCsvSample(csvFilename, 3);
        
        console.log('📊 AMOSTRA DO CSV (3 primeiros registros):');
        console.log('='.repeat(80));
        
        sample.forEach((row, i) => {
            console.log(`\n📝 REGISTRO ${i + 1}:`);
            console.log(`   ID: ${row.appointment_id}`);
            console.log(`   Tenant: ${row.tenant_name}`);
            console.log(`   Domínio: ${row.business_domain}`);
            console.log(`   Usuário: ${row.user_name} (${row.user_phone})`);
            console.log(`   Serviço: ${row.service_name}`);
            console.log(`   Status: ${row.status}`);
            console.log(`   Preço cotado: "${row.quoted_price}"`);
            console.log(`   Preço final: "${row.final_price}"`);
            console.log(`   Preço efetivo: "${row.effective_price}"`);
            console.log(`   Conversa ID: ${row.conversation_id}`);
            console.log(`   Data início: ${row.start_time}`);
            console.log(`   Duração: ${row.duration_minutes}`);
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

main();