#!/bin/bash

# 📋 Listar Workers do Cloudflare via API

set -e

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() { echo -e "${BLUE}==>${NC} $1"; }
print_success() { echo -e "${GREEN}✅${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠️${NC} $1"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📋 Listar Cloudflare Workers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Carregar .env
if [ -f .env ]; then
    source .env
fi

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    print_warning "Wrangler não instalado. Instalando..."
    npm install -g wrangler
fi

# Autenticar
print_step "Autenticando..."
wrangler whoami 2>/dev/null || wrangler login

# Listar workers
print_step "Listando workers..."
echo ""

wrangler deployments list 2>/dev/null || {
    print_warning "Nenhum deployment encontrado ou erro ao listar"
}

echo ""
print_step "Workers ativos:"
wrangler list 2>/dev/null || {
    print_warning "Erro ao listar workers"
}

echo ""
print_success "Para ver detalhes de um worker específico:"
echo "  wrangler deployments list --name WORKER_NAME"
echo ""
print_success "Para ver logs em tempo real:"
echo "  wrangler tail WORKER_NAME"
echo ""
