/**
 * ATUALIZAR TENANT_METRICS COM CONVERSATION_OUTCOME
 * Recalcular métricas dos tenants incluindo os novos dados de outcomes e appointments
 */

const { supabaseAdmin } = require('./src/config/database');

class TenantMetricsUpdater {
    async updateTenantMetrics() {
        console.log('🔄 ATUALIZANDO TENANT_METRICS COM CONVERSATION_OUTCOME\n');

        try {
            // 1. Buscar tenants que têm dados de conversation_outcome
            const tenantsWithData = await this.getTenantsWithOutcomeData();
            console.log(`📊 Encontrados ${tenantsWithData.length} tenants com dados de outcomes`);

            // 2. Para cada tenant, calcular novas métricas
            let processed = 0;
            for (const tenant of tenantsWithData) {
                console.log(`\n🏢 Processando tenant: ${tenant.tenant_id.substring(0, 8)}...`);
                await this.calculateTenantMetrics(tenant.tenant_id);
                processed++;
                
                if (processed % 10 === 0) {
                    console.log(`   ⏱️ Processados ${processed}/${tenantsWithData.length} tenants`);
                }
            }

            console.log(`\n✅ CONCLUÍDO: ${processed} tenants processados`);
            
            // 3. Validar resultados
            await this.validateResults();

        } catch (error) {
            console.error('❌ Erro na atualização:', error.message);
        }
    }

    async getTenantsWithOutcomeData() {
        const { data, error } = await supabaseAdmin
            .from('conversation_history')
            .select('tenant_id')
            .not('conversation_outcome', 'is', null);

        if (error) throw new Error(`Erro ao buscar tenants: ${error.message}`);

        // Remover duplicatas
        const uniqueTenants = [...new Set(data.map(item => item.tenant_id))];
        return uniqueTenants.map(tenant_id => ({ tenant_id }));
    }

    async calculateTenantMetrics(tenantId) {
        // Calcular métricas para períodos: 7, 30, 90 dias
        const periods = [7, 30, 90];
        
        for (const periodDays of periods) {
            const metrics = await this.calculateMetricsForPeriod(tenantId, periodDays);
            await this.saveTenantMetrics(tenantId, periodDays, metrics);
        }
    }

    async calculateMetricsForPeriod(tenantId, periodDays) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        // 1. Métricas de conversas com outcomes
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_outcome, created_at, tokens_used, api_cost_usd')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .not('conversation_outcome', 'is', null);

        if (convError) throw new Error(`Erro ao buscar conversas: ${convError.message}`);

