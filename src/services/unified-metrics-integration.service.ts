/**
 * Unified Metrics Integration Service
 * Integrates the new unified procedure with existing cron system
 * 
 * @version 1.0.0
 * @author UBS Team
 */

import { getAdminClient } from '../config/database';
import { Logger } from 'winston';

export interface UnifiedMetricsResult {
    success: boolean;
    processed_tenants: number;
    periods_processed: number[];
    total_metrics_created: number;
    calculation_date: string;
    execution_time_ms: number;
}

export class UnifiedMetricsIntegrationService {
    private client = getAdminClient();
    private logger: Logger;

    constructor(logger?: Logger) {
        this.logger = logger || console as any;
    }

    /**
     * Execute the unified metrics procedure for all tenants and periods
     */
    async executeUnifiedMetricsCalculation(
        calculationDate?: string | null,
        tenantId?: string | null
    ): Promise<UnifiedMetricsResult> {
        const startTime = Date.now();
        
        try {
            this.logger.info('Starting unified metrics calculation', {
                calculationDate: calculationDate || 'CURRENT_DATE',
                tenantId: tenantId || 'ALL_TENANTS',
                timestamp: new Date().toISOString()
            });

            // Call the DEFINITIVA TOTAL fixed procedure
            const { data, error } = await (this.client as any)
                .rpc('calculate_tenant_metrics_definitiva_total_fixed_v5', {
                    p_calculation_date: calculationDate || null,
                    p_tenant_id: tenantId || null
                });

            if (error) {
                throw new Error(`Database error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            const result = data as UnifiedMetricsResult;
            
            this.logger.info('Unified metrics calculation completed', {
                success: result.success,
                processed_tenants: result.processed_tenants,
                periods_processed: result.periods_processed,
                total_metrics_created: result.total_metrics_created,
                execution_time_ms: result.execution_time_ms,
                timestamp: new Date().toISOString()
            });

            return result;

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.logger.error('Unified metrics calculation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                execution_time_ms: executionTime,
                timestamp: new Date().toISOString()
            });

            return {
                success: false,
                processed_tenants: 0,
                periods_processed: [],
                total_metrics_created: 0,
                calculation_date: (calculationDate || new Date().toISOString().split('T')[0]) as string,
                execution_time_ms: executionTime
            };
        }
    }

    /**
     * Execute the cronjob function directly
     */
    async executeCronjob(): Promise<any> {
        try {
            this.logger.info('Starting unified metrics cronjob');

            const { data, error } = await (this.client as any)
                .rpc('calculate_tenant_metrics_definitiva_total_fixed_v5', {
                    p_calculation_date: null,
                    p_tenant_id: null
                });

            if (error) {
                throw new Error(`Cronjob execution error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            this.logger.info('Unified metrics cronjob completed successfully', data);
            return data;

        } catch (error) {
            this.logger.error('Unified metrics cronjob failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Verify that the unified procedure exists in the database
     */
    async verifyProcedureExists(): Promise<boolean> {
        try {
            // Test if function exists by trying to call it
            const { data, error } = await (this.client as any)
                .rpc('calculate_tenant_metrics_definitiva_total_fixed_v5', {
                    p_calculation_date: new Date().toISOString().split('T')[0],
                    p_tenant_id: null
                });

            if (error && error.code === 'PGRST202') {
                // Function does not exist
                return false;
            }

            const exists = !error || !!data;
            this.logger.info('Procedure verification', {
                procedure: 'calculate_tenant_metrics_definitiva_total_fixed_v5',
                exists
            });

            return exists;

        } catch (error) {
            this.logger.error('Procedure verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            return false;
        }
    }

    /**
     * Get current metrics count from tenant_metrics table
     */
    async getCurrentMetricsCount(): Promise<{ total: number; by_metric_type: any }> {
        try {
            // Total count
            const { count: total, error: countError } = await this.client
                .from('tenant_metrics')
                .select('*', { count: 'exact', head: true });

            if (countError) {
                throw new Error(`Count error: ${countError.message}`);
            }

            // Count by metric type
            const { data: byType, error: typeError } = await this.client
                .from('tenant_metrics')
                .select('metric_type, period')
                .order('metric_type, period');

            if (typeError) {
                throw new Error(`Type count error: ${typeError.message}`);
            }

            // Group by metric_type and period
            const grouped = byType?.reduce((acc: any, item: any) => {
                const key = `${item.metric_type}-${item.period}`;
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {}) || {};

            return {
                total: total || 0,
                by_metric_type: grouped
            };

        } catch (error) {
            this.logger.error('Failed to get metrics count', { error: error instanceof Error ? error.message : 'Unknown error' });
            return { total: 0, by_metric_type: {} };
        }
    }

    /**
     * Clear tenant_metrics table (use with caution)
     */
    async clearTenantMetrics(): Promise<{ deleted_count: number }> {
        try {
            this.logger.warn('Clearing tenant_metrics table - ALL DATA WILL BE DELETED');

            const { count, error } = await this.client
                .from('tenant_metrics')
                .delete({ count: 'exact' })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

            if (error) {
                throw new Error(`Delete error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            const deletedCount = count || 0;
            this.logger.info('Tenant metrics table cleared', { deleted_count: deletedCount });

            return { deleted_count: deletedCount };

        } catch (error) {
            this.logger.error('Failed to clear tenant_metrics table', { error: error instanceof Error ? error.message : 'Unknown error' });
            throw error;
        }
    }
}

export default UnifiedMetricsIntegrationService;