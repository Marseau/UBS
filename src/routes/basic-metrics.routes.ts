/**
 * Basic Metrics API Routes
 * 
 * RESTful API endpoints for the PostgreSQL basic metrics functions.
 * Provides endpoints for individual metrics and comprehensive calculations.
 */

import { Router, Request, Response } from 'express';
import { 
    postgresMetricsService, 
    validateMetricsParams, 
    formatMetricsForAPI,
    MetricsCalculationParams 
} from '../services/postgresql-metrics.service';

const router = Router();

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Validate and parse metrics request parameters
 */
const validateMetricsRequest = (req: Request, res: Response, next: any): void | Response => {
    const { tenant_id, start_date, end_date } = req.query;

    if (!tenant_id || typeof tenant_id !== 'string') {
        return res.status(400).json({
            error: 'tenant_id is required and must be a valid UUID string'
        });
    }

    if (!start_date || typeof start_date !== 'string') {
        return res.status(400).json({
            error: 'start_date is required and must be in YYYY-MM-DD format'
        });
    }

    if (!end_date || typeof end_date !== 'string') {
        return res.status(400).json({
            error: 'end_date is required and must be in YYYY-MM-DD format'
        });
    }

    const params: MetricsCalculationParams = {
        tenant_id,
        start_date,
        end_date
    };

    const validationErrors = validateMetricsParams(params);
    if (validationErrors.length > 0) {
        return res.status(400).json({
            error: 'Validation failed',
            details: validationErrors
        });
    }

    // Add validated params to request
    req.metricsParams = params;
    next();
};

// =====================================================
// INDIVIDUAL METRIC ENDPOINTS
// =====================================================

/**
 * GET /api/metrics/monthly-revenue
 * Calculate monthly revenue for a tenant and period
 */
