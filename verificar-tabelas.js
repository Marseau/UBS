/**
 * VERIFICAR ESTRUTURA DAS TABELAS
 */

const { supabaseAdmin } = require('./dist/config/database.js');

async function verificarTabelas() {
    console.log('🔍 VERIFICANDO ESTRUTURA DAS TABELAS\n');
    
    try {
        // 1. Verificar service_categories
        console.log('1. SERVICE_CATEGORIES:');
        const { error: catError } = await supabaseAdmin
            .from('service_categories')
            .insert({})
            .select();
        console.log('   Erro:', catError?.message || 'N/A');
        
        // 2. Verificar services
        console.log('\n2. SERVICES:');
        const { error: srvError } = await supabaseAdmin
            .from('services')
            .insert({})
            .select();
        console.log('   Erro:', srvError?.message || 'N/A');
        
        // 3. Verificar conversation_history
        console.log('\n3. CONVERSATION_HISTORY:');
        const { error: convError } = await supabaseAdmin
            .from('conversation_history')
            .insert({})
            .select();
        console.log('   Erro:', convError?.message || 'N/A');
        
        // 4. Verificar appointments
        console.log('\n4. APPOINTMENTS:');
        const { error: aptError } = await supabaseAdmin
            .from('appointments')
            .insert({})
            .select();
        console.log('   Erro:', aptError?.message || 'N/A');
        
        // 5. Contar registros existentes
        console.log('\n📊 CONTAGEM ATUAL:');
        
        const tabelas = [
            'tenants',
            'professionals',
            'service_categories',
            'services',
            'users',
            'user_tenants',
            'conversation_history',
            'appointments'
        ];
        
        for (const tabela of tabelas) {
            const { count, error } = await supabaseAdmin
                .from(tabela)
                .select('*', { count: 'exact', head: true });
            
            if (!error) {
                console.log(`   ${tabela}: ${count || 0}`);
            } else {
                console.log(`   ${tabela}: ERRO - ${error.message}`);
            }
        }
        
    } catch (erro) {
        console.error('❌ Erro:', erro);
    }
}

// Executar
verificarTabelas()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('❌ Erro fatal:', err);
        process.exit(1);
    });