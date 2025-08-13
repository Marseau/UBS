require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarEstruturaReal() {
    console.log('🔍 VERIFICANDO ESTRUTURA REAL DA platform_metrics');
    console.log('='.repeat(60));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Buscar um registro atual
        const { data, error } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1)
            .single();
        
        if (error) {
            console.error('❌ Erro ao buscar dados:', error.message);
            return;
        }
        
        if (data) {
            console.log('📊 CAMPOS PRESENTES:');
            Object.keys(data).forEach((key, i) => {
                const type = typeof data[key];
                const isJson = type === 'object' && data[key] !== null;
                console.log(`   ${i+1}. ${key} (${type})${isJson ? ' 📄 JSON' : ''}`);
            });
            
            console.log('\n🎯 CAMPOS JSON IDENTIFICADOS:');
            const jsonFields = Object.keys(data).filter(key => typeof data[key] === 'object' && data[key] !== null);
            jsonFields.forEach((field, i) => {
                console.log(`   ${i+1}. ${field}`);
            });
            
            console.log(`\n📋 TOTAL: ${jsonFields.length} campos JSON`);
            
            if (jsonFields.length === 3) {
                console.log('\n❌ PROBLEMA CONFIRMADO: Temos apenas 3 campos JSON!');
                console.log('✅ ESPERADO: 4 campos JSON (comprehensive_metrics, participation_metrics, ranking_metrics, metric_data)');
                console.log('\n🚀 SOLUÇÃO: Precisamos adicionar o campo metric_data como 4º campo JSON');
                
                // Mostrar quais são os 3 campos atuais
                console.log('\n📋 CAMPOS JSON ATUAIS:');
                jsonFields.forEach(field => {
                    const keys = Object.keys(data[field] || {}).length;
                    console.log(`   • ${field}: ${keys} chaves`);
                });
            } else if (jsonFields.length === 4) {
                console.log('\n✅ ESTRUTURA CORRETA: 4 campos JSON presentes!');
            } else {
                console.log(`\n⚠️ ESTRUTURA INESPERADA: ${jsonFields.length} campos JSON`);
            }
        } else {
            console.log('❌ Nenhum registro encontrado na platform_metrics');
        }
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
    }
}

verificarEstruturaReal().catch(console.error);