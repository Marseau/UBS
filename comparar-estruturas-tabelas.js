require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function compararEstruturas() {
    console.log('🔍 COMPARANDO ESTRUTURAS DAS TABELAS');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // Buscar tenant_metrics
        const { data: tenantSample } = await client
            .from('tenant_metrics')
            .select('*')
            .limit(1);
        
        // Buscar platform_metrics
        const { data: platformSample } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1);
        
        if (tenantSample && tenantSample[0] && platformSample && platformSample[0]) {
            const tenantFields = Object.keys(tenantSample[0]).sort();
            const platformFields = Object.keys(platformSample[0]).sort();
            
            console.log('📊 TENANT_METRICS tem', tenantFields.length, 'campos:');
            tenantFields.forEach(field => {
                console.log('   ✅', field);
            });
            
            console.log('\n🌐 PLATFORM_METRICS tem', platformFields.length, 'campos:');
            platformFields.forEach(field => {
                console.log('   ✅', field);
            });
            
            // Campos que estão em tenant_metrics mas não em platform_metrics
            const missingInPlatform = tenantFields.filter(field => !platformFields.includes(field));
            
            console.log('\n❌ CAMPOS FALTANDO EM PLATFORM_METRICS:', missingInPlatform.length);
            if (missingInPlatform.length > 0) {
                missingInPlatform.forEach(field => {
                    console.log('   🔴', field);
                });
                
                console.log('\n🔧 SQL PARA ADICIONAR OS CAMPOS FALTANTES:');
                console.log('ALTER TABLE platform_metrics');
                missingInPlatform.forEach((field, index) => {
                    let fieldType = 'JSONB'; // Default para campos JSON
                    if (field.includes('id')) fieldType = 'UUID';
                    else if (field.includes('date') || field.includes('at')) fieldType = 'TIMESTAMPTZ';
                    else if (field === 'metric_type' || field === 'period') fieldType = 'TEXT';
                    
                    const separator = index < missingInPlatform.length - 1 ? ',' : ';';
                    console.log(`ADD COLUMN ${field} ${fieldType}${separator}`);
                });
            } else {
                console.log('✅ Todas as estruturas estão sincronizadas!');
            }
            
            // Campos que estão em platform_metrics mas não em tenant_metrics  
            const extraInPlatform = platformFields.filter(field => !tenantFields.includes(field));
            
            console.log('\n➕ CAMPOS EXTRAS EM PLATFORM_METRICS:', extraInPlatform.length);
            if (extraInPlatform.length > 0) {
                extraInPlatform.forEach(field => {
                    console.log('   🔵', field);
                });
            }
            
        } else {
            console.log('❌ Não foi possível buscar amostras das tabelas');
        }
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
    }
}

compararEstruturas().then(() => process.exit(0)).catch(console.error);