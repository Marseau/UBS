/**
 * P3-002: WebSocket Client for Real-time Dashboard Updates
 * 
 * Client-side WebSocket manager for live data synchronization
 */

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.clientId = null;
        this.subscriptions = new Set();
        this.eventHandlers = new Map();
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
        this.lastPing = 0;
        
        // Configuration
        this.config = {
            url: this.getWebSocketURL(),
            pingInterval: 30000, // 30 seconds
            reconnectInterval: 5000, // 5 seconds
            maxReconnectDelay: 30000 // 30 seconds max
        };
        
        console.log('🔌 WebSocket client initialized');
    }
    
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }
    
    connect(token = null, tenantId = null, role = 'tenant_admin') {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.log('⚠️  WebSocket already connected');
            return;
        }
        
        console.log('🔗 Connecting to WebSocket server...');
        
        try {
            this.ws = new WebSocket(this.config.url);
            
            this.ws.onopen = () => {
                console.log('✅ WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Authenticate if credentials provided
                if (token || role === 'super_admin') {
                    this.authenticate(token, tenantId, role);
                }
                
                this.startHeartbeat();
                this.emit('connected');
            };
            
            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };
            
            this.ws.onclose = (event) => {
                console.log('🔌 WebSocket disconnected', event.code, event.reason);
                this.isConnected = false;
                this.isAuthenticated = false;
                this.stopHeartbeat();
                
                if (event.code !== 1000) { // Not a normal closure
                    this.scheduleReconnect();
                }
                
                this.emit('disconnected', { code: event.code, reason: event.reason });
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.emit('error', error);
            };
            
        } catch (error) {
            console.error('❌ WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }
    
    authenticate(token, tenantId, role) {
        if (!this.isConnected) {
            console.error('❌ Cannot authenticate: not connected');
            return;
        }
        
        console.log('🔐 Authenticating WebSocket connection...');
        
        this.send({
            type: 'authenticate',
            token: token,
            tenantId: tenantId,
            role: role
        });
    }
    
    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connection_established':
                    this.clientId = message.clientId;
                    console.log(`🆔 Client ID: ${this.clientId}`);
                    this.emit('connection_established', message);
                    break;
                    
                case 'authenticated':
                    this.isAuthenticated = true;
                    console.log('✅ WebSocket authenticated');
                    this.emit('authenticated', message);
                    break;
                    
                case 'authentication_failed':
                    console.error('❌ WebSocket authentication failed');
                    this.emit('authentication_failed', message);
                    break;
                    
                case 'subscribed':
                    this.subscriptions.add(message.channel);
                    console.log(`📡 Subscribed to ${message.channel}`);
                    this.emit('subscribed', message);
                    break;
                    
                case 'unsubscribed':
                    this.subscriptions.delete(message.channel);
                    console.log(`📡 Unsubscribed from ${message.channel}`);
                    this.emit('unsubscribed', message);
                    break;
                    
                case 'initial_data':
                    console.log(`📊 Initial data for ${message.channel}`);
                    this.emit(`${message.channel}_data`, message.data);
                    this.emit('initial_data', message);
                    break;
                    
                case 'dashboard_update':
                    this.emit('dashboard_update', message.data);
                    this.emit(`${message.channel}_update`, message.data);
                    break;
                    
                case 'metrics_update':
                    this.emit('metrics_update', message.data);
                    this.emit(`${message.channel}_update`, message.data);
                    break;
                    
                case 'platform_update':
                    this.emit('platform_update', message.data);
                    this.emit(`${message.channel}_update`, message.data);
                    break;
                    
                case 'ping':
                    this.send({ type: 'ping' });
                    break;
                    
                case 'pong':
                    this.lastPing = Date.now();
                    break;
                    
                case 'error':
                    console.error('❌ WebSocket server error:', message.message);
                    this.emit('error', message);
                    break;
                    
                default:
                    console.log('📨 Unknown message type:', message.type);
                    this.emit('message', message);
            }
            
        } catch (error) {
            console.error('❌ Message parsing error:', error);
        }
    }
    
    send(message) {
        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ Cannot send message: not connected');
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('❌ Send error:', error);
            return false;
        }
    }
    
    subscribe(channel, params = {}) {
        if (!this.isAuthenticated) {
            console.error('❌ Cannot subscribe: not authenticated');
            return false;
        }
        
        console.log(`📡 Subscribing to ${channel}...`);
        
        return this.send({
            type: 'subscribe',
            channel: channel,
            params: params
        });
    }
    
    unsubscribe(channel) {
        if (!this.isAuthenticated) {
            console.error('❌ Cannot unsubscribe: not authenticated');
            return false;
        }
        
        console.log(`📡 Unsubscribing from ${channel}...`);
        
        return this.send({
            type: 'unsubscribe',
            channel: channel
        });
    }
    
    requestUpdate(channel, params = {}) {
        if (!this.subscriptions.has(channel)) {
            console.error(`❌ Cannot request update: not subscribed to ${channel}`);
            return false;
        }
        
        return this.send({
            type: 'request_update',
            channel: channel,
            params: params
        });
    }
    
    // Event handling
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }
    
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }
    
    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            for (const handler of this.eventHandlers.get(event)) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`❌ Event handler error for ${event}:`, error);
                }
            }
        }
    }
    
    // Connection management
    scheduleReconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnect attempts reached');
            this.emit('max_reconnect_attempts');
            return;
        }
        
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts),
            this.config.maxReconnectDelay
        );
        
        console.log(`⏰ Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }
    
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'ping' });
            }
        }, this.config.pingInterval);
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    disconnect() {
        console.log('🔌 Disconnecting WebSocket...');
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        this.stopHeartbeat();
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close(1000, 'Client disconnect');
        }
        
        this.isConnected = false;
        this.isAuthenticated = false;
        this.subscriptions.clear();
    }
    
    // Utility methods
    getConnectionState() {
        const states = {
            [WebSocket.CONNECTING]: 'connecting',
            [WebSocket.OPEN]: 'open',
            [WebSocket.CLOSING]: 'closing',
            [WebSocket.CLOSED]: 'closed'
        };
        
        return {
            readyState: this.ws ? states[this.ws.readyState] : 'not_created',
            isConnected: this.isConnected,
            isAuthenticated: this.isAuthenticated,
            clientId: this.clientId,
            subscriptions: Array.from(this.subscriptions),
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    getStats() {
        return {
            connection: this.getConnectionState(),
            lastPing: this.lastPing,
            eventHandlers: Array.from(this.eventHandlers.keys()),
            config: this.config
        };
    }
}

// Dashboard-specific WebSocket manager
class DashboardWebSocketManager {
    constructor() {
        this.ws = new WebSocketClient();
        this.isInitialized = false;
        this.dashboardType = null;
        this.updateHandlers = new Map();
        this.lastUpdateTime = new Map();
        
        // Auto-retry configuration
        this.retryConfig = {
            maxRetries: 3,
            retryDelay: 2000,
            backoffMultiplier: 2
        };
    }
    
    initialize(dashboardType, tenantId = null, role = 'tenant_admin') {
        if (this.isInitialized) {
            console.log('⚠️  Dashboard WebSocket already initialized');
            return;
        }
        
        this.dashboardType = dashboardType;
        console.log(`🚀 Initializing Dashboard WebSocket for ${dashboardType}`);
        
        // Set up event handlers
        this.setupEventHandlers();
        
        // Connect and authenticate
        const token = localStorage.getItem('authToken') || 'dev-token';
        this.ws.connect(token, tenantId, role);
        
        this.isInitialized = true;
    }
    
    setupEventHandlers() {
        // Connection events
        this.ws.on('connected', () => {
            console.log('✅ Dashboard WebSocket connected');
            this.showConnectionStatus('connected');
        });
        
        this.ws.on('authenticated', () => {
            console.log('✅ Dashboard WebSocket authenticated');
            this.subscribeToChannels();
        });
        
        this.ws.on('disconnected', () => {
            console.log('🔌 Dashboard WebSocket disconnected');
            this.showConnectionStatus('disconnected');
        });
        
        // Data update events
        this.ws.on('dashboard_update', (data) => {
            this.handleDashboardUpdate(data);
        });
        
        this.ws.on('metrics_update', (data) => {
            this.handleMetricsUpdate(data);
        });
        
        this.ws.on('platform_update', (data) => {
            this.handlePlatformUpdate(data);
        });
        
        // Error handling
        this.ws.on('error', (error) => {
            console.error('❌ Dashboard WebSocket error:', error);
            this.showConnectionStatus('error');
        });
    }
    
    subscribeToChannels() {
        const channels = this.getChannelsForDashboard();
        
        for (const channel of channels) {
            this.ws.subscribe(channel);
        }
    }
    
    getChannelsForDashboard() {
        const channelMap = {
            'tenant_admin': ['dashboard_kpi', 'live_metrics', 'appointment_status'],
            'super_admin': ['platform_overview', 'live_metrics', 'dashboard_kpi'],
            'analytics': ['live_metrics', 'dashboard_kpi', 'platform_overview']
        };
        
        return channelMap[this.dashboardType] || ['dashboard_kpi', 'live_metrics'];
    }
    
    handleDashboardUpdate(data) {
        console.log('📊 Dashboard update received');
        this.lastUpdateTime.set('dashboard', new Date());
        
        // Update dashboard components
        this.updateDashboardMetrics(data);
        this.updateConnectionIndicator('updated');
    }
    
    handleMetricsUpdate(data) {
        console.log('📈 Metrics update received');
        this.lastUpdateTime.set('metrics', new Date());
        
        // Update metrics displays
        this.updateLiveMetrics(data);
    }
    
    handlePlatformUpdate(data) {
        console.log('🏢 Platform update received');
        this.lastUpdateTime.set('platform', new Date());
        
        // Update platform overview
        this.updatePlatformOverview(data);
    }
    
    updateDashboardMetrics(data) {
        try {
            if (data.metrics) {
                // Update KPI cards
                this.updateKPICards(data.metrics);
                
                // Update charts
                this.updateCharts(data.metrics);
                
                // Update summary
                this.updateSummary(data.metrics);
            }
        } catch (error) {
            console.error('❌ Dashboard metrics update error:', error);
        }
    }
    
    updateKPICards(metrics) {
        const kpiMapping = {
            'total-appointments': metrics.appointments?.total || 0,
            'completed-appointments': metrics.appointments?.completed || 0,
            'total-revenue': metrics.revenue?.total || 0,
            'avg-transaction': metrics.revenue?.avgTransactionValue || 0,
            'total-conversations': metrics.conversations?.total || 0,
            'conversion-rate': metrics.summary?.conversionRate || 0
        };
        
        for (const [elementId, value] of Object.entries(kpiMapping)) {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = this.formatValue(elementId, value);
                this.animateValueChange(element);
            }
        }
    }
    
    updateCharts(metrics) {
        // This would integrate with Chart.js instances
        if (window.dashboardCharts) {
            // Update chart data
            for (const [chartId, chart] of Object.entries(window.dashboardCharts)) {
                try {
                    this.updateChartData(chartId, chart, metrics);
                } catch (error) {
                    console.error(`❌ Chart update error for ${chartId}:`, error);
                }
            }
        }
    }
    
    updateChartData(chartId, chart, metrics) {
        // Chart-specific update logic
        if (chartId === 'appointments-chart' && metrics.appointments) {
            chart.data.datasets[0].data = [
                metrics.appointments.confirmed,
                metrics.appointments.completed,
                metrics.appointments.cancelled
            ];
            chart.update('none'); // Update without animation for real-time
        }
    }
    
    updateLiveMetrics(data) {
        // Update live system metrics
        if (data.memory) {
            this.updateMemoryDisplay(data.memory);
        }
        
        if (data.connections) {
            this.updateConnectionCount(data.connections);
        }
    }
    
    updatePlatformOverview(data) {
        // Update platform-wide metrics
        if (data.platform) {
            this.updatePlatformKPIs(data.platform);
        }
    }
    
    // UI Helper methods
    showConnectionStatus(status) {
        const statusElement = document.getElementById('ws-status');
        if (statusElement) {
            const statusConfig = {
                connected: { text: 'Live', class: 'text-success', icon: 'fas fa-circle' },
                disconnected: { text: 'Offline', class: 'text-warning', icon: 'fas fa-exclamation-triangle' },
                error: { text: 'Error', class: 'text-danger', icon: 'fas fa-times-circle' },
                updated: { text: 'Updated', class: 'text-info', icon: 'fas fa-sync' }
            };
            
            const config = statusConfig[status] || statusConfig.disconnected;
            statusElement.innerHTML = `<i class="${config.icon}"></i> ${config.text}`;
            statusElement.className = `badge ${config.class}`;
        }
    }
    
    updateConnectionIndicator(status) {
        const indicator = document.getElementById('live-indicator');
        if (indicator) {
            indicator.classList.remove('text-success', 'text-warning', 'text-danger');
            
            if (status === 'updated') {
                indicator.classList.add('text-success');
                indicator.innerHTML = '<i class="fas fa-circle"></i> Live';
            } else if (status === 'disconnected') {
                indicator.classList.add('text-warning');
                indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Offline';
            }
        }
    }
    
    formatValue(type, value) {
        if (type.includes('revenue') || type.includes('transaction')) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(value);
        }
        
        if (type.includes('rate')) {
            return `${value}%`;
        }
        
        return value.toLocaleString();
    }
    
    animateValueChange(element) {
        element.style.transition = 'all 0.3s ease';
        element.style.transform = 'scale(1.1)';
        
        setTimeout(() => {
            element.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Public methods
    requestUpdate(channel) {
        return this.ws.requestUpdate(channel);
    }
    
    getConnectionStats() {
        return {
            ...this.ws.getStats(),
            lastUpdateTimes: Object.fromEntries(this.lastUpdateTime),
            isInitialized: this.isInitialized,
            dashboardType: this.dashboardType
        };
    }
    
    disconnect() {
        this.ws.disconnect();
        this.isInitialized = false;
    }
}

// Global instance
window.dashboardWS = new DashboardWebSocketManager();

// Auto-initialize based on page
document.addEventListener('DOMContentLoaded', () => {
    // Detect dashboard type from URL or page elements
    const dashboardType = window.location.pathname.includes('super-admin') ? 'super_admin' : 'tenant_admin';
    
    // Initialize if on a dashboard page
    if (document.querySelector('[data-dashboard]')) {
        window.dashboardWS.initialize(dashboardType);
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebSocketClient, DashboardWebSocketManager };
}