#!/bin/bash

# Script para testar Followers Scraper
# Scrape seguidores de perfis concorrentes (B2B → B2C)

echo "🧪 Teste: Scraping de Seguidores de Concorrentes"
echo ""
echo "📋 Exemplos de perfis concorrentes:"
echo "   1. @biotina_oficial (beleza - biotina)"
echo "   2. @colagenopremium (saúde - colágeno)"
echo "   3. @omega3brasil (saúde - suplementos)"
echo ""

# Configuração
API_URL="http://localhost:3000/api/instagram-scraper/scrape-followers"
COMPETITOR_USERNAME="biotina_oficial"  # Altere conforme necessário
MAX_FOLLOWERS=20  # Começar com poucos para testar
TARGET_SEGMENT="consumidoras_beleza_estetica"

echo "⚙️  Configuração do teste:"
echo "   API: $API_URL"
echo "   Concorrente: @$COMPETITOR_USERNAME"
echo "   Max seguidores: $MAX_FOLLOWERS"
echo "   Segment: $TARGET_SEGMENT"
echo ""

echo "🚀 Executando scraping..."
echo ""

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "competitor_username": "'"$COMPETITOR_USERNAME"'",
    "max_followers": '"$MAX_FOLLOWERS"',
    "target_segment": "'"$TARGET_SEGMENT"'"
  }' | jq .

echo ""
echo "✅ Teste concluído!"
echo ""
echo "📊 Para verificar os leads salvos no banco:"
echo "   SELECT username, full_name, segment, lead_source, search_term_used"
echo "   FROM instagram_leads"
echo "   WHERE lead_source = 'competitor_follower'"
echo "   ORDER BY captured_at DESC"
echo "   LIMIT 20;"
