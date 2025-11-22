#!/bin/bash

# 🎬 Teste ZERO RE-ENCODING - Preserva 100% das transições

echo "🎬 ========== TESTE AUDIO-ONLY SYNC (ZERO RE-ENCODING) =========="
echo ""

# Dados do content
CONTENT_ID="test-audio-sync-$(date +%s)"

# Thread 1 tweets (7 tweets)
TWEETS='[
  "1/7 Já se perguntou por que 78% dos leads optam por quem responde primeiro? ⏰ A urgência é mais poderosa que o preço.",
  "2/7 Estudos mostram que a primeira empresa a responder um lead tem 50% mais chance de conversão.",
  "3/7 A janela de 5 minutos é crítica. Após esse tempo, a probabilidade de contato diminui drasticamente.",
  "4/7 73% dos leads não retornam após 1h sem resposta. A espera é inimiga da conversão.",
  "5/7 Se sua equipe leva mais de 5 minutos para responder, você está perdendo vendas valiosas.",
  "6/7 O impacto de atrasos na resposta é direto: perda de interesse. Não deixe seu lead esfriar.",
  "7/7 Identificou essa dor? Descubra como otimizar seu tempo de resposta. Saiba mais no link na bio."
]'

# CTA
CTA="Acesse nosso site e transforme seu negócio!"

# ⚠️  IMPORTANTE: Vídeo do Canva COM TEXTO JÁ INCLUÍDO (67.5s)
VIDEO_FILE="/Users/marseau/Downloads/UBS Template Base.mp4"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ Vídeo não encontrado: $VIDEO_FILE"
  exit 1
fi

# Verificar duração do vídeo
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null)
SIZE=$(du -h "$VIDEO_FILE" | cut -f1)

echo "📹 Vídeo base (COM TEXTO):"
echo "  📄 Arquivo: $VIDEO_FILE"
echo "  📏 Tamanho: $SIZE"
echo "  ⏱️  Duração: ${DURATION}s (esperado: 67.5s)"
echo ""

echo "🚀 Iniciando servidor de desenvolvimento..."
echo "   (Pressione Ctrl+C no servidor quando o teste terminar)"
echo ""

# Verificar se servidor já está rodando
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
  echo "✅ Servidor já está rodando na porta 3000"
else
  echo "⚠️  Servidor não está rodando. Iniciando..."
  npm run dev &
  SERVER_PID=$!
  echo "   PID do servidor: $SERVER_PID"
  sleep 5
fi

echo ""
echo "📤 Preparando vídeo para upload..."
echo ""

# Criar servidor HTTP temporário para servir o vídeo
TEMP_DIR="/tmp/canva-audio-sync-$$"
mkdir -p "$TEMP_DIR"
cp "$VIDEO_FILE" "$TEMP_DIR/base-video.mp4"

echo "🌐 Iniciando servidor HTTP temporário na porta 8080..."
cd "$TEMP_DIR"
python3 -m http.server 8080 &
HTTP_SERVER_PID=$!
sleep 2

BASE_VIDEO_URL="http://localhost:8080/base-video.mp4"

echo "✅ URL do vídeo base: $BASE_VIDEO_URL"
echo ""
echo "📡 Chamando API /api/canva-audio-sync/test..."
echo ""
echo "⚡ MODO: ZERO RE-ENCODING"
echo "   - Vídeo: 100% preservado (codec copy)"
echo "   - Apenas: Sincronização de áudio TTS"
echo "   - Bonus: Legendas .srt geradas"
echo ""

# Fazer requisição
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/canva-audio-sync/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"base_video_url\": \"${BASE_VIDEO_URL}\",
    \"tweets\": ${TWEETS},
    \"cta_text\": \"${CTA}\",
    \"content_id\": \"${CONTENT_ID}\",
    \"generate_subtitles\": true
  }")

echo "📥 Resposta da API:"
echo "$RESPONSE" | jq '.'
echo ""

# Extrair URL do vídeo
VIDEO_URL=$(echo "$RESPONSE" | jq -r '.video_url // empty')
SUBTITLE_URL=$(echo "$RESPONSE" | jq -r '.subtitle_url // empty')

if [ -n "$VIDEO_URL" ]; then
  echo "✅ SUCESSO! Vídeo gerado SEM RE-ENCODING!"
  echo ""
  echo "🎥 URL do vídeo: $VIDEO_URL"

  if [ -n "$SUBTITLE_URL" ]; then
    echo "📝 URL das legendas: $SUBTITLE_URL"
  fi

  echo ""
  echo "📊 Detalhes:"
  echo "$RESPONSE" | jq '{
    duration_seconds,
    cost_usd,
    message
  }'
  echo ""
  echo "🔍 VALIDAÇÃO:"
  echo "  ⚡ ZERO RE-ENCODING usado!"
  echo "  1. Abra o vídeo e verifique:"
  echo "     ✅ Transições do Canva 100% PRESERVADAS?"
  echo "     ✅ Qualidade de vídeo IDÊNTICA ao original?"
  echo "     ✅ TTS sincronizado perfeitamente?"
  echo "     ✅ Legendas disponíveis (se geradas)?"
  echo ""
  echo "  2. Codec usado:"
  echo "     ✅ -c:v copy (ZERO re-encoding de vídeo)"
  echo "     ✅ Apenas áudio foi mixado (TTS + música original)"
  echo ""

  # Abrir vídeo automaticamente (macOS)
  echo "🎬 Abrindo vídeo no player padrão..."
  if command -v open &> /dev/null; then
    open "$VIDEO_URL"
  fi
else
  echo "❌ ERRO ao gerar vídeo!"
  echo ""
  echo "Resposta completa:"
  echo "$RESPONSE" | jq '.'
fi

# Cleanup
echo ""
echo "🧹 Limpando recursos temporários..."
kill $HTTP_SERVER_PID 2>/dev/null
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Teste concluído!"
