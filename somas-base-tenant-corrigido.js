/**
 * SCRIPT DE SOMAS BASE POR TENANT - VERSÃO CORRIGIDA
 * Calcula somas básicas usando lógica correta de conversas
 * Aproveita métricas existentes do sistema
 * Períodos: 7, 30 e 90 dias
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class TenantBaseSumsCorrigido {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
    }

    async getTenants() {
        const { data, error } = await this.supabase
            .from('tenants')
            .select('id, business_name, domain, email')
            .eq('status', 'active');
        
        if (error) throw error;
        return data;
    }

    /**
     * Conta conversas reais por session_id (não mensagens)
     */
    async countRealConversations(tenantId, startDate = null) {
        let query = this.supabase
            .from('conversation_history')
            .select('conversation_context, created_at');

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        const { data, error } = await query;
        
        if (error) {
            console.warn(`Erro contando conversas para tenant ${tenantId}:`, error.message);
            return { total: 0, byTenant: 0 };
        }

        const allSessionIds = new Set();
        const tenantSessionIds = new Set();

        data?.forEach(msg => {
            try {
                const context = typeof msg.conversation_context === 'string' ? 
                    JSON.parse(msg.conversation_context) : msg.conversation_context;
                
                if (context?.session_id) {
                    allSessionIds.add(context.session_id);
                    
                    // Verificar se é do tenant (pelo context ou filtro posterior)
                    if (context?.tenantId === tenantId) {
                        tenantSessionIds.add(context.session_id);
                    }
                }
            } catch (e) {
                // Context inválido, ignorar
            }
        });

        return {
            total: allSessionIds.size,
            byTenant: tenantSessionIds.size
        };
    }

    /**
     * Busca métricas existentes do tenant
     */
    async getExistingTenantMetrics(tenantId, period = '30d') {
        try {
            // Buscar billing_analysis (mais completo)
            const { data: billingData } = await this.supabase
                .from('tenant_metrics')
                .select('metric_data, calculated_at')
                .eq('tenant_id', tenantId)
                .eq('metric_type', 'billing_analysis')
                .eq('period', period)
                .order('calculated_at', { ascending: false })
                .limit(1);

            // Buscar participation
            const { data: participationData } = await this.supabase
                .from('tenant_metrics')
                .select('metric_data, calculated_at')
                .eq('tenant_id', tenantId)
                .eq('metric_type', 'participation')
                .eq('period', period)
                .order('calculated_at', { ascending: false })
                .limit(1);

            return {
                billing: billingData?.[0]?.metric_data || null,
                participation: participationData?.[0]?.metric_data || null,
                last_calculated: billingData?.[0]?.calculated_at || participationData?.[0]?.calculated_at
            };
        } catch (error) {
            console.warn(`Erro buscando métricas existentes para ${tenantId}:`, error.message);
            return { billing: null, participation: null, last_calculated: null };
        }
    }

    /**
     * Conta registros básicos (appointments, services, etc)
     */
    async countRecords(table, tenantId, startDate = null, additionalFilters = {}) {
        let query = this.supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId);

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        // Aplicar filtros adicionais
        Object.entries(additionalFilters).forEach(([key, value]) => {
            if (value.startsWith('eq.')) {
                query = query.eq(key, value.replace('eq.', ''));
            }
        });

        const { count, error } = await query;
        
        if (error) {
            console.warn(`Erro contando ${table}:`, error.message);
            return 0;
        }

        return count || 0;
    }

    async calculateTenantSums(tenantId, tenantName, days) {
        console.log(`📊 Calculando ${tenantName} (${days} dias)...`);
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const sums = {
            tenant_id: tenantId,
            tenant_name: tenantName,
            period_days: days,
            start_date: startDateStr,
            calculated_at: new Date().toISOString(),
            data_source: 'corrected_logic'
        };

        try {
            // 1. BUSCAR MÉTRICAS EXISTENTES PRIMEIRO
            console.log(`   📈 Buscando métricas existentes...`);
            const period = days === 7 ? '7d' : days === 30 ? '30d' : days === 90 ? '90d' : '30d';
            const existingMetrics = await this.getExistingTenantMetrics(tenantId, period);

            // 2. CONVERSAS REAIS (CORRIGIDO)
            console.log(`   💬 Contando conversas reais...`);
            if (existingMetrics.billing) {
                // Usar dados de billing_analysis (mais preciso)
                sums.conversations_total = existingMetrics.billing.total_conversations || 0;
                sums.conversations_billable = existingMetrics.billing.billable_conversations || 0;
                sums.conversations_outcome_distribution = existingMetrics.billing.outcome_distribution || {};
                sums.plan_utilization_pct = existingMetrics.billing.plan_utilization_pct || 0;
                console.log(`   ✅ Usando dados de billing_analysis: ${sums.conversations_total} conversas`);
            } else {
                // Fallback: calcular por session_id
                const conversationCount = await this.countRealConversations(tenantId, startDateStr);
                sums.conversations_total = conversationCount.byTenant;
                sums.conversations_billable = conversationCount.byTenant; // Assumir todas billable como fallback
                console.log(`   ✅ Calculado por session_id: ${sums.conversations_total} conversas`);
            }

            // 3. APPOINTMENTS - Contagens básicas
            console.log(`   📅 Appointments...`);
            sums.appointments_total = await this.countRecords('appointments', tenantId, startDateStr);
            sums.appointments_confirmed = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.confirmed' });
            sums.appointments_cancelled = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.cancelled' });
            sums.appointments_no_show = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.no_show' });
            sums.appointments_completed = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.completed' });
            sums.appointments_pending = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.pending' });

            // 4. SERVICES - Total (sem filtro de data)
            console.log(`   🛠️ Services...`);
            sums.services_total = await this.countRecords('services', tenantId);
            sums.services_active = await this.countRecords('services', tenantId, null, { 'is_active': 'eq.true' });

            // 5. MÉTRICAS DE PARTICIPAÇÃO (se disponível)
            if (existingMetrics.participation) {
                sums.platform_participation = {
                    revenue_pct: existingMetrics.participation.revenue?.participation_pct || 0,
                    customers_count: existingMetrics.participation.customers?.count || 0,
                    appointments_count: existingMetrics.participation.appointments?.count || 0,
                    ai_interactions_count: existingMetrics.participation.ai_interactions?.count || 0
                };
                
                sums.business_intelligence = existingMetrics.participation.business_intelligence || {};
            }

            // 6. MÉTRICAS CALCULADAS CORRIGIDAS
            sums.cancellation_total = sums.appointments_cancelled + sums.appointments_no_show;
            sums.cancellation_rate = sums.conversations_total > 0 ? 
                (sums.cancellation_total / sums.conversations_total * 100).toFixed(2) : 0;
            
            // CONVERSÃO CORRETA: appointments / conversas (não mensagens)
            sums.conversion_rate = sums.conversations_total > 0 ? 
                (sums.appointments_total / sums.conversations_total * 100).toFixed(2) : 0;

            // Eficiência operacional
            sums.operational_efficiency = sums.business_intelligence?.efficiency_score || 
                (sums.conversations_total > 0 ? (sums.appointments_total / sums.conversations_total * 100).toFixed(1) : 0);

            // Status da métrica
            sums.metrics_source = existingMetrics.billing ? 'existing_billing_analysis' : 'calculated_fallback';
            sums.last_calculated = existingMetrics.last_calculated;

            console.log(`   ✅ ${sums.appointments_total} appointments, ${sums.conversations_total} conversas REAIS, ${sums.conversion_rate}% conversão`);

        } catch (error) {
            console.error(`❌ Erro no tenant ${tenantName}:`, error.message);
            sums.error = error.message;
        }

        return sums;
    }

    async calculateForAllTenants(days = 30) {
        console.log(`🚀 CALCULANDO SOMAS BASE CORRIGIDAS - ${days} DIAS`);
        console.log('='.repeat(50));

        const tenants = await this.getTenants();
        console.log(`📋 Encontrados ${tenants.length} tenants ativos\n`);

        const results = {};

        for (const tenant of tenants) {
            const sums = await this.calculateTenantSums(tenant.id, tenant.business_name, days);
            results[tenant.id] = sums;
        }

        return results;
    }

    /**
     * Validar totais contra platform_metrics
     */
    async validateAgainstPlatform(results, days) {
        try {
            console.log('\n🔍 VALIDANDO CONTRA PLATFORM_METRICS...');
            
            const { data: platformMetrics } = await this.supabase
                .from('platform_metrics')
                .select('*')
                .eq('period_days', days)
                .order('updated_at', { ascending: false })
                .limit(1);

            if (!platformMetrics?.[0]) {
                console.log('⚠️ Nenhuma métrica de plataforma encontrada para validação');
                return;
            }

            const platform = platformMetrics[0];
            const validResults = Object.values(results).filter(r => !r.error);
            
            const totals = {
                conversations: validResults.reduce((sum, r) => sum + (r.conversations_total || 0), 0),
                appointments: validResults.reduce((sum, r) => sum + (r.appointments_total || 0), 0),
                services: validResults.reduce((sum, r) => sum + (r.services_active || 0), 0)
            };

            console.log(`📊 COMPARAÇÃO COM PLATFORM_METRICS:`);
            console.log(`   Conversas - Calculado: ${totals.conversations} | Plataforma: ${platform.total_conversations} | Diferença: ${totals.conversations - platform.total_conversations}`);
            console.log(`   Appointments - Calculado: ${totals.appointments} | Plataforma: ${platform.total_appointments} | Diferença: ${totals.appointments - platform.total_appointments}`);
            console.log(`   Eficiência - Plataforma: ${platform.operational_efficiency_pct}%`);

            // Alertas de inconsistências
            if (Math.abs(totals.conversations - platform.total_conversations) > 50) {
                console.log('⚠️ ALERTA: Grande diferença na contagem de conversas!');
            }
            if (Math.abs(totals.appointments - platform.total_appointments) > 50) {
                console.log('⚠️ ALERTA: Grande diferença na contagem de appointments!');
            }

        } catch (error) {
            console.warn('❌ Erro na validação:', error.message);
        }
    }

    saveResults(results, days) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         new Date().toTimeString().split(' ')[0].replace(/:/g, '');
        const filename = `tenant-somas-corrigido-${days}d-${timestamp}.json`;
        
        require('fs').writeFileSync(filename, JSON.stringify(results, null, 2));
        console.log(`💾 Resultados salvos: ${filename}`);
        return filename;
    }

    generateSummary(results) {
        const validResults = Object.values(results).filter(r => !r.error);
        const usingExistingMetrics = validResults.filter(r => r.metrics_source === 'existing_billing_analysis').length;
        
        const summary = {
            total_tenants: Object.keys(results).length,
            successful_calculations: validResults.length,
            failed_calculations: Object.keys(results).length - validResults.length,
            using_existing_metrics: usingExistingMetrics,
            using_fallback_calculation: validResults.length - usingExistingMetrics,
            totals: {
                appointments: validResults.reduce((sum, r) => sum + (r.appointments_total || 0), 0),
                conversations: validResults.reduce((sum, r) => sum + (r.conversations_total || 0), 0),
                conversations_billable: validResults.reduce((sum, r) => sum + (r.conversations_billable || 0), 0),
                cancellations: validResults.reduce((sum, r) => sum + (r.cancellation_total || 0), 0),
                services: validResults.reduce((sum, r) => sum + (r.services_active || 0), 0)
            },
            averages: {
                appointments_per_tenant: 0,
                conversations_per_tenant: 0,
                conversion_rate: 0,
                operational_efficiency: 0
            }
        };

        if (validResults.length > 0) {
            summary.averages.appointments_per_tenant = (summary.totals.appointments / validResults.length).toFixed(1);
            summary.averages.conversations_per_tenant = (summary.totals.conversations / validResults.length).toFixed(1);
            summary.averages.conversion_rate = (validResults.reduce((sum, r) => sum + parseFloat(r.conversion_rate || 0), 0) / validResults.length).toFixed(2);
            summary.averages.operational_efficiency = (validResults.reduce((sum, r) => sum + parseFloat(r.operational_efficiency || 0), 0) / validResults.length).toFixed(2);
        }

        return summary;
    }
}

