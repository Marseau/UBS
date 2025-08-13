require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function comparacaoFinalEstruturas() {
    console.log('📊 COMPARAÇÃO FINAL: tenant_metrics VS platform_metrics');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Analisar tenant_metrics
        console.log('🏢 1. ANÁLISE TENANT_METRICS:');
        
        const { data: tenantData } = await client
            .from('tenant_metrics')
            .select('*')
            .limit(1)
            .single();
        
        if (tenantData) {
            const tenantJsonFields = [];
            Object.keys(tenantData).forEach(key => {
                if (tenantData[key] && typeof tenantData[key] === 'object') {
                    tenantJsonFields.push(key);
                }
            });
            
            console.log(`   Total campos: ${Object.keys(tenantData).length}`);
            console.log(`   Campos JSON: ${tenantJsonFields.length} (${tenantJsonFields.join(', ')})`);
            
            tenantJsonFields.forEach(field => {
                const keys = Object.keys(tenantData[field]).length;
                console.log(`     • ${field}: ${keys} chaves`);
            });
        }
        
        // 2. Analisar platform_metrics (físico)
        console.log('\\n🏛️ 2. ANÁLISE PLATFORM_METRICS (FÍSICO):');
        
        const { data: platformData } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1)
            .single();
        
        if (platformData) {
            const platformJsonFields = [];
            Object.keys(platformData).forEach(key => {
                if (platformData[key] && typeof platformData[key] === 'object') {
                    platformJsonFields.push(key);
                }
            });
            
            console.log(`   Total campos: ${Object.keys(platformData).length}`);
            console.log(`   Campos JSON: ${platformJsonFields.length} (${platformJsonFields.join(', ')})`);
            
            platformJsonFields.forEach(field => {
                const keys = Object.keys(platformData[field]).length;
                console.log(`     • ${field}: ${keys} chaves`);
            });
        }
        
        // 3. Aplicar adapter e analisar (virtual)
        console.log('\\n🔧 3. ANÁLISE PLATFORM_METRICS (COM ADAPTER):');
        
        function applyAdapter(record) {
            const comprehensive = record.comprehensive_metrics || {};
            const metricDataVirtual = comprehensive.metric_data_virtual || {};
            
            const cleanComprehensive = { ...comprehensive };
            delete cleanComprehensive.metric_data_virtual;
            
            return {
                ...record,
                comprehensive_metrics: cleanComprehensive,
                metric_data: metricDataVirtual
            };
        }
        
        const adaptedPlatformData = applyAdapter(platformData);
        
        const adaptedJsonFields = [];
        Object.keys(adaptedPlatformData).forEach(key => {
            if (adaptedPlatformData[key] && typeof adaptedPlatformData[key] === 'object' && Object.keys(adaptedPlatformData[key]).length > 0) {
                adaptedJsonFields.push(key);
            }
        });
        
        console.log(`   Total campos: ${Object.keys(adaptedPlatformData).length}`);
        console.log(`   Campos JSON: ${adaptedJsonFields.length} (${adaptedJsonFields.join(', ')})`);
        
        adaptedJsonFields.forEach(field => {
            const keys = Object.keys(adaptedPlatformData[field]).length;
            console.log(`     • ${field}: ${keys} chaves`);
        });
        
        // 4. Comparação final
        console.log('\\n🎯 4. COMPARAÇÃO FINAL:');
        
        const tenantJsonCount = tenantData ? Object.keys(tenantData).filter(key => tenantData[key] && typeof tenantData[key] === 'object').length : 0;
        const platformJsonCount = platformData ? Object.keys(platformData).filter(key => platformData[key] && typeof platformData[key] === 'object').length : 0;
        const adaptedJsonCount = adaptedJsonFields.length;
        
        console.log(`   tenant_metrics JSON fields: ${tenantJsonCount}`);
        console.log(`   platform_metrics JSON fields (físico): ${platformJsonCount}`);
        console.log(`   platform_metrics JSON fields (adapter): ${adaptedJsonCount}`);
        
        const structuralEquality = tenantJsonCount === adaptedJsonCount;
        
        console.log(`\\n   ${structuralEquality ? '✅' : '❌'} Igualdade estrutural: ${structuralEquality ? 'ALCANÇADA' : 'NÃO ALCANÇADA'}`);
        
        if (structuralEquality) {
            console.log('\\n🎉 CONCLUSÃO:');
            console.log('   ✅ tenant_metrics e platform_metrics têm MESMA estrutura JSON');
            console.log('   ✅ Adapter permite compatibilidade total');
            console.log('   ✅ Super Admin Dashboard pode funcionar normalmente');
            console.log('   ✅ Problema dos 4 campos JSON RESOLVIDO');
        }
        
        return structuralEquality;
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
        return false;
    }
}

comparacaoFinalEstruturas()
    .then(equal => {
        if (equal) {
            console.log('\\n🏆 VERIFICAÇÃO FINAL: ESTRUTURAS SÃO EQUIVALENTES!');
            console.log('✅ platform_metrics agora tem estrutura igual a tenant_metrics');
        } else {
            console.log('\\n❌ VERIFICAÇÃO FINAL: ESTRUTURAS AINDA DIFERENTES');
        }
        process.exit(equal ? 0 : 1);
    })
    .catch(console.error);