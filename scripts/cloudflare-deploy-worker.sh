#!/bin/bash

# 🚀 Deploy Cloudflare Worker via CLI
# Este script atualiza o Cloudflare Worker para servir a landing Taylor Made

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
echo "  🚀 Deploy Cloudflare Worker - Landing Taylor Made"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    print_error "Wrangler CLI não está instalado"
    echo ""
    print_step "Instalando Wrangler..."
    npm install -g wrangler
    print_success "Wrangler instalado"
fi

print_success "Wrangler CLI instalado: $(wrangler --version)"
echo ""

# Solicitar credenciais se não estiverem no .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v '^[[:space:]]*$' | grep '=' | xargs) 2>/dev/null || true
fi

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    print_warning "CLOUDFLARE_API_TOKEN não encontrado no .env"
    echo ""
    echo "📋 Para obter seu API Token:"
    echo "1. Acesse: https://dash.cloudflare.com/profile/api-tokens"
    echo "2. Clique em 'Create Token'"
    echo "3. Use template 'Edit Cloudflare Workers'"
    echo "4. Copie o token gerado"
    echo ""
    read -p "Cole seu Cloudflare API Token: " CLOUDFLARE_API_TOKEN
    echo ""

    # Salvar no .env
    if grep -q "CLOUDFLARE_API_TOKEN" .env 2>/dev/null; then
        sed -i.bak "s|^CLOUDFLARE_API_TOKEN=.*|CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN|" .env
    else
        echo "CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN" >> .env
    fi
    print_success "Token salvo no .env"
fi

# Configurar wrangler com token
export CLOUDFLARE_API_TOKEN

# Verificar se existe wrangler.toml
print_step "Verificando configuração..."

if [ ! -f "landing-worker/wrangler.toml" ]; then
    print_warning "wrangler.toml não encontrado. Criando..."

    read -p "Account ID do Cloudflare: " ACCOUNT_ID
    read -p "Nome do worker (padrão: ubs-landing): " WORKER_NAME
    WORKER_NAME=${WORKER_NAME:-ubs-landing}

    cat > landing-worker/wrangler.toml <<EOF
name = "$WORKER_NAME"
main = "worker-proxy.js"
compatibility_date = "2024-01-01"
account_id = "$ACCOUNT_ID"

[env.production]
route = "ubs.app.br/*"
zone_name = "ubs.app.br"
EOF

    print_success "wrangler.toml criado"
else
    print_success "wrangler.toml existe"
fi

# Solicitar URL do backend
echo ""
print_step "Configurar servidor backend..."
read -p "URL do servidor Node.js (ex: https://api.ubs.app.br): " BACKEND_URL

if [ -z "$BACKEND_URL" ]; then
    print_error "URL do backend é obrigatória"
    exit 1
fi

# Criar worker.js com URL configurada
print_step "Gerando código do worker..."

cat > landing-worker/worker-proxy.js <<'EOF'
/**
 * Cloudflare Worker - Proxy para Servidor Node.js
 * Deploy via Wrangler CLI
 */

const BACKEND_SERVER = "BACKEND_URL_PLACEHOLDER";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const backendUrl = new URL(url.pathname + url.search, BACKEND_SERVER);

    const headers = new Headers(request.headers);
    headers.set("Host", hostname);
    headers.set("X-Forwarded-Host", hostname);
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    headers.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

    const backendRequest = new Request(backendUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.method !== "GET" && request.method !== "HEAD"
        ? await request.arrayBuffer()
        : null,
    });

    const backendResponse = await fetch(backendRequest);

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: backendResponse.headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Servidor temporariamente indisponível",
        message: error.message,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      }
    );
  }
}
EOF

# Substituir placeholder pela URL real
sed -i.bak "s|BACKEND_URL_PLACEHOLDER|$BACKEND_URL|g" landing-worker/worker-proxy.js
rm -f landing-worker/worker-proxy.js.bak

print_success "Worker configurado com backend: $BACKEND_URL"

# Fazer login no Cloudflare (se necessário)
print_step "Autenticando no Cloudflare..."
wrangler whoami || wrangler login

# Deploy do worker
echo ""
print_step "Fazendo deploy do worker..."
cd landing-worker
wrangler deploy --env production

if [ $? -eq 0 ]; then
    print_success "Worker deployado com sucesso!"
else
    print_error "Falha no deploy do worker"
    exit 1
fi

cd ..

# Purgar cache do Cloudflare
echo ""
print_step "Limpando cache do Cloudflare..."

read -p "Zone ID do ubs.app.br (encontrar em Cloudflare Dashboard): " ZONE_ID

if [ -n "$ZONE_ID" ]; then
    curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
         -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
         -H "Content-Type: application/json" \
         --data '{"purge_everything":true}' \
         -s | jq -r '.success'

    if [ $? -eq 0 ]; then
        print_success "Cache limpo com sucesso"
    else
        print_warning "Falha ao limpar cache. Limpe manualmente no dashboard."
    fi
else
    print_warning "Zone ID não fornecido. Limpe o cache manualmente no dashboard."
fi

# Testar
echo ""
print_step "Testando deploy..."
sleep 3

RESULT=$(curl -s https://ubs.app.br | grep -o '<title>[^<]*</title>' || echo "ERROR")

if [[ "$RESULT" == *"Taylor Made"* ]]; then
    print_success "✅ Deploy bem-sucedido!"
    echo ""
    echo "🎉 https://ubs.app.br agora serve a landing Taylor Made"
else
    print_warning "⚠️ Deploy concluído mas resultado inesperado:"
    echo "$RESULT"
    echo ""
    print_warning "Aguarde alguns minutos para propagação e limpe cache do browser"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deploy Concluído!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_success "Próximos passos:"
echo "  1. Testar no browser: https://ubs.app.br (modo anônimo)"
echo "  2. Verificar logs: wrangler tail (em landing-worker/)"
echo "  3. Ver status: wrangler deployments list"
echo ""
