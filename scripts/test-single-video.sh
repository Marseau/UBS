#!/bin/bash

# 🎬 Teste com VÍDEO ÚNICO do Canva (preservando transições)

echo "🎬 ========== TESTE VÍDEO ÚNICO - PRESERVAR TRANSIÇÕES =========="
echo ""

# Dados do content
CONTENT_ID="test-single-video-$(date +%s)"

# Thread 1 tweets (7 tweets)
TWEETS='[
  "1/7 Já se perguntou por que 78% dos leads optam por quem responde primeiro? ⏰ A urgência é mais poderosa que o preço. #LeadGeneration",
  "2/7 Estudos mostram que a primeira empresa a responder um lead tem 50% mais chance de conversão. (Harvard Business Review, 2023)",
  "3/7 A janela de 5 minutos é crítica. Após esse tempo, a probabilidade de contato diminui drasticamente. (Forrester, 2022)",
  "4/7 73% dos leads não retornam após 1h sem resposta. A espera é inimiga da conversão. (HubSpot Research, 2023)",
  "5/7 Se sua equipe leva mais de 5 minutos para responder, você está perdendo vendas valiosas. #TempoÉDinheiro",
  "6/7 O impacto de atrasos na resposta é direto: perda de interesse. Não deixe seu lead esfriar. ❄️",
  "7/7 Identificou essa dor? Descubra como otimizar seu tempo de resposta. Saiba mais no link na bio. 🔗"
]'

# CTA
CTA="Acesse nosso site e transforme seu negócio!"

# ⚠️  IMPORTANTE: Você precisa ter um vídeo ÚNICO do Canva (~74.5s)
# com as 8 páginas já incluídas (com transições entre elas)
VIDEO_FILE="/Users/marseau/Downloads/UBS Template Base.mp4"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ Vídeo não encontrado: $VIDEO_FILE"
  echo ""
  echo "💡 Você precisa exportar do Canva um vídeo ÚNICO com:"
  echo "   - Página 1: 9.5s (sem transição de entrada)"
  echo "   - Páginas 2-7: 10s cada (0.5s entrada + 9s + 0.5s saída)"
  echo "   - Página 8: 5s (0.5s entrada + 4.5s)"
  echo "   - Total: ~74.5s"
  exit 1
fi

# Verificar duração do vídeo
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null)
SIZE=$(du -h "$VIDEO_FILE" | cut -f1)

echo "📹 Vídeo base encontrado:"
echo "  📄 Arquivo: $VIDEO_FILE"
echo "  📏 Tamanho: $SIZE"
echo "  ⏱️  Duração: ${DURATION}s (esperado: ~74.5s)"
echo ""

if [ "$(echo "$DURATION < 70" | bc)" -eq 1 ] || [ "$(echo "$DURATION > 80" | bc)" -eq 1 ]; then
  echo "⚠️  Aviso: Duração fora do esperado (70-80s)"
  echo ""
fi

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
TEMP_DIR="/tmp/canva-single-$$"
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
echo "📡 Chamando API /api/canva-animated-video/test..."
echo ""

# Fazer requisição
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/canva-animated-video/test" \
  -H "Content-Type: application/json" \
  -d "{
    \"base_video_url\": \"${BASE_VIDEO_URL}\",
    \"tweets\": ${TWEETS},
    \"cta_text\": \"${CTA}\",
    \"content_id\": \"${CONTENT_ID}\"
  }")

echo "📥 Resposta da API:"
echo "$RESPONSE" | jq '.'
echo ""

# Extrair URL do vídeo
VIDEO_URL=$(echo "$RESPONSE" | jq -r '.video_url // empty')

if [ -n "$VIDEO_URL" ]; then
  echo "✅ SUCESSO! Vídeo gerado!"
  echo ""
  echo "🎥 URL do vídeo: $VIDEO_URL"
  echo ""
  echo "📊 Detalhes:"
  echo "$RESPONSE" | jq '{
    duration_seconds,
    cost_usd,
    message
  }'
  echo ""
  echo "🔍 VALIDAÇÃO:"
  echo "  1. Abra o vídeo e verifique:"
  echo "     ✅ Transições DO CANVA estão preservadas?"
  echo "     ✅ Textos aparecem APENAS no meio de cada página (não durante transições)?"
  echo "     ✅ TTS sincronizado com cada página?"
  echo ""
  echo "  2. Timing esperado:"
  echo "     ✅ Página 1: 0s-9s (texto visível 0s-9s)"
  echo "     ✅ Página 2: 9.5s-19.5s (texto visível 10s-19s)"
  echo "     ✅ Página 3: 19.5s-29.5s (texto visível 20s-29s)"
  echo "     ✅ Página 4: 29.5s-39.5s (texto visível 30s-39s)"
  echo "     ✅ Página 5: 39.5s-49.5s (texto visível 40s-49s)"
  echo "     ✅ Página 6: 49.5s-59.5s (texto visível 50s-59s)"
  echo "     ✅ Página 7: 59.5s-69.5s (texto visível 60s-69s)"
  echo "     ✅ Página 8: 69.5s-74.5s (texto visível 70s-74.5s)"
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
