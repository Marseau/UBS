#!/bin/bash

# 🚀 Script de Deploy Automatizado - ubs.app.br e dev.ubs.app.br
# Este script configura automaticamente o Nginx para servir as landing pages corretas

set -e  # Exit on error

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções auxiliares
print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

# Banner
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Deploy Automatizado - UBS App BR Landing Pages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar se está rodando como root ou com sudo
if [ "$EUID" -ne 0 ]; then
    print_error "Este script precisa ser executado com sudo"
    echo "Execute: sudo bash scripts/deploy-ubs-app-br.sh"
    exit 1
fi

# 1. Verificar se Nginx está instalado
print_step "1/10 Verificando instalação do Nginx..."
if ! command -v nginx &> /dev/null; then
    print_error "Nginx não está instalado"
    echo "Execute: sudo apt-get install nginx"
    exit 1
fi
print_success "Nginx instalado: $(nginx -v 2>&1 | cut -d'/' -f2)"

# 2. Verificar se Node.js está rodando na porta 3000
print_step "2/10 Verificando Node.js na porta 3000..."
if lsof -i :3000 &> /dev/null; then
    NODE_PID=$(lsof -t -i :3000)
    print_success "Node.js rodando na porta 3000 (PID: $NODE_PID)"
else
    print_error "Nenhum processo escutando na porta 3000"
    print_warning "Inicie o servidor Node.js antes de continuar"
    echo ""
    echo "Execute um dos comandos:"
    echo "  - PM2: pm2 start dist/index.js --name ubs-api"
    echo "  - Direct: NODE_ENV=production node dist/index.js &"
    exit 1
fi

# 3. Testar roteamento local antes de configurar Nginx
print_step "3/10 Testando roteamento do Node.js..."

