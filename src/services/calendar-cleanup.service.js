const { CalendarService } = require('./calendar.service');

/**
 * Calendar Cleanup Service
 * Handles automated cleanup of expired Google Calendar tokens
 * Implements data retention policy for GDPR/LGPD compliance
 */
class CalendarCleanupService {
    constructor() {
        this.calendarService = new CalendarService();
        this.isRunning = false;
    }

    /**
     * Start automated cleanup service
     * Runs daily at 2 AM to clean expired tokens
     */
    startScheduledCleanup() {
        if (this.isRunning) {
            console.log('Calendar cleanup service is already running');
            return;
        }

        this.isRunning = true;
        
        // Run cleanup immediately on start
        this.runCleanup();
        
        // Schedule daily cleanup at 2 AM
        this.cleanupInterval = setInterval(() => {
            const now = new Date();
            if (now.getHours() === 2 && now.getMinutes() === 0) {
                this.runCleanup();
            }
        }, 60000); // Check every minute

        console.log('✅ Calendar cleanup service started - runs daily at 2 AM');
    }

    /**
     * Stop automated cleanup service
     */
    stopScheduledCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        
        this.isRunning = false;
        console.log('🛑 Calendar cleanup service stopped');
    }

    /**
     * Run cleanup process
     * Can be called manually or by scheduled service
     */
    async runCleanup() {
        try {
            console.log('🧹 Starting calendar token cleanup...');
            
            const result = await this.calendarService.cleanupExpiredTokens();
            
            if (result.success) {
                console.log(`✅ Calendar cleanup completed: ${result.cleanedCount} expired tokens removed`);
                
                // Log cleanup results for audit trail
                await this.logCleanupResults(result);
            } else {
                console.error('❌ Calendar cleanup failed:', result.error);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Calendar cleanup error:', error);
            return { success: false, error: error.message, cleanedCount: 0 };
        }
    }

    /**
     * Log cleanup results for audit purposes
     * @param {Object} result - Cleanup results
     */
    async logCleanupResults(result) {
        try {
            // You can extend this to save to database for audit trail
            const logEntry = {
                timestamp: new Date().toISOString(),
                operation: 'calendar_token_cleanup',
                success: result.success,
                cleaned_count: result.cleanedCount,
                details: result
            };

            console.log('📋 Cleanup audit log:', JSON.stringify(logEntry, null, 2));
            
            // TODO: Save to audit log table in database
            // await supabase.from('audit_logs').insert(logEntry);
            
        } catch (error) {
            console.error('Failed to log cleanup results:', error);
        }
    }

    /**
     * Get service status
     * @returns {Object} Service status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            hasInterval: !!this.cleanupInterval,
            nextCleanup: this.calculateNextCleanup(),
            lastRun: this.lastRunTime || null
        };
    }

    /**
     * Calculate next cleanup time (2 AM tomorrow)
     * @returns {Date} Next cleanup time
     */
    calculateNextCleanup() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0);
        return tomorrow;
    }

    /**
     * Manual cleanup trigger
     * For testing or manual execution
     */
    async triggerManualCleanup() {
        console.log('🔧 Manual cleanup triggered');
        this.lastRunTime = new Date();
        return await this.runCleanup();
    }
}

module.exports = CalendarCleanupService;