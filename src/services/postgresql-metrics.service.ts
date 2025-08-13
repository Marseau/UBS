/**
 * PostgreSQL Metrics Service
 * 
 * Service layer for the new PostgreSQL basic metrics functions.
 * Provides TypeScript interfaces and error handling for the 4 basic metrics.
 * 
 * Functions:
 * - calculate_monthly_revenue()
 * - calculate_new_customers()
 * - calculate_appointment_success_rate()
 * - calculate_no_show_impact()
 * - calculate_all_basic_metrics()
 */

import { supabase } from '../config/database';

// =====================================================
// TYPES AND INTERFACES
// =====================================================

export interface MonthlyRevenueResult {
    current_revenue: number;
    previous_revenue: number;
    change_percentage: number;
    total_appointments_current: number;
    total_appointments_previous: number;
    completed_appointments_current: number;
    completed_appointments_previous: number;
    period_days: number;
    calculated_at: string;
}

export interface NewCustomersResult {
    new_customers_current: number;
    new_customers_previous: number;
    change_percentage: number;
    total_customers_current: number;
    total_customers_previous: number;
    service_breakdown: Record<string, number>;
    professional_breakdown: Record<string, number>;
    period_days: number;
    calculated_at: string;
}

export interface AppointmentSuccessRateResult {
    success_rate_current: number;
    success_rate_previous: number;
    change_percentage: number;
    total_appointments_current: number;
    total_appointments_previous: number;
    completed_appointments_current: number;
    completed_appointments_previous: number;
    status_breakdown: Record<string, number>;
    service_breakdown: Record<string, number>;
    professional_breakdown: Record<string, number>;
    period_days: number;
    calculated_at: string;
}

export interface NoShowImpactResult {
    impact_percentage: number;
    previous_impact_percentage: number;
    change_percentage: number;
    no_show_count_current: number;
    no_show_count_previous: number;
    total_appointments_current: number;
    total_appointments_previous: number;
    lost_revenue_current: number;
    lost_revenue_previous: number;
    status_breakdown: Record<string, any>;
    period_days: number;
    calculated_at: string;
}

export interface AllBasicMetricsResult {
    tenant_id: string;
    period: {
        start_date: string;
        end_date: string;
        days: number;
    };
    monthly_revenue: MonthlyRevenueResult;
    new_customers: NewCustomersResult;
    appointment_success_rate: AppointmentSuccessRateResult;
    no_show_impact: NoShowImpactResult;
    calculated_at: string;
}

export interface MetricsCalculationParams {
    tenant_id: string;
    start_date: string; // YYYY-MM-DD format
    end_date: string;   // YYYY-MM-DD format
}

// =====================================================
// SERVICE CLASS
// =====================================================

export class PostgreSQLMetricsService {
    /**
     * Calculate monthly revenue metric using PostgreSQL function
     */
    async calculateMonthlyRevenue(params: MetricsCalculationParams): Promise<MonthlyRevenueResult> {
        try {
            const { data, error } = await (supabase as any).rpc('calculate_monthly_revenue', {
                p_tenant_id: params.tenant_id,
                p_start_date: params.start_date,
                p_end_date: params.end_date
            });

            if (error) {
                throw new Error(`Failed to calculate monthly revenue: ${error.message}`);
            }

            if (!data || (data as any[]).length === 0) {
                throw new Error('No data returned from monthly revenue calculation');
            }

            return data[0];
        } catch (error) {
            console.error('Error calculating monthly revenue:', error);
            throw error;
        }
    }

    /**
     * Calculate new customers metric using PostgreSQL function
     */
    async calculateNewCustomers(params: MetricsCalculationParams): Promise<NewCustomersResult> {
        try {
            const { data, error } = await (supabase as any).rpc('calculate_new_customers', {
                p_tenant_id: params.tenant_id,
                p_start_date: params.start_date,
                p_end_date: params.end_date
            });

            if (error) {
                throw new Error(`Failed to calculate new customers: ${error.message}`);
            }

            if (!data || (data as any[]).length === 0) {
                throw new Error('No data returned from new customers calculation');
            }

            return data[0];
        } catch (error) {
            console.error('Error calculating new customers:', error);
            throw error;
        }
    }

