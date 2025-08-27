/**
 * Platform Aggregation Service - Refatorado para Nova Estrutura JSON
 * Agrega dados dos tenant_metrics (estrutura JSON) em platform_metrics (estrutura JSON)
 * Princípio: "utilizar o que temos, melhorando sempre"
 * 
 * @version 2.1.0 - Estrutura refatorada JSON
 * @author UBS Team
 */

import { getAdminClient } from '../config/database';

export class PlatformAggregationRefactoredService {
    private client = getAdminClient();

    /**
     * Executa agregação completa da plataforma para todos os períodos
     */
    async executeCompletePlatformAggregation(): Promise<any> {
        console.log('🚀 EXECUTANDO AGREGAÇÃO REFATORADA (ESTRUTURA JSON)');
        console.log('='.repeat(70));

        const periods = ['7d', '30d', '90d'];
        const results: any[] = [];
        const errors: string[] = [];
        const startTime = Date.now();

        for (const period of periods) {
            try {
                console.log(`\n📊 Processando período: ${period}`);
                const result = await this.aggregatePlatformForPeriod(period);
                results.push(result as any);
                console.log(`✅ ${period} processado com sucesso`);
            } catch (error) {
                console.error(`❌ Erro no período ${period}:`, (error as Error).message);
                errors.push(`Período ${period}: ${(error as Error).message}`);
            }
        }

        const executionTime = Date.now() - startTime;
        
        console.log('\n' + '='.repeat(70));
        console.log('📋 AGREGAÇÃO REFATORADA COMPLETA - RELATÓRIO');
        console.log('='.repeat(70));
        console.log(`✅ Períodos processados: ${results.length}`);
        console.log(`❌ Erros: ${errors.length}`);
        console.log(`⏱️ Tempo execução: ${executionTime}ms`);
        
        if (errors.length > 0) {
            console.log('\n❌ ERROS ENCONTRADOS:');
            errors.forEach((error: string) => console.log(`   • ${error}`));
        }

        return {
            success: errors.length === 0,
            processed_periods: results,
            errors: errors,
            execution_time_ms: executionTime
        };
    }