# Testar ubs.app.br (deve retornar landingTM.html)
UBS_TITLE=$(curl -s -H "Host: ubs.app.br" http://localhost:3000 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "ERROR")
if [[ "$UBS_TITLE" == *"Taylor Made"* ]]; then
    print_success "ubs.app.br → landingTM.html ✓"
else
    print_error "ubs.app.br não está retornando landingTM.html"
    echo "Retornou: $UBS_TITLE"
    exit 1
fi

# Testar dev.ubs.app.br (deve retornar landing.html)
DEV_TITLE=$(curl -s -H "Host: dev.ubs.app.br" http://localhost:3000 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "ERROR")
if [[ "$DEV_TITLE" == *"Automatize seus Agendamentos"* ]]; then
    print_success "dev.ubs.app.br → landing.html ✓"
else
    print_error "dev.ubs.app.br não está retornando landing.html"
    echo "Retornou: $DEV_TITLE"
    exit 1
fi

# 4. Procurar configurações antigas do Nginx
print_step "4/10 Identificando configurações antigas..."
OLD_CONFIGS=$(grep -l "ubs.app.br" /etc/nginx/sites-enabled/* 2>/dev/null || true)

if [ -n "$OLD_CONFIGS" ]; then
    print_warning "Encontradas configurações existentes:"
    echo "$OLD_CONFIGS" | while read config; do
        echo "  - $config"
    done
    echo ""
    read -p "Deseja fazer backup e remover essas configs? (s/N): " REMOVE_OLD

    if [[ "$REMOVE_OLD" =~ ^[SsYy]$ ]]; then
        BACKUP_DIR="/etc/nginx/backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"

        echo "$OLD_CONFIGS" | while read config; do
            cp "$config" "$BACKUP_DIR/"
            rm "$config"
            print_success "Backup criado e config removida: $(basename $config)"
        done

        print_success "Backups salvos em: $BACKUP_DIR"
    else
        print_warning "Configurações antigas não foram removidas. Podem causar conflitos."
    fi
else
    print_success "Nenhuma configuração antiga encontrada"
fi

# 5. Detectar certificados SSL
print_step "5/10 Detectando certificados SSL..."

SSL_CERT=""
SSL_KEY=""

# Tentar Let's Encrypt primeiro
if [ -f "/etc/letsencrypt/live/ubs.app.br/fullchain.pem" ]; then
    SSL_CERT="/etc/letsencrypt/live/ubs.app.br/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/ubs.app.br/privkey.pem"
    print_success "Certificado Let's Encrypt encontrado"
else
    print_warning "Certificado SSL não encontrado automaticamente"
    read -p "Path do certificado SSL (.crt): " SSL_CERT_INPUT
    read -p "Path da chave privada SSL (.key): " SSL_KEY_INPUT

    if [ -f "$SSL_CERT_INPUT" ] && [ -f "$SSL_KEY_INPUT" ]; then
        SSL_CERT="$SSL_CERT_INPUT"
        SSL_KEY="$SSL_KEY_INPUT"
        print_success "Certificados informados manualmente"
    else
        print_error "Certificados não encontrados nos paths informados"
        exit 1
    fi
fi

# 6. Copiar e modificar configuração Nginx
print_step "6/10 Configurando Nginx..."

CONFIG_SOURCE="production/ubs-app-br.nginx.conf"
CONFIG_DEST="/etc/nginx/sites-available/ubs-app-br"

if [ ! -f "$CONFIG_SOURCE" ]; then
    print_error "Arquivo de configuração não encontrado: $CONFIG_SOURCE"
    exit 1
fi

# Copiar arquivo
cp "$CONFIG_SOURCE" "$CONFIG_DEST"

# Substituir paths dos certificados SSL
sed -i "s|ssl_certificate /path/to/ssl/ubs.app.br/certificate.crt;|ssl_certificate $SSL_CERT;|g" "$CONFIG_DEST"
sed -i "s|ssl_certificate_key /path/to/ssl/ubs.app.br/private.key;|ssl_certificate_key $SSL_KEY;|g" "$CONFIG_DEST"

print_success "Configuração criada: $CONFIG_DEST"

# 7. Criar symlink para sites-enabled
print_step "7/10 Ativando configuração..."
ln -sf "$CONFIG_DEST" /etc/nginx/sites-enabled/ubs-app-br
print_success "Symlink criado: /etc/nginx/sites-enabled/ubs-app-br"

# 8. Testar configuração do Nginx
print_step "8/10 Validando configuração do Nginx..."
if nginx -t 2>&1 | grep -q "successful"; then
    print_success "Configuração do Nginx válida"
else
    print_error "Erro na configuração do Nginx"
    nginx -t
    exit 1
fi

# 9. Recarregar Nginx
print_step "9/10 Recarregando Nginx..."
systemctl reload nginx
print_success "Nginx recarregado com sucesso"

# 10. Testar acesso via HTTPS
print_step "10/10 Testando acesso via HTTPS..."

sleep 2  # Aguardar Nginx processar

# Testar ubs.app.br via HTTPS
echo ""
print_step "Testando https://ubs.app.br..."
HTTPS_UBS=$(curl -k -s https://localhost 2>/dev/null -H "Host: ubs.app.br" | grep -o '<title>[^<]*</title>' || echo "ERROR")

if [[ "$HTTPS_UBS" == *"Taylor Made"* ]]; then
    print_success "https://ubs.app.br → landingTM.html ✓"
else
    print_warning "Teste HTTPS retornou: $HTTPS_UBS"
fi

# Testar dev.ubs.app.br via HTTPS
print_step "Testando https://dev.ubs.app.br..."
HTTPS_DEV=$(curl -k -s https://localhost 2>/dev/null -H "Host: dev.ubs.app.br" | grep -o '<title>[^<]*</title>' || echo "ERROR")

if [[ "$HTTPS_DEV" == *"Automatize seus Agendamentos"* ]]; then
    print_success "https://dev.ubs.app.br → landing.html ✓"
else
    print_warning "Teste HTTPS retornou: $HTTPS_DEV"
fi

# Resumo final
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deploy Concluído com Sucesso!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Configurações aplicadas:"
echo "  - Nginx: /etc/nginx/sites-enabled/ubs-app-br"
echo "  - SSL Cert: $SSL_CERT"
echo "  - SSL Key: $SSL_KEY"
echo ""
print_success "Roteamento configurado:"
echo "  - https://ubs.app.br → landingTM.html (Taylor Made)"
echo "  - https://dev.ubs.app.br → landing.html (SaaS UBS)"
echo ""
print_warning "Próximos passos:"
echo "  1. Limpar cache do Cloudflare (se usar)"
echo "  2. Testar em browser: https://ubs.app.br"
echo "  3. Verificar logs: tail -f /var/log/nginx/ubs-app-br-*.log"
echo ""
print_step "Monitorar logs em tempo real:"
echo "  sudo tail -f /var/log/nginx/ubs-app-br-access.log"
echo ""
