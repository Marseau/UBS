/**
 * Tenant Metrics Service - Refatorado para Nova Estrutura JSON
 * Utiliza os 3 campos JSON especializados: comprehensive, participation, ranking
 * Princípio: "utilizar o que temos, melhorando sempre"
 * 
 * @version 2.1.0 - Estrutura refatorada
 * @author UBS Team
 */

import { getAdminClient } from '../config/database';

export class TenantMetricsRefactoredService {
    private client = getAdminClient();

    /**
     * Calcula e salva todas as métricas de um tenant em formato JSON especializado
     */
    async calculateAndSaveTenantMetrics(tenantId: string, period: '7d' | '30d' | '90d'): Promise<void> {
        try {
            console.log(`📊 Calculando métricas para tenant ${tenantId}, período ${period}`);
            
            // 1. Buscar nome do tenant
            const tenantName = await this.getTenantName(tenantId);
            
            // 2. Calcular as 3 categorias de métricas
            const comprehensiveMetrics = await this.calculateComprehensiveMetrics(tenantId, period);
            const participationMetrics = await this.calculateParticipationMetrics(tenantId, period);
            const rankingMetrics = await this.calculateRankingMetrics(tenantId, period);
            
            // 3. Upsert usando nova estrutura
            await this.upsertTenantMetrics(tenantId, tenantName, period, {
                comprehensive: comprehensiveMetrics,
                participation: participationMetrics,
                ranking: rankingMetrics
            });
            
            console.log(`✅ Métricas salvas para tenant ${tenantId}, período ${period}`);
            
        } catch (error) {
            console.error(`❌ Erro ao calcular métricas tenant ${tenantId}:`, error);
            throw error;
        }
    }

    /**
     * Busca nome do tenant
     */
    private async getTenantName(tenantId: string): Promise<string> {
        const { data, error } = await this.client
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single();
            
        if (error || !data) {
            throw new Error(`Tenant não encontrado: ${tenantId}`);
        }
        
        return data.name;
    }

    /**
     * Calcula métricas operacionais completas (26+ métricas)
     */
    private async calculateComprehensiveMetrics(tenantId: string, period: string): Promise<object> {
        const days = this.periodToDays(period);
        const startDate = this.getStartDate(days);
        const endDate = new Date();

        // Buscar dados base
        const [appointments, conversations, customers] = await Promise.all([
            this.getAppointmentsData(tenantId, startDate, endDate),
            this.getConversationsData(tenantId, startDate, endDate),
            this.getCustomersData(tenantId, startDate, endDate)
        ]);

        // Calcular métricas operacionais
        return {
            // Appointments
            total_appointments: appointments.total,
            confirmed_appointments: appointments.confirmed,
            cancelled_appointments: appointments.cancelled,
            completed_appointments: appointments.completed,
            pending_appointments: appointments.pending,
            appointments_growth_rate: await this.calculateGrowthRate(tenantId, 'appointments', period),
            
            // Revenue
            total_revenue: appointments.revenue,
            revenue_growth_rate: await this.calculateGrowthRate(tenantId, 'revenue', period),
            average_value: appointments.total > 0 ? appointments.revenue / appointments.total : 0,
            
            // Customers
            total_customers: customers.total,
            new_customers: customers.new,
            returning_customers: customers.returning,
            customer_growth_rate: await this.calculateGrowthRate(tenantId, 'customers', period),
            
            // AI & Conversations
            total_conversations: conversations.total,
            ai_success_rate: conversations.success_rate,
            avg_response_time: conversations.avg_response_time,
            conversion_rate: appointments.total > 0 ? (appointments.total / conversations.total) * 100 : 0,
            
            // Services
            services_count: await this.getServicesCount(tenantId),
            professionals_count: await this.getProfessionalsCount(tenantId),
            
            // Period info
            period_start: startDate.toISOString(),
            period_end: endDate.toISOString(),
            period_type: period,
            calculated_at: new Date().toISOString()
        };
    }

    /**
     * Calcula métricas de participação na plataforma
     */
    private async calculateParticipationMetrics(tenantId: string, period: string): Promise<object> {
        const platformTotals = await this.getPlatformTotals(period);
        const tenantTotals = await this.getTenantTotals(tenantId, period);

        return {
            revenue_platform_percentage: platformTotals.revenue > 0 
                ? (tenantTotals.revenue / platformTotals.revenue) * 100 : 0,
            appointments_platform_percentage: platformTotals.appointments > 0 
                ? (tenantTotals.appointments / platformTotals.appointments) * 100 : 0,
            customers_platform_percentage: platformTotals.customers > 0 
                ? (tenantTotals.customers / platformTotals.customers) * 100 : 0,
            conversations_platform_percentage: platformTotals.conversations > 0 
                ? (tenantTotals.conversations / platformTotals.conversations) * 100 : 0,
            platform_rank: await this.calculatePlatformRank(tenantId, 'revenue', period),
            calculated_at: new Date().toISOString()
        };
    }

