const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function clearTenantMetrics() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('🧹 Limpando tabela tenant_metrics...');
    
    const { error } = await supabase
        .from('tenant_metrics')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        console.error('❌ Erro:', error);
        return;
    }

    console.log('✅ Tabela tenant_metrics limpa');
}

clearTenantMetrics();