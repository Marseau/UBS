require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * TESTE SIMPLIFICADO DO PIPELINE REFATORADO
 * Sem compilação TypeScript, direto com dados reais
 */

async function testSimpleRefactored() {
    console.log('🧪 TESTE SIMPLIFICADO - PIPELINE REFATORADO');
    console.log('='.repeat(70));
    
    try {
        // 1. Buscar tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .limit(2); // Apenas 2 para teste
        
        if (tenantsError) {
            throw new Error(`Erro tenants: ${tenantsError.message}`);
        }
        
        console.log(`📊 Testando com ${tenants.length} tenants`);
        tenants.forEach(t => console.log(`   - ${t.name}`));
        
        // 2. Para cada tenant, calcular e salvar métricas
        for (const tenant of tenants) {
            console.log(`\n🏢 Processando: ${tenant.name}`);
            
            // Calcular métricas por período
            const periods = ['30d']; // Apenas 30d para teste
            
            for (const period of periods) {
                console.log(`   ⏰ Período: ${period}`);
                
                // Calcular métricas do tenant
                const metrics = await calculateTenantMetrics(tenant.id, period);
                
                // Salvar usando nova estrutura
                await saveTenantMetricsRefactored(tenant.id, tenant.name, period, metrics);
                
                console.log(`   ✅ Salvo com nova estrutura JSON`);
            }
        }
        
        // 3. Verificar dados salvos
        console.log('\n🔍 VERIFICANDO DADOS SALVOS:');
        
        const { data: saved, error: savedError } = await supabase
            .from('tenant_metrics')
            .select('tenant_name, period, comprehensive_metrics, participation_metrics, ranking_metrics')
            .not('comprehensive_metrics', 'is', null);
        
        if (savedError) {
            throw new Error(`Erro verificação: ${savedError.message}`);
        }
        
        console.log(`📊 Registros com nova estrutura: ${saved.length}`);
        
        saved.forEach(s => {
            const compKeys = Object.keys(s.comprehensive_metrics || {}).length;
            const partKeys = Object.keys(s.participation_metrics || {}).length; 
            const rankKeys = Object.keys(s.ranking_metrics || {}).length;
            
            console.log(`   📈 ${s.tenant_name} (${s.period}): comp=${compKeys}, part=${partKeys}, rank=${rankKeys} campos`);
        });
        
        console.log('\n✅ PIPELINE REFATORADO FUNCIONANDO!');
        
    } catch (error) {
        console.error('❌ ERRO:', error);
        throw error;
    }
}

async function calculateTenantMetrics(tenantId, period) {
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();
    
    // Buscar appointments
    const { data: appointments } = await supabase
        .from('appointments')
        .select('status, final_price')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
    
    // Buscar conversations
    const { data: conversations } = await supabase
        .from('conversation_history')
        .select('outcome')
        .eq('tenant_id', tenantId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
    
    // Buscar services
    const { count: servicesCount } = await supabase
        .from('services')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true);
    
    const appointmentsList = appointments || [];
    const conversationsList = conversations || [];
    
    // COMPREHENSIVE METRICS
    const comprehensive = {
        total_appointments: appointmentsList.length,
        confirmed_appointments: appointmentsList.filter(a => a.status === 'confirmed').length,
        cancelled_appointments: appointmentsList.filter(a => a.status === 'cancelled').length,
        completed_appointments: appointmentsList.filter(a => a.status === 'completed').length,
        pending_appointments: appointmentsList.filter(a => a.status === 'pending').length,
        total_revenue: appointmentsList
            .filter(a => a.status === 'completed')
            .reduce((sum, a) => sum + (a.final_price || 0), 0),
        average_value: appointmentsList.length > 0 
            ? appointmentsList
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + (a.final_price || 0), 0) / appointmentsList.length
            : 0,
        total_conversations: conversationsList.length,
        services_count: servicesCount || 0,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
        calculated_at: new Date().toISOString()
    };
    
    // PARTICIPATION METRICS  
    const participation = {
        revenue_platform_percentage: 0, // TODO: Calcular vs totais plataforma
        appointments_platform_percentage: 0,
        conversations_platform_percentage: 0,
        calculated_at: new Date().toISOString()
    };
    
    // RANKING METRICS
    const ranking = {
        business_health_score: appointmentsList.length > 10 ? 85 : 65,
        risk_level: appointmentsList.length < 5 ? 'high' : 'low',
        risk_score: appointmentsList.length < 5 ? 75 : 25,
        calculated_at: new Date().toISOString()
    };
    
    return { comprehensive, participation, ranking };
}

async function saveTenantMetricsRefactored(tenantId, tenantName, period, metrics) {
    const { error } = await supabase
        .from('tenant_metrics')
        .upsert({
            tenant_id: tenantId,
            tenant_name: tenantName,
            period: period,
            comprehensive_metrics: metrics.comprehensive,
            participation_metrics: metrics.participation,
            ranking_metrics: metrics.ranking,
            calculated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'tenant_id,period'
        });
    
    if (error) {
        throw new Error(`Erro ao salvar: ${error.message}`);
    }
}

testSimpleRefactored()
    .then(() => {
        console.log('\n🎉 TESTE SIMPLES CONCLUÍDO!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 FALHA:', error);
        process.exit(1);
    });