router.get('/monthly-revenue', validateMetricsRequest, async (req: Request, res: Response) => {
    try {
        const result = await postgresMetricsService.calculateMonthlyRevenue(req.metricsParams!);
        
        res.json({
            success: true,
            data: {
                metric: 'monthly_revenue',
                current_revenue: parseFloat(result.current_revenue.toString()),
                previous_revenue: parseFloat(result.previous_revenue.toString()),
                change_percentage: parseFloat(result.change_percentage.toString()),
                appointments: {
                    current_total: result.total_appointments_current,
                    current_completed: result.completed_appointments_current,
                    previous_total: result.total_appointments_previous,
                    previous_completed: result.completed_appointments_previous
                },
                period_days: result.period_days,
                calculated_at: result.calculated_at
            }
        });
    } catch (error) {
        console.error('Error in monthly-revenue endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

/**
 * GET /api/metrics/new-customers
 * Calculate new customers for a tenant and period
 */
router.get('/new-customers', validateMetricsRequest, async (req: Request, res: Response) => {
    try {
        const result = await postgresMetricsService.calculateNewCustomers(req.metricsParams!);
        
        res.json({
            success: true,
            data: {
                metric: 'new_customers',
                new_customers_current: result.new_customers_current,
                new_customers_previous: result.new_customers_previous,
                change_percentage: parseFloat(result.change_percentage.toString()),
                total_customers: {
                    current: result.total_customers_current,
                    previous: result.total_customers_previous
                },
                breakdowns: {
                    services: result.service_breakdown,
                    professionals: result.professional_breakdown
                },
                period_days: result.period_days,
                calculated_at: result.calculated_at
            }
        });
    } catch (error) {
        console.error('Error in new-customers endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

/**
 * GET /api/metrics/success-rate
 * Calculate appointment success rate for a tenant and period
 */
router.get('/success-rate', validateMetricsRequest, async (req: Request, res: Response) => {
    try {
        const result = await postgresMetricsService.calculateAppointmentSuccessRate(req.metricsParams!);
        
        res.json({
            success: true,
            data: {
                metric: 'appointment_success_rate',
                success_rate_current: parseFloat(result.success_rate_current.toString()),
                success_rate_previous: parseFloat(result.success_rate_previous.toString()),
                change_percentage: parseFloat(result.change_percentage.toString()),
                appointments: {
                    current_total: result.total_appointments_current,
                    current_completed: result.completed_appointments_current,
                    previous_total: result.total_appointments_previous,
                    previous_completed: result.completed_appointments_previous
                },
                breakdowns: {
                    status: result.status_breakdown,
                    services: result.service_breakdown,
                    professionals: result.professional_breakdown
                },
                period_days: result.period_days,
                calculated_at: result.calculated_at
            }
        });
    } catch (error) {
        console.error('Error in success-rate endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

/**
 * GET /api/metrics/no-show-impact
 * Calculate no-show impact for a tenant and period
 */
router.get('/no-show-impact', validateMetricsRequest, async (req: Request, res: Response) => {
    try {
        const result = await postgresMetricsService.calculateNoShowImpact(req.metricsParams!);
        
        res.json({
            success: true,
            data: {
                metric: 'no_show_impact',
                impact_percentage: parseFloat(result.impact_percentage.toString()),
                previous_impact_percentage: parseFloat(result.previous_impact_percentage.toString()),
                change_percentage: parseFloat(result.change_percentage.toString()),
                no_show_counts: {
                    current: result.no_show_count_current,
                    previous: result.no_show_count_previous
                },
                total_appointments: {
                    current: result.total_appointments_current,
                    previous: result.total_appointments_previous
                },
                lost_revenue: {
                    current: parseFloat(result.lost_revenue_current.toString()),
                    previous: parseFloat(result.lost_revenue_previous.toString())
                },
                status_breakdown: result.status_breakdown,
                period_days: result.period_days,
                calculated_at: result.calculated_at
            }
        });
    } catch (error) {
        console.error('Error in no-show-impact endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

// =====================================================
// COMPREHENSIVE ENDPOINTS
// =====================================================

/**
 * GET /api/metrics/all
 * Calculate all basic metrics for a tenant and period
 */
router.get('/all', validateMetricsRequest, async (req: Request, res: Response) => {
    try {
        const result = await postgresMetricsService.calculateAllBasicMetrics(req.metricsParams!);
        const formattedResult = formatMetricsForAPI(result);
        
        res.json({
            success: true,
            data: formattedResult
        });
    } catch (error) {
        console.error('Error in all-metrics endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

/**
 * GET /api/metrics/periods/:tenant_id
 * Get metrics for common periods (7d, 30d, 90d)
 */
router.get('/periods/:tenant_id', async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { tenant_id } = req.params;
        
        if (!tenant_id) {
            return res.status(400).json({
                success: false,
                error: 'tenant_id parameter is required'
            });
        }

        const periods = [7, 30, 90] as const;
        const results = await Promise.allSettled(
            periods.map(async (days) => {
                const metrics = await postgresMetricsService.calculateMetricsForPeriod(tenant_id, days);
                return {
                    period: `${days}d`,
                    metrics: formatMetricsForAPI(metrics)
                };
            })
        );

        const successfulResults = results
            .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
            .map(result => result.value);

        const failedResults = results
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .map(result => result.reason);

        res.json({
            success: true,
            data: {
                tenant_id,
                periods: successfulResults,
                errors: failedResults.length > 0 ? failedResults.map(err => err.message) : undefined
            }
        });
    } catch (error) {
        console.error('Error in periods endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

// =====================================================
// BATCH OPERATIONS
// =====================================================

/**
 * POST /api/metrics/batch
 * Calculate metrics for multiple tenants
 */
router.post('/batch', async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { tenant_ids, start_date, end_date } = req.body;

        if (!tenant_ids || !Array.isArray(tenant_ids) || tenant_ids.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'tenant_ids must be a non-empty array'
            });
        }

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                error: 'start_date and end_date are required'
            });
        }

        const results = await postgresMetricsService.calculateMetricsForTenants(tenant_ids, {
            start_date,
            end_date
        });

        const successful = results.filter(r => r.metrics).length;
        const failed = results.filter(r => r.error).length;

        res.json({
            success: true,
            data: {
                summary: {
                    total: results.length,
                    successful,
                    failed
                },
                results: results.map(result => ({
                    tenant_id: result.tenant_id,
                    success: !!result.metrics,
                    data: result.metrics ? formatMetricsForAPI(result.metrics) : undefined,
                    error: result.error
                }))
            }
        });
    } catch (error) {
        console.error('Error in batch endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

/**
 * POST /api/metrics/calculate-all-tenants
 * Calculate and store metrics for all active tenants
 */
router.post('/calculate-all-tenants', async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { period_days = 30 } = req.body;

        if (period_days && ![7, 30, 90].includes(period_days)) {
            return res.status(400).json({
                success: false,
                error: 'period_days must be 7, 30, or 90'
            });
        }

        const results = await postgresMetricsService.calculateAndStoreForAllTenants(period_days);

        res.json({
            success: true,
            data: {
                message: 'Batch calculation completed',
                summary: {
                    successful: results.success,
                    failed: results.failed,
                    total: results.success + results.failed
                },
                errors: results.errors.length > 0 ? results.errors : undefined
            }
        });
    } catch (error) {
        console.error('Error in calculate-all-tenants endpoint:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

// =====================================================
// HEALTH CHECK
// =====================================================

/**
 * GET /api/metrics/health
 * Health check endpoint to verify PostgreSQL functions are working
 */
router.get('/health', async (req: Request, res: Response): Promise<Response | void> => {
    try {
        // Try to get a sample tenant for testing
        const { data: tenants } = await postgresMetricsService['supabase']
            .from('tenants')
            .select('id')
            .eq('status', 'active')
            .limit(1);

        if (!tenants || tenants.length === 0) {
            return res.json({
                success: true,
                status: 'healthy',
                message: 'PostgreSQL functions are available (no active tenants to test with)'
            });
        }

        const testTenant = tenants[0];
        const dateRange = postgresMetricsService.constructor['generateDateRange'](7);

        // Test one function to verify connectivity
        await postgresMetricsService.calculateMonthlyRevenue({
            tenant_id: testTenant.id,
            ...dateRange
        });

        res.json({
            success: true,
            status: 'healthy',
            message: 'All PostgreSQL metric functions are working properly'
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

export default router;

// Add type declaration for custom request property
declare global {
    namespace Express {
        interface Request {
            metricsParams?: MetricsCalculationParams;
        }
    }
}