async function main() {
    const calculator = new TenantBaseSumsCorrigido();
    
    // Calcular para múltiplos períodos
    for (const days of [7, 30, 90]) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 PERÍODO: ${days} DIAS - VERSÃO CORRIGIDA`);
        console.log(`${'='.repeat(60)}`);
        
        try {
            const results = await calculator.calculateForAllTenants(days);
            await calculator.validateAgainstPlatform(results, days);
            const filename = calculator.saveResults(results, days);
            const summary = calculator.generateSummary(results);
            
            console.log(`\n📋 RESUMO CORRIGIDO - ${days} DIAS:`);
            console.log(`👥 Tenants processados: ${summary.successful_calculations}/${summary.total_tenants}`);
            console.log(`📊 Usando métricas existentes: ${summary.using_existing_metrics}`);
            console.log(`🔄 Usando cálculo fallback: ${summary.using_fallback_calculation}`);
            console.log(`📅 Total appointments: ${summary.totals.appointments}`);
            console.log(`💬 Total conversas REAIS: ${summary.totals.conversations}`);
            console.log(`💰 Conversas faturáveis: ${summary.totals.conversations_billable}`);
            console.log(`❌ Total cancelamentos: ${summary.totals.cancellations}`);
            console.log(`📈 Taxa conversão média: ${summary.averages.conversion_rate}%`);
            console.log(`⚡ Eficiência operacional média: ${summary.averages.operational_efficiency}%`);
            console.log(`📄 Arquivo: ${filename}`);
            
        } catch (error) {
            console.error(`💥 Erro no período ${days} dias:`, error);
        }
    }
    
    console.log('\n🎯 CÁLCULO CORRIGIDO CONCLUÍDO!');
    console.log('✅ Agora usando contagem correta de conversas (por session_id)');
    console.log('✅ Aproveitando métricas existentes do sistema');
    console.log('✅ Validação contra platform_metrics implementada');
}

// Executar se chamado diretamente
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('💥 Erro:', error);
            process.exit(1);
        });
}

module.exports = TenantBaseSumsCorrigido;