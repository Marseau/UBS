require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarSchemaPlatform() {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        const { data: sample } = await client
            .from('platform_metrics')  
            .select()
            .limit(1);
            
        if (sample && sample[0]) {
            console.log('🌐 COLUNAS REAIS da platform_metrics:');
            Object.keys(sample[0]).sort().forEach(col => {
                console.log('   ✅', col);
            });
            
            console.log('\n🔍 Verificando campos JSON específicos:');
            console.log('   comprehensive_metrics:', sample[0].comprehensive_metrics ? 'EXISTE' : 'NÃO EXISTE');
            console.log('   participation_metrics:', sample[0].participation_metrics ? 'EXISTE' : 'NÃO EXISTE');
            console.log('   ranking_metrics:', sample[0].ranking_metrics ? 'EXISTE' : 'NÃO EXISTE');
            console.log('   metric_data:', sample[0].hasOwnProperty('metric_data') ? 'EXISTE' : 'NÃO EXISTE');
        } else {
            console.log('❌ Nenhum registro encontrado');
        }
    } catch (error) {
        console.error('💥 Erro:', error.message);
    }
}

verificarSchemaPlatform().then(() => process.exit(0)).catch(console.error);