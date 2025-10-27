/**
 * PM2 Ecosystem Configuration
 * Gerencia servidor Node.js + Cloudflare Tunnel automaticamente
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup (para iniciar no boot)
 */

module.exports = {
  apps: [
    {
      name: 'ubs-server',
      script: 'dist/index.js',
      cwd: '/Users/marseau/Developer/WhatsAppSalon-N8N',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/pm2-server-error.log',
      out_file: './logs/pm2-server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10
    },
    {
      name: 'cloudflare-tunnel',
      script: 'cloudflared',
      args: 'tunnel run dev-tunnel',
      cwd: '/Users/marseau/Developer/WhatsAppSalon-N8N',
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
