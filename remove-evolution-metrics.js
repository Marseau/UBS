/**
 * Remove Evolution metrics from tenant_metrics table
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

async function removeEvolutionMetrics() {
    try {
        console.log('🗑️ REMOVENDO MÉTRICAS EVOLUTION');
        console.log('═'.repeat(50));
        
        // Check existing evolution metrics
        const { data: existingMetrics, error: countError } = await supabase
            .from('tenant_metrics')
            .select('id, tenant_id, period')
            .eq('metric_type', 'evolution');
        
        if (countError) {
            console.error('❌ Erro ao consultar metrics:', countError);
            return;
        }
        
        console.log(`📊 Encontradas ${existingMetrics?.length || 0} métricas evolution`);
        
        if (existingMetrics?.length > 0) {
            // Show what will be deleted
            console.log('\n📝 Métricas que serão removidas:');
            existingMetrics.forEach(metric => {
                console.log(`   - Tenant: ${metric.tenant_id.substring(0, 8)}, Period: ${metric.period}`);
            });
            
            // Delete evolution metrics
            const { error: deleteError } = await supabase
                .from('tenant_metrics')
                .delete()
                .eq('metric_type', 'evolution');
            
            if (deleteError) {
                console.error('❌ Erro ao remover evolution metrics:', deleteError);
                return;
            }
            
            console.log('\n✅ Métricas evolution removidas com sucesso da base de dados');
        } else {
            console.log('ℹ️ Nenhuma métrica evolution encontrada para remover');
        }
        
        // Verify removal
        const { data: remainingMetrics, error: verifyError } = await supabase
            .from('tenant_metrics')
            .select('id')
            .eq('metric_type', 'evolution');
        
        if (verifyError) {
            console.error('❌ Erro na verificação:', verifyError);
            return;
        }
        
        console.log(`\n🔍 Verificação: ${remainingMetrics?.length || 0} métricas evolution restantes`);
        console.log('✅ Limpeza concluída!');
        
    } catch (error) {
        console.error('❌ Erro geral:', error);
    }
}

removeEvolutionMetrics().catch(console.error);