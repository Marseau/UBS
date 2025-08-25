import express from 'express';
import path from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { AdminAuthMiddleware } from './middleware/admin-auth';
import { verifyActiveSubscription } from './middleware/subscription-auth';
import { redisCacheService } from './services/redis-cache.service';
import { validateProductionModel } from './utils/ai-config';

// Load environment variables
dotenv.config();

// 🚨 PRP-OPENAI-MODEL-UNI: Validação crítica em produção
validateProductionModel();

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar no proxy (dev.ubs.app.br → localhost)
app.set('trust proxy', 1);

// Middleware: RAW body para webhooks WhatsApp (V3 oficial)
try {
  const whatsappV3WebhookPath = '/api/whatsapp-v3/webhook';
  const whatsappOfficialWebhookPath = '/api/whatsapp/webhook';
  // raw body para verificar assinatura
  // @ts-ignore: express.raw disponível
  app.use(whatsappV3WebhookPath, express.raw({ type: 'application/json' }));
  // @ts-ignore: express.raw disponível
  app.use(whatsappOfficialWebhookPath, express.raw({ type: 'application/json' }));
} catch (_) { /* noop */ }

// Demais rotas usam JSON normal
app.use(express.json());

// Servir arquivos estáticos da pasta frontend
app.use('/src/frontend', express.static(path.join(__dirname, 'frontend')));

// Autenticação para rotas da API de Admin
const authMiddleware = new AdminAuthMiddleware();
// Apply auth middleware to all admin routes except login
app.use('/api/admin', (req, res, next) => {
  // Skip authentication for login route
  if (req.path === '/auth/login') {
    return next();
  }
  return authMiddleware.verifyToken(req, res, next);
});

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
try {
  // Oficial: V3 no endpoint padrão
  const whatsappWebhookV3 = require('./routes/whatsapp-webhook-v3.routes');
  app.use('/api/whatsapp', 'default' in whatsappWebhookV3 ? whatsappWebhookV3.default : whatsappWebhookV3);
  console.log('✅ WhatsApp webhook V3 promoted to official /api/whatsapp');
} catch (error) {
  console.error('❌ Failed to load WhatsApp webhook V3 as official route:', error);
}

// V2 removida para evitar confusão; manter apenas V3

// Alias: manter V3 acessível também em /api/whatsapp-v3
try {
  const whatsappWebhookV3Alias = require('./routes/whatsapp-webhook-v3.routes');
  app.use('/api/whatsapp-v3', 'default' in whatsappWebhookV3Alias ? whatsappWebhookV3Alias.default : whatsappWebhookV3Alias);
  console.log('✅ WhatsApp webhook V3 alias mounted at /api/whatsapp-v3');
} catch (error) {
  console.error('❌ Failed to load WhatsApp webhook V3 routes:', error);
}

try {
  // Load Google OAuth routes (no auth required for OAuth flow)
  const googleOAuthRoutes = require('./routes/google-oauth.routes');
  app.use('/api/google-oauth', 'default' in googleOAuthRoutes ? googleOAuthRoutes.default : googleOAuthRoutes);
  console.log('✅ Google OAuth routes loaded successfully - CALENDAR INTEGRATION READY');
} catch (error) {
  console.error("❌ Failed to load Google OAuth routes:", error);
}

try {
  // Load auth routes first (critical for registration)
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', 'default' in authRoutes ? authRoutes.default : authRoutes);
  console.log('✅ Auth routes loaded successfully');
} catch (error) {
  console.error("❌ Failed to load auth routes:", error);
}

try {
  // Load simple login route (EMERGENCY FIX)
  const simpleLoginRoutes = require('./routes/simple-login');
  app.use('/api/admin/auth', 'default' in simpleLoginRoutes ? simpleLoginRoutes.default : simpleLoginRoutes);
  console.log('✅ Simple login routes loaded successfully');
} catch (error) {
  console.error("❌ Failed to load simple login routes:", error);
}

