#!/bin/bash

# 🎬 Teste REAL do sistema de 8 páginas com vídeos locais

echo "🎬 ========== TESTE 8 PÁGINAS - DADOS REAIS =========="
echo ""

# Dados do content
CONTENT_ID="23fa0ed5-a740-493b-9b3f-c32e54bca8b7"
REEL_NUMBER=1

# Thread 1 tweets
TWEETS='[
  "1/7 Já se perguntou por que 78% dos leads optam por quem responde primeiro? ⏰ A urgência é mais poderosa que o preço. #LeadGeneration",
  "2/7 Estudos mostram que a primeira empresa a responder um lead tem 50% mais chance de conversão. (Harvard Business Review, 2023)",
  "3/7 A janela de 5 minutos é crítica. Após esse tempo, a probabilidade de contato diminui drasticamente. (Forrester, 2022)",
  "4/7 73% dos leads não retornam após 1h sem resposta. A espera é inimiga da conversão. (HubSpot Research, 2023)",
  "5/7 Se sua equipe leva mais de 5 minutos para responder, você está perdendo vendas valiosas. #TempoÉDinheiro",
  "6/7 O impacto de atrasos na resposta é direto: perda de interesse. Não deixe seu lead esfriar. ❄️",
  "7/7 Identificou essa dor? Descubra como otimizar seu tempo de resposta. Saiba mais no link na bio. 🔗"
]'

# Thread 1 title
TITLE="Por Que Seus Leads Somem em 5 Minutos"

# CTA
CTA="Acesse nosso site e transforme seu negócio!"

# Vídeos individuais (8 páginas separadas)
VIDEO_DIR="/Users/marseau/Downloads"

# Verificar se vídeos existem
echo "📹 Verificando 8 páginas de vídeo..."
for i in {1..8}; do
  VIDEO_FILE="${VIDEO_DIR}/${i}.mp4"
  if [ ! -f "$VIDEO_FILE" ]; then
    echo "❌ Vídeo não encontrado: $VIDEO_FILE"
    exit 1
  fi
  SIZE=$(du -h "$VIDEO_FILE" | cut -f1)
  DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VIDEO_FILE" 2>/dev/null)
  echo "  ✅ Página $i: ${SIZE} - ${DURATION}s"
done

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
echo "📤 Fazendo upload dos vídeos para API temporária..."
echo ""

# Criar diretório temporário para servir os vídeos
TEMP_SERVER_DIR="/tmp/canva-videos-$$"
mkdir -p "$TEMP_SERVER_DIR"

# Copiar os 8 vídeos para diretório temporário
for i in {1..8}; do
  cp "${VIDEO_DIR}/${i}.mp4" "$TEMP_SERVER_DIR/${i}.mp4"
done

# Iniciar servidor HTTP simples em outra porta
echo "🌐 Iniciando servidor HTTP temporário na porta 8080..."
cd "$TEMP_SERVER_DIR"
python3 -m http.server 8080 &
HTTP_SERVER_PID=$!
sleep 2

# Construir URLs (8 vídeos diferentes, cada um com sua duração específica)
PAGE_URLS='['
for i in {1..8}; do
  PAGE_URLS="${PAGE_URLS}\"http://localhost:8080/${i}.mp4\""
  if [ $i -lt 8 ]; then
    PAGE_URLS="${PAGE_URLS},"
  fi
done
PAGE_URLS="${PAGE_URLS}]"

echo "✅ URLs geradas (8 páginas individuais com duração específica):"
echo "$PAGE_URLS" | jq '.'
echo ""
echo "📊 Duração total esperada: 7×9.5s + 1×4.75s = ~71s"
echo ""

echo "📡 Chamando API /api/canva-animated-video/test-pages..."
echo ""

# Fazer requisição
RESPONSE=$(curl -s -X POST "http://localhost:3000/api/canva-animated-video/test-pages" \
  -H "Content-Type: application/json" \
  -d "{
    \"page_video_urls\": ${PAGE_URLS},
    \"tweets\": ${TWEETS},
    \"cta_text\": \"${CTA}\",
    \"content_id\": \"${CONTENT_ID}\",
    \"title\": \"${TITLE}\"
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
    pages,
    tweets_count,
    message
  }'
  echo ""
  echo "🔍 VALIDAÇÃO:"
  echo "  1. Abra o vídeo e verifique:"
  echo "     ✅ Página 1: Título + Texto + Hashtag"
  echo "     ✅ Páginas 2-7: Texto + Hashtag"
  echo "     ✅ Página 8: CTA"
  echo ""
  echo "  2. Coordenadas (devem estar EXATAS):"
  echo "     ✅ Título: y=320px, fonte 58 bold"
  echo "     ✅ Conteúdo: y=645px, fonte 32 regular, line_spacing=13"
  echo "     ✅ Hashtag: y=1350px, fonte 60 verde #28a745"
  echo ""
  echo "  3. Sincronização:"
  echo "     ✅ TTS sincronizado com cada página (duração dinâmica)"
  echo "     ✅ Sem cortes ou silêncios longos"
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
  echo ""
  echo "💡 Dicas de debugging:"
  echo "  - Verifique logs do servidor backend"
  echo "  - Confirme que fontes Inter estão instaladas"
  echo "  - Teste se FFmpeg está funcionando: ffmpeg -version"
  echo "  - Verifique se ElevenLabs API key está configurada"
fi

# Cleanup
echo ""
echo "🧹 Limpando recursos temporários..."
kill $HTTP_SERVER_PID 2>/dev/null
rm -rf "$TEMP_SERVER_DIR"

echo ""
echo "✅ Teste concluído!"
