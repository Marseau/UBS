#!/bin/bash

# 🎬 Teste do Canva Animated Video Generator
# Script para testar geração de vídeo com overlay de texto animado

VIDEO_PATH="/Users/marseau/Downloads/UBS Template Base.mp4"
PORT="${PORT:-3000}"
API_BASE="${CANVA_API_BASE:-http://localhost:$PORT}"
API_URL="$API_BASE/api/canva-animated-video/test"
HEALTH_URL="$API_BASE/api/health"

echo "🎬 ========== TESTE CANVA ANIMATED VIDEO =========="
echo ""
echo "📹 Vídeo: $VIDEO_PATH"
echo "🌐 API: $API_URL"
echo ""

# Verificar se vídeo existe
if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ Erro: Vídeo não encontrado em $VIDEO_PATH"
  exit 1
fi

# Obter tamanho do vídeo
VIDEO_SIZE=$(du -h "$VIDEO_PATH" | cut -f1)
echo "📊 Tamanho do vídeo: $VIDEO_SIZE"
echo ""

# Verificar se servidor está rodando
echo "🔍 Verificando se servidor está rodando..."
if ! curl -s "$HEALTH_URL" > /dev/null; then
  echo "❌ Erro: Servidor não está rodando na porta 3000"
  echo "   Execute: npm run dev"
  exit 1
fi
echo "✅ Servidor online"
echo ""

# Upload temporário do vídeo para servidor
echo "📤 Fazendo upload temporário do vídeo..."
TEMP_DIR="/tmp/canva-test-$(date +%s)"
mkdir -p "$TEMP_DIR"
cp "$VIDEO_PATH" "$TEMP_DIR/test-video.mp4"

# Iniciar servidor HTTP simples na porta 8888
echo "🌐 Iniciando servidor HTTP temporário..."
cd "$TEMP_DIR"
python3 -m http.server 8888 > /dev/null 2>&1 &
HTTP_SERVER_PID=$!
sleep 2

VIDEO_URL="http://localhost:8888/test-video.mp4"
echo "✅ Vídeo disponível em: $VIDEO_URL"
echo ""

# Chamar API
echo "🚀 Chamando API de teste..."
echo ""

RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "base_video_url": "'"$VIDEO_URL"'",
    "title": "Por Que Seus Leads Somem em 5 Minutos",
    "tweets": [
      "Já se perguntou por que 78% dos leads optam por quem responde primeiro? A urgência é mais poderosa que o preço.",
      "Estudos mostram que a primeira empresa a responder um lead tem 50% mais chance de conversão. (Harvard Business Review, 2023)",
      "A janela de 5 minutos é crítica; depois disso a probabilidade de contato despenca. (Forrester, 2022)",
      "73% dos leads não retornam após 1 hora sem resposta; a espera é inimiga da conversão. (HubSpot Research, 2023)",
      "Se sua equipe leva mais de 5 minutos para responder, você está perdendo vendas valiosas.",
      "O impacto de atrasos na resposta é direto: perda de interesse. Não deixe seu lead esfriar.",
      "Identificou essa dor? Descubra como otimizar seu tempo de resposta e manter o lead aquecido."
    ],
    "cta_text": "Acesse nosso site e transforme seu negócio!",
    "content_id": "test-'$(date +%s)'"
  }')

echo ""
echo "📊 Resposta da API:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Verificar sucesso
if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
  VIDEO_URL_RESULT=$(echo "$RESPONSE" | jq -r '.video_url')
  DURATION=$(echo "$RESPONSE" | jq -r '.duration_seconds')
  COST=$(echo "$RESPONSE" | jq -r '.cost_usd')

  echo "✅ ========== TESTE CONCLUÍDO COM SUCESSO =========="
  echo ""
  echo "🎥 URL do vídeo final: $VIDEO_URL_RESULT"
  echo "⏱️  Duração: ${DURATION}s"
  echo "💰 Custo TTS: \$$COST"
  echo ""
  echo "📝 Próximos passos:"
  echo "   1. Abra o vídeo e verifique os overlays de texto"
  echo "   2. Confirme a alternância de vozes (Carla/Bruno)"
  echo "   3. Valide os 8 segmentos de 8s cada"
  echo "   4. Compare com vídeos atuais"
  echo ""
else
  echo "❌ ========== TESTE FALHOU =========="
  echo ""
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message // .error' 2>/dev/null)
  echo "Erro: $ERROR_MSG"
  echo ""
fi

# Cleanup
echo "🧹 Limpando arquivos temporários..."
kill $HTTP_SERVER_PID 2>/dev/null
rm -rf "$TEMP_DIR"
echo "✅ Cleanup concluído"