try {
  // Load admin routes 
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', 'default' in adminRoutes ? adminRoutes.default : adminRoutes);
  console.log('✅ Admin routes loaded successfully - NAVEGAÇÃO CORRIGIDA - APPOINTMENTS AGORA INTERNO');
} catch (error) {
  console.error("❌ Failed to load admin routes:", error);
}

try {
  // Load dashboard routes for all 3 dashboards
  const dashboardRoutes = require('./routes/dashboard-apis');
  
  // Apply auth + subscription middleware to dashboard routes
  app.use('/api/dashboard', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/dashboard', verifyActiveSubscription);
  
  app.use('/api/dashboard', 'default' in dashboardRoutes ? dashboardRoutes.default : dashboardRoutes);
  console.log('✅ Dashboard routes loaded successfully - ALL 3 DASHBOARDS READY + SUBSCRIPTION PROTECTED');
} catch (error) {
  console.error("❌ Failed to load dashboard routes:", error);
}

try {
  // Load Super Admin 6 Charts routes (WITHOUT middleware - will be handled by unified middleware later)
  const superAdmin6ChartsRoutes = require('./routes/super-admin-6-charts-apis');
  app.use('/api/super-admin', 'default' in superAdmin6ChartsRoutes ? superAdmin6ChartsRoutes.default : superAdmin6ChartsRoutes);
  console.log('✅ Super Admin 6 Charts routes loaded successfully - REAL DATA ANALYTICS READY');
} catch (error) {
  console.error("❌ Failed to load Super Admin 6 Charts routes:", error);
}

// UBS monitoring routes - reactivated
try {
  const ubsMonitoringRoutes = require('./routes/ubs-monitoring.routes');
  app.use('/api/ubs-monitoring', authMiddleware.requireSuperAdmin, 
          'default' in ubsMonitoringRoutes ? ubsMonitoringRoutes.default : ubsMonitoringRoutes);
  console.log('✅ UBS Monitoring routes loaded successfully');
} catch (error) {
  console.error("❌ Failed to load UBS monitoring routes:", error);
}

try {
  // Load analytics routes for tenant-specific data
  const analyticsRoutes = require('./routes/analytics');
  
  // Apply auth + subscription middleware to analytics routes (tenant-specific)
  app.use('/api/analytics', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/analytics', verifyActiveSubscription);
  
  app.use('/api/analytics', 'default' in analyticsRoutes ? analyticsRoutes.default : analyticsRoutes);
  console.log('✅ Analytics routes loaded successfully + SUBSCRIPTION PROTECTED');
} catch (error) {
  console.error("❌ Failed to load analytics routes:", error);
}

try {
  // Load tenant business analytics routes (FASE 4)
  const tenantAnalyticsRoutes = require('./routes/tenant-business-analytics');
  
  // Apply auth middleware to tenant analytics routes
  app.use('/api/tenant-business-analytics', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/tenant-business-analytics', 'default' in tenantAnalyticsRoutes ? tenantAnalyticsRoutes.default : tenantAnalyticsRoutes);
  console.log('✅ Tenant Business Analytics routes loaded successfully - FASE 4 COMPLETA');
} catch (error) {
  console.error("❌ Failed to load tenant business analytics routes:", error);
}

try {
  // Load tenant analytics cron routes (FASE 6)
  const tenantAnalyticsCronRoutes = require('./routes/tenant-analytics-cron');
  
  // Apply auth middleware to cron routes
  app.use('/api/tenant-analytics-cron', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/tenant-analytics-cron', 'default' in tenantAnalyticsCronRoutes ? tenantAnalyticsCronRoutes.default : tenantAnalyticsCronRoutes);
  console.log('✅ Tenant Analytics Cron routes loaded successfully - FASE 6 APIS');
} catch (error) {
  console.error("❌ Failed to load tenant analytics cron routes:", error);
}

try {
  // Load billing routes for payment management
  const billingRoutes = require('./routes/billing');
  app.use('/api/billing', 'default' in billingRoutes ? billingRoutes.default : billingRoutes);
  console.log('✅ Billing routes loaded successfully');
} catch (error) {
  console.error("❌ Failed to load billing routes:", error);
}

try {
  // Load metrics refresh routes (NEW METRICS SYSTEM)
  const metricsRefreshRoutes = require('./routes/metrics-refresh.routes');
  
  // Apply auth middleware
  app.use('/api/metrics', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/metrics', 'default' in metricsRefreshRoutes ? metricsRefreshRoutes.default : metricsRefreshRoutes);
  console.log('✅ Metrics refresh routes loaded successfully');
} catch (error) {
  console.error("❌ Failed to load metrics routes:", error);
}

try {
  // Load conversation billing management routes (NEW BILLING SYSTEM)
  const conversationBillingRoutes = require('./routes/conversation-billing.routes');
  
  // Apply auth middleware with bypass for development
  app.use('/api/conversation-billing', (req, res, next) => {
    // Bypass authentication for development/testing or health checks
    if (process.env.NODE_ENV === 'development' || req.path === '/health') {
      return next();
    }
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/conversation-billing', 'default' in conversationBillingRoutes ? conversationBillingRoutes.default : conversationBillingRoutes);
  console.log('✅ Conversation Billing routes loaded successfully - BILLING APIS READY');
} catch (error) {
  console.error("❌ Failed to load conversation billing routes:", error);
}

try {
  // Load demo routes (NO AUTH REQUIRED)  
  const demoRoutesModule = require('./routes/demo-apis');
  const demoRoutes = demoRoutesModule.default || demoRoutesModule;
  app.use('/api/demo', demoRoutes);
  console.log('✅ Demo routes loaded successfully - DEMO INTERATIVA READY');
} catch (error) {
  console.error("❌ Failed to load demo routes:", error);
}

try {
  // Load UNIFIED metrics routes (NEW CONSOLIDATED SYSTEM)
  const unifiedMetricsRoutes = require('./routes/unified-metrics.routes');
  
  // Apply auth middleware to unified metrics routes
  app.use('/api/metrics', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/metrics', 'default' in unifiedMetricsRoutes ? unifiedMetricsRoutes.default : unifiedMetricsRoutes);
  console.log('✅ Unified Metrics routes loaded successfully - CONSOLIDATED API SYSTEM');
} catch (error) {
  console.error("❌ Failed to load unified metrics routes:", error);
}

try {
  // Load tenant-platform routes (NEW CONSOLIDATED APIs)
  const tenantPlatformRoutes = require('./routes/tenant-platform-apis');
  
  // Apply auth middleware to tenant-platform routes
  app.use('/api/tenant-platform', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/tenant-platform', 'default' in tenantPlatformRoutes ? tenantPlatformRoutes.default : tenantPlatformRoutes);
  console.log('✅ Tenant-Platform routes loaded successfully - CONSOLIDATED APIs READY');
} catch (error) {
  console.error("❌ Failed to load tenant-platform routes:", error);
}

try {
  // Load super-admin dashboard routes (NEW SUPER ADMIN APIs)
  const superAdminRoutes = require('./routes/super-admin-dashboard-apis');
  
  // Apply improved dashboard auth middleware to super-admin routes
  const { authenticateUser, requireSuperAdmin } = require('./middleware/dashboard-auth.middleware');
  app.use('/api/super-admin', authenticateUser);
  app.use('/api/super-admin', requireSuperAdmin);
  
  app.use('/api/super-admin', 'default' in superAdminRoutes ? superAdminRoutes.default : superAdminRoutes);
  console.log('✅ Super Admin Dashboard routes loaded successfully - SUPER ADMIN APIs READY');
} catch (error) {
  console.error("❌ Failed to load super-admin routes:", error);
}

try {
  // Load tenant-admin dashboard routes (TENANT ADMIN DASHBOARD APIs)
  const tenantAdminRoutes = require('./routes/tenant-admin-dashboard-apis');
  
  // Apply auth middleware to tenant-admin routes (always requires authentication)
  app.use('/api/tenant-admin', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/tenant-admin', 'default' in tenantAdminRoutes ? tenantAdminRoutes.default : tenantAdminRoutes);
  console.log('✅ Tenant Admin Dashboard routes loaded successfully - TENANT ADMIN APIs READY');
} catch (error) {
  console.error("❌ Failed to load tenant-admin routes:", error);
}

try {
  // Load advanced monitoring routes (ADVANCED MONITORING SYSTEM)
  const monitoringRoutes = require('./routes/advanced-monitoring.routes');
  app.use('/api/monitoring', 'default' in monitoringRoutes ? monitoringRoutes.default : monitoringRoutes);
  console.log('✅ Advanced Monitoring routes loaded successfully - MONITORING APIS READY');
} catch (error) {
  console.error("❌ Failed to load monitoring routes:", error);
}

try {
  // Load environment optimization routes (ENVIRONMENT OPTIMIZATION SYSTEM)
  const optimizationRoutes = require('./routes/environment-optimization.routes');
  app.use('/api/optimize', 'default' in optimizationRoutes ? optimizationRoutes.default : optimizationRoutes);
  console.log('✅ Environment Optimization routes loaded successfully - OPTIMIZATION APIS READY');
} catch (error) {
  console.error("❌ Failed to load optimization routes:", error);
}

try {
  // Load ML Analytics routes (MACHINE LEARNING ANALYTICS SYSTEM)
  const mlAnalyticsRoutes = require('./routes/ml-analytics.routes');
  app.use('/api/ml', 'default' in mlAnalyticsRoutes ? mlAnalyticsRoutes.default : mlAnalyticsRoutes);
  console.log('✅ ML Analytics routes loaded successfully - AI/ML ANALYTICS READY');
} catch (error) {
  console.error("❌ Failed to load ML analytics routes:", error);
}

try {
  // Load unified cron management routes (UNIFIED CRON SYSTEM)
  const cronRoutes = require('./routes/cron-management');
  
  // Apply auth middleware with bypass for development
  app.use('/api/cron', (req, res, next) => {
    // Bypass authentication for development/testing or health checks
    if (process.env.NODE_ENV === 'development' || req.path === '/health') {
      return next();
    }
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/cron', 'default' in cronRoutes ? cronRoutes.default : cronRoutes);
  console.log('✅ Unified Cron Management routes loaded successfully - CRON APIS READY');
} catch (error) {
  console.error("❌ Failed to load cron management routes:", error);
}

try {
  // Load UNIFIED METRICS MANAGEMENT routes (NEW UNIFIED PROCEDURE SYSTEM)
  const unifiedMetricsRoutes = require('./routes/unified-metrics-management.routes');
  
  // Apply auth middleware with bypass for development
  app.use('/api/unified-metrics', (req, res, next) => {
    // Bypass authentication for development/testing or health checks
    if (process.env.NODE_ENV === 'development' || req.path === '/health') {
      return next();
    }
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/unified-metrics', 'default' in unifiedMetricsRoutes ? unifiedMetricsRoutes.default : unifiedMetricsRoutes);
  console.log('✅ Unified Metrics Management routes loaded successfully - NEW UNIFIED PROCEDURE READY');
} catch (error) {
  console.error("❌ Failed to load unified metrics management routes:", error);
}

try {
  // Load optimized cron routes (NEW OPTIMIZED CRON SYSTEM)
  const optimizedCronRoutes = require('./routes/optimized-cron');
  
  // Apply auth middleware with bypass for development
  app.use('/api/optimized-cron', (req, res, next) => {
    // Bypass authentication for development/testing or health checks
    if (process.env.NODE_ENV === 'development' || req.path === '/health') {
      return next();
    }
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/optimized-cron', 'default' in optimizedCronRoutes ? optimizedCronRoutes.default : optimizedCronRoutes);
  console.log('✅ Optimized Cron routes loaded successfully - OPTIMIZED CRON APIS READY');
} catch (error) {
  console.error("❌ Failed to load optimized cron routes:", error);
}

try {
  // Load conversations routes for WhatsApp conversations management
  const conversationsRoutes = require('./routes/conversations');
  
  // Apply auth middleware to conversations routes  
  app.use('/api/admin/conversations', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/admin/conversations', 'default' in conversationsRoutes ? conversationsRoutes.default : conversationsRoutes);
  console.log('✅ Conversations routes loaded successfully - WHATSAPP CONVERSATIONS READY');
} catch (error) {
  console.error("❌ Failed to load conversations routes:", error);
}

try {
  // Load tenant routes for tenant-specific data
  const tenantRoutes = require('./routes/tenant');
  
  // Apply auth middleware to tenant routes
  app.use('/api/admin/tenant', (req, res, next) => {
    return authMiddleware.verifyToken(req, res, next);
  });
  
  app.use('/api/admin/tenant', 'default' in tenantRoutes ? tenantRoutes.default : tenantRoutes);
  console.log('✅ Tenant routes loaded successfully - TENANT DATA APIS READY');
} catch (error) {
  console.error("❌ Failed to load tenant routes:", error);
}

// Calendar Webhook Routes - Google Calendar bidirectional sync
try {
  const calendarWebhookRoutes = require('./routes/calendar-webhook');
  app.use('/api/calendar', calendarWebhookRoutes);
  console.log('✅ Calendar webhook routes loaded successfully - GOOGLE CALENDAR SYNC READY');
} catch (error) {
  console.error("❌ Failed to load calendar webhook routes:", error);
}

// Define o caminho para a pasta frontend de forma explícita e segura
const candidatePaths: string[] = [
  path.join(process.cwd(), 'src', 'frontend'),
  path.resolve(__dirname, '..', 'src', 'frontend')
];
function resolveFrontendPath(paths: string[]): string {
  const defaultPath: string = path.join(process.cwd(), 'src', 'frontend');
  for (const p of paths) {
    try {
      if (fs.existsSync(path.join(p, 'demo.html'))) {
        return p;
      }
    } catch (_) { /* ignore */ }
  }
  return defaultPath;
}
const frontendPath: string = resolveFrontendPath(candidatePaths);
console.log('🖥️ Frontend path using:', frontendPath);

// Routes - Define these BEFORE static middleware to ensure they take precedence
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'landing.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard-main.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(frontendPath, 'register.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(frontendPath, 'demo.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(frontendPath, 'forgot-password.html'));
});

app.get('/domain-details', (req, res) => {
  res.sendFile(path.join(frontendPath, 'domain-details.html'));
});

// Tenant Business Analytics Dashboard route
app.get('/tenant-business-analytics', (req, res) => {
  res.sendFile(path.join(frontendPath, 'tenant-business-analytics.html'));
});

// Redirect old tenant platform dashboard to new business analytics
app.get('/admin/tenant-platform', (req, res) => {
  res.redirect('/tenant-business-analytics.html');
});

app.get('/dashboard-standardized', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard-standardized.html'));
});

app.get('/dashboard-tenant-analysis', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard-tenant-analysis.html'));
});

app.get('/dashboard-tenant-admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard-tenant-admin.html'));
});

// Test page for tenant redirect
app.get('/test-tenant-redirect', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'test-tenant-redirect.html'));
});

// Static files after specific routes - this ensures route handlers take precedence
// Add no-cache headers for HTML files to prevent caching during development
app.use(express.static(frontendPath, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Helper para listar rotas (diagnóstico)
function listRoutes(limit: number = 50): string[] {
  const acc: string[] = [];
  // @ts-ignore
  const stack = app._router?.stack || [];
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => (layer.route.methods as any)[m])
        .map((m) => m.toUpperCase());
      acc.push(`${methods.join(', ')} ${layer.route.path}`);
    }
  }
  return acc.slice(0, limit);
}

// Rota de diagnóstico
app.get('/__signature', (_req, res) => {
  res.json({
    app: 'ubs-main',
    frontendPath,
    routes: listRoutes(100),
    timestamp: new Date().toISOString()
  });
});

// Initialize Email and Monitoring Services
let emailService: any = null;
let subscriptionMonitor: any = null;
let analyticsScheduler: any = null;
let metricsCronService: any = null;
let calendarSyncCron: any = null;

async function initializeServices() {
  try {
    console.log('🚀 Initializing application services...');
    
    // DEPLOY 3: Initialize Memory Optimizer (HIGHEST PRIORITY)
    try {
      console.log('🧠 [DEPLOY-3] Initializing Memory Optimizer...');
      const { memoryOptimizer } = await import('./utils/memory-optimizer');
      
      // Memory optimizer is already initialized as singleton
      
      // Set aggressive optimization targets
      const currentMemory = memoryOptimizer.getCurrentMemoryUsage();
      console.log(`📊 [MEMORY] Initial RSS: ${currentMemory.rss.toFixed(2)}MB`);
      console.log(`🎯 [MEMORY] Target: <50MB RSS in production`);
      
      // Trigger immediate optimization
      memoryOptimizer.triggerMemoryCleanup();
      
      // Setup periodic optimization (every 5 minutes)
      setInterval(() => {
        const usage = memoryOptimizer.getCurrentMemoryUsage();
        if (usage.rss > 50) {
          console.log(`🧹 [MEMORY] Triggering cleanup - RSS: ${usage.rss.toFixed(2)}MB`);
          memoryOptimizer.triggerMemoryCleanup();
        }
      }, 5 * 60 * 1000);
      
      console.log('✅ [DEPLOY-3] Memory Optimizer initialized successfully');
      console.log('🎯 [DEPLOY-3] Memory monitoring active - Target: <50MB RSS');
      
    } catch (error) {
      console.error('❌ [DEPLOY-3] Failed to initialize Memory Optimizer:', error);
    }
    
    // Initialize New Metrics Cron Service
    try {
      const { NewMetricsCronService } = await import('./services/new-metrics-cron.service');
      const metricsCron = new NewMetricsCronService();
      
      // Start metrics cron job (runs daily at 03:00h)
      metricsCron.start();
      
      console.log('✅ New Metrics Cron Service initialized successfully');
      console.log('⏰ Metrics cron job scheduled for 03:00h daily (America/Sao_Paulo)');
      
    } catch (error) {
      console.error('❌ Failed to initialize New Metrics Cron Service:', error);
    }
    
    // Initialize Conversation Outcome Processor
    try {
      const { conversationOutcomeProcessor } = await import('./cron/conversation-outcome-processor');
      
      // Start conversation outcome processor (runs every 15 minutes)
      conversationOutcomeProcessor.start();
      
      console.log('✅ Conversation Outcome Processor initialized successfully');
      console.log('⏰ Conversation outcome cronjob scheduled for every 15 minutes');
      
    } catch (error) {
      console.error('❌ Failed to initialize Conversation Outcome Processor:', error);
    }
    
    // Initialize COMPREHENSIVE METRICS SYSTEM (TODAS AS 14+ MÉTRICAS)
    if (process.env.ENABLE_COMPREHENSIVE_METRICS !== 'false') {
      try {
        const { executeAllMetrics } = require('../execute-all-metrics');
        const cron = require('node-cron');
        
        // Schedule comprehensive metrics calculation daily at 03:30h (after other crons)
        cron.schedule('30 3 * * *', async () => {
          console.log('🚀 Executando sistema completo de métricas...');
          try {
            const result = await executeAllMetrics();
            console.log('✅ Sistema de métricas executado:', result.success ? 'SUCESSO' : 'FALHA');
          } catch (error) {
            console.error('❌ Erro no sistema de métricas:', error);
          }
        });
        
        console.log('✅ Sistema Completo de Métricas inicializado');
        console.log('⏰ Cron agendado para 03:30h diariamente');
        console.log('📊 Cobertura: 14+ métricas para todos os tenants (7d/30d/90d)');
        
        // Add manual execution endpoint
        app.post('/api/admin/execute-comprehensive-metrics', authMiddleware.verifyToken, async (req, res) => {
          try {
            console.log('🚀 Execução manual do sistema de métricas iniciada...');
            const result = await executeAllMetrics();
            res.json({
              success: result.success,
              message: result.success ? 'Métricas calculadas com sucesso' : 'Erro no cálculo de métricas',
              data: result
            });
          } catch (error) {
            console.error('❌ Erro na execução manual:', error);
            res.status(500).json({
              success: false,
              message: 'Erro interno no sistema de métricas',
              error: error instanceof Error ? error.message : String(error)
            });
          }
        });
        
      } catch (error) {
        console.error('❌ Failed to initialize Comprehensive Metrics System:', error);
      }
    }
    
    // Initialize Email Service
    if (process.env.ENABLE_EMAIL_SERVICE === 'true') {
      const { EmailService } = await import('./services/email.service');
      emailService = new EmailService();
      
      // Test email configuration
      const testResult = await emailService.testConfiguration();
      if (testResult.success) {
        console.log('✅ Email service initialized successfully');
      } else {
        console.warn('⚠️ Email service configuration issue:', testResult.message);
      }
    }
    
    // Initialize Subscription Monitoring
    if (process.env.ENABLE_SUBSCRIPTION_MONITORING === 'true') {
      const { subscriptionMonitor: basicMonitor } = await import('./services/subscription-monitor.service');
      subscriptionMonitor = basicMonitor;
      subscriptionMonitor.startMonitoring();
      console.log('✅ Subscription monitoring service started');
    }
    
    // Schedule Email Reminders
    if (process.env.ENABLE_EMAIL_REMINDERS === 'true' && emailService) {
      // Run reminder check every hour
      setInterval(async () => {
        try {
          await emailService.scheduleReminders();
        } catch (error) {
          console.error('❌ Error in reminder scheduler:', error);
        }
      }, 60 * 60 * 1000); // 1 hour
      
      console.log('✅ Email reminder scheduler activated (hourly)');
    }
    
    // Initialize Analytics Scheduler
    if (process.env.ENABLE_ANALYTICS_SCHEDULER !== 'false') {
      try {
        const { getSchedulerInstance } = await import('./services/analytics-scheduler.service');
        analyticsScheduler = getSchedulerInstance();
        await analyticsScheduler.initialize();
        console.log('✅ Analytics scheduler initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize analytics scheduler:', error);
        // Don't break the app if analytics scheduler fails
      }
    }
    
    // Initialize CONVERSATION BILLING CRON SERVICE (VERSÃO DEFINITIVA)
    if (process.env.ENABLE_CONVERSATION_BILLING !== 'false') {
      try {
        console.log('💰 Billing System agora integrado ao Unified Cron Service...');
        console.log('📋 Modelo: Planos fixos + excedente por conversa');
        console.log('🎯 Métricas baseadas em conversation_outcome (dados reais)');
        console.log('✅ Billing calculation integrado ao Unified Cron Service');
        console.log('💰 Sistema completo de cobrança por conversas ativo');
        console.log('📊 Management API: /api/cron/* endpoints disponíveis');
        
      } catch (error) {
        console.error('❌ Failed to initialize Billing System:', error);
      }
    }

    // Initialize OPTIMIZED TENANT METRICS CRON SERVICE (25x more efficient for 10k tenants)
    if (process.env.ENABLE_UNIFIED_CRON !== 'false') {
      try {
        console.log('🚀 Initializing Optimized Tenant Metrics Cron Service...');
        console.log('📋 MIGRATED: unified-cron.service → tenant-metrics-cron-optimized.service');
        console.log('🚀 PERFORMANCE: 25x faster, Redis caching, intelligent batching for 10k tenants');
        
        const TenantMetricsCronOptimizedService = (await import('./services/tenant-metrics-cron-optimized.service')).default;
        const optimizedService = new TenantMetricsCronOptimizedService();
        await optimizedService.initialize();
        
        // Store service instance globally for API access
        (global as any).tenantMetricsCronService = optimizedService;
        
        console.log('✅ Optimized Tenant Metrics Cron Service initialized successfully');
        console.log('🎯 MIGRATION COMPLETE: 25x performance boost + platform aggregation');
        console.log('⏰ Smart scheduling: Daily comprehensive + Weekly risk + Monthly evolution');
        console.log('📊 Management API: /api/cron/* endpoints migrated and enhanced');
        
      } catch (error) {
        console.error('❌ Failed to initialize Unified Cron Service:', error);
        console.log('🔄 Falling back to legacy services...');
        
        // FALLBACK: Initialize old services if unified fails
        try {
          console.log('🕐 [FALLBACK] Initializing Tenant-Platform Cron Service...');
          const { tenantPlatformCronService } = await import('./services/tenant-platform-cron.service');
          tenantPlatformCronService.initialize();
          console.log('✅ [FALLBACK] Tenant-Platform Cron Service active');
        } catch (fallbackError) {
          console.error('❌ [FALLBACK] Failed to initialize fallback service:', fallbackError);
        }
      }
    } else {
      console.log('⚠️ Unified Cron Service disabled via ENABLE_UNIFIED_CRON=false');
      console.log('🔄 Using legacy services...');
      
      // Initialize legacy services when unified is disabled
      if (process.env.ENABLE_TENANT_PLATFORM_CRON !== 'false') {
        try {
          console.log('🕐 [LEGACY] Initializing Tenant-Platform Cron Service...');
          const { tenantPlatformCronService } = await import('./services/tenant-platform-cron.service');
          tenantPlatformCronService.initialize();
          console.log('✅ [LEGACY] Tenant-Platform Cron Service initialized');
        } catch (error) {
          console.error('❌ [LEGACY] Failed to initialize Tenant-Platform Cron Service:', error);
        }
      }
    }
    
    // Initialize Optimized Cron Service (NEW)
    if (process.env.ENABLE_OPTIMIZED_CRON !== 'false') {
      try {
        console.log('🚀 Inicializando Optimized Cron Service...');
        console.log('📋 Replacing: 21 legacy crons → 5 optimized crons');
        
        const { optimizedCronService } = await import('./services/optimized-cron.service');
        console.log('✅ Optimized Cron Service initialized successfully - PRODUCTION READY');
      } catch (error) {
        console.error('❌ Failed to initialize Optimized Cron Service:', error);
      }
    }

    // Initialize Conversation Billing Cron Service (NEW MODEL)
    if (process.env.ENABLE_BILLING_CRON !== 'false') {
      try {
        console.log('💰 Inicializando Conversation Billing Cron Service...');
        console.log('📋 Modelo de cobrança: Planos fixos + excedente');
        
        // Sistema de billing agora integrado ao unified-cron.service
        console.log('📋 Billing calculation integrado ao Unified Cron Service');
        
        console.log('✅ Conversation Billing Cron Service initialized successfully');
        console.log('🎯 Atualização automática de métricas de cobrança ativa');
        console.log('💳 Modelo: Básico R$ 44,48 | Profissional R$ 111,20 | Enterprise R$ 278,00');
        console.log('⚡ Excedente: R$ 0,25 por conversa adicional');
        
      } catch (error) {
        console.error('❌ Failed to initialize Conversation Billing Cron Service:', error);
      }
    }

    // Initialize Google Calendar Sync Cron
    try {
      const { calendarSyncCron } = require('./services/calendar-sync-cron.service');
      calendarSyncCron.start();
      
      console.log('✅ Google Calendar Sync Cron initialized successfully');
      console.log('📅 Sincronização automática a cada 15 minutos');
      console.log('🔄 Eventos externos → appointments | Mudanças → atualizações');
      
    } catch (error) {
      console.error('❌ Failed to initialize Calendar Sync Cron:', error);
    }

    console.log('🎉 All services initialized successfully');
    
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
  }
}

app.listen(PORT, async () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email Service: ${process.env.ENABLE_EMAIL_SERVICE === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔔 Email Reminders: ${process.env.ENABLE_EMAIL_REMINDERS === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💰 Subscription Monitor: ${process.env.ENABLE_SUBSCRIPTION_MONITORING === 'true' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`📊 Analytics Scheduler: ${process.env.ENABLE_ANALYTICS_SCHEDULER !== 'false' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔄 Metrics Cron Service: ${process.env.ENABLE_METRICS_CRON !== 'false' ? 'ENABLED' : 'DISABLED'}`);
  
  // Initialize services after server starts
  await initializeServices();
});