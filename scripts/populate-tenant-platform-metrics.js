#!/usr/bin/env node

/**
 * Script to populate tenant-platform metrics tables
 * This script should be run as a cron job to keep the pre-calculated metrics up to date
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

class TenantPlatformMetricsPopulator {
    constructor() {
        this.currentDate = new Date();
        this.currentMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        this.previousMonth = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    }

    async populateAll() {
        console.log('🚀 Starting tenant-platform metrics population...');
        
        try {
            // 1. Populate platform context metrics
            await this.populatePlatformContextMetrics();
            
            // 2. Populate tenant platform metrics
            await this.populateTenantPlatformMetrics();
            
            // 3. Populate tenant platform evolution
            await this.populateTenantPlatformEvolution();
            
            // 4. Populate tenant platform ranking
            await this.populateTenantPlatformRanking();
            
            // 5. Populate tenant services distribution
            await this.populateTenantServicesDistribution();
            
            console.log('✅ All tenant-platform metrics populated successfully!');
            
        } catch (error) {
            console.error('❌ Error populating tenant-platform metrics:', error);
            throw error;
        }
    }

    async populatePlatformContextMetrics() {
        console.log('📊 Populating platform context metrics...');
        
        try {
            // Get total revenue
            const { data: revenueData } = await supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const totalRevenue = revenueData?.reduce((sum, apt) => {
                return sum + (apt.final_price || apt.quoted_price || 0);
            }, 0) || 0;

            // Get total appointments
            const { data: appointmentsData } = await supabase
                .from('appointments')
                .select('id')
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const totalAppointments = appointmentsData?.length || 0;

            // Get total customers
            const { data: customersData } = await supabase
                .from('users')
                .select('id')
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const totalCustomers = customersData?.length || 0;

            // Get total AI interactions
            const { data: aiData } = await supabase
                .from('conversation_history')
                .select('id')
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const totalAiInteractions = aiData?.length || 0;

            // Get active tenants
            const { data: tenantsData } = await supabase
                .from('tenants')
                .select('id')
                .eq('is_active', true);

            const totalActiveTenants = tenantsData?.length || 0;

            // Calculate averages
            const avgTenantRevenue = totalActiveTenants > 0 ? totalRevenue / totalActiveTenants : 0;
            const avgTenantAppointments = totalActiveTenants > 0 ? totalAppointments / totalActiveTenants : 0;
            const avgTenantCustomers = totalActiveTenants > 0 ? totalCustomers / totalActiveTenants : 0;

            // Upsert platform context metrics
            const { error } = await supabase
                .from('platform_context_metrics')
                .upsert({
                    metric_date: this.currentMonth.toISOString().split('T')[0],
                    total_revenue: totalRevenue,
                    total_appointments: totalAppointments,
                    total_customers: totalCustomers,
                    total_ai_interactions: totalAiInteractions,
                    total_active_tenants: totalActiveTenants,
                    avg_tenant_revenue: avgTenantRevenue,
                    avg_tenant_appointments: avgTenantAppointments,
                    avg_tenant_customers: avgTenantCustomers,
                    calculated_at: new Date().toISOString()
                });

            if (error) throw error;

            console.log('✅ Platform context metrics populated');
            
        } catch (error) {
            console.error('❌ Error populating platform context metrics:', error);
            throw error;
        }
    }

    async populateTenantPlatformMetrics() {
        console.log('🏢 Populating tenant platform metrics...');
        
        try {
            // Get all active tenants
            const { data: tenants } = await supabase
                .from('tenants')
                .select('id, name, business_domain')
                .eq('is_active', true);

            if (!tenants || tenants.length === 0) {
                console.log('No active tenants found');
                return;
            }

            // Get platform context for this month
            const { data: platformContext } = await supabase
                .from('platform_context_metrics')
                .select('*')
                .eq('metric_date', this.currentMonth.toISOString().split('T')[0])
                .single();

            if (!platformContext) {
                console.log('Platform context not found, skipping tenant metrics');
                return;
            }

            // Process each tenant
            for (const tenant of tenants) {
                await this.calculateTenantMetrics(tenant, platformContext);
            }

            console.log('✅ Tenant platform metrics populated');
            
        } catch (error) {
            console.error('❌ Error populating tenant platform metrics:', error);
            throw error;
        }
    }

    async calculateTenantMetrics(tenant, platformContext) {
        try {
            // Get tenant revenue
            const { data: revenueData } = await supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenant.id)
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const tenantRevenue = revenueData?.reduce((sum, apt) => {
                return sum + (apt.final_price || apt.quoted_price || 0);
            }, 0) || 0;

            // Get tenant appointments
            const { data: appointmentsData } = await supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenant.id)
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const tenantAppointments = appointmentsData?.length || 0;

            // Get tenant customers
            const { data: customersData } = await supabase
                .from('user_tenants')
                .select('user_id')
                .eq('tenant_id', tenant.id)
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const tenantCustomers = customersData?.length || 0;

            // Get tenant AI interactions
            const { data: aiData } = await supabase
                .from('conversation_history')
                .select('id')
                .eq('tenant_id', tenant.id)
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            const tenantAiInteractions = aiData?.length || 0;

            // Calculate participation percentages
            const revenueParticipation = platformContext.total_revenue > 0 ? 
                (tenantRevenue / platformContext.total_revenue) * 100 : 0;
            
            const appointmentsParticipation = platformContext.total_appointments > 0 ? 
                (tenantAppointments / platformContext.total_appointments) * 100 : 0;
            
            const customersParticipation = platformContext.total_customers > 0 ? 
                (tenantCustomers / platformContext.total_customers) * 100 : 0;
            
            const aiParticipation = platformContext.total_ai_interactions > 0 ? 
                (tenantAiInteractions / platformContext.total_ai_interactions) * 100 : 0;

            // Calculate risk score (simplified)
            const avgParticipation = (revenueParticipation + appointmentsParticipation + customersParticipation + aiParticipation) / 4;
            const riskScore = Math.max(0, Math.min(100, 100 - (avgParticipation * 2)));
            
            let riskStatus = 'Low Risk';
            if (riskScore >= 80) riskStatus = 'High Risk';
            else if (riskScore >= 60) riskStatus = 'Medium Risk';

            // Upsert tenant platform metrics
            const { error } = await supabase
                .from('tenant_platform_metrics')
                .upsert({
                    tenant_id: tenant.id,
                    metric_month: this.currentMonth.toISOString().split('T')[0],
                    platform_revenue_participation_pct: revenueParticipation,
                    tenant_revenue_value: tenantRevenue,
                    platform_total_revenue: platformContext.total_revenue,
                    platform_appointments_participation_pct: appointmentsParticipation,
                    tenant_appointments_count: tenantAppointments,
                    platform_total_appointments: platformContext.total_appointments,
                    platform_customers_participation_pct: customersParticipation,
                    tenant_customers_count: tenantCustomers,
                    platform_total_customers: platformContext.total_customers,
                    platform_ai_participation_pct: aiParticipation,
                    tenant_ai_interactions: tenantAiInteractions,
                    platform_total_ai_interactions: platformContext.total_ai_interactions,
                    risk_score: riskScore,
                    risk_status: riskStatus,
                    calculated_at: new Date().toISOString()
                });

            if (error) throw error;

            console.log(`📊 Metrics calculated for tenant: ${tenant.name}`);
            
        } catch (error) {
            console.error(`❌ Error calculating metrics for tenant ${tenant.name}:`, error);
            throw error;
        }
    }

    async populateTenantPlatformEvolution() {
        console.log('📈 Populating tenant platform evolution...');
        
        try {
            // Get metrics for current and previous month
            const { data: currentMetrics } = await supabase
                .from('tenant_platform_metrics')
                .select('*')
                .eq('metric_month', this.currentMonth.toISOString().split('T')[0]);

            const { data: previousMetrics } = await supabase
                .from('tenant_platform_metrics')
                .select('*')
                .eq('metric_month', this.previousMonth.toISOString().split('T')[0]);

            if (!currentMetrics || currentMetrics.length === 0) {
                console.log('No current metrics found for evolution calculation');
                return;
            }

            // Create evolution records
            for (const current of currentMetrics) {
                const previous = previousMetrics?.find(p => p.tenant_id === current.tenant_id);
                
                const revenueChange = previous ? 
                    current.platform_revenue_participation_pct - previous.platform_revenue_participation_pct : 0;
                
                const appointmentsChange = previous ? 
                    current.platform_appointments_participation_pct - previous.platform_appointments_participation_pct : 0;
                
                const customersChange = previous ? 
                    current.platform_customers_participation_pct - previous.platform_customers_participation_pct : 0;
                
                const aiChange = previous ? 
                    current.platform_ai_participation_pct - previous.platform_ai_participation_pct : 0;

                const { error } = await supabase
                    .from('tenant_platform_evolution')
                    .upsert({
                        tenant_id: current.tenant_id,
                        evolution_date: this.currentMonth.toISOString().split('T')[0],
                        revenue_participation_pct: current.platform_revenue_participation_pct,
                        appointments_participation_pct: current.platform_appointments_participation_pct,
                        customers_participation_pct: current.platform_customers_participation_pct,
                        ai_participation_pct: current.platform_ai_participation_pct,
                        revenue_participation_change_pct: revenueChange,
                        appointments_participation_change_pct: appointmentsChange,
                        customers_participation_change_pct: customersChange,
                        ai_participation_change_pct: aiChange,
                        calculated_at: new Date().toISOString()
                    });

                if (error) throw error;
            }

            console.log('✅ Tenant platform evolution populated');
            
        } catch (error) {
            console.error('❌ Error populating tenant platform evolution:', error);
            throw error;
        }
    }

    async populateTenantPlatformRanking() {
        console.log('🏆 Populating tenant platform ranking...');
        
        try {
            // Get all current metrics
            const { data: metrics } = await supabase
                .from('tenant_platform_metrics')
                .select('*')
                .eq('metric_month', this.currentMonth.toISOString().split('T')[0])
                .order('platform_revenue_participation_pct', { ascending: false });

            if (!metrics || metrics.length === 0) {
                console.log('No metrics found for ranking calculation');
                return;
            }

            // Get previous rankings
            const { data: previousRankings } = await supabase
                .from('tenant_platform_ranking')
                .select('*')
                .eq('ranking_date', this.previousMonth.toISOString().split('T')[0]);

            // Calculate ranking
            for (let i = 0; i < metrics.length; i++) {
                const metric = metrics[i];
                const position = i + 1;
                
                const previousRanking = previousRankings?.find(r => r.tenant_id === metric.tenant_id);
                const previousPosition = previousRanking?.position || 0;
                const positionChange = previousPosition > 0 ? previousPosition - position : 0;

                // Calculate scores
                const revenueScore = metric.platform_revenue_participation_pct;
                const appointmentsScore = metric.platform_appointments_participation_pct;
                const growthScore = Math.max(0, 50 + (positionChange * 10)); // Basic growth scoring
                const engagementScore = metric.platform_ai_participation_pct;
                const totalScore = (revenueScore + appointmentsScore + growthScore + engagementScore) / 4;

                const percentile = ((metrics.length - position + 1) / metrics.length) * 100;

                const { error } = await supabase
                    .from('tenant_platform_ranking')
                    .upsert({
                        ranking_date: this.currentMonth.toISOString().split('T')[0],
                        tenant_id: metric.tenant_id,
                        position: position,
                        previous_position: previousPosition,
                        position_change: positionChange,
                        total_score: totalScore,
                        revenue_score: revenueScore,
                        appointments_score: appointmentsScore,
                        growth_score: growthScore,
                        engagement_score: engagementScore,
                        total_tenants: metrics.length,
                        percentile: percentile,
                        calculated_at: new Date().toISOString()
                    });

                if (error) throw error;
            }

            console.log('✅ Tenant platform ranking populated');
            
        } catch (error) {
            console.error('❌ Error populating tenant platform ranking:', error);
            throw error;
        }
    }

    async populateTenantServicesDistribution() {
        console.log('🎯 Populating tenant services distribution...');
        
        try {
            // Get all active tenants
            const { data: tenants } = await supabase
                .from('tenants')
                .select('id')
                .eq('is_active', true);

            if (!tenants || tenants.length === 0) {
                console.log('No active tenants found');
                return;
            }

            // Process each tenant
            for (const tenant of tenants) {
                await this.calculateTenantServicesDistribution(tenant.id);
            }

            console.log('✅ Tenant services distribution populated');
            
        } catch (error) {
            console.error('❌ Error populating tenant services distribution:', error);
            throw error;
        }
    }

    async calculateTenantServicesDistribution(tenantId) {
        try {
            // Get appointments with services for this tenant
            const { data: appointmentServices } = await supabase
                .from('appointments')
                .select(`
                    services!inner (
                        id, name, category
                    ),
                    final_price,
                    quoted_price,
                    status
                `)
                .eq('tenant_id', tenantId)
                .in('status', ['completed', 'confirmed'])
                .gte('created_at', this.currentMonth.toISOString())
                .lt('created_at', new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1).toISOString());

            if (!appointmentServices || appointmentServices.length === 0) {
                return;
            }

            // Group by service category
            const serviceGroups = {};
            appointmentServices.forEach(apt => {
                const category = apt.services?.category || 'Outros';
                if (!serviceGroups[category]) {
                    serviceGroups[category] = {
                        count: 0,
                        revenue: 0,
                        appointments: 0
                    };
                }
                
                serviceGroups[category].count++;
                serviceGroups[category].appointments++;
                serviceGroups[category].revenue += (apt.final_price || apt.quoted_price || 0);
            });

            // Calculate total for percentages
            const totalAppointments = appointmentServices.length;

            // Insert distribution records
            for (const [category, data] of Object.entries(serviceGroups)) {
                const participationPct = (data.appointments / totalAppointments) * 100;

                const { error } = await supabase
                    .from('tenant_services_distribution')
                    .upsert({
                        tenant_id: tenantId,
                        calculation_date: this.currentMonth.toISOString().split('T')[0],
                        service_category: category,
                        service_count: data.count,
                        service_revenue: data.revenue,
                        service_appointments: data.appointments,
                        tenant_service_participation_pct: participationPct,
                        calculated_at: new Date().toISOString()
                    });

                if (error) throw error;
            }

            console.log(`📊 Services distribution calculated for tenant: ${tenantId}`);
            
        } catch (error) {
            console.error(`❌ Error calculating services distribution for tenant ${tenantId}:`, error);
            throw error;
        }
    }
}

// Main execution
async function main() {
    try {
        const populator = new TenantPlatformMetricsPopulator();
        await populator.populateAll();
        console.log('🎉 Tenant-platform metrics population completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = TenantPlatformMetricsPopulator;