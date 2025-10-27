#!/bin/bash

# 🚀 Script de Deploy Remoto - ubs.app.br
# Este script faz deploy do servidor local para o servidor remoto via SSH

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
echo "  🚀 Deploy Remoto - UBS App BR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Solicitar informações do servidor
read -p "IP ou hostname do servidor: " SERVER_HOST
read -p "Usuário SSH (padrão: ubuntu): " SERVER_USER
SERVER_USER=${SERVER_USER:-ubuntu}

read -p "Path do projeto no servidor (padrão: /var/www/ubs-app): " REMOTE_PATH
REMOTE_PATH=${REMOTE_PATH:-/var/www/ubs-app}

echo ""
print_step "Testando conexão SSH..."
if ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER_USER@$SERVER_HOST" exit 2>/dev/null; then
    print_success "Conexão SSH estabelecida"
else
    print_error "Falha ao conectar via SSH"
    print_warning "Certifique-se de:"
    echo "  1. SSH key configurado (~/.ssh/id_rsa.pub no servidor)"
    echo "  2. Servidor acessível na rede"
    echo "  3. Usuário $SERVER_USER existe no servidor"
    exit 1
fi

# 1. Build local
print_step "1/8 Compilando projeto localmente..."
npm run build
print_success "Build concluído"

# 2. Criar diretório remoto se não existir
print_step "2/8 Preparando diretório no servidor..."
ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p $REMOTE_PATH/{dist,src/frontend,production,scripts,database}"
print_success "Diretório criado: $REMOTE_PATH"

# 3. Copiar arquivos essenciais
print_step "3/8 Copiando arquivos para o servidor..."

# Copiar build
rsync -avz --progress dist/ "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/dist/"

# Copiar frontend
rsync -avz --progress src/frontend/ "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/src/frontend/"

# Copiar configurações
rsync -avz --progress production/ "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/production/"

# Copiar scripts
rsync -avz --progress scripts/ "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/scripts/"

# Copiar package.json e .env
scp package.json "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/"
scp .env "$SERVER_USER@$SERVER_HOST:$REMOTE_PATH/" 2>/dev/null || print_warning ".env não encontrado localmente"

print_success "Arquivos copiados"

# 4. Instalar dependências no servidor
print_step "4/8 Instalando dependências no servidor..."
ssh "$SERVER_USER@$SERVER_HOST" "cd $REMOTE_PATH && npm install --production"
print_success "Dependências instaladas"

# 5. Verificar/instalar PM2
print_step "5/8 Configurando PM2..."
ssh "$SERVER_USER@$SERVER_HOST" "
    if ! command -v pm2 &> /dev/null; then
        sudo npm install -g pm2
        echo 'PM2 instalado'
    else
        echo 'PM2 já instalado'
    fi
"
print_success "PM2 configurado"

# 6. Iniciar/Restart aplicação
print_step "6/8 Iniciando aplicação Node.js..."
ssh "$SERVER_USER@$SERVER_HOST" "
    cd $REMOTE_PATH
    pm2 delete ubs-api 2>/dev/null || true
    NODE_ENV=production pm2 start dist/index.js --name ubs-api --log /var/log/pm2-ubs-api.log
    pm2 save
    pm2 startup | grep -o 'sudo.*' | sh 2>/dev/null || true
"
print_success "Aplicação iniciada com PM2"

# 7. Executar script de deploy Nginx
print_step "7/8 Configurando Nginx no servidor..."
ssh "$SERVER_USER@$SERVER_HOST" "
    cd $REMOTE_PATH
    sudo bash scripts/deploy-ubs-app-br.sh
"

# 8. Testar acesso
print_step "8/8 Testando acesso remoto..."

sleep 3

UBS_RESULT=$(curl -k -s "https://$SERVER_HOST" -H "Host: ubs.app.br" 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "ERROR")
DEV_RESULT=$(curl -k -s "https://$SERVER_HOST" -H "Host: dev.ubs.app.br" 2>/dev/null | grep -o '<title>[^<]*</title>' || echo "ERROR")

echo ""
if [[ "$UBS_RESULT" == *"Taylor Made"* ]]; then
    print_success "ubs.app.br → landingTM.html ✓"
else
    print_warning "ubs.app.br retornou: $UBS_RESULT"
fi

if [[ "$DEV_RESULT" == *"Automatize"* ]]; then
    print_success "dev.ubs.app.br → landing.html ✓"
else
    print_warning "dev.ubs.app.br retornou: $DEV_RESULT"
fi

# Resumo final
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deploy Remoto Concluído!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Aplicação deployada em: $SERVER_USER@$SERVER_HOST:$REMOTE_PATH"
echo ""
print_warning "Comandos úteis no servidor:"
echo "  - Ver logs PM2: ssh $SERVER_USER@$SERVER_HOST 'pm2 logs ubs-api'"
echo "  - Status PM2: ssh $SERVER_USER@$SERVER_HOST 'pm2 status'"
echo "  - Restart app: ssh $SERVER_USER@$SERVER_HOST 'pm2 restart ubs-api'"
echo "  - Logs Nginx: ssh $SERVER_USER@$SERVER_HOST 'sudo tail -f /var/log/nginx/ubs-app-br-*.log'"
echo ""
print_warning "Não esqueça de:"
echo "  1. Configurar DNS para apontar ubs.app.br → $SERVER_HOST"
echo "  2. Configurar DNS para apontar dev.ubs.app.br → $SERVER_HOST"
echo "  3. Limpar cache do Cloudflare (se usar)"
echo ""
