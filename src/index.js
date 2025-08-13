"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const tenants_1 = __importDefault(require("./routes/tenants"));
const whatsapp_simple_1 = __importDefault(require("./routes/whatsapp-simple"));
const admin_1 = __importDefault(require("./routes/admin"));
const billing_1 = __importDefault(require("./routes/billing"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const auth_1 = __importDefault(require("./routes/auth"));
const tenant_resolver_1 = require("./middleware/tenant-resolver");
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    defaultMeta: { service: 'universal-booking-system' },
    transports: [
        new winston_1.default.transports.File({ filename: 'error.log', level: 'error' }),
        new winston_1.default.transports.File({ filename: 'combined.log' }),
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
        })
    ]
});
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug']
}));
app.use((0, compression_1.default)());
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger.info(message.trim())
    }
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});
app.get('/api/status', (req, res) => {
    const requiredEnvVars = [
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'WHATSAPP_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'OPENAI_API_KEY'
    ];
    const envStatus = requiredEnvVars.reduce((acc, envVar) => {
        acc[envVar] = process.env[envVar] ? '✅ Configured' : '❌ Missing';
        return acc;
    }, {});
    const allConfigured = requiredEnvVars.every(envVar => !!process.env[envVar]);
    res.json({
        service: 'Universal Booking System',
        version: '1.0.0',
        status: allConfigured ? 'ready' : 'configuration_needed',
        environment: {
            node_env: process.env.NODE_ENV || 'development',
            port: port,
            ...envStatus
        },
        features: {
            multi_tenant: '✅ Enabled',
            whatsapp_business: process.env.WHATSAPP_TOKEN ? '✅ Enabled' : '❌ Disabled',
            ai_integration: process.env.OPENAI_API_KEY ? '✅ Enabled' : '❌ Disabled',
            database: process.env.SUPABASE_URL ? '✅ Connected' : '❌ Not Connected'
        },
        domains_supported: [
            'legal',
            'healthcare',
            'education',
            'beauty',
            'sports',
            'consulting'
        ],
        timestamp: new Date().toISOString()
    });
});
app.use('/api/tenants', tenant_resolver_1.resolveTenant);
app.use('/static', express_1.default.static(path_1.default.join(__dirname, '../src/frontend')));
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'landing.html'));
});
app.get('/admin', (req, res) => {
    // Send the unified dashboard that handles both roles
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'dashboard-standardized.html'));
});
app.get('/login', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'login.html'));
});
app.get('/register', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'register.html'));
});
app.get('/settings', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'settings.html'));
});
app.get('/billing', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'billing.html'));
});
app.get('/success', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'success.html'));
});
app.get('/agenda', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'tenant-agenda.html'));
});
app.get('/analytics', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'analytics.html'));
});
app.get('/appointments', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'appointments.html'));
});
app.get('/customers', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'customers.html'));
});
app.get('/services', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'services.html'));
});
app.get('/tenants', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'tenants.html'));
});
app.get('/admin/tenant-platform', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'tenant-platform-dashboard.html'));
});
app.get('/payments', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../src/frontend', 'payments.html'));
});
app.use('/api/tenants', tenants_1.default);
app.use('/api/whatsapp', whatsapp_simple_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/billing', billing_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/auth', auth_1.default);
app.get('/api', (req, res) => {
    res.json({
        message: '🚀 Universal Booking System API',
        description: 'Sistema Universal de Agendamentos Multi-Tenant com WhatsApp AI',
        version: '1.0.0',
        documentation: 'https://github.com/Marseau/universal-booking-system',
        endpoints: {
            health: '/health',
            status: '/api/status',
            tenants: '/api/tenants',
            whatsapp: '/api/whatsapp',
            billing: '/api/billing'
        },
        features: [
            'Multi-tenant architecture',
            'WhatsApp Business API integration',
            'AI-powered conversations',
            'Cross-tenant user support',
            'Multiple business domains',
            'Stripe billing integration'
        ],
        supported_domains: [
            'Legal (Advogados)',
            'Healthcare (Psicólogos)',
            'Education (Professores)',
            'Beauty (Salões)',
            'Sports (Personal Trainers)',
            'Consulting (Consultores)'
        ]
    });
});
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body
    });
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
        request_id: req.headers['x-request-id'] || 'unknown'
    });
});
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        available_routes: [
            'GET /',
            'GET /health',
            'GET /api/status',
            'GET /api/tenants',
            'POST /api/tenants',
            'GET /api/whatsapp/webhook',
            'POST /api/whatsapp/webhook',
            'POST /api/whatsapp/send',
            'GET /api/whatsapp/status'
        ],
        timestamp: new Date().toISOString()
    });
});
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});
const server = app.listen(port, () => {
    logger.info(`🚀 Universal Booking System started`);
    logger.info(`📊 Server running on port ${port}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📱 WhatsApp Business: ${process.env.WHATSAPP_TOKEN ? 'Enabled' : 'Disabled'}`);
    logger.info(`🤖 AI Integration: ${process.env.OPENAI_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`🗄️  Database: ${process.env.SUPABASE_URL ? 'Connected' : 'Not Connected'}`);
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SUBSCRIPTION_MONITORING === 'true') {
        try {
            logger.info(`📋 Subscription monitoring service started`);
        }
        catch (error) {
            logger.error('Failed to start subscription monitoring:', error);
        }
    }
    try {
        const retentionDays = parseInt(process.env.CONVERSATION_RETENTION_DAYS || '60');
        const cleanupIntervalHours = parseInt(process.env.CONVERSATION_CLEANUP_INTERVAL_HOURS || '24');
    }
    catch (error) {
        logger.error('Failed to start conversation cleanup:', error);
    }
    if (process.env.NODE_ENV === 'development') {
        console.log('\n🔗 Quick Links:');
        console.log(`   API Status: http://localhost:${port}/api/status`);
        console.log(`   Health Check: http://localhost:${port}/health`);
        console.log(`   WhatsApp Status: http://localhost:${port}/api/whatsapp/status`);
        console.log(`   Billing Dashboard: http://localhost:${port}/billing`);
        console.log(`   Documentation: https://github.com/Marseau/universal-booking-system`);
    }
});
server.on('error', (error) => {
    logger.error('Server error:', error);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map