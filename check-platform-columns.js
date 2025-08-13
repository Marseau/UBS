require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPlatformColumns() {
    console.log('🔍 VERIFICANDO COLUNAS DA TABELA PLATFORM_METRICS');
    console.log('='.repeat(60));
    
    try {
        const { data, error } = await supabase
            .from('platform_metrics')
            .select('*')
            .limit(1);
        
        if (error) {
            console.log('❌ Erro:', error.message);
            return;
        }
        
        if (data.length > 0) {
            console.log('✅ Colunas encontradas:');
            Object.keys(data[0]).forEach(col => {
                console.log(`   • ${col}`);
            });
            
            console.log('\n📊 EXEMPLO DE DADOS:');
            console.log(JSON.stringify(data[0], null, 2));
        } else {
            console.log('⚠️ Tabela vazia');
        }
        
    } catch (err) {
        console.log('❌ Erro:', err.message);
    }
}

checkPlatformColumns().catch(console.error);