    /**
     * Calcula métricas de ranking e scores
     */
    private async calculateRankingMetrics(tenantId: string, period: string): Promise<object> {
        return {
            business_health_score: await this.calculateHealthScore(tenantId, period),
            risk_score: await this.calculateRiskScore(tenantId, period),
            risk_level: await this.calculateRiskLevel(tenantId, period),
            platform_rank: await this.calculatePlatformRank(tenantId, 'overall', period),
            segment_rank: await this.calculateSegmentRank(tenantId, period),
            performance_score: await this.calculatePerformanceScore(tenantId, period),
            calculated_at: new Date().toISOString()
        };
    }

    /**
     * Upsert métricas usando nova estrutura
     */
    private async upsertTenantMetrics(
        tenantId: string, 
        tenantName: string, 
        period: string,
        metrics: {
            comprehensive: object,
            participation: object,
            ranking: object
        }
    ): Promise<void> {
        const { error } = await (this.client as any)
            .from('tenant_metrics')
            .upsert({
                tenant_id: tenantId,
                metric_type: 'comprehensive',
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
            throw new Error(`Erro ao salvar métricas: ${error.message}`);
        }
    }

    // ========== MÉTODOS AUXILIARES ==========

    private periodToDays(period: string): number {
        switch(period) {
            case '7d': return 7;
            case '30d': return 30;
            case '90d': return 90;
            default: return 30;
        }
    }

    private getStartDate(days: number): Date {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date;
    }

    private async getAppointmentsData(tenantId: string, startDate: Date, endDate: Date) {
        const { data, error } = await this.client
            .from('appointments')
            .select('status, final_price')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (error) throw new Error(`Erro appointments: ${error.message}`);

        const appointments = data || [];
        
        return {
            total: appointments.length,
            confirmed: appointments.filter(a => a.status === 'confirmed').length,
            cancelled: appointments.filter(a => a.status === 'cancelled').length,
            completed: appointments.filter(a => a.status === 'completed').length,
            pending: appointments.filter(a => a.status === 'pending').length,
            revenue: appointments
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + (a.final_price || 0), 0)
        };
    }

    private async getConversationsData(tenantId: string, startDate: Date, endDate: Date) {
        const { data, error } = await this.client
            .from('conversation_history')
            .select('outcome, message_duration')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (error) throw new Error(`Erro conversations: ${error.message}`);

        const conversations = data || [];
        const successful = conversations.filter((c: any) => 
            c.outcome === 'appointment_scheduled' || 
            c.outcome === 'information_provided'
        ).length;

        return {
            total: conversations.length,
            success_rate: conversations.length > 0 ? (successful / conversations.length) * 100 : 0,
            avg_response_time: conversations.length > 0 
                ? conversations.reduce((sum: number, c: any) => sum + (c.message_duration || 0), 0) / conversations.length 
                : 0
        };
    }

    private async getCustomersData(tenantId: string, startDate: Date, endDate: Date) {
        // Clientes únicos no período
        const { data: customers, error: customersError } = await this.client
            .from('users')
            .select('id, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (customersError) throw new Error(`Erro customers: ${customersError.message}`);

        // Clientes recorrentes (que já tinham appointment antes do período)
        const { data: returning, error: returningError } = await this.client
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .not('user_id', 'is', null);

        if (returningError) throw new Error(`Erro returning customers: ${returningError.message}`);

        const uniqueCustomers = new Set((customers || []).map(c => c.id));
        const returningCustomers = new Set((returning || []).map(r => r.user_id));

        return {
            total: uniqueCustomers.size,
            new: (customers || []).length,
            returning: returningCustomers.size
        };
    }

    // Métodos placeholder para cálculos específicos
    private async calculateGrowthRate(tenantId: string, metric: string, period: string): Promise<number> {
        // TODO: Implementar lógica de crescimento
        return 0;
    }

    private async getServicesCount(tenantId: string): Promise<number> {
        const { count, error } = await this.client
            .from('services')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        return count || 0;
    }

    private async getProfessionalsCount(tenantId: string): Promise<number> {
        // Professionals table não existe, retornar 0
        return 0;
        
        /* TODO: Implementar quando tabela existir
        const { count, error } = await this.client
            .from('professionals')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        return count || 0;
        */
    }

    private async getPlatformTotals(period: string) {
        // TODO: Buscar totais da plataforma
        return { revenue: 1000, appointments: 100, customers: 50, conversations: 200 };
    }

    private async getTenantTotals(tenantId: string, period: string) {
        // TODO: Buscar totais do tenant
        return { revenue: 100, appointments: 10, customers: 5, conversations: 20 };
    }

    private async calculateHealthScore(tenantId: string, period: string): Promise<number> {
        // TODO: Lógica de health score
        return 75;
    }

    private async calculateRiskScore(tenantId: string, period: string): Promise<number> {
        // TODO: Lógica de risk score  
        return 25;
    }

    private async calculateRiskLevel(tenantId: string, period: string): Promise<string> {
        const risk = await this.calculateRiskScore(tenantId, period);
        return risk < 30 ? 'low' : risk < 60 ? 'medium' : 'high';
    }

    private async calculatePlatformRank(tenantId: string, metric: string, period: string): Promise<number> {
        // TODO: Lógica de ranking
        return 5;
    }

    private async calculateSegmentRank(tenantId: string, period: string): Promise<number> {
        // TODO: Lógica de ranking por segmento
        return 3;
    }

    private async calculatePerformanceScore(tenantId: string, period: string): Promise<number> {
        // TODO: Lógica de performance score
        return 80;
    }
}