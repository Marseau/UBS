#!/bin/bash

# =====================================================
# UMAMI QUICK START SCRIPT
# Inicia o Umami Analytics facilmente
# =====================================================

set -e

echo "🚀 Iniciando Umami Analytics..."
echo ""

# Verificar se Docker está rodando
if ! docker compose version > /dev/null 2>&1; then
    echo "❌ Docker não está rodando!"
    echo "   Abra o Docker Desktop e tente novamente."
    exit 1
fi

# Verificar se .env existe
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "   Criando .env básico..."
    cat > .env <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres123
UMAMI_APP_SECRET=$(openssl rand -base64 32)
EOF
    echo "✅ Arquivo .env criado com App Secret aleatório"
else
    # Verificar se UMAMI_APP_SECRET existe
    if ! grep -q "UMAMI_APP_SECRET" .env; then
        echo "⚠️  UMAMI_APP_SECRET não encontrado no .env"
        echo "   Adicionando..."
        echo "UMAMI_APP_SECRET=$(openssl rand -base64 32)" >> .env
        echo "✅ UMAMI_APP_SECRET adicionado"
    fi
fi

echo ""
echo "📦 Iniciando containers..."
docker compose up -d umami

echo ""
echo "⏳ Aguardando Umami inicializar (30s)..."
sleep 30

echo ""
echo "📊 Verificando status..."
docker compose ps | grep umami

echo ""
echo "✅ Umami iniciado com sucesso!"
echo ""
echo "🌐 Acesse o dashboard em: http://localhost:3002"
echo "👤 Login padrão:"
echo "   Usuário: admin"
echo "   Senha: umami"
echo ""
echo "📝 Próximos passos:"
echo "   1. Acesse http://localhost:3002"
echo "   2. Faça login com admin/umami"
echo "   3. TROQUE A SENHA imediatamente!"
echo "   4. Settings → Websites → Add website"
echo "   5. Copie o Website ID"
echo "   6. Atualize src/frontend/aic-landing.html (linha 1398)"
echo "   7. npm run build"
echo ""
echo "📚 Documentação completa: ./UMAMI-SETUP.md"
echo ""
echo "🔍 Ver logs em tempo real:"
echo "   docker logs -f umami-analytics"
echo ""
