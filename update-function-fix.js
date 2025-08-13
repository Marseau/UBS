/**
 * Recria a função com correção do erro de status
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateFunction() {
    console.log('🔧 Recriando função com correção...\n');
    
    try {
        console.log('💡 Execute manualmente no Supabase SQL Editor:');
        console.log('📁 Arquivo: database/calculate-new-metrics-function.sql');
        console.log('🌐 Dashboard: https://supabase.com/dashboard/project/[projeto]/sql');
        console.log('\n⚠️  A função foi atualizada e precisa ser executada novamente');
        
        // Testar uma execução simples após a atualização
        console.log('\n🧪 Após atualizar, teste com:');
        console.log("SELECT * FROM calculate_new_metrics_system('2025-07-15', 30, NULL);");
        
    } catch (error) {
        console.error('❌ Erro:', error);
    }
}

updateFunction().catch(console.error);