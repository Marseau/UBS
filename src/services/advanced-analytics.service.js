/**
 * P3-003: Advanced Analytics Engine
 * 
 * Complex metrics calculation, trend analysis, and predictive analytics
 */

const { createClient } = require('@supabase/supabase-js');
const { getCacheService } = require('./redis-cache.service');

class AdvancedAnalyticsEngine {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        this.cache = getCacheService();
        
        // Analytics computation complexity levels
        this.complexityLevels = {
            BASIC: { weight: 1, cacheTTL: 300 },      // 5 minutes
            INTERMEDIATE: { weight: 2, cacheTTL: 600 }, // 10 minutes
            ADVANCED: { weight: 3, cacheTTL: 1200 },   // 20 minutes
            PREDICTIVE: { weight: 4, cacheTTL: 1800 }  // 30 minutes
        };
        
        // Trend analysis algorithms
        this.trendAlgorithms = {
            LINEAR_REGRESSION: 'linear_regression',
            MOVING_AVERAGE: 'moving_average',
            EXPONENTIAL_SMOOTHING: 'exponential_smoothing',
            SEASONAL_DECOMPOSITION: 'seasonal_decomposition'
        };
        
        // Business intelligence metrics
        this.biMetrics = {
            CUSTOMER_LIFETIME_VALUE: 'clv',
            CHURN_PROBABILITY: 'churn_prob',
            REVENUE_PREDICTION: 'revenue_pred',
            DEMAND_FORECASTING: 'demand_forecast',
            OPTIMIZATION_SCORE: 'optimization_score'
        };
    }
    
    // Complex Metrics Calculation
    async calculateComplexMetrics(tenantId, analysisType, timeRange) {
        const cacheKey = `complex_metrics:${tenantId}:${analysisType}:${timeRange.start}:${timeRange.end}`;
        
        // Check cache first
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            console.log(`🎯 Complex metrics cache HIT for ${analysisType}`);
            return cached;
        }
        
        console.log(`💫 Complex metrics cache MISS for ${analysisType}, calculating...`);
        
        try {
            const result = await this.performComplexCalculation(tenantId, analysisType, timeRange);
            
            // Cache based on complexity
            const complexity = this.getAnalysisComplexity(analysisType);
            await this.cache.set(cacheKey, result, complexity.cacheTTL);
            
            return result;
            
        } catch (error) {
            console.error(`❌ Complex metrics calculation failed for ${analysisType}:`, error.message);
            throw error;
        }
    }
    
    async performComplexCalculation(tenantId, analysisType, timeRange) {
        switch (analysisType) {
            case 'customer_behavior_analysis':
                return await this.calculateCustomerBehaviorAnalysis(tenantId, timeRange);
            
            case 'revenue_trend_analysis':
                return await this.calculateRevenueTrendAnalysis(tenantId, timeRange);
            
            case 'operational_efficiency':
                return await this.calculateOperationalEfficiency(tenantId, timeRange);
            
            case 'market_performance':
                return await this.calculateMarketPerformance(tenantId, timeRange);
            
            case 'predictive_insights':
                return await this.calculatePredictiveInsights(tenantId, timeRange);
            
            default:
                throw new Error(`Unknown analysis type: ${analysisType}`);
        }
    }
    
    // Customer Behavior Analysis
    async calculateCustomerBehaviorAnalysis(tenantId, timeRange) {
        console.log('📊 Calculating customer behavior analysis...');
        
        // Get customer interaction data
        const { data: conversations, error: convError } = await this.supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', timeRange.start)
            .lte('created_at', timeRange.end);
        
        if (convError) throw convError;
        
        // Get appointment data
        const { data: appointments, error: apptError } = await this.supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', timeRange.start)
            .lte('created_at', timeRange.end);
        
        if (apptError) throw apptError;
        
        // Analyze customer segments
        const customerSegments = await this.analyzeCustomerSegments(conversations, appointments);
        
        // Calculate engagement metrics
        const engagementMetrics = await this.calculateEngagementMetrics(conversations);
        
        // Analyze conversion patterns
        const conversionPatterns = await this.analyzeConversionPatterns(conversations, appointments);
        
        // Calculate customer lifetime value
        const lifetimeValue = await this.calculateCustomerLifetimeValue(appointments);
        
        return {
            analysisType: 'customer_behavior_analysis',
            calculatedAt: new Date().toISOString(),
            timeRange,
            metrics: {
                customerSegments,
                engagementMetrics,
                conversionPatterns,
                lifetimeValue
            },
            insights: this.generateBehaviorInsights(customerSegments, engagementMetrics, conversionPatterns)
        };
    }
    
    async analyzeCustomerSegments(conversations, appointments) {
        const customerData = new Map();
        
        // Aggregate customer interactions
        conversations.forEach(conv => {
            if (!customerData.has(conv.user_id)) {
                customerData.set(conv.user_id, {
                    totalConversations: 0,
                    totalAppointments: 0,
                    firstInteraction: conv.created_at,
                    lastInteraction: conv.created_at,
                    messageTypes: new Set()
                });
            }
            
            const customer = customerData.get(conv.user_id);
            customer.totalConversations++;
            customer.messageTypes.add(conv.message_type);
            customer.lastInteraction = conv.created_at;
        });
        
        // Add appointment data
        appointments.forEach(appt => {
            if (customerData.has(appt.user_id)) {
                customerData.get(appt.user_id).totalAppointments++;
            }
        });
        
        // Segment customers
        const segments = {
            high_value: [],
            regular: [],
            occasional: [],
            inactive: []
        };
        
        customerData.forEach((data, userId) => {
            const score = this.calculateCustomerScore(data);
            
            if (score >= 80) segments.high_value.push(userId);
            else if (score >= 60) segments.regular.push(userId);
            else if (score >= 30) segments.occasional.push(userId);
            else segments.inactive.push(userId);
        });
        
        return {
            segments,
            distribution: {
                high_value: segments.high_value.length,
                regular: segments.regular.length,
                occasional: segments.occasional.length,
                inactive: segments.inactive.length
            },
            totalCustomers: customerData.size
        };
    }
    
    calculateCustomerScore(customerData) {
        const conversationScore = Math.min(customerData.totalConversations * 10, 40);
        const appointmentScore = Math.min(customerData.totalAppointments * 20, 40);
        const diversityScore = Math.min(customerData.messageTypes.size * 5, 20);
        
        return conversationScore + appointmentScore + diversityScore;
    }
    
    async calculateEngagementMetrics(conversations) {
        const totalConversations = conversations.length;
        const uniqueUsers = new Set(conversations.map(c => c.user_id)).size;
        
        // Time-based engagement analysis
        const hourlyDistribution = new Array(24).fill(0);
        const dailyDistribution = new Array(7).fill(0);
        
        conversations.forEach(conv => {
            const date = new Date(conv.created_at);
            hourlyDistribution[date.getHours()]++;
            dailyDistribution[date.getDay()]++;
        });
        
        // Response time analysis
        const responseTimeAnalysis = await this.analyzeResponseTimes(conversations);
        
        return {
            totalConversations,
            uniqueUsers,
            avgConversationsPerUser: totalConversations / uniqueUsers,
            peakHours: this.findPeakHours(hourlyDistribution),
            peakDays: this.findPeakDays(dailyDistribution),
            responseTimeAnalysis,
            engagementScore: this.calculateEngagementScore(totalConversations, uniqueUsers)
        };
    }
    
    async analyzeResponseTimes(conversations) {
        const responseTimes = [];
        
        // Group conversations by session
        const sessions = new Map();
        conversations.forEach(conv => {
            if (!sessions.has(conv.session_id)) {
                sessions.set(conv.session_id, []);
            }
            sessions.get(conv.session_id).push(conv);
        });
        
        // Calculate response times within sessions
        sessions.forEach(sessionConversations => {
            sessionConversations.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            
            for (let i = 1; i < sessionConversations.length; i++) {
                const timeDiff = new Date(sessionConversations[i].created_at) - new Date(sessionConversations[i-1].created_at);
                if (timeDiff < 24 * 60 * 60 * 1000) { // Within 24 hours
                    responseTimes.push(timeDiff);
                }
            }
        });
        
        if (responseTimes.length === 0) {
            return { avgResponseTime: 0, medianResponseTime: 0 };
        }
        
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const sortedTimes = responseTimes.sort((a, b) => a - b);
        const medianResponseTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
        
        return {
            avgResponseTime: Math.round(avgResponseTime / 1000 / 60), // Convert to minutes
            medianResponseTime: Math.round(medianResponseTime / 1000 / 60),
            totalResponses: responseTimes.length
        };
    }
    
    // Revenue Trend Analysis
    async calculateRevenueTrendAnalysis(tenantId, timeRange) {
        console.log('📈 Calculating revenue trend analysis...');
        
        // Get revenue data
        const { data: appointments, error } = await this.supabase
            .from('appointments')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('created_at', timeRange.start)
            .lte('created_at', timeRange.end);
        
        if (error) throw error;
        
        // Group by time periods
        const dailyRevenue = this.groupRevenueByPeriod(appointments, 'daily');
        const weeklyRevenue = this.groupRevenueByPeriod(appointments, 'weekly');
        const monthlyRevenue = this.groupRevenueByPeriod(appointments, 'monthly');
        
        // Calculate trends
        const dailyTrend = this.calculateTrend(dailyRevenue, this.trendAlgorithms.LINEAR_REGRESSION);
        const weeklyTrend = this.calculateTrend(weeklyRevenue, this.trendAlgorithms.MOVING_AVERAGE);
        const monthlyTrend = this.calculateTrend(monthlyRevenue, this.trendAlgorithms.EXPONENTIAL_SMOOTHING);
        
        // Revenue forecasting
        const forecast = await this.forecastRevenue(monthlyRevenue, 3); // 3 months ahead
        
        return {
            analysisType: 'revenue_trend_analysis',
            calculatedAt: new Date().toISOString(),
            timeRange,
            metrics: {
                dailyRevenue,
                weeklyRevenue,
                monthlyRevenue,
                trends: {
                    daily: dailyTrend,
                    weekly: weeklyTrend,
                    monthly: monthlyTrend
                },
                forecast,
                totalRevenue: appointments.reduce((sum, appt) => sum + (parseFloat(appt.price) || 0), 0)
            },
            insights: this.generateRevenueInsights(dailyTrend, weeklyTrend, monthlyTrend, forecast)
        };
    }
    
    groupRevenueByPeriod(appointments, period) {
        const grouped = new Map();
        
        appointments.forEach(appt => {
            const date = new Date(appt.created_at);
            let key;
            
            switch (period) {
                case 'daily':
                    key = date.toISOString().split('T')[0];
                    break;
                case 'weekly':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().split('T')[0];
                    break;
                case 'monthly':
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    break;
            }
            
            if (!grouped.has(key)) {
                grouped.set(key, { period: key, revenue: 0, count: 0 });
            }
            
            grouped.get(key).revenue += parseFloat(appt.price) || 0;
            grouped.get(key).count++;
        });
        
        return Array.from(grouped.values()).sort((a, b) => a.period.localeCompare(b.period));
    }
    
    calculateTrend(data, algorithm) {
        if (data.length < 2) {
            return { trend: 'insufficient_data', slope: 0, confidence: 0 };
        }
        
        switch (algorithm) {
            case this.trendAlgorithms.LINEAR_REGRESSION:
                return this.linearRegression(data);
            case this.trendAlgorithms.MOVING_AVERAGE:
                return this.movingAverage(data);
            case this.trendAlgorithms.EXPONENTIAL_SMOOTHING:
                return this.exponentialSmoothing(data);
            default:
                return this.linearRegression(data);
        }
    }
    
    linearRegression(data) {
        const n = data.length;
        const sumX = data.reduce((sum, _, i) => sum + i, 0);
        const sumY = data.reduce((sum, item) => sum + item.revenue, 0);
        const sumXY = data.reduce((sum, item, i) => sum + i * item.revenue, 0);
        const sumXX = data.reduce((sum, _, i) => sum + i * i, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate R-squared for confidence
        const meanY = sumY / n;
        const ssTotal = data.reduce((sum, item) => sum + Math.pow(item.revenue - meanY, 2), 0);
        const ssResidual = data.reduce((sum, item, i) => {
            const predicted = slope * i + intercept;
            return sum + Math.pow(item.revenue - predicted, 2);
        }, 0);
        
        const rSquared = 1 - (ssResidual / ssTotal);
        
        return {
            trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
            slope,
            intercept,
            confidence: Math.max(0, Math.min(1, rSquared)) * 100,
            algorithm: 'linear_regression'
        };
    }
    
    movingAverage(data, window = 3) {
        if (data.length < window) {
            return { trend: 'insufficient_data', values: [], confidence: 0 };
        }
        
        const movingAverages = [];
        for (let i = window - 1; i < data.length; i++) {
            const sum = data.slice(i - window + 1, i + 1).reduce((sum, item) => sum + item.revenue, 0);
            movingAverages.push(sum / window);
        }
        
        // Determine trend from moving averages
        const firstThird = movingAverages.slice(0, Math.floor(movingAverages.length / 3));
        const lastThird = movingAverages.slice(-Math.floor(movingAverages.length / 3));
        
        const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
        const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
        
        const change = ((lastAvg - firstAvg) / firstAvg) * 100;
        
        return {
            trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
            values: movingAverages,
            change: change,
            confidence: Math.min(100, Math.abs(change) * 2),
            algorithm: 'moving_average'
        };
    }
    
    exponentialSmoothing(data, alpha = 0.3) {
        if (data.length < 2) {
            return { trend: 'insufficient_data', values: [], confidence: 0 };
        }
        
        const smoothed = [data[0].revenue];
        
        for (let i = 1; i < data.length; i++) {
            const smoothedValue = alpha * data[i].revenue + (1 - alpha) * smoothed[i - 1];
            smoothed.push(smoothedValue);
        }
        
        // Calculate trend
        const trend = smoothed[smoothed.length - 1] - smoothed[0];
        const trendPercentage = (trend / smoothed[0]) * 100;
        
        return {
            trend: trendPercentage > 5 ? 'increasing' : trendPercentage < -5 ? 'decreasing' : 'stable',
            values: smoothed,
            trendPercentage,
            confidence: Math.min(100, Math.abs(trendPercentage)),
            algorithm: 'exponential_smoothing'
        };
    }
    
    // Predictive Analytics
    async forecastRevenue(historicalData, periodsAhead) {
        console.log('🔮 Generating revenue forecast...');
        
        if (historicalData.length < 3) {
            return { forecast: [], confidence: 0, method: 'insufficient_data' };
        }
        
        // Use simple linear extrapolation for demo
        const trend = this.linearRegression(historicalData);
        const forecast = [];
        
        for (let i = 1; i <= periodsAhead; i++) {
            const futureIndex = historicalData.length + i - 1;
            const predictedValue = trend.slope * futureIndex + trend.intercept;
            
            // Add some uncertainty
            const uncertainty = Math.abs(predictedValue * 0.1); // 10% uncertainty
            
            forecast.push({
                period: i,
                predicted: Math.max(0, predictedValue),
                lowerBound: Math.max(0, predictedValue - uncertainty),
                upperBound: predictedValue + uncertainty,
                confidence: Math.max(0, trend.confidence - (i * 5)) // Decrease confidence over time
            });
        }
        
        return {
            forecast,
            method: 'linear_extrapolation',
            baseConfidence: trend.confidence,
            assumptions: ['Linear trend continuation', 'No external factors', 'Historical patterns persist']
        };
    }
    
    // Business Intelligence Insights
    generateBehaviorInsights(segments, engagement, conversion) {
        const insights = [];
        
        // Customer segment insights
        const highValuePercentage = (segments.distribution.high_value / segments.totalCustomers) * 100;
        if (highValuePercentage > 20) {
            insights.push({
                type: 'positive',
                metric: 'customer_segments',
                message: `Strong high-value customer base (${highValuePercentage.toFixed(1)}%)`,
                recommendation: 'Focus on retention strategies for high-value customers'
            });
        } else if (highValuePercentage < 10) {
            insights.push({
                type: 'warning',
                metric: 'customer_segments',
                message: `Low high-value customer percentage (${highValuePercentage.toFixed(1)}%)`,
                recommendation: 'Implement customer value enhancement programs'
            });
        }
        
        // Engagement insights
        if (engagement.engagementScore > 75) {
            insights.push({
                type: 'positive',
                metric: 'engagement',
                message: `High customer engagement score (${engagement.engagementScore})`,
                recommendation: 'Maintain current engagement strategies'
            });
        } else if (engagement.engagementScore < 50) {
            insights.push({
                type: 'warning',
                metric: 'engagement',
                message: `Low engagement score (${engagement.engagementScore})`,
                recommendation: 'Improve response times and interaction quality'
            });
        }
        
        return insights;
    }
    
    generateRevenueInsights(dailyTrend, weeklyTrend, monthlyTrend, forecast) {
        const insights = [];
        
        // Trend consistency analysis
        const trendConsistency = this.analyzeTrendConsistency(dailyTrend, weeklyTrend, monthlyTrend);
        
        if (trendConsistency.consistent && trendConsistency.direction === 'increasing') {
            insights.push({
                type: 'positive',
                metric: 'revenue_trend',
                message: 'Consistent upward revenue trend across all time periods',
                recommendation: 'Scale successful strategies and prepare for growth'
            });
        } else if (trendConsistency.consistent && trendConsistency.direction === 'decreasing') {
            insights.push({
                type: 'alert',
                metric: 'revenue_trend',
                message: 'Consistent downward revenue trend detected',
                recommendation: 'Immediate action required to reverse trend'
            });
        }
        
        // Forecast reliability
        const avgForecastConfidence = forecast.forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.forecast.length;
        
        if (avgForecastConfidence > 70) {
            insights.push({
                type: 'info',
                metric: 'forecast_reliability',
                message: `High forecast confidence (${avgForecastConfidence.toFixed(1)}%)`,
                recommendation: 'Use forecast for strategic planning'
            });
        } else {
            insights.push({
                type: 'warning',
                metric: 'forecast_reliability',
                message: `Low forecast confidence (${avgForecastConfidence.toFixed(1)}%)`,
                recommendation: 'Collect more data for better predictions'
            });
        }
        
        return insights;
    }
    
    analyzeTrendConsistency(dailyTrend, weeklyTrend, monthlyTrend) {
        const trends = [dailyTrend.trend, weeklyTrend.trend, monthlyTrend.trend];
        const increasing = trends.filter(t => t === 'increasing').length;
        const decreasing = trends.filter(t => t === 'decreasing').length;
        const stable = trends.filter(t => t === 'stable').length;
        
        if (increasing >= 2) {
            return { consistent: true, direction: 'increasing' };
        } else if (decreasing >= 2) {
            return { consistent: true, direction: 'decreasing' };
        } else {
            return { consistent: false, direction: 'mixed' };
        }
    }
    
    // Utility methods
    findPeakHours(hourlyDistribution) {
        const maxValue = Math.max(...hourlyDistribution);
        const peakHours = hourlyDistribution
            .map((value, hour) => ({ hour, value }))
            .filter(item => item.value === maxValue)
            .map(item => item.hour);
        
        return peakHours;
    }
    
    findPeakDays(dailyDistribution) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const maxValue = Math.max(...dailyDistribution);
        const peakDays = dailyDistribution
            .map((value, day) => ({ day: days[day], value }))
            .filter(item => item.value === maxValue)
            .map(item => item.day);
        
        return peakDays;
    }
    
    calculateEngagementScore(totalConversations, uniqueUsers) {
        const conversationScore = Math.min(totalConversations / 10, 50);
        const userScore = Math.min(uniqueUsers / 5, 30);
        const ratioScore = Math.min((totalConversations / uniqueUsers) * 5, 20);
        
        return Math.round(conversationScore + userScore + ratioScore);
    }
    
    getAnalysisComplexity(analysisType) {
        const complexityMap = {
            'customer_behavior_analysis': this.complexityLevels.ADVANCED,
            'revenue_trend_analysis': this.complexityLevels.ADVANCED,
            'operational_efficiency': this.complexityLevels.INTERMEDIATE,
            'market_performance': this.complexityLevels.INTERMEDIATE,
            'predictive_insights': this.complexityLevels.PREDICTIVE
        };
        
        return complexityMap[analysisType] || this.complexityLevels.BASIC;
    }
    
    // Health and monitoring
    async getAnalyticsHealth() {
        const health = {
            cacheStatus: this.cache.isConnected ? 'connected' : 'disconnected',
            availableAnalytics: Object.keys(this.biMetrics),
            complexityLevels: this.complexityLevels,
            lastCalculation: new Date().toISOString(),
            systemLoad: {
                memory: process.memoryUsage(),
                uptime: process.uptime()
            }
        };
        
        return health;
    }
}

// Singleton instance
let analyticsEngineInstance = null;

function getAdvancedAnalyticsEngine() {
    if (!analyticsEngineInstance) {
        analyticsEngineInstance = new AdvancedAnalyticsEngine();
    }
    return analyticsEngineInstance;
}

module.exports = {
    AdvancedAnalyticsEngine,
    getAdvancedAnalyticsEngine
};