        // 2. Appointments realistas do tenant
        const { data: appointments, error: aptError } = await supabaseAdmin
            .from('appointments')
            .select('status, start_time, appointment_data')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString());

        if (aptError) throw new Error(`Erro ao buscar appointments: ${aptError.message}`);

        // 3. Calcular métricas
        const totalConversations = conversations.length;
        const appointmentCreated = conversations.filter(c => c.conversation_outcome === 'appointment_created').length;
        const totalAppointments = appointments.length;
        const realisticAppointments = appointments.filter(a => a.appointment_data?.realistic_data).length;

        // Métricas de cobrança por conversa
        const billableConversations = appointmentCreated; // Apenas conversas que geram appointments
        const conversionRate = totalConversations > 0 ? (appointmentCreated / totalConversations * 100) : 0;
        
        // Custo estimado (R$ 0,25 por conversa cobrada no modelo proposto)
        const estimatedRevenue = billableConversations * 0.25; // R$ 0,25 por conversa

        // Métricas de outcomes
        const outcomeCounts = {};
        conversations.forEach(conv => {
            outcomeCounts[conv.conversation_outcome] = (outcomeCounts[conv.conversation_outcome] || 0) + 1;
        });

        // Status dos appointments
        const appointmentsByStatus = {};
        appointments.forEach(apt => {
            appointmentsByStatus[apt.status] = (appointmentsByStatus[apt.status] || 0) + 1;
        });

        return {
            period_days: periodDays,
            total_conversations: totalConversations,
            billable_conversations: billableConversations,
            total_appointments: totalAppointments,
            realistic_appointments: realisticAppointments,
            operational_efficiency_pct: parseFloat(conversionRate.toFixed(2)),
            estimated_revenue_brl: parseFloat(estimatedRevenue.toFixed(2)),
            outcome_distribution: outcomeCounts,
            appointment_status_distribution: appointmentsByStatus,
            // Métricas tradicionais para compatibilidade
            total_tokens: conversations.reduce((sum, c) => sum + (c.tokens_used || 0), 0),
            total_api_cost: conversations.reduce((sum, c) => sum + (c.api_cost_usd || 0), 0),
            calculated_at: new Date().toISOString()
        };
    }

    async saveTenantMetrics(tenantId, periodDays, metrics) {
        // Deletar métricas antigas deste período
        await supabaseAdmin
            .from('tenant_metrics')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('period', `${periodDays}d`)
            .eq('metric_type', 'conversation_outcome_based');

        // Inserir novas métricas
        const { error } = await supabaseAdmin
            .from('tenant_metrics')
            .insert({
                tenant_id: tenantId,
                metric_type: 'conversation_outcome_based',
                metric_data: metrics,
                period: `${periodDays}d`,
                calculated_at: new Date().toISOString()
            });

        if (error) {
            console.log(`   ❌ Erro ao salvar métricas para ${periodDays}d: ${error.message}`);
        } else {
            console.log(`   ✅ Métricas salvas para período ${periodDays}d`);
        }
    }

    async validateResults() {
        console.log('\n🔍 VALIDANDO RESULTADOS:\n');

        // Contar métricas inseridas
        const { data: newMetrics, error } = await supabaseAdmin
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data')
            .eq('metric_type', 'conversation_outcome_based')
            .order('calculated_at', { ascending: false })
            .limit(15);

        if (error) {
            console.log('❌ Erro na validação:', error.message);
            return;
        }

        console.log('📊 MÉTRICAS INSERIDAS (15 mais recentes):');
        newMetrics.forEach((metric, index) => {
            const data = metric.metric_data;
            console.log(`   ${index + 1}. Tenant: ${metric.tenant_id.substring(0, 8)}... | Período: ${metric.period}`);
            console.log(`      Conversas: ${data.total_conversations} | Cobráveis: ${data.billable_conversations}`);
            console.log(`      Appointments: ${data.total_appointments} | Conversão: ${data.operational_efficiency_pct}%`);
            console.log(`      Receita Estimada: R$ ${data.estimated_revenue_brl}`);
            console.log('');
        });

        // Estatísticas gerais
        const totalTenants = [...new Set(newMetrics.map(m => m.tenant_id))].length;
        const totalBillableConversations = newMetrics.reduce((sum, m) => sum + (m.metric_data.billable_conversations || 0), 0);
        const totalEstimatedRevenue = newMetrics.reduce((sum, m) => sum + (m.metric_data.estimated_revenue_brl || 0), 0);

        console.log('🎯 RESUMO GERAL:');
        console.log(`   🏢 Tenants processados: ${totalTenants}`);
        console.log(`   💬 Total de conversas cobráveis: ${totalBillableConversations}`);
        console.log(`   💰 Receita estimada total: R$ ${totalEstimatedRevenue.toFixed(2)}`);
        
        console.log('\n✅ TENANT_METRICS ATUALIZADO COM CONVERSATION_OUTCOME!');
        console.log('🔄 Próximo passo: Atualizar platform_metrics baseado nestas métricas');
    }
}

// Executar atualização
async function runUpdate() {
    const updater = new TenantMetricsUpdater();
    
    try {
        await updater.updateTenantMetrics();
    } catch (error) {
        console.error('❌ Erro geral:', error);
    } finally {
        process.exit(0);
    }
}

// Verificar se está sendo executado diretamente
if (require.main === module) {
    runUpdate();
}

module.exports = { TenantMetricsUpdater };