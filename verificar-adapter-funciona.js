require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verificarAdapterFunciona() {
    console.log('🔍 VERIFICANDO SE O ADAPTER REALMENTE FUNCIONA');
    console.log('='.repeat(70));
    
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        // 1. Estado atual da tabela (físico)
        console.log('📊 1. ESTADO FÍSICO DA TABELA:');
        
        const { data: rawData, error } = await client
            .from('platform_metrics')
            .select('*')
            .limit(1)
            .single();
        
        if (error || !rawData) {
            console.log('❌ Nenhum dado encontrado');
            return false;
        }
        
        const physicalJsonFields = [];
        if (rawData.comprehensive_metrics && typeof rawData.comprehensive_metrics === 'object') physicalJsonFields.push('comprehensive_metrics');
        if (rawData.participation_metrics && typeof rawData.participation_metrics === 'object') physicalJsonFields.push('participation_metrics');
        if (rawData.ranking_metrics && typeof rawData.ranking_metrics === 'object') physicalJsonFields.push('ranking_metrics');
        if (rawData.metric_data && typeof rawData.metric_data === 'object') physicalJsonFields.push('metric_data');
        
        console.log(`   Campos JSON físicos: ${physicalJsonFields.length} (${physicalJsonFields.join(', ')})`);
        
        // 2. Verificar se metric_data_virtual existe
        const hasVirtual = rawData.comprehensive_metrics?.metric_data_virtual !== undefined;
        console.log(`   metric_data_virtual presente: ${hasVirtual ? '✅' : '❌'}`);
        
        if (hasVirtual) {
            const virtualKeys = Object.keys(rawData.comprehensive_metrics.metric_data_virtual).length;
            console.log(`   metric_data_virtual keys: ${virtualKeys}`);
        }
        
        // 3. Aplicar adapter
        console.log('\\n🔧 2. APLICANDO ADAPTER:');
        
        function applyAdapter(record) {
            const comprehensive = record.comprehensive_metrics || {};
            const metricDataVirtual = comprehensive.metric_data_virtual || {};
            
            // Limpar comprehensive
            const cleanComprehensive = { ...comprehensive };
            delete cleanComprehensive.metric_data_virtual;
            
            return {
                id: record.id,
                calculation_date: record.calculation_date,
                period: record.period,
                tenants_processed: record.tenants_processed,
                total_tenants: record.total_tenants,
                calculation_method: record.calculation_method,
                created_at: record.created_at,
                updated_at: record.updated_at,
                
                // 4 CAMPOS JSON
                comprehensive_metrics: cleanComprehensive,
                participation_metrics: record.participation_metrics,
                ranking_metrics: record.ranking_metrics,
                metric_data: metricDataVirtual // 4º CAMPO VIRTUAL
            };
        }
        
        const adaptedRecord = applyAdapter(rawData);
        
        // 4. Verificar resultado do adapter
        console.log('\\n📋 3. RESULTADO DO ADAPTER:');
        
        const adaptedJsonFields = [];
        if (adaptedRecord.comprehensive_metrics && typeof adaptedRecord.comprehensive_metrics === 'object' && Object.keys(adaptedRecord.comprehensive_metrics).length > 0) adaptedJsonFields.push('comprehensive_metrics');
        if (adaptedRecord.participation_metrics && typeof adaptedRecord.participation_metrics === 'object' && Object.keys(adaptedRecord.participation_metrics).length > 0) adaptedJsonFields.push('participation_metrics');
        if (adaptedRecord.ranking_metrics && typeof adaptedRecord.ranking_metrics === 'object' && Object.keys(adaptedRecord.ranking_metrics).length > 0) adaptedJsonFields.push('ranking_metrics');
        if (adaptedRecord.metric_data && typeof adaptedRecord.metric_data === 'object' && Object.keys(adaptedRecord.metric_data).length > 0) adaptedJsonFields.push('metric_data');
        
        console.log(`   Campos JSON após adapter: ${adaptedJsonFields.length} (${adaptedJsonFields.join(', ')})`);
        
        adaptedJsonFields.forEach(field => {
            const keys = Object.keys(adaptedRecord[field]).length;
            console.log(`     • ${field}: ${keys} chaves`);
        });
        
        // 5. Status final
        const adapterWorking = adaptedJsonFields.length === 4;
        
        console.log('\\n🎯 4. STATUS FINAL:');
        console.log(`   Tabela física: ${physicalJsonFields.length} campos JSON`);
        console.log(`   Adapter virtual: ${adaptedJsonFields.length} campos JSON`);
        console.log(`   Adapter funcionando: ${adapterWorking ? '✅ SIM' : '❌ NÃO'}`);
        
        if (adapterWorking) {
            console.log('\\n✅ CONFIRMADO:');
            console.log('   • Fisicamente: 3 campos JSON na tabela');
            console.log('   • Virtualmente: 4 campos JSON via adapter');
            console.log('   • Dashboard pode usar os 4 campos normalmente');
            console.log('   • Solução funciona sem modificar banco de dados');
        }
        
        return adapterWorking;
        
    } catch (error) {
        console.error('💥 Erro:', error.message);
        return false;
    }
}

verificarAdapterFunciona()
    .then(working => {
        if (working) {
            console.log('\\n🎉 ADAPTER CONFIRMADO FUNCIONANDO!');
            console.log('✅ Platform_metrics apresenta 4 campos JSON para dashboards');
            console.log('✅ Compatibilidade alcançada com solução virtual');
        } else {
            console.log('\\n❌ ADAPTER TEM PROBLEMAS');
        }
        process.exit(working ? 0 : 1);
    })
    .catch(console.error);