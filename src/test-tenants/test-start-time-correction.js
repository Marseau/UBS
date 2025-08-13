#!/usr/bin/env node
/**
 * TESTE REAL DA CORREÇÃO start_time
 * Verificar se as correções estão funcionando
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testarCorrecaoReal() {
    console.log('🧪 TESTE REAL DA CORREÇÃO start_time');
    console.log('='.repeat(40));
    
    try {
        // Pegar um tenant real primeiro
        const { data: tenants } = await adminClient
            .from('tenants')
            .select('id')
            .limit(1);
            
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant encontrado');
            return;
        }
        
        const tenantId = tenants[0].id;
        const periodDays = 30;
        
        const currentPeriodEnd = new Date();
        const currentPeriodStart = new Date(currentPeriodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);
        
        console.log(`\nTenant: ${tenantId.substring(0, 8)}...`);
        console.log(`Período: ${currentPeriodStart.toISOString().substring(0, 10)} até ${currentPeriodEnd.toISOString().substring(0, 10)}`);
        
        // Query usando start_time (como corrigido)
        const { data: appointmentsStartTime, error: errorStart } = await adminClient
            .from('appointments')
            .select('final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('start_time', currentPeriodStart.toISOString())
            .lte('start_time', currentPeriodEnd.toISOString());
        
        console.log('\n📊 RESULTADO COM start_time (CORRIGIDO):');
        if (errorStart) {
            console.log('❌ Erro:', errorStart.message);
        } else {
            const countStart = appointmentsStartTime?.length || 0;
            const revenueStart = appointmentsStartTime?.reduce((sum, apt) => sum + (apt.quoted_price || apt.final_price || 0), 0) || 0;
            console.log(`   Appointments: ${countStart}`);
            console.log(`   Revenue: R$ ${revenueStart.toFixed(2)}`);
        }
        
        // Query usando created_at (método antigo para comparação)
        const { data: appointmentsCreatedAt, error: errorCreated } = await adminClient
            .from('appointments')
            .select('final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('created_at', currentPeriodStart.toISOString())
            .lte('created_at', currentPeriodEnd.toISOString());
        
        console.log('\n📊 COMPARAÇÃO COM created_at (ANTIGO):');
        if (errorCreated) {
            console.log('❌ Erro:', errorCreated.message);
        } else {
            const countCreated = appointmentsCreatedAt?.length || 0;
            const revenueCreated = appointmentsCreatedAt?.reduce((sum, apt) => sum + (apt.quoted_price || apt.final_price || 0), 0) || 0;
            console.log(`   Appointments: ${countCreated}`);
            console.log(`   Revenue: R$ ${revenueCreated.toFixed(2)}`);
        }
        
        // Verificar qual método o cron está usando agora
        console.log('\n🔍 VERIFICANDO MÉTRICAS CALCULADAS:');
        const { data: metrics } = await adminClient
            .from('tenant_metrics')
            .select('metric_data')
            .eq('tenant_id', tenantId)
            .eq('metric_type', 'business_dashboard')
            .eq('period', '30d')
            .order('calculated_at', { ascending: false })
            .limit(1);
            
        if (metrics && metrics.length > 0) {
            const metric = metrics[0];
            const calculatedRevenue = metric.metric_data?.monthly_revenue?.value || 0;
            console.log(`   Revenue nas métricas: R$ ${calculatedRevenue.toFixed(2)}`);
            
            // Comparar com os valores reais
            const revenueStart = appointmentsStartTime?.reduce((sum, apt) => sum + (apt.quoted_price || apt.final_price || 0), 0) || 0;
            const revenueCreated = appointmentsCreatedAt?.reduce((sum, apt) => sum + (apt.quoted_price || apt.final_price || 0), 0) || 0;
            
            if (Math.abs(calculatedRevenue - revenueStart) < Math.abs(calculatedRevenue - revenueCreated)) {
                console.log('   ✅ Cron está usando start_time (CORRETO)');
            } else {
                console.log('   ❌ Cron ainda está usando created_at (INCORRETO)');
            }
        } else {
            console.log('   ⚠️ Nenhuma métrica encontrada para este tenant');
        }
        
    } catch (error) {
        console.error('💥 Erro no teste:', error.message);
    }
}

testarCorrecaoReal()
    .then(() => {
        console.log('\n✅ Teste concluído');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Erro fatal:', error.message);
        process.exit(1);
    });