    /**
     * Agrega dados para um período específico
     */
    private async aggregatePlatformForPeriod(period: string): Promise<any> {
        console.log(`🔄 AGREGANDO DADOS REFATORADOS - Período: ${period}`);

        // 1. Buscar dados dos tenant_metrics com estrutura JSON
        const { data: tenantMetrics, error: fetchError } = await this.client
            .from('tenant_metrics')
            .select(`
                tenant_id,
                tenant_name,
                comprehensive_metrics,
                participation_metrics,
                ranking_metrics,
                calculated_at
            `)
            .eq('period', period)
            .not('comprehensive_metrics', 'is', null);

        if (fetchError || !tenantMetrics) {
            throw new Error(`Erro ao buscar tenant_metrics: ${fetchError?.message}`);
        }

        console.log(`📊 Encontrados ${tenantMetrics.length} tenants com dados JSON`);

        // 2. Agregar dados em 3 categorias JSON
        const comprehensiveAggregated = await this.aggregateComprehensiveMetrics(tenantMetrics);
        const participationAggregated = await this.aggregateParticipationMetrics(tenantMetrics);
        const rankingAggregated = await this.aggregateRankingMetrics(tenantMetrics);

        // 3. Salvar usando nova estrutura JSON
        const platformRecord = {
            calculation_date: new Date().toISOString().split('T')[0],
            period: period,
            comprehensive_metrics: comprehensiveAggregated,
            participation_metrics: participationAggregated,
            ranking_metrics: rankingAggregated,
            tenants_processed: tenantMetrics.length,
            total_tenants: await this.getTotalTenantsCount(),
            calculation_method: 'json_aggregation_refactored',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // 4. Upsert na nova estrutura
        await this.upsertPlatformMetrics(platformRecord);

        console.log(`✅ Agregação ${period} concluída - ${tenantMetrics.length} tenants processados`);

        return {
            period,
            tenants_processed: tenantMetrics.length,
            comprehensive_fields: Object.keys(comprehensiveAggregated).length,
            participation_fields: Object.keys(participationAggregated).length,
            ranking_fields: Object.keys(rankingAggregated).length
        };
    }

    /**
     * Agrega métricas operacionais (comprehensive)
     */
    private async aggregateComprehensiveMetrics(tenantMetrics: any[]): Promise<object> {
        const aggregated = {
            // Revenue metrics
            total_platform_revenue: 0,
            avg_revenue_per_tenant: 0,
            revenue_distribution: {} as any,
            
            // Operational metrics  
            total_platform_appointments: 0,
            total_platform_conversations: 0,
            total_platform_services: 0,
            active_tenants_count: 0,
            
            // Performance metrics
            platform_avg_success_rate: 0,
            platform_avg_conversion_rate: 0,
            platform_health_score: 0,
            
            // Time metrics
            calculation_timestamp: new Date().toISOString(),
            period_summary: {
                start: null,
                end: null,
                total_days: this.periodToDays(tenantMetrics[0]?.period || '30d')
            }
        };

        let totalRevenue = 0;
        let totalAppointments = 0;
        let totalConversations = 0;
        let totalServices = 0;
        let activeTenants = 0;
        let totalSuccessRate = 0;
        let validSuccessRates = 0;

        for (const tenant of tenantMetrics) {
            const comp = tenant.comprehensive_metrics || {};
            
            // Revenue
            const revenue = parseFloat(comp.total_revenue || 0);
            totalRevenue += revenue;
            
            // Appointments
            const appointments = parseInt(comp.total_appointments || 0);
            totalAppointments += appointments;
            
            // Conversations
            const conversations = parseInt(comp.total_conversations || 0);
            totalConversations += conversations;
            
            // Services
            const services = parseInt(comp.services_count || 0);
            totalServices += services;
            
            // Active tenants (com pelo menos 1 appointment)
            if (appointments > 0) {
                activeTenants++;
            }
            
            // Success rate
            const successRate = parseFloat(comp.ai_success_rate || 0);
            if (successRate > 0) {
                totalSuccessRate += successRate;
                validSuccessRates++;
            }
            
            // Revenue distribution por tenant
            if (revenue > 0) {
                aggregated.revenue_distribution[tenant.tenant_name || tenant.tenant_id] = revenue;
            }
        }

        // Calcular agregados
        aggregated.total_platform_revenue = totalRevenue;
        aggregated.avg_revenue_per_tenant = activeTenants > 0 ? totalRevenue / activeTenants : 0;
        aggregated.total_platform_appointments = totalAppointments;
        aggregated.total_platform_conversations = totalConversations;
        aggregated.total_platform_services = totalServices;
        aggregated.active_tenants_count = activeTenants;
        aggregated.platform_avg_success_rate = validSuccessRates > 0 ? totalSuccessRate / validSuccessRates : 0;
        aggregated.platform_health_score = this.calculatePlatformHealthScore(aggregated);

        return aggregated;
    }

    /**
     * Agrega métricas de participação
     */
    private async aggregateParticipationMetrics(tenantMetrics: any[]): Promise<object> {
        const aggregated = {
            // Growth metrics
            platform_growth_trends: {} as any,
            tenant_participation_distribution: {} as any,
            market_share_analysis: {} as any,
            
            // Comparative metrics
            top_performers: [] as any[],
            underperformers: [] as any[],
            platform_benchmarks: {} as any,
            
            calculation_timestamp: new Date().toISOString()
        };

        // Calcular participação relativa de cada tenant
        const totalPlatformRevenue = tenantMetrics.reduce((sum, t) => {
            return sum + parseFloat(t.comprehensive_metrics?.total_revenue || 0);
        }, 0);

        const tenantShares = tenantMetrics.map(tenant => {
            const revenue = parseFloat(tenant.comprehensive_metrics?.total_revenue || 0);
            const share = totalPlatformRevenue > 0 ? (revenue / totalPlatformRevenue) * 100 : 0;
            
            return {
                tenant_id: tenant.tenant_id,
                tenant_name: tenant.tenant_name,
                revenue,
                platform_share: share,
                appointments: parseInt(tenant.comprehensive_metrics?.total_appointments || 0)
            };
        }).sort((a, b) => b.revenue - a.revenue);

        // Top 5 performers
        aggregated.top_performers = tenantShares.slice(0, 5);
        
        // Underperformers (receita = 0)
        aggregated.underperformers = tenantShares.filter(t => t.revenue === 0);
        
        // Distribuição de participação
        tenantShares.forEach(tenant => {
            aggregated.tenant_participation_distribution[tenant.tenant_name || tenant.tenant_id] = tenant.platform_share;
        });

        // Benchmarks da plataforma
        aggregated.platform_benchmarks = {
            avg_tenant_revenue: totalPlatformRevenue / tenantMetrics.length,
            median_tenant_revenue: this.calculateMedian(tenantShares.map(t => t.revenue)),
            revenue_concentration: tenantShares.slice(0, 3).reduce((sum, t) => sum + t.platform_share, 0), // Top 3
            active_tenant_ratio: (tenantShares.filter(t => t.revenue > 0).length / tenantMetrics.length) * 100
        };

        return aggregated;
    }

    /**
     * Agrega métricas de ranking e scores
     */
    private async aggregateRankingMetrics(tenantMetrics: any[]): Promise<object> {
        const aggregated = {
            // Platform scores
            overall_platform_score: 0,
            platform_risk_assessment: {} as any,
            platform_performance_index: 0,
            
            // Rankings
            tenant_rankings: [] as any[],
            segment_analysis: {} as any,
            
            // Quality metrics
            platform_quality_scores: {} as any,
            improvement_opportunities: [] as string[],
            
            calculation_timestamp: new Date().toISOString()
        };

        let totalHealthScore = 0;
        let totalRiskScore = 0;
        let validScores = 0;
        const segments = {} as any;

        // Processar rankings individuais
        const tenantRankings = tenantMetrics.map(tenant => {
            const rank = tenant.ranking_metrics || {};
            const comp = tenant.comprehensive_metrics || {};
            
            const healthScore = parseFloat(rank.business_health_score || 0);
            const riskScore = parseFloat(rank.risk_score || 0);
            
            if (healthScore > 0) {
                totalHealthScore += healthScore;
                totalRiskScore += riskScore;
                validScores++;
            }
            
            // Análise por segmento (simulado baseado em características)
            const appointments = parseInt(comp.total_appointments || 0);
            let segment = 'startup'; // < 50 appointments
            if (appointments >= 50 && appointments < 200) segment = 'growth';
            if (appointments >= 200) segment = 'enterprise';
            
            if (!segments[segment]) segments[segment] = { count: 0, avg_health: 0, total_health: 0 };
            segments[segment].count++;
            segments[segment].total_health += healthScore;
            
            return {
                tenant_id: tenant.tenant_id,
                tenant_name: tenant.tenant_name,
                health_score: healthScore,
                risk_score: riskScore,
                risk_level: rank.risk_level || 'unknown',
                segment: segment,
                appointments: appointments
            };
        }).sort((a, b) => b.health_score - a.health_score);

        // Finalizar cálculos de segmento
        Object.keys(segments).forEach(segment => {
            segments[segment].avg_health = segments[segment].total_health / segments[segment].count;
        });

        // Montar resultado
        aggregated.overall_platform_score = validScores > 0 ? totalHealthScore / validScores : 0;
        aggregated.platform_risk_assessment = {
            avg_platform_risk: validScores > 0 ? totalRiskScore / validScores : 0,
            high_risk_tenants: tenantRankings.filter(t => t.risk_level === 'high').length,
            low_risk_tenants: tenantRankings.filter(t => t.risk_level === 'low').length
        };
        aggregated.tenant_rankings = tenantRankings;
        aggregated.segment_analysis = segments;

        // Quality scores
        aggregated.platform_quality_scores = {
            overall_health: aggregated.overall_platform_score,
            risk_distribution: this.calculateRiskDistribution(tenantRankings),
            segment_performance: segments
        };

        // Oportunidades de melhoria
        aggregated.improvement_opportunities = this.identifyImprovementOpportunities(tenantRankings);

        return aggregated;
    }

    /**
     * Salva métricas agregadas na nova estrutura
     */
    private async upsertPlatformMetrics(platformRecord: any): Promise<void> {
        console.log(`💾 Salvando platform_metrics refatorado (${platformRecord.period})`);

        const { error } = await this.client
            .from('platform_metrics')
            .upsert(platformRecord, {
                onConflict: 'calculation_date,period'
            });

        if (error) {
            throw new Error(`Erro ao salvar platform_metrics: ${(error as Error).message}`);
        }

        console.log(`✅ Platform_metrics salvo (${platformRecord.period})`);
    }

    // ========== MÉTODOS AUXILIARES ==========

    private async getTotalTenantsCount(): Promise<number> {
        const { count, error } = await this.client
            .from('tenants')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        return count || 0;
    }

    private periodToDays(period: string): number {
        switch(period) {
            case '7d': return 7;
            case '30d': return 30;
            case '90d': return 90;
            default: return 30;
        }
    }

    private calculatePlatformHealthScore(metrics: any): number {
        // Fórmula simples baseada em métricas key
        const revenueScore = metrics.total_platform_revenue > 0 ? 25 : 0;
        const activityScore = metrics.active_tenants_count > 0 ? 25 : 0;
        const performanceScore = metrics.platform_avg_success_rate > 0 ? (metrics.platform_avg_success_rate / 100) * 25 : 0;
        const diversityScore = Object.keys(metrics.revenue_distribution).length > 1 ? 25 : 0;

        return revenueScore + activityScore + performanceScore + diversityScore;
    }

    private calculateMedian(numbers: number[]): number {
        const sorted = numbers.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    }

    private calculateRiskDistribution(rankings: any[]): any {
        const distribution: { [key: string]: number } = { high: 0, medium: 0, low: 0, unknown: 0 };
        rankings.forEach((r: any) => {
            distribution[r.risk_level as string] = (distribution[r.risk_level as string] || 0) + 1;
        });
        return distribution;
    }

    private identifyImprovementOpportunities(rankings: any[]): string[] {
        const opportunities: string[] = [];
        
        const highRiskCount = rankings.filter((r: any) => r.risk_level === 'high').length;
        const zeroAppointments = rankings.filter((r: any) => r.appointments === 0).length;
        const lowHealthScores = rankings.filter((r: any) => r.health_score < 50).length;

        if (highRiskCount > 0) {
            opportunities.push(`${highRiskCount} tenants com risco alto precisam atenção`);
        }
        if (zeroAppointments > 0) {
            opportunities.push(`${zeroAppointments} tenants sem appointments precisam ativação`);
        }
        if (lowHealthScores > 0) {
            opportunities.push(`${lowHealthScores} tenants com saúde abaixo de 50 pontos`);
        }

        return opportunities;
    }
}