    /**
     * Calculate appointment success rate metric using PostgreSQL function
     */
    async calculateAppointmentSuccessRate(params: MetricsCalculationParams): Promise<AppointmentSuccessRateResult> {
        try {
            const { data, error } = await (supabase as any).rpc('calculate_appointment_success_rate', {
                p_tenant_id: params.tenant_id,
                p_start_date: params.start_date,
                p_end_date: params.end_date
            });

            if (error) {
                throw new Error(`Failed to calculate appointment success rate: ${error.message}`);
            }

            if (!data || (data as any[]).length === 0) {
                throw new Error('No data returned from appointment success rate calculation');
            }

            return data[0];
        } catch (error) {
            console.error('Error calculating appointment success rate:', error);
            throw error;
        }
    }

    /**
     * Calculate no-show impact metric using PostgreSQL function
     */
    async calculateNoShowImpact(params: MetricsCalculationParams): Promise<NoShowImpactResult> {
        try {
            const { data, error } = await (supabase as any).rpc('calculate_no_show_impact', {
                p_tenant_id: params.tenant_id,
                p_start_date: params.start_date,
                p_end_date: params.end_date
            });

            if (error) {
                throw new Error(`Failed to calculate no-show impact: ${error.message}`);
            }

            if (!data || (data as any[]).length === 0) {
                throw new Error('No data returned from no-show impact calculation');
            }

            return data[0];
        } catch (error) {
            console.error('Error calculating no-show impact:', error);
            throw error;
        }
    }

    /**
     * Calculate all basic metrics using comprehensive PostgreSQL function
     */
    async calculateAllBasicMetrics(params: MetricsCalculationParams): Promise<AllBasicMetricsResult> {
        try {
            const { data, error } = await (supabase as any).rpc('calculate_all_basic_metrics', {
                p_tenant_id: params.tenant_id,
                p_start_date: params.start_date,
                p_end_date: params.end_date
            });

            if (error) {
                throw new Error(`Failed to calculate all basic metrics: ${error.message}`);
            }

            if (!data) {
                throw new Error('No data returned from all basic metrics calculation');
            }

            return data;
        } catch (error) {
            console.error('Error calculating all basic metrics:', error);
            throw error;
        }
    }

    /**
     * Helper method to generate common date ranges
     */
    static generateDateRange(periodDays: number): { start_date: string; end_date: string } {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - periodDays);

