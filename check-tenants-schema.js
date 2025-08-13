/**
 * Verificar Schema da Tabela Tenants
 */

require('dotenv').config();
const { getAdminClient } = require('./dist/config/database.js');

async function checkTenantsSchema() {
    console.log('🔍 VERIFICANDO SCHEMA DA TABELA TENANTS');
    console.log('=' .repeat(50));

    try {
        const supabase = getAdminClient();
        
        // Buscar um registro para ver os campos disponíveis
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('*')
            .limit(1);

        if (error) {
            throw new Error(`Erro: ${error.message}`);
        }

        if (tenants && tenants.length > 0) {
            console.log('📋 CAMPOS DISPONÍVEIS NA TABELA TENANTS:');
            console.log('-'.repeat(30));
            
            Object.keys(tenants[0]).forEach((field, index) => {
                console.log(`${index + 1}. ${field}: ${typeof tenants[0][field]} = ${tenants[0][field]}`);
            });
        } else {
            console.log('❌ Nenhum tenant encontrado');
        }

    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

checkTenantsSchema();