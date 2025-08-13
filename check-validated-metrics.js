/**
 * Script para verificar se as métricas validadas estão sendo populadas
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function checkMetricsValidadas() {
    const client = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log('🔍 Verificando campo metricas_validadas na tabela tenant_metrics...\n');
    
    try {
        // Buscar algumas métricas recentes
        const { data, error } = await client
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at, metricas_validadas')
            .order('calculated_at', { ascending: false })
            .limit(10);
        
        if (error) {
            console.error('❌ Erro ao consultar tenant_metrics:', error.message);
            return;
        }
        
        if (!data || data.length === 0) {
            console.log('⚠️ Nenhuma métrica encontrada na tabela tenant_metrics');
            return;
        }
        
        console.log('📊 Últimas 10 métricas encontradas:');
        console.log('=====================================');
        
        let validatedCount = 0;
        let nullCount = 0;
        
        data.forEach((metric, index) => {
            const hasValidated = metric.metricas_validadas && 
                               Object.keys(metric.metricas_validadas).length > 0;
            
            if (hasValidated) validatedCount++;
            else nullCount++;
            
            console.log(`${index + 1}. Tenant: ${metric.tenant_id.substring(0, 8)}...`);
            console.log(`   Tipo: ${metric.metric_type}`);
            console.log(`   Período: ${metric.period}`);
            console.log(`   Data: ${new Date(metric.calculated_at).toLocaleString('pt-BR')}`);
            console.log(`   Métricas Validadas: ${hasValidated ? '✅ POPULADO' : '❌ NULO/VAZIO'}`);
            
            if (hasValidated) {
                const keys = Object.keys(metric.metricas_validadas);
                console.log(`   Chaves encontradas: ${keys.length} (${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''})`);
            }
            console.log('');
        });
        
        console.log('📈 RESUMO:');
        console.log(`   ✅ Com métricas validadas: ${validatedCount}`);
        console.log(`   ❌ Sem métricas validadas: ${nullCount}`);
        console.log(`   📊 Taxa de população: ${((validatedCount / data.length) * 100).toFixed(1)}%`);
        
        // Verificar se temos registros com metric_type = 'validated_metrics'
        const { data: validatedMetricsData } = await client
            .from('tenant_metrics')
            .select('count(*)')
            .eq('metric_type', 'validated_metrics');
            
        console.log('\n🔍 Verificando registros com metric_type = "validated_metrics":');
        console.log(`   Encontrados: ${validatedMetricsData ? validatedMetricsData[0].count : 0} registros`);
        
    } catch (error) {
        console.error('❌ Erro geral:', error.message);
    }
}

checkMetricsValidadas().catch(console.error);