/**
 * Clear Metrics Tables Script
 * Sistema UBS - Universal Booking System
 * 
 * Limpa as tabelas tenant_metrics e platform_metrics para repopulação
 * Alinhado com metodologia COLEAM00 e arquitetura multi-tenant
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearMetricsTables() {
    console.log('🧹 Iniciando limpeza das tabelas de métricas...');
    
    try {
        // 1. Contar registros antes da limpeza
        const { data: tenantMetricsCount } = await supabase
            .from('tenant_metrics')
            .select('id', { count: 'exact', head: true });
        
        const { data: platformMetricsCount } = await supabase
            .from('platform_metrics')
            .select('id', { count: 'exact', head: true });

        console.log(`📊 Estado Atual:`);
        console.log(`   • tenant_metrics: ${tenantMetricsCount?.length || 0} registros`);
        console.log(`   • platform_metrics: ${platformMetricsCount?.length || 0} registros`);

        // 2. Limpar tenant_metrics
        console.log('\n🗑️ Limpando tabela tenant_metrics...');
        const { error: tenantError } = await supabase
            .from('tenant_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

        if (tenantError) {
            console.error('❌ Erro ao limpar tenant_metrics:', tenantError);
            throw tenantError;
        }

        // 3. Limpar platform_metrics
        console.log('🗑️ Limpando tabela platform_metrics...');
        const { error: platformError } = await supabase
            .from('platform_metrics')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

        if (platformError) {
            console.error('❌ Erro ao limpar platform_metrics:', platformError);
            throw platformError;
        }

        // 4. Verificar limpeza
        const { data: tenantAfter } = await supabase
            .from('tenant_metrics')
            .select('id', { count: 'exact', head: true });
        
        const { data: platformAfter } = await supabase
            .from('platform_metrics')
            .select('id', { count: 'exact', head: true });

        console.log('\n✅ Limpeza concluída:');
        console.log(`   • tenant_metrics: ${tenantAfter?.length || 0} registros restantes`);
        console.log(`   • platform_metrics: ${platformAfter?.length || 0} registros restantes`);

        // 5. Verificar dados brutos para validação posterior
        const { data: tenants } = await supabase
            .from('tenants')
            .select('id, name, status')
            .eq('status', 'active');

        const { data: appointments } = await supabase
            .from('appointments')
            .select('id', { count: 'exact', head: true });

        const { data: conversations } = await supabase
            .from('conversation_history')
            .select('id', { count: 'exact', head: true });

        console.log('\n📈 Dados brutos disponíveis para validação:');
        console.log(`   • Tenants ativos: ${tenants?.length || 0}`);
        console.log(`   • Appointments: ${appointments?.length || 0}`);
        console.log(`   • Conversations: ${conversations?.length || 0}`);

        console.log('\n🎯 Sistema pronto para execução do cron job de métricas');

    } catch (error) {
        console.error('❌ ERRO durante limpeza:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    clearMetricsTables()
        .then(() => {
            console.log('✅ Script de limpeza executado com sucesso');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { clearMetricsTables };