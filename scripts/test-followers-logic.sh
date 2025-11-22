#!/bin/bash
# Script para testar lógica de scraping de seguidores ISOLADAMENTE

echo "🧪 Teste Isolado - Lógica de Scraping de Seguidores"
echo "=================================================="
echo ""

# Perfil padrão: light_detox (17k seguidores)
TARGET_PROFILE="${1:-light_detox}"

echo "👤 Perfil alvo: @$TARGET_PROFILE"
echo "📝 Para usar outro perfil: ./scripts/test-followers-logic.sh username"
echo ""
echo "▶️  Iniciando teste..."
echo ""

npx tsx scripts/test-followers-logic.ts "$TARGET_PROFILE"
