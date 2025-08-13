/**
 * Unified Metrics Management Routes
 * Routes for managing the new unified metrics procedure
 * 
 * @version 1.0.0
 * @author UBS Team
 */

import express from 'express';
import UnifiedMetricsIntegrationService from '../services/unified-metrics-integration.service';

const router = express.Router();

// Initialize the service
const unifiedMetricsService = new UnifiedMetricsIntegrationService();

/**
 * Health check for unified metrics system
 */
router.get('/health', async (req, res) => {
    try {
        const procedureExists = await unifiedMetricsService.verifyProcedureExists();
        const metricsCount = await unifiedMetricsService.getCurrentMetricsCount();

        res.json({
            status: 'OK',
            procedure_exists: procedureExists,
            current_metrics: metricsCount,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Execute unified metrics calculation
 */
router.post('/execute', async (req, res) => {
    try {
        const { calculation_date, tenant_id } = req.body;

        const result = await unifiedMetricsService.executeUnifiedMetricsCalculation(
            calculation_date,
            tenant_id
        );

        if (result.success) {
            res.json({
                success: true,
                message: 'Unified metrics calculation completed successfully',
                result,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Unified metrics calculation failed',
                result,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Execute the automated cronjob
 */
router.post('/cronjob', async (req, res) => {
    try {
        const result = await unifiedMetricsService.executeCronjob();

        res.json({
            success: true,
            message: 'Unified metrics cronjob executed successfully',
            result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get current metrics statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await unifiedMetricsService.getCurrentMetricsCount();

        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Clear tenant_metrics table (DANGER - USE WITH CAUTION)
 */
router.delete('/clear', async (req, res) => {
    try {
        const { confirm } = req.body;

        if (confirm !== 'YES_DELETE_ALL_METRICS') {
            return res.status(400).json({
                success: false,
                error: 'Confirmation required. Send {"confirm": "YES_DELETE_ALL_METRICS"}',
                timestamp: new Date().toISOString()
            });
        }

        const result = await unifiedMetricsService.clearTenantMetrics();

        return res.json({
            success: true,
            message: `Cleared ${result.deleted_count} records from tenant_metrics table`,
            result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;