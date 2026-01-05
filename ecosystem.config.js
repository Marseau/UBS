/**
 * PM2 Ecosystem Configuration
 * Multi-Instance Architecture - Mesmo código em múltiplas portas
 *
 * Portas:
 *   3000 - ubs-main     (scrape-tag, scrape-users)
 *   3002 - ubs-rescue   (scrape-users-rescue)
 *   3003 - ubs-url      (scrape-url, scrape-followers)
 *   3004 - ubs-dm       (puppeteer DMs outbound)
 *   3005 - ubs-dev      (testes e desenvolvimento)
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup (para iniciar no boot)
 *
 * Comandos úteis:
 *   pm2 status              - Ver status de todos
 *   pm2 logs ubs-main       - Logs do worker principal
 *   pm2 restart ubs-rescue  - Restart específico
 *   pm2 monit               - Monitor em tempo real
 */

const CWD = '/Users/marseau/Developer/WhatsAppSalon-N8N';

module.exports = {
  apps: [
    // ========================================
    // WORKER PRINCIPAL - Porta 3000
    // scrape-tag, scrape-users, scrape-explore
    // ========================================
    {
      name: 'ubs-main',
      script: 'dist/index.js',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-main-error.log',
      out_file: './logs/pm2-main-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },

    // ========================================
    // WORKER RESCUE - Porta 3002
    // scrape-users-rescue, scrape-profile-dedicated
    // ========================================
    {
      name: 'ubs-rescue',
      script: 'dist/index.js',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/pm2-rescue-error.log',
      out_file: './logs/pm2-rescue-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },

    // ========================================
    // WORKER URL - Porta 3003
    // scrape-url, scrape-followers, extract-qr
    // ========================================
    {
      name: 'ubs-url',
      script: 'dist/index.js',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      error_file: './logs/pm2-url-error.log',
      out_file: './logs/pm2-url-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },

    // ========================================
    // WORKER DM - Porta 3004
    // Puppeteer DMs outbound (Instagram + WhatsApp)
    // ========================================
    {
      name: 'ubs-dm',
      script: 'dist/index.js',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      error_file: './logs/pm2-dm-error.log',
      out_file: './logs/pm2-dm-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },

    // ========================================
    // WORKER DEV - Porta 3005
    // Testes e desenvolvimento (não reinicia auto)
    // ========================================
    {
      name: 'ubs-dev',
      script: 'dist/index.js',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,  // Dev não reinicia automaticamente
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3005
      },
      error_file: './logs/pm2-dev-error.log',
      out_file: './logs/pm2-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 3
    },

    // ========================================
    // CLOUDFLARE TUNNEL
    // ========================================
    {
      name: 'cloudflare-tunnel',
      script: 'cloudflared',
      args: 'tunnel run dev-tunnel',
      cwd: CWD,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: './logs/pm2-tunnel-error.log',
      out_file: './logs/pm2-tunnel-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};
