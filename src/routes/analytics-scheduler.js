/**
 * Analytics Scheduler API Routes
 * 
 * Provides endpoints to monitor and control analytics cron jobs
 */

const express = require('express');
const { getSchedulerInstance } = require('../services/analytics-scheduler.service');
const { getAdminClient } = require('../config/database');

const router = express.Router();

/**
 * GET /api/admin/analytics/scheduler/status
 * Get the status of all scheduled jobs
 */
router.get('/status', async (req, res) => {
    try {
        const scheduler = getSchedulerInstance();
        const status = scheduler.getJobsStatus();
        
        // Get recent job executions
        const { data: recentExecutions } = await getAdminClient()
            .rpc('get_job_execution_summary', { p_hours_back: 24 });

        res.json({
            success: true,
            data: {
                scheduler: status,
                recentExecutions: recentExecutions || []
            }
        });

    } catch (error) {
        console.error('Failed to get scheduler status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get scheduler status',
            message: error.message
        });
    }
});

/**
 * POST /api/admin/analytics/scheduler/trigger/:jobName
 * Manually trigger a specific job
 */
router.post('/trigger/:jobName', async (req, res) => {
    try {
        const { jobName } = req.params;
        const validJobs = ['dailyAggregation', 'materializedViewRefresh', 'cacheCleanup', 'healthCheck'];
        
        if (!validJobs.includes(jobName)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid job name',
                validJobs
            });
        }

        const scheduler = getSchedulerInstance();
        await scheduler.triggerJob(jobName);

        res.json({
            success: true,
            message: `Job ${jobName} triggered successfully`
        });

    } catch (error) {
        console.error(`Failed to trigger job ${req.params.jobName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger job',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/analytics/scheduler/executions
 * Get job execution history
 */
router.get('/executions', async (req, res) => {
    try {
        const { 
            jobName = null, 
            hoursBack = 24, 
            status = null,
            limit = 50 
        } = req.query;

        let query = getAdminClient()
            .from('analytics_job_executions')
            .select('*')
            .order('executed_at', { ascending: false })
            .limit(parseInt(limit));

        if (jobName) {
            query = query.eq('job_name', jobName);
        }

        if (status) {
            query = query.eq('status', status);
        }

        if (hoursBack) {
            const hoursAgo = new Date();
            hoursAgo.setHours(hoursAgo.getHours() - parseInt(hoursBack));
            query = query.gte('executed_at', hoursAgo.toISOString());
        }

        const { data: executions, error } = await query;

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            data: executions || []
        });

    } catch (error) {
        console.error('Failed to get job executions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get job executions',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/analytics/scheduler/health
 * Get analytics system health status
 */
router.get('/health', async (req, res) => {
    try {
        const scheduler = getSchedulerInstance();
        
        // Trigger health check
        await scheduler.triggerJob('healthCheck');
        
        // Get latest health check results
        const { data: healthResults, error } = await getAdminClient()
            .from('analytics_job_executions')
            .select('*')
            .eq('job_name', 'health_check')
            .order('executed_at', { ascending: false })
            .limit(1);

        if (error) {
            throw error;
        }

        const latestHealth = healthResults?.[0];
        
        res.json({
            success: true,
            data: {
                healthy: latestHealth?.status === 'success',
                lastCheck: latestHealth?.executed_at,
                status: latestHealth?.status,
                details: latestHealth?.metadata || {}
            }
        });

    } catch (error) {
        console.error('Failed to get analytics health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics health',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/analytics/scheduler/metrics
 * Get aggregated job performance metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        const { hoursBack = 24 } = req.query;

        // Get job summary
        const { data: summary } = await getAdminClient()
            .rpc('get_job_execution_summary', { 
                p_hours_back: parseInt(hoursBack) 
            });

        // Get recent failures
        const { data: failures } = await getAdminClient()
            .from('analytics_job_executions')
            .select('job_name, error_message, executed_at')
            .eq('status', 'error')
            .gte('executed_at', new Date(Date.now() - parseInt(hoursBack) * 60 * 60 * 1000).toISOString())
            .order('executed_at', { ascending: false })
            .limit(10);

        // Calculate overall health score
        const totalJobs = summary?.reduce((sum, job) => sum + job.total_executions, 0) || 0;
        const successfulJobs = summary?.reduce((sum, job) => sum + job.successful_executions, 0) || 0;
        const healthScore = totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 100;

        res.json({
            success: true,
            data: {
                period: `${hoursBack} hours`,
                healthScore,
                totalExecutions: totalJobs,
                successfulExecutions: successfulJobs,
                jobSummary: summary || [],
                recentFailures: failures || []
            }
        });

    } catch (error) {
        console.error('Failed to get scheduler metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get scheduler metrics',
            message: error.message
        });
    }
});

/**
 * DELETE /api/admin/analytics/scheduler/executions/cleanup
 * Clean old job execution records
 */
router.delete('/executions/cleanup', async (req, res) => {
    try {
        const { data: deletedCount, error } = await getAdminClient()
            .rpc('clean_old_job_executions');

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            message: `Cleaned ${deletedCount || 0} old job execution records`
        });

    } catch (error) {
        console.error('Failed to clean job executions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clean job executions',
            message: error.message
        });
    }
});

module.exports = router;