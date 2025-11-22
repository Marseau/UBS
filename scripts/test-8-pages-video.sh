#!/bin/bash

# 🎬 Teste com 8 Páginas Separadas do Canva
# Cada página é um MP4 individual renderizado no Canva

API_URL="http://localhost:3000/api/canva-animated-video/test-pages"
VIDEOS_DIR="/Users/marseau/Downloads"

echo "🎬 ========== TESTE 8 PÁGINAS CANVA =========="
echo ""

# Verificar se todos os vídeos existem
for i in {1..8}; do
  VIDEO_PATH="$VIDEOS_DIR/$i.mp4"
  if [ ! -f "$VIDEO_PATH" ]; then
    echo "❌ Erro: Vídeo $i.mp4 não encontrado"
    exit 1
  fi
  SIZE=$(du -h "$VIDEO_PATH" | cut -f1)
  echo "✅ Página $i: $SIZE"
done

echo ""
echo "🔍 Verificando se servidor está rodando..."
if ! curl -s http://localhost:3000/api/health > /dev/null; then
  echo "❌ Erro: Servidor não está rodando na porta 3000"
  echo "   Execute: npm start"
  exit 1
fi
echo "✅ Servidor online"
echo ""

# Iniciar servidor HTTP temporário para servir os vídeos
echo "🌐 Iniciando servidor HTTP temporário..."
cd "$VIDEOS_DIR"
python3 -m http.server 8888 > /dev/null 2>&1 &
HTTP_SERVER_PID=$!
sleep 2
echo "✅ Servidor HTTP rodando na porta 8888"
echo ""

# Montar URLs
PAGE_URLS=""
for i in {1..8}; do
  PAGE_URLS="$PAGE_URLS\"http://localhost:8888/$i.mp4\""
  if [ $i -lt 8 ]; then
    PAGE_URLS="$PAGE_URLS,"
  fi
done

# Chamar API
echo "🚀 Chamando API com 8 páginas..."
echo ""

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "page_video_urls": ['"$PAGE_URLS"'],
    "title": "Por Que Seus Leads Somem em 5 Minutos",
    "tweets": [
      "1/7 Você sabia que 70% das empresas ainda perdem leads por falta de automação? #Automação",
      "2/7 Com IA conversacional, você captura, qualifica e agenda automaticamente.",
      "3/7 Nosso sistema usa WhatsApp + GPT-4 para atender seus clientes 24/7.",
      "4/7 Integração completa com Google Calendar, Stripe e analytics em tempo real.",
      "5/7 Implantação em 15 dias, teste grátis por 7 dias, sem compromisso.",
      "6/7 Mais de 500 empresas já automatizaram seus agendamentos conosco. #SaaS",
      "7/7 Transforme sua operação hoje mesmo. Comece agora!"
    ],
    "cta_text": "Acesse nosso site e transforme seu negócio!",
    "content_id": "test-8pages-'$(date +%s)'"
  }')

echo "📊 Resposta da API:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar sucesso
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  VIDEO_URL=$(echo "$RESPONSE" | jq -r '.video_url')
  DURATION=$(echo "$RESPONSE" | jq -r '.duration_seconds')
  COST=$(echo "$RESPONSE" | jq -r '.cost_usd')

  echo "✅ ========== TESTE CONCLUÍDO COM SUCESSO =========="
  echo ""
  echo "🎥 URL do vídeo final: $VIDEO_URL"
  echo "⏱️  Duração: ${DURATION}s"
  echo "💰 Custo TTS: \$$COST"
  echo ""
  echo "📝 Próximos passos:"
  echo "   1. Abra o vídeo e verifique a qualidade"
  echo "   2. Confirme que as animações do Canva foram mantidas"
  echo "   3. Valide os 8 segmentos com áudio TTS"
  echo "   4. Compare com o vídeo anterior"
  echo ""
else
  echo "❌ ========== TESTE FALHOU =========="
  echo ""
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message // .error' 2>/dev/null)
  echo "Erro: $ERROR_MSG"
  echo ""
fi

# Cleanup
echo "🧹 Limpando..."
kill $HTTP_SERVER_PID 2>/dev/null
echo "✅ Cleanup concluído"