        return {
            start_date: start.toISOString().split('T')[0] || '',
            end_date: end.toISOString().split('T')[0] || ''
        };
    }

    /**
     * Helper method for common periods (7d, 30d, 90d)
     */
    async calculateMetricsForPeriod(
        tenant_id: string, 
        periodDays: 7 | 30 | 90
    ): Promise<AllBasicMetricsResult> {
        const dateRange = PostgreSQLMetricsService.generateDateRange(periodDays);
        
        return this.calculateAllBasicMetrics({
            tenant_id,
            ...dateRange
        });
    }

    /**
     * Batch calculate metrics for multiple tenants
     */
    async calculateMetricsForTenants(
        tenant_ids: string[],
        params: Omit<MetricsCalculationParams, 'tenant_id'>
    ): Promise<{ tenant_id: string; metrics?: AllBasicMetricsResult; error?: string }[]> {
        const promises = tenant_ids.map(async (tenant_id) => {
            try {
                const metrics = await this.calculateAllBasicMetrics({
                    tenant_id,
                    ...params
                });
                return { tenant_id, metrics };
            } catch (error) {
                return { 
                    tenant_id, 
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        });

        return Promise.all(promises);
    }

    /**
     * Store calculated metrics in tenant_metrics table
     */
    async storeMetricsInTable(
        tenant_id: string,
        metrics: AllBasicMetricsResult,
        metric_type: string = 'basic_metrics',
        period: string = '30d'
    ): Promise<void> {
        try {
            const { error } = await supabase
                .from('tenant_metrics')
                .upsert({
                    tenant_id,
                    metric_type,
                    metric_data: metrics as any,
                    period,
                    calculated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) {
                throw new Error(`Failed to store metrics: ${error.message}`);
            }
        } catch (error) {
            console.error('Error storing metrics:', error);
            throw error;
        }
    }

    /**
     * Calculate and store metrics for all active tenants
     */
    async calculateAndStoreForAllTenants(periodDays: number = 30): Promise<{
        success: number;
        failed: number;
        errors: string[];
    }> {
        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        try {
            // Get all active tenants
            const { data: tenants, error: tenantsError } = await supabase
                .from('tenants')
                .select('id, name')
                .eq('status', 'active');

            if (tenantsError) {
                throw new Error(`Failed to fetch tenants: ${tenantsError.message}`);
            }

            if (!tenants || tenants.length === 0) {
                throw new Error('No active tenants found');
            }

            console.log(`📊 Calculating metrics for ${tenants.length} tenants...`);

            // Calculate metrics for each tenant
            for (const tenant of tenants) {
                try {
                    const metrics = await this.calculateMetricsForPeriod(tenant.id, periodDays as 7 | 30 | 90);
                    
                    await this.storeMetricsInTable(
                        tenant.id,
                        metrics,
                        'basic_metrics',
                        `${periodDays}d`
                    );

                    results.success++;
                    console.log(`✅ Metrics calculated for ${tenant.name}`);
                } catch (error) {
                    results.failed++;
                    const errorMessage = `Failed for ${tenant.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
                    results.errors.push(errorMessage);
                    console.error(`❌ ${errorMessage}`);
                }
            }

            console.log(`📊 Batch calculation completed: ${results.success} success, ${results.failed} failed`);
            return results;
        } catch (error) {
            console.error('Error in batch calculation:', error);
            throw error;
        }
    }
}

// =====================================================
// SINGLETON EXPORT
// =====================================================

export const postgresMetricsService = new PostgreSQLMetricsService();

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Validate metrics calculation parameters
 */
export function validateMetricsParams(params: MetricsCalculationParams): string[] {
    const errors: string[] = [];

    if (!params.tenant_id) {
        errors.push('tenant_id is required');
    }

    if (!params.start_date) {
        errors.push('start_date is required');
    }

    if (!params.end_date) {
        errors.push('end_date is required');
    }

    if (params.start_date && params.end_date && params.start_date > params.end_date) {
        errors.push('start_date must be before or equal to end_date');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (params.start_date && !dateRegex.test(params.start_date)) {
        errors.push('start_date must be in YYYY-MM-DD format');
    }

    if (params.end_date && !dateRegex.test(params.end_date)) {
        errors.push('end_date must be in YYYY-MM-DD format');
    }

    return errors;
}

/**
 * Format metrics result for API response
 */
export function formatMetricsForAPI(metrics: AllBasicMetricsResult) {
    return {
        tenant_id: metrics.tenant_id,
        period: metrics.period,
        metrics: {
            monthly_revenue: {
                current: parseFloat(metrics.monthly_revenue.current_revenue.toString()),
                previous: parseFloat(metrics.monthly_revenue.previous_revenue.toString()),
                change_percent: parseFloat(metrics.monthly_revenue.change_percentage.toString()),
                appointments: {
                    current: metrics.monthly_revenue.total_appointments_current,
                    completed: metrics.monthly_revenue.completed_appointments_current
                }
            },
            new_customers: {
                current: metrics.new_customers.new_customers_current,
                previous: metrics.new_customers.new_customers_previous,
                change_percent: parseFloat(metrics.new_customers.change_percentage.toString()),
                total_customers: metrics.new_customers.total_customers_current,
                breakdowns: {
                    services: metrics.new_customers.service_breakdown,
                    professionals: metrics.new_customers.professional_breakdown
                }
            },
            success_rate: {
                current: parseFloat(metrics.appointment_success_rate.success_rate_current.toString()),
                previous: parseFloat(metrics.appointment_success_rate.success_rate_previous.toString()),
                change_percent: parseFloat(metrics.appointment_success_rate.change_percentage.toString()),
                appointments: {
                    total: metrics.appointment_success_rate.total_appointments_current,
                    completed: metrics.appointment_success_rate.completed_appointments_current
                },
                breakdowns: {
                    status: metrics.appointment_success_rate.status_breakdown,
                    services: metrics.appointment_success_rate.service_breakdown,
                    professionals: metrics.appointment_success_rate.professional_breakdown
                }
            },
            no_show_impact: {
                impact_percent: parseFloat(metrics.no_show_impact.impact_percentage.toString()),
                previous_impact_percent: parseFloat(metrics.no_show_impact.previous_impact_percentage.toString()),
                change_percent: parseFloat(metrics.no_show_impact.change_percentage.toString()),
                no_shows: {
                    current: metrics.no_show_impact.no_show_count_current,
                    previous: metrics.no_show_impact.no_show_count_previous
                },
                lost_revenue: {
                    current: parseFloat(metrics.no_show_impact.lost_revenue_current.toString()),
                    previous: parseFloat(metrics.no_show_impact.lost_revenue_previous.toString())
                },
                status_breakdown: metrics.no_show_impact.status_breakdown
            }
        },
        calculated_at: metrics.calculated_at
    };
}