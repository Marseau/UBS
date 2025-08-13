import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface ProductionConfig {
  environment: "production" | "staging";
  database: {
    url: string;
    ssl: boolean;
    poolSize: number;
    maxRetries: number;
  };
  security: {
    jwtSecret: string;
    jwtExpiresIn: string;
    forceHttps: boolean;
    corsOrigins: string[];
    rateLimiting: {
      enabled: boolean;
      windowMs: number;
      maxRequests: number;
    };
  };
  monitoring: {
    enabled: boolean;
    logLevel: "error" | "warn" | "info" | "debug";
    metricsCollection: boolean;
  };
  performance: {
    cacheEnabled: boolean;
    compressionEnabled: boolean;
    staticFilesCaching: boolean;
  };
  integrations: {
    whatsapp: {
      webhookUrl: string;
      verifyToken: string;
    };
    email: {
      smtpEnabled: boolean;
      provider: string;
    };
  };
}

export class ProductionConfigService {
  /**
   * Generate production environment configuration
   */
  static generateProductionConfig(): ProductionConfig {
    return {
      environment: "production",
      database: {
        url: process.env.SUPABASE_URL || "",
        ssl: true,
        poolSize: 20,
        maxRetries: 3,
      },
      security: {
        jwtSecret: this.generateSecureSecret(),
        jwtExpiresIn: "24h",
        forceHttps: true,
        corsOrigins: ["https://yourdomain.com", "https://admin.yourdomain.com"],
        rateLimiting: {
          enabled: true,
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 100,
        },
      },
      monitoring: {
        enabled: true,
        logLevel: "info",
        metricsCollection: true,
      },
      performance: {
        cacheEnabled: true,
        compressionEnabled: true,
        staticFilesCaching: true,
      },
      integrations: {
        whatsapp: {
          webhookUrl: "https://yourdomain.com/api/whatsapp/webhook",
          verifyToken: this.generateSecureSecret(32),
        },
        email: {
          smtpEnabled: true,
          provider: "zoho",
        },
      },
    };
  }

  /**
   * Generate secure random secret
   */
  private static generateSecureSecret(length: number = 64): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate production environment file
   */
  static generateProductionEnv(config: ProductionConfig): string {
    return `# PRODUCTION ENVIRONMENT CONFIGURATION
# Generated: ${new Date().toISOString()}
# SECURITY WARNING: Keep this file secure and never commit to version control

# Application Environment
NODE_ENV=production
PORT=3000

# Database Configuration
SUPABASE_URL=${config.database.url}
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Security Configuration
JWT_SECRET=${config.security.jwtSecret}
JWT_EXPIRES_IN=${config.security.jwtExpiresIn}
FORCE_HTTPS=${config.security.forceHttps}
CORS_ORIGINS=${config.security.corsOrigins.join(",")}

# Rate Limiting
RATE_LIMIT_ENABLED=${config.security.rateLimiting.enabled}
RATE_LIMIT_WINDOW_MS=${config.security.rateLimiting.windowMs}
RATE_LIMIT_MAX_REQUESTS=${config.security.rateLimiting.maxRequests}

# WhatsApp Business API
WHATSAPP_TOKEN=your_whatsapp_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_WEBHOOK_VERIFY_TOKEN=${config.integrations.whatsapp.verifyToken}
WHATSAPP_WEBHOOK_URL=${config.integrations.whatsapp.webhookUrl}

# AI Services
OPENAI_API_KEY=your_openai_api_key_here

# Email Configuration (Zoho)
EMAIL_SMTP_HOST=smtp.zoho.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=true
EMAIL_SMTP_USER=your_email@yourdomain.com
EMAIL_SMTP_PASS=your_email_password_here
EMAIL_FROM_NAME=Universal Booking System
EMAIL_FROM_ADDRESS=noreply@yourdomain.com

# Google Calendar Integration (Optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# Monitoring and Logging
LOG_LEVEL=${config.monitoring.logLevel}
METRICS_ENABLED=${config.monitoring.metricsCollection}
HEALTH_CHECK_ENABLED=true

# Performance Settings
CACHE_ENABLED=${config.performance.cacheEnabled}
COMPRESSION_ENABLED=${config.performance.compressionEnabled}
STATIC_CACHE_ENABLED=${config.performance.staticFilesCaching}

# Cloudflare (if using)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
CLOUDFLARE_ZONE_ID=your_cloudflare_zone_id_here

# Database Connection Pool
DB_POOL_SIZE=${config.database.poolSize}
DB_MAX_RETRIES=${config.database.maxRetries}
DB_SSL=${config.database.ssl}
`;
  }

