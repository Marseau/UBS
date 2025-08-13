/**
 * P3-002: Real-time WebSocket Service
 * 
 * WebSocket implementation for live dashboard updates and real-time KPI sync
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { getCachedMetricsService } = require('./cached-metrics.service');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // clientId -> { ws, tenantId, role, subscriptions }
        this.rooms = new Map(); // roomId -> Set of clientIds
        this.metrics = getCachedMetricsService();
        
        // Real-time update intervals
        this.updateIntervals = {
            DASHBOARD_KPI: 10000,      // 10 seconds
            LIVE_METRICS: 5000,        // 5 seconds  
            CONVERSATION_FEED: 2000,   // 2 seconds
            APPOINTMENT_STATUS: 15000, // 15 seconds
            PLATFORM_OVERVIEW: 30000  // 30 seconds
        };
        
        this.activeIntervals = new Map();
        this.lastUpdate = new Map();
    }
    
    initialize(server) {
        console.log('🚀 Initializing WebSocket service...');
        
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws',
            clientTracking: true
        });
        
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });
        
        this.wss.on('error', (error) => {
            console.error('❌ WebSocket server error:', error.message);
        });
        
        // Start global update cycles
        this.startUpdateCycles();
        
        console.log('✅ WebSocket service initialized');
        console.log(`📡 WebSocket server listening on /ws`);
    }
    
    handleConnection(ws, req) {
        const clientId = uuidv4();
        const ip = req.socket.remoteAddress;
        
        console.log(`🔗 New WebSocket connection: ${clientId} from ${ip}`);
        
        // Initialize client
        this.clients.set(clientId, {
            ws: ws,
            id: clientId,
            connectedAt: new Date(),
            tenantId: null,
            role: null,
            subscriptions: new Set(),
            lastPing: Date.now()
        });
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'connection_established',
            clientId: clientId,
            timestamp: new Date().toISOString(),
            availableChannels: [
                'dashboard_kpi',
                'live_metrics', 
                'conversation_feed',
                'appointment_status',
                'platform_overview'
            ]
        });
        
        // Handle messages
        ws.on('message', (data) => {
            this.handleMessage(clientId, data);
        });
        
        // Handle connection close
        ws.on('close', () => {
            this.handleDisconnection(clientId);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for client ${clientId}:`, error.message);
            this.handleDisconnection(clientId);
        });
        
        // Start ping/pong for connection health
        this.startHeartbeat(clientId);
    }
    
    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);
            
            if (!client) {
                console.error(`❌ Message from unknown client: ${clientId}`);
                return;
            }
            
            console.log(`📨 Message from ${clientId}:`, message.type);
            
            switch (message.type) {
                case 'authenticate':
                    this.handleAuthentication(clientId, message);
                    break;
                    
                case 'subscribe':
                    this.handleSubscription(clientId, message);
                    break;
                    
                case 'unsubscribe':
                    this.handleUnsubscription(clientId, message);
                    break;
                    
                case 'ping':
                    this.handlePing(clientId);
                    break;
                    
                case 'request_update':
                    this.handleUpdateRequest(clientId, message);
                    break;
                    
                default:
                    console.log(`⚠️  Unknown message type: ${message.type}`);
            }
            
        } catch (error) {
            console.error(`❌ Message parsing error for client ${clientId}:`, error.message);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid message format'
            });
        }
    }
    
    handleAuthentication(clientId, message) {
        const client = this.clients.get(clientId);
        const { token, tenantId, role } = message;
        
        // Simple authentication for demo (in production, verify JWT)
        if (token && (role === 'super_admin' || role === 'tenant_admin')) {
            client.tenantId = tenantId;
            client.role = role;
            client.authenticated = true;
            
            console.log(`✅ Client ${clientId} authenticated as ${role}${tenantId ? ` for tenant ${tenantId}` : ''}`);
            
            this.sendToClient(clientId, {
                type: 'authenticated',
                role: role,
                tenantId: tenantId,
                permissions: this.getPermissions(role)
            });
            
            // Join appropriate rooms
            this.joinRoom(clientId, `role:${role}`);
            if (tenantId) {
                this.joinRoom(clientId, `tenant:${tenantId}`);
            }
            
        } else {
            this.sendToClient(clientId, {
                type: 'authentication_failed',
                message: 'Invalid credentials'
            });
        }
    }
    
    handleSubscription(clientId, message) {
        const client = this.clients.get(clientId);
        const { channel, params } = message;
        
        if (!client.authenticated) {
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Authentication required'
            });
            return;
        }
        
        // Validate subscription permissions
        if (!this.canSubscribeToChannel(client, channel)) {
            this.sendToClient(clientId, {
                type: 'subscription_denied',
                channel: channel,
                message: 'Insufficient permissions'
            });
            return;
        }
        
        client.subscriptions.add(channel);
        console.log(`📡 Client ${clientId} subscribed to ${channel}`);
        
        this.sendToClient(clientId, {
            type: 'subscribed',
            channel: channel,
            updateInterval: this.updateIntervals[channel.toUpperCase()] || 10000
        });
        
        // Send initial data
        this.sendInitialData(clientId, channel, params);
        
        // Join channel room
        this.joinRoom(clientId, `channel:${channel}`);
    }
    
    handleUnsubscription(clientId, message) {
        const client = this.clients.get(clientId);
        const { channel } = message;
        
        client.subscriptions.delete(channel);
        this.leaveRoom(clientId, `channel:${channel}`);
        
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            channel: channel
        });
        
        console.log(`📡 Client ${clientId} unsubscribed from ${channel}`);
    }
    
    handlePing(clientId) {
        const client = this.clients.get(clientId);
        client.lastPing = Date.now();
        
        this.sendToClient(clientId, {
            type: 'pong',
            timestamp: new Date().toISOString()
        });
    }
    
    async handleUpdateRequest(clientId, message) {
        const client = this.clients.get(clientId);
        const { channel, params } = message;
        
        if (!client.subscriptions.has(channel)) {
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Not subscribed to channel'
            });
            return;
        }
        
        try {
            const data = await this.generateUpdateData(channel, client, params);
            this.sendToClient(clientId, {
                type: 'update',
                channel: channel,
                data: data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error(`❌ Update request error for ${channel}:`, error.message);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Failed to fetch update data'
            });
        }
    }
    
    handleDisconnection(clientId) {
        const client = this.clients.get(clientId);
        
        if (client) {
            console.log(`🔌 Client ${clientId} disconnected`);
            
            // Remove from all rooms
            for (const [roomId, clientIds] of this.rooms.entries()) {
                clientIds.delete(clientId);
                if (clientIds.size === 0) {
                    this.rooms.delete(roomId);
                }
            }
            
            this.clients.delete(clientId);
        }
    }
    
    // Real-time update cycles
    startUpdateCycles() {
        console.log('⏰ Starting real-time update cycles...');
        
        // Dashboard KPI updates
        this.activeIntervals.set('dashboard_kpi', setInterval(async () => {
            await this.broadcastDashboardUpdates();
        }, this.updateIntervals.DASHBOARD_KPI));
        
        // Live metrics updates
        this.activeIntervals.set('live_metrics', setInterval(async () => {
            await this.broadcastMetricsUpdates();
        }, this.updateIntervals.LIVE_METRICS));
        
        // Platform overview updates
        this.activeIntervals.set('platform_overview', setInterval(async () => {
            await this.broadcastPlatformUpdates();
        }, this.updateIntervals.PLATFORM_OVERVIEW));
        
        console.log('✅ Update cycles started');
    }
    
    async broadcastDashboardUpdates() {
        const channelClients = this.rooms.get('channel:dashboard_kpi');
        if (!channelClients || channelClients.size === 0) return;
        
        try {
            // Get tenant-specific updates
            const tenantUpdates = new Map();
            
            for (const clientId of channelClients) {
                const client = this.clients.get(clientId);
                if (client?.tenantId && !tenantUpdates.has(client.tenantId)) {
                    const metrics = await this.metrics.getDashboardMetrics(client.tenantId);
                    tenantUpdates.set(client.tenantId, metrics);
                }
            }
            
            // Send updates to subscribed clients
            for (const clientId of channelClients) {
                const client = this.clients.get(clientId);
                if (client?.tenantId) {
                    const data = tenantUpdates.get(client.tenantId);
                    if (data) {
                        this.sendToClient(clientId, {
                            type: 'dashboard_update',
                            channel: 'dashboard_kpi',
                            data: data,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Dashboard broadcast error:', error.message);
        }
    }
    
    async broadcastMetricsUpdates() {
        const channelClients = this.rooms.get('channel:live_metrics');
        if (!channelClients || channelClients.size === 0) return;
        
        try {
            const liveMetrics = {
                timestamp: new Date().toISOString(),
                connections: this.clients.size,
                activeChannels: this.rooms.size,
                systemLoad: process.memoryUsage(),
                uptime: process.uptime()
            };
            
            this.broadcastToChannel('live_metrics', {
                type: 'metrics_update',
                channel: 'live_metrics',
                data: liveMetrics
            });
            
        } catch (error) {
            console.error('❌ Metrics broadcast error:', error.message);
        }
    }
    
    async broadcastPlatformUpdates() {
        const channelClients = this.rooms.get('channel:platform_overview');
        if (!channelClients || channelClients.size === 0) return;
        
        try {
            const platformMetrics = await this.metrics.getPlatformMetrics();
            
            this.broadcastToChannel('platform_overview', {
                type: 'platform_update',
                channel: 'platform_overview',
                data: platformMetrics
            });
            
        } catch (error) {
            console.error('❌ Platform broadcast error:', error.message);
        }
    }
    
    // Helper methods
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`❌ Send error to client ${clientId}:`, error.message);
                this.handleDisconnection(clientId);
            }
        }
    }
    
    broadcastToChannel(channel, message) {
        const channelClients = this.rooms.get(`channel:${channel}`);
        if (channelClients) {
            for (const clientId of channelClients) {
                this.sendToClient(clientId, message);
            }
        }
    }
    
    broadcastToRoom(roomId, message) {
        const roomClients = this.rooms.get(roomId);
        if (roomClients) {
            for (const clientId of roomClients) {
                this.sendToClient(clientId, message);
            }
        }
    }
    
    joinRoom(clientId, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(clientId);
    }
    
    leaveRoom(clientId, roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.delete(clientId);
            if (room.size === 0) {
                this.rooms.delete(roomId);
            }
        }
    }
    
    canSubscribeToChannel(client, channel) {
        // Super admins can subscribe to everything
        if (client.role === 'super_admin') {
            return true;
        }
        
        // Tenant admins can subscribe to tenant-specific channels
        if (client.role === 'tenant_admin') {
            const allowedChannels = ['dashboard_kpi', 'live_metrics', 'conversation_feed', 'appointment_status'];
            return allowedChannels.includes(channel);
        }
        
        return false;
    }
    
    getPermissions(role) {
        const permissions = {
            super_admin: ['all_channels', 'platform_overview', 'tenant_management'],
            tenant_admin: ['dashboard_kpi', 'live_metrics', 'conversation_feed', 'appointment_status']
        };
        
        return permissions[role] || [];
    }
    
    async sendInitialData(clientId, channel, params) {
        const client = this.clients.get(clientId);
        
        try {
            const data = await this.generateUpdateData(channel, client, params);
            this.sendToClient(clientId, {
                type: 'initial_data',
                channel: channel,
                data: data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error(`❌ Initial data error for ${channel}:`, error.message);
        }
    }
    
    async generateUpdateData(channel, client, params = {}) {
        switch (channel) {
            case 'dashboard_kpi':
                if (client.tenantId) {
                    return await this.metrics.getDashboardMetrics(client.tenantId);
                }
                break;
                
            case 'live_metrics':
                return {
                    connections: this.clients.size,
                    activeChannels: this.rooms.size,
                    memory: process.memoryUsage(),
                    uptime: process.uptime(),
                    timestamp: new Date().toISOString()
                };
                
            case 'platform_overview':
                return await this.metrics.getPlatformMetrics();
                
            case 'conversation_feed':
                // This would fetch recent conversations
                return { recentConversations: [], lastUpdate: new Date().toISOString() };
                
            case 'appointment_status':
                // This would fetch appointment updates
                return { recentAppointments: [], lastUpdate: new Date().toISOString() };
                
            default:
                throw new Error(`Unknown channel: ${channel}`);
        }
    }
    
    startHeartbeat(clientId) {
        const heartbeatInterval = setInterval(() => {
            const client = this.clients.get(clientId);
            
            if (!client || client.ws.readyState !== WebSocket.OPEN) {
                clearInterval(heartbeatInterval);
                return;
            }
            
            // Check if client is still responsive
            const timeSinceLastPing = Date.now() - client.lastPing;
            if (timeSinceLastPing > 60000) { // 1 minute timeout
                console.log(`⏰ Client ${clientId} timed out`);
                client.ws.terminate();
                clearInterval(heartbeatInterval);
                return;
            }
            
            // Send ping
            this.sendToClient(clientId, { type: 'ping' });
            
        }, 30000); // 30 second heartbeat
    }
    
    // Statistics and monitoring
    getStats() {
        return {
            totalConnections: this.clients.size,
            totalRooms: this.rooms.size,
            activeIntervals: this.activeIntervals.size,
            roomDetails: Array.from(this.rooms.entries()).map(([roomId, clients]) => ({
                roomId,
                clientCount: clients.size
            })),
            clientDetails: Array.from(this.clients.values()).map(client => ({
                id: client.id,
                role: client.role,
                tenantId: client.tenantId,
                subscriptions: Array.from(client.subscriptions),
                connectedAt: client.connectedAt
            }))
        };
    }
    
    // Graceful shutdown
    shutdown() {
        console.log('🔌 Shutting down WebSocket service...');
        
        // Clear all intervals
        for (const interval of this.activeIntervals.values()) {
            clearInterval(interval);
        }
        
        // Close all connections
        for (const client of this.clients.values()) {
            client.ws.terminate();
        }
        
        if (this.wss) {
            this.wss.close();
        }
        
        console.log('✅ WebSocket service shutdown complete');
    }
}

// Singleton instance
let wsServiceInstance = null;

function getWebSocketService() {
    if (!wsServiceInstance) {
        wsServiceInstance = new WebSocketService();
    }
    return wsServiceInstance;
}

module.exports = {
    WebSocketService,
    getWebSocketService
};