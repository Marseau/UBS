// =====================================================
// TENANT/PLATFORM API ROUTES - Node.js/Express
// Real database queries only - NO MOCK DATA
// =====================================================

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Supabase client setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================================================
// 1. GET /api/tenant-platform/metrics/:tenantId
// Main metrics endpoint for tenant platform participation
// =====================================================
router.get('/metrics/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { period = '30', date } = req.query;
        
        // Validate tenant ID
        if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid tenant ID format'
            });
        }
        
        // Calculate metric date (default to current date)
        const metricDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        // Query tenant platform metrics
        const { data: tenantMetrics, error: metricsError } = await supabase
            .from('tenant_platform_metrics')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('metric_date', metricDate)
            .single();
            
        if (metricsError && metricsError.code !== 'PGRST116') {
            console.error('Database error fetching tenant metrics:', metricsError);
            return res.status(500).json({
                success: false,
                error: 'Database error fetching metrics'
            });
        }
        
        // If no data found, calculate it
        if (!tenantMetrics) {
            // Trigger calculation for this tenant
            const { data: calculationResult, error: calcError } = await supabase
                .rpc('calculate_single_tenant_metrics', {
                    p_tenant_id: tenantId,
                    p_calculation_date: metricDate,
                    p_period_days: parseInt(period)
                });
                
            if (calcError) {
                console.error('Error calculating metrics:', calcError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to calculate metrics'
                });
            }
            
            // Retry fetching after calculation
            const { data: newMetrics, error: retryError } = await supabase
                .from('tenant_platform_metrics')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('metric_date', metricDate)
                .single();
                
            if (retryError) {
                return res.status(404).json({
                    success: false,
                    error: 'Metrics not found after calculation'
                });
            }
            
            return res.json({
                success: true,
                data: formatMetricsResponse(newMetrics),
                calculated: true
            });
        }
        
        // Return existing metrics
        res.json({
            success: true,
            data: formatMetricsResponse(tenantMetrics),
            calculated: false
        });
        
    } catch (error) {
        console.error('Unexpected error in metrics endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// 2. GET /api/tenant-platform/participation/:tenantId
// Participation breakdown with platform context
// =====================================================
router.get('/participation/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { date } = req.query;
        
        const metricDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        // Get tenant metrics and platform aggregates in parallel
        const [tenantResult, platformResult] = await Promise.all([
            supabase
                .from('tenant_platform_metrics')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('metric_date', metricDate)
                .single(),
            supabase
                .from('platform_daily_aggregates')
                .select('*')
                .eq('aggregate_date', metricDate)
                .single()
        ]);
        
        if (tenantResult.error) {
            return res.status(404).json({
                success: false,
                error: 'Tenant metrics not found'
            });
        }
        
        if (platformResult.error) {
            return res.status(404).json({
                success: false,
                error: 'Platform aggregates not found'
            });
        }
        
        const tenant = tenantResult.data;
        const platform = platformResult.data;
        
        res.json({
            success: true,
            data: {
                participation: {
                    revenue: {
                        percentage: tenant.revenue_participation_pct,
                        tenant_amount: tenant.revenue_participation_value,
                        platform_total: tenant.platform_total_revenue,
                        status: 'dados reais'
                    },
                    appointments: {
                        percentage: tenant.appointments_participation_pct,
                        tenant_count: tenant.tenant_appointments_count,
                        platform_total: tenant.platform_total_appointments,
                        status: 'dados reais'
                    },
                    customers: {
                        percentage: tenant.customers_participation_pct,
                        tenant_count: tenant.tenant_customers_count,
                        platform_total: tenant.platform_total_customers,
                        status: 'dados reais'
                    },
                    ai_interactions: {
                        percentage: tenant.ai_participation_pct,
                        tenant_count: tenant.tenant_ai_interactions,
                        platform_total: tenant.platform_total_ai_interactions,
                        status: 'dados reais'
                    }
                },
                platform_context: {
                    total_tenants: platform.total_active_tenants,
                    total_revenue: platform.total_revenue,
                    total_appointments: platform.total_appointments,
                    total_customers: platform.total_customers,
                    avg_revenue_per_tenant: platform.avg_revenue_per_tenant,
                    has_sufficient_data: true
                },
                ranking: {
                    position: tenant.ranking_position,
                    total_tenants: tenant.total_tenants_in_ranking,
                    percentile: tenant.ranking_percentile,
                    category: tenant.ranking_category
                },
                risk_assessment: {
                    score: tenant.risk_score,
                    status: tenant.risk_status,
                    efficiency_score: tenant.efficiency_score
                },
                period: {
                    date: metricDate,
                    days: tenant.calculation_period_days
                },
                last_updated: tenant.calculated_at
            }
        });
        
    } catch (error) {
        console.error('Error in participation endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// 3. GET /api/tenant-platform/time-series/:tenantId
// Historical time series data for charts
// =====================================================
router.get('/time-series/:tenantId', async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { metric_type = 'all', days = '30' } = req.query;
        
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        let query = supabase
            .from('tenant_time_series')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('series_date', startDate)
            .lte('series_date', endDate)
            .order('series_date', { ascending: true });
            
        if (metric_type !== 'all') {
            query = query.eq('metric_type', metric_type);
        }
        
        const { data: timeSeries, error } = await query;
        
        if (error) {
            console.error('Error fetching time series:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch time series data'
            });
        }
        
        // Group by metric type
        const groupedData = timeSeries.reduce((acc, record) => {
            if (!acc[record.metric_type]) {
                acc[record.metric_type] = [];
            }
            acc[record.metric_type].push({
                date: record.series_date,
                daily_value: parseFloat(record.daily_value),
                cumulative_value: parseFloat(record.cumulative_value)
            });
            return acc;
        }, {});
        
        res.json({
            success: true,
            data: {
                time_series: groupedData,
                period: {
                    start_date: startDate,
                    end_date: endDate,
                    days: parseInt(days)
                }
            }
        });
        
    } catch (error) {
        console.error('Error in time series endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// 4. GET /api/tenant-platform/ranking
// Platform-wide ranking information
// =====================================================
router.get('/ranking', async (req, res) => {
    try {
        const { date, limit = '10' } = req.query;
        const metricDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        const { data: rankings, error } = await supabase
            .from('tenant_platform_metrics')
            .select(`
                tenant_id,
                revenue_participation_pct,
                revenue_participation_value,
                ranking_position,
                ranking_percentile,
                ranking_category,
                risk_score,
                tenants!inner(business_name, domain)
            `)
            .eq('metric_date', metricDate)
            .order('ranking_position', { ascending: true })
            .limit(parseInt(limit));
            
        if (error) {
            console.error('Error fetching rankings:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch ranking data'
            });
        }
        
        res.json({
            success: true,
            data: {
                rankings: rankings.map(rank => ({
                    tenant_id: rank.tenant_id,
                    business_name: rank.tenants.business_name,
                    domain: rank.tenants.domain,
                    revenue_participation: rank.revenue_participation_pct,
                    revenue_value: rank.revenue_participation_value,
                    position: rank.ranking_position,
                    percentile: rank.ranking_percentile,
                    category: rank.ranking_category,
                    risk_score: rank.risk_score
                })),
                total_count: rankings.length,
                date: metricDate
            }
        });
        
    } catch (error) {
        console.error('Error in ranking endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// 5. GET /api/tenant-platform/tenants
// List all available tenants for selection
// =====================================================
router.get('/tenants', async (req, res) => {
    try {
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, domain, subscription_plan, status, created_at')
            .eq('status', 'active')
            .order('business_name', { ascending: true });
            
        if (error) {
            console.error('Error fetching tenants:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch tenants list'
            });
        }
        
        res.json({
            success: true,
            data: tenants.map(tenant => ({
                id: tenant.id,
                business_name: tenant.business_name,
                domain: tenant.domain,
                subscription_plan: tenant.subscription_plan || 'Free',
                status: tenant.status,
                created_at: tenant.created_at
            })),
            total_count: tenants.length
        });
        
    } catch (error) {
        console.error('Error in tenants endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// 6. POST /api/tenant-platform/calculate
// Trigger metrics calculation manually
// =====================================================
router.post('/calculate', async (req, res) => {
    try {
        const { tenant_id, date, period_days = 30 } = req.body;
        
        const calculationDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        
        if (tenant_id) {
            // Calculate for specific tenant
            const { data, error } = await supabase
                .rpc('calculate_single_tenant_metrics', {
                    p_tenant_id: tenant_id,
                    p_calculation_date: calculationDate,
                    p_period_days: parseInt(period_days)
                });
                
            if (error) {
                console.error('Error calculating tenant metrics:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to calculate tenant metrics'
                });
            }
            
            res.json({
                success: true,
                message: 'Tenant metrics calculated successfully',
                tenant_id,
                date: calculationDate
            });
        } else {
            // Calculate for all tenants
            const { data, error } = await supabase
                .rpc('calculate_tenant_platform_metrics', {
                    p_calculation_date: calculationDate,
                    p_period_days: parseInt(period_days)
                });
                
            if (error) {
                console.error('Error calculating platform metrics:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to calculate platform metrics'
                });
            }
            
            res.json({
                success: true,
                message: 'Platform metrics calculated successfully',
                processed_tenants: data[0]?.processed_tenants || 0,
                total_revenue: data[0]?.total_revenue || 0,
                execution_time_ms: data[0]?.execution_time_ms || 0,
                date: calculationDate
            });
        }
        
    } catch (error) {
        console.error('Error in calculate endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function formatMetricsResponse(metrics) {
    return {
        tenant_info: {
            id: metrics.tenant_id,
            last_updated: metrics.calculated_at
        },
        contribution: {
            mrr: {
                value: parseFloat(metrics.revenue_participation_value),
                percentage: parseFloat(metrics.revenue_participation_pct)
            },
            appointments: {
                value: metrics.tenant_appointments_count,
                percentage: parseFloat(metrics.appointments_participation_pct)
            },
            customers: {
                value: metrics.tenant_customers_count,
                percentage: parseFloat(metrics.customers_participation_pct)
            },
            ai_interactions: {
                value: metrics.tenant_ai_interactions,
                percentage: parseFloat(metrics.ai_participation_pct)
            }
        },
        ranking: {
            position: metrics.ranking_position,
            total_tenants: metrics.total_tenants_in_ranking,
            percentile: parseFloat(metrics.ranking_percentile),
            category: metrics.ranking_category
        },
        risk_assessment: {
            score: metrics.risk_score,
            status: metrics.risk_status
        },
        business_metrics: {
            cancellation_rate: parseFloat(metrics.cancellation_rate_pct),
            rescheduling_rate: parseFloat(metrics.rescheduling_rate_pct),
            efficiency_score: parseFloat(metrics.efficiency_score),
            avg_chat_time: parseFloat(metrics.avg_chat_time_minutes),
            phone_quality: parseFloat(metrics.phone_quality_score),
            conversion_rate: parseFloat(metrics.conversion_rate_pct)
        },
        platform_context: {
            total_revenue: parseFloat(metrics.platform_total_revenue),
            total_appointments: metrics.platform_total_appointments,
            total_customers: metrics.platform_total_customers,
            total_ai_interactions: metrics.platform_total_ai_interactions
        },
        period: {
            days: metrics.calculation_period_days,
            date: metrics.metric_date
        }
    };
}

// =====================================================
// ERROR HANDLING MIDDLEWARE
// =====================================================
router.use((error, req, res, next) => {
    console.error('Unhandled error in tenant-platform routes:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

module.exports = router;

// =====================================================
// SAMPLE REQUESTS/RESPONSES
// =====================================================

/*
1. GET /api/tenant-platform/metrics/9c4d4d05-b99e-4fb9-9c4f-c8c56a7e7e7e

Response:
{
  "success": true,
  "data": {
    "tenant_info": {
      "id": "9c4d4d05-b99e-4fb9-9c4f-c8c56a7e7e7e",
      "last_updated": "2025-07-13T10:30:00Z"
    },
    "contribution": {
      "mrr": {
        "value": 179.70,
        "percentage": 20.09
      },
      "appointments": {
        "value": 0,
        "percentage": 0.00
      },
      "customers": {
        "value": 44,
        "percentage": 25.88
      }
    },
    "ranking": {
      "position": 8,
      "total_tenants": 9,
      "percentile": 11.11,
      "category": "Other"
    }
  },
  "calculated": false
}

2. POST /api/tenant-platform/calculate
Body: {
  "tenant_id": "9c4d4d05-b99e-4fb9-9c4f-c8c56a7e7e7e",
  "date": "2025-07-13",
  "period_days": 30
}

Response:
{
  "success": true,
  "message": "Tenant metrics calculated successfully",
  "tenant_id": "9c4d4d05-b99e-4fb9-9c4f-c8c56a7e7e7e",
  "date": "2025-07-13"
}
*/