/**
 * SCRIPT DE SOMAS BASE POR TENANT - JavaScript
 * Calcula somas básicas usando Supabase client
 * Períodos: 7, 30 e 90 dias
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class TenantBaseSums {
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
            .select('id, name, domain, email')
            .eq('status', 'active');
        
        if (error) throw error;
        return data;
    }

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
            calculated_at: new Date().toISOString()
        };

        try {
            // APPOINTMENTS - Contagens básicas
            console.log(`   📅 Appointments...`);
            sums.appointments_total = await this.countRecords('appointments', tenantId, startDateStr);
            sums.appointments_confirmed = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.confirmed' });
            sums.appointments_cancelled = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.cancelled' });
            sums.appointments_no_show = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.no_show' });
            sums.appointments_completed = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.completed' });
            sums.appointments_pending = await this.countRecords('appointments', tenantId, startDateStr, { 'status': 'eq.pending' });

            // CONVERSATIONS - Contagens básicas
            console.log(`   💬 Conversations...`);
            sums.conversations_total = await this.countRecords('conversation_history', tenantId, startDateStr);
            sums.conversations_from_users = await this.countRecords('conversation_history', tenantId, startDateStr, { 'is_from_user': 'eq.true' });

            // SERVICES - Total (sem filtro de data)
            console.log(`   🛠️ Services...`);
            sums.services_total = await this.countRecords('services', tenantId);
            sums.services_active = await this.countRecords('services', tenantId, null, { 'is_active': 'eq.true' });

            // MÉTRICAS CALCULADAS SIMPLES
            sums.cancellation_total = sums.appointments_cancelled + sums.appointments_no_show;
            sums.cancellation_rate = sums.appointments_total > 0 ? 
                (sums.cancellation_total / sums.appointments_total * 100).toFixed(2) : 0;
            
            sums.conversion_rate = sums.conversations_total > 0 ? 
                (sums.appointments_total / sums.conversations_total * 100).toFixed(2) : 0;

            console.log(`   ✅ ${sums.appointments_total} appointments, ${sums.conversations_total} conversations, ${sums.cancellation_rate}% cancelamento`);

        } catch (error) {
            console.error(`❌ Erro no tenant ${tenantName}:`, error.message);
            sums.error = error.message;
        }

        return sums;
    }

    async calculateForAllTenants(days = 30) {
        console.log(`🚀 CALCULANDO SOMAS BASE - ${days} DIAS`);
        console.log('='.repeat(50));

        const tenants = await this.getTenants();
        console.log(`📋 Encontrados ${tenants.length} tenants ativos\n`);

        const results = {};

        for (const tenant of tenants) {
            const sums = await this.calculateTenantSums(tenant.id, tenant.name, days);
            results[tenant.id] = sums;
        }

        return results;
    }

    saveResults(results, days) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         new Date().toTimeString().split(' ')[0].replace(/:/g, '');
        const filename = `tenant-somas-${days}d-${timestamp}.json`;
        
        require('fs').writeFileSync(filename, JSON.stringify(results, null, 2));
        console.log(`💾 Resultados salvos: ${filename}`);
        return filename;
    }

    generateSummary(results) {
        const validResults = Object.values(results).filter(r => !r.error);
        
        const summary = {
            total_tenants: Object.keys(results).length,
            successful_calculations: validResults.length,
            failed_calculations: Object.keys(results).length - validResults.length,
            totals: {
                appointments: validResults.reduce((sum, r) => sum + (r.appointments_total || 0), 0),
                conversations: validResults.reduce((sum, r) => sum + (r.conversations_total || 0), 0),
                cancellations: validResults.reduce((sum, r) => sum + (r.cancellation_total || 0), 0),
                services: validResults.reduce((sum, r) => sum + (r.services_active || 0), 0)
            },
            averages: {
                appointments_per_tenant: 0,
                conversations_per_tenant: 0,
                cancellation_rate: 0,
                conversion_rate: 0
            }
        };

        if (validResults.length > 0) {
            summary.averages.appointments_per_tenant = (summary.totals.appointments / validResults.length).toFixed(1);
            summary.averages.conversations_per_tenant = (summary.totals.conversations / validResults.length).toFixed(1);
            summary.averages.cancellation_rate = (validResults.reduce((sum, r) => sum + parseFloat(r.cancellation_rate || 0), 0) / validResults.length).toFixed(2);
            summary.averages.conversion_rate = (validResults.reduce((sum, r) => sum + parseFloat(r.conversion_rate || 0), 0) / validResults.length).toFixed(2);
        }

        return summary;
    }
}

async function main() {
    const calculator = new TenantBaseSums();
    
    // Calcular para múltiplos períodos
    for (const days of [7, 30, 90]) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📊 PERÍODO: ${days} DIAS`);
        console.log(`${'='.repeat(60)}`);
        
        try {
            const results = await calculator.calculateForAllTenants(days);
            const filename = calculator.saveResults(results, days);
            const summary = calculator.generateSummary(results);
            
            console.log(`\n📋 RESUMO - ${days} DIAS:`);
            console.log(`👥 Tenants processados: ${summary.successful_calculations}/${summary.total_tenants}`);
            console.log(`📅 Total appointments: ${summary.totals.appointments}`);
            console.log(`💬 Total conversations: ${summary.totals.conversations}`);
            console.log(`❌ Total cancelamentos: ${summary.totals.cancellations}`);
            console.log(`📊 Taxa cancelamento média: ${summary.averages.cancellation_rate}%`);
            console.log(`📈 Taxa conversão média: ${summary.averages.conversion_rate}%`);
            console.log(`📄 Arquivo: ${filename}`);
            
        } catch (error) {
            console.error(`💥 Erro no período ${days} dias:`, error);
        }
    }
    
    console.log('\n🎯 CÁLCULO CONCLUÍDO! Arquivos JSON gerados com as somas base de cada tenant.');
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

module.exports = TenantBaseSums;