  /**
   * Generate Docker production configuration
   */
  static generateDockerConfig(): string {
    return `# Production Dockerfile
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY database/ ./database/
COPY scripts/ ./scripts/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodeuser:nodejs /app/dist ./dist
COPY --from=builder --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser:nodejs /app/package*.json ./
COPY --chown=nodeuser:nodejs src/frontend ./src/frontend

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
`;
  }

  /**
   * Generate Nginx configuration
   */
  static generateNginxConfig(domain: string): string {
    return `# Nginx configuration for ${domain}
server {
    listen 80;
    server_name ${domain} www.${domain};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain} www.${domain};

    # SSL Configuration
    ssl_certificate /path/to/ssl/certificate.crt;
    ssl_certificate_key /path/to/ssl/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    add_header Referrer-Policy "no-referrer-when-downgrade";

    # Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # Static Files
    location /static/ {
        alias /app/src/frontend/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API Routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Admin Dashboard
    location /admin/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health Check
    location /health {
        proxy_pass http://localhost:3000;
        access_log off;
    }

    # Default Route
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
  }

  /**
   * Generate deployment script
   */
  static generateDeploymentScript(): string {
    return `#!/bin/bash
# Production Deployment Script
# Generated: ${new Date().toISOString()}

set -e

echo "🚀 Starting production deployment..."

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Check if required tools are installed
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        echo -e "\${RED}Docker is not installed\${NC}"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        echo -e "\${RED}Git is not installed\${NC}"
        exit 1
    fi
    
    echo -e "\${GREEN}✅ All dependencies are installed\${NC}"
}

# Backup current deployment
backup_deployment() {
    echo "💾 Creating backup..."
    
    if [ -d "/app/backup" ]; then
        rm -rf /app/backup
    fi
    
    if [ -d "/app/current" ]; then
        cp -r /app/current /app/backup
        echo -e "\${GREEN}✅ Backup created\${NC}"
    fi
}

# Pull latest code
update_code() {
    echo "📥 Pulling latest code..."
    
    cd /app/universal-booking-system
    git pull origin main
    
    echo -e "\${GREEN}✅ Code updated\${NC}"
}

# Build Docker image
build_image() {
    echo "🔨 Building Docker image..."
    
    cd /app/universal-booking-system
    docker build -t universal-booking-system:latest .
    
    echo -e "\${GREEN}✅ Docker image built\${NC}"
}

# Stop current containers
stop_containers() {
    echo "🛑 Stopping current containers..."
    
    docker-compose down || true
    
    echo -e "\${GREEN}✅ Containers stopped\${NC}"
}

# Start new containers
start_containers() {
    echo "🚀 Starting new containers..."
    
    cd /app/universal-booking-system
    docker-compose up -d
    
    echo -e "\${GREEN}✅ Containers started\${NC}"
}

# Health check
health_check() {
    echo "🏥 Performing health check..."
    
    sleep 30
    
    for i in {1..10}; do
        if curl -f http://localhost:3000/health > /dev/null 2>&1; then
            echo -e "\${GREEN}✅ Health check passed\${NC}"
            return 0
        fi
        echo "Attempt \$i/10 failed, retrying in 10 seconds..."
        sleep 10
    done
    
    echo -e "\${RED}❌ Health check failed\${NC}"
    return 1
}

# Rollback on failure
rollback() {
    echo -e "\${RED}🔄 Rolling back to previous version...\${NC}"
    
    if [ -d "/app/backup" ]; then
        docker-compose down
        rm -rf /app/current
        mv /app/backup /app/current
        cd /app/current
        docker-compose up -d
        echo -e "\${YELLOW}⚠️ Rollback completed\${NC}"
    else
        echo -e "\${RED}❌ No backup found for rollback\${NC}"
    fi
}

# Main deployment process
main() {
    check_dependencies
    backup_deployment
    update_code
    build_image
    stop_containers
    start_containers
    
    if health_check; then
        echo -e "\${GREEN}🎉 Deployment successful!\${NC}"
        
        # Clean up old images
        docker system prune -f
        
        echo "📊 Deployment summary:"
        echo "  - Version: \$(git rev-parse --short HEAD)"
        echo "  - Deployed at: \$(date)"
        echo "  - Status: ✅ Healthy"
    else
        rollback
        exit 1
    fi
}

# Run deployment
main
`;
  }

  /**
   * Generate monitoring configuration
   */
  static generateMonitoringConfig(): string {
    return `# Monitoring Configuration for Production

# Health Check Endpoint
/health:
  - Response time < 500ms
  - Status code: 200
  - Memory usage < 80%
  - CPU usage < 80%

# Critical Endpoints to Monitor
/api/admin/dashboard:
  - Response time < 2s
  - Error rate < 1%

/api/whatsapp/webhook:
  - Response time < 1s
  - Error rate < 0.1%

/api/appointments:
  - Response time < 1s
  - Error rate < 1%

# Database Monitoring
Database:
  - Connection pool utilization < 80%
  - Query response time < 500ms
  - Failed connections < 1%

# Security Monitoring
Security:
  - Failed authentication attempts
  - Rate limit violations
  - Suspicious API usage patterns
  - SSL certificate expiration

# Performance Metrics
Performance:
  - Average response time
  - 95th percentile response time
  - Request throughput
  - Error rates by endpoint

# Alerts Configuration
Alerts:
  Critical:
    - Service down for > 1 minute
    - Error rate > 5% for > 5 minutes
    - Response time > 5s for > 2 minutes
    - Database connection failures
    
