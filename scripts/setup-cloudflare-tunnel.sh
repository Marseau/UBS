#!/bin/bash

# 🚇 Setup Cloudflare Tunnel para dev.ubs.app.br
# Expõe localhost:3000 publicamente via Cloudflare Tunnel

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✅${NC} $1"; }
print_error() { echo -e "${RED}❌${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠️${NC} $1"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚇 Setup Cloudflare Tunnel - dev.ubs.app.br"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Verificar se cloudflared está instalado
print_step "1/5 Verificando Cloudflare Tunnel (cloudflared)..."

if ! command -v cloudflared &> /dev/null; then
    print_warning "cloudflared não está instalado. Instalando..."

    # macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install cloudflare/cloudflare/cloudflared
    # Linux
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    else
        print_error "Sistema operacional não suportado. Instale manualmente:"
        echo "  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
        exit 1
    fi

    print_success "cloudflared instalado"
else
    print_success "cloudflared já instalado: $(cloudflared --version)"
fi

# 2. Login no Cloudflare
print_step "2/5 Autenticando no Cloudflare..."
cloudflared tunnel login

print_success "Autenticado no Cloudflare"

# 3. Criar túnel
print_step "3/5 Criando túnel..."

TUNNEL_NAME="ubs-dev-tunnel"
TUNNEL_EXISTS=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" || echo "")

if [ -z "$TUNNEL_EXISTS" ]; then
    cloudflared tunnel create "$TUNNEL_NAME"
    print_success "Túnel '$TUNNEL_NAME' criado"
else
    print_warning "Túnel '$TUNNEL_NAME' já existe. Reutilizando..."
fi

# Obter ID do túnel
TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')

if [ -z "$TUNNEL_ID" ]; then
    print_error "Não foi possível obter o ID do túnel"
    exit 1
fi

print_success "Tunnel ID: $TUNNEL_ID"

# 4. Criar arquivo de configuração
print_step "4/5 Configurando túnel..."

mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/${TUNNEL_ID}.json

ingress:
  # dev.ubs.app.br → localhost:3000
  - hostname: dev.ubs.app.br
    service: http://localhost:3000

  # Catch-all rule (obrigatório)
  - service: http_status:404
EOF

print_success "Configuração criada: ~/.cloudflared/config.yml"

# 5. Configurar DNS
print_step "5/5 Configurando DNS..."

print_warning "Configure o DNS no Cloudflare Dashboard:"
echo ""
echo "  1. Acesse: https://dash.cloudflare.com"
echo "  2. Selecione a zona: ubs.app.br"
echo "  3. Vá em 'DNS' → 'Records'"
echo "  4. Adicione um registro CNAME:"
echo ""
echo "     Type:    CNAME"
echo "     Name:    dev"
echo "     Target:  ${TUNNEL_ID}.cfargotunnel.com"
echo "     Proxy:   ON (nuvem laranja)"
echo ""
read -p "Pressione ENTER após configurar o DNS..."

# Ou configurar via CLI (requer permissões específicas)
print_step "Tentando configurar DNS via CLI..."

cloudflared tunnel route dns "$TUNNEL_NAME" dev.ubs.app.br 2>/dev/null && \
    print_success "DNS configurado automaticamente" || \
    print_warning "Configure DNS manualmente conforme instruções acima"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup Concluído!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Próximos passos:"
echo ""
echo "  1. Inicie o servidor Node.js na porta 3000:"
echo "     npm start"
echo ""
echo "  2. Inicie o túnel Cloudflare (em outro terminal):"
echo "     cloudflared tunnel run $TUNNEL_NAME"
echo ""
echo "  3. Ou use como serviço (mantém rodando):"
echo "     cloudflared service install"
echo "     sudo systemctl start cloudflared"
echo ""
echo "  4. Teste o acesso:"
echo "     curl https://dev.ubs.app.br"
echo ""
print_warning "Importante:"
echo "  - O túnel precisa estar RODANDO para dev.ubs.app.br funcionar"
echo "  - Use PM2 ou systemd para manter rodando em produção"
echo ""
