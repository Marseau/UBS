#!/bin/bash

# 🧹 Limpar Cache do Cloudflare via API

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✅${NC} $1"; }
print_error() { echo -e "${RED}❌${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠️${NC} $1"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🧹 Limpar Cache Cloudflare"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Carregar .env
if [ -f .env ]; then
    source .env
fi

# Verificar token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    print_error "CLOUDFLARE_API_TOKEN não encontrado no .env"
    echo ""
    echo "Obtenha em: https://dash.cloudflare.com/profile/api-tokens"
    exit 1
fi

# Solicitar Zone ID se não estiver no .env
if [ -z "$CLOUDFLARE_ZONE_ID" ]; then
    echo "📋 Para obter seu Zone ID:"
    echo "1. Acesse: https://dash.cloudflare.com"
    echo "2. Selecione o domínio ubs.app.br"
    echo "3. Sidebar direita → API → Zone ID"
    echo ""
    read -p "Cole o Zone ID do ubs.app.br: " CLOUDFLARE_ZONE_ID

    # Salvar no .env
    if grep -q "CLOUDFLARE_ZONE_ID" .env 2>/dev/null; then
        sed -i.bak "s|^CLOUDFLARE_ZONE_ID=.*|CLOUDFLARE_ZONE_ID=$CLOUDFLARE_ZONE_ID|" .env
    else
        echo "CLOUDFLARE_ZONE_ID=$CLOUDFLARE_ZONE_ID" >> .env
    fi
    print_success "Zone ID salvo no .env"
fi

# Limpar cache
print_step "Limpando cache do Cloudflare..."
echo ""

RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}')

SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
    print_success "Cache limpo com sucesso!"
    echo ""
    print_warning "Aguarde 30 segundos para propagação..."
    sleep 2

    # Testar
    print_step "Testando ubs.app.br..."
    RESULT=$(curl -s https://ubs.app.br | grep -o '<title>[^<]*</title>' || echo "ERROR")

    if [[ "$RESULT" == *"Taylor Made"* ]]; then
        print_success "✅ ubs.app.br → Landing Taylor Made"
    else
        print_warning "Resultado: $RESULT"
        echo ""
        print_warning "Se ainda ver página antiga:"
        echo "  1. Aguarde mais alguns minutos"
        echo "  2. Limpe cache do browser (Ctrl+Shift+R)"
        echo "  3. Teste em modo anônimo"
    fi
else
    print_error "Falha ao limpar cache"
    echo ""
    echo "Resposta da API:"
    echo "$RESPONSE" | jq '.'
    echo ""
    print_warning "Tente limpar manualmente:"
    echo "  https://dash.cloudflare.com → ubs.app.br → Caching → Purge Everything"
fi

echo ""