  Warning:
    - Error rate > 1% for > 10 minutes
    - Response time > 2s for > 5 minutes
    - Memory usage > 80% for > 10 minutes
    - CPU usage > 80% for > 10 minutes

# Log Aggregation
Logs:
  - Application logs (INFO, WARN, ERROR)
  - Access logs with IP filtering
  - Security logs (authentication, authorization)
  - Performance logs (slow queries, high memory usage)
  
# Notification Channels
Notifications:
  - Email: admin@yourdomain.com
  - Slack: #alerts channel
  - SMS: +1234567890 (critical only)
`;
  }

  /**
   * Create all production configuration files
   */
  static async createProductionFiles(domain: string): Promise<void> {
    const config = this.generateProductionConfig();

    // Create production directory if it doesn't exist
    const prodDir = path.join(process.cwd(), "production");
    if (!fs.existsSync(prodDir)) {
      fs.mkdirSync(prodDir, { recursive: true });
    }

    // Generate all configuration files
    const files = [
      { name: ".env.production", content: this.generateProductionEnv(config) },
      { name: "Dockerfile.production", content: this.generateDockerConfig() },
      { name: "nginx.conf", content: this.generateNginxConfig(domain) },
      { name: "deploy.sh", content: this.generateDeploymentScript() },
      { name: "monitoring.yml", content: this.generateMonitoringConfig() },
      {
        name: "production-config.json",
        content: JSON.stringify(config, null, 2),
      },
    ];

    // Write all files
    for (const file of files) {
      const filePath = path.join(prodDir, file.name);
      fs.writeFileSync(filePath, file.content);

      // Make deployment script executable
      if (file.name === "deploy.sh") {
        try {
          execSync(`chmod +x "${filePath}"`);
        } catch (error) {
          console.log("Note: Could not make deploy.sh executable");
        }
      }
    }

    console.log(`✅ Production configuration files created in: ${prodDir}`);
  }
}
