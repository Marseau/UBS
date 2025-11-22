#!/bin/bash

# 🎬 Teste do sistema de vídeo com 8 páginas do Canva
# Nova arquitetura: Canva gera 8 vídeos prontos (com música + transições)
# Backend adiciona: TTS + Overlay de texto (coordenadas EXATAS da produção)

echo "🎬 ========== TESTE CANVA 8 PÁGINAS VIDEO =========="
echo ""
echo "📋 Este teste valida:"
echo "  ✅ Coordenadas EXATAS da produção (320px, 645px, 1350px)"
echo "  ✅ Fontes Inter (bold 58, regular 32, regular 60)"
echo "  ✅ Sincronização com TTS (duração dinâmica, não mais 8s fixo)"
echo "  ✅ Word wrap inteligente (30 chars título, 40 chars conteúdo)"
echo "  ✅ Sanitização robusta (emojis, %, aspas)"
echo "  ✅ Hashtag na posição correta (1350px, verde #28a745)"
echo ""

# URL base da API
BASE_URL="http://localhost:3000"

# Content ID de teste (ajuste conforme necessário)
CONTENT_ID="test-8pages-$(date +%s)"

# Tweets de teste (7 tweets)
TWEETS='[
  "1/7 🚀 A inteligência artificial está transformando o varejo físico em 2024 #RetailTech",
  "2/7 Lojas inteligentes usam IA para análise de comportamento de clientes em tempo real",
  "3/7 Prateleiras automatizadas detectam quando produtos estão em falta e enviam alertas",
  "4/7 Sistemas de reconhecimento facial personalizam experiências de compra",
  "5/7 Chatbots com IA respondem dúvidas instantaneamente via totens interativos",
  "6/7 Análise preditiva otimiza estoques e prevê demandas sazonais com 95% de precisão #IA",
  "7/7 O futuro do varejo é a fusão entre experiência física e inteligência digital"
]'

# Título da thread
TITLE="Como a IA está revolucionando lojas físicas"

# CTA
CTA="Acesse nosso site e transforme seu negócio!"

# URLs das 8 páginas de vídeo do Canva (SUBSTITUA com URLs reais!)
PAGE_URLS='[
  "https://exemplo.com/canva-page-1.mp4",
  "https://exemplo.com/canva-page-2.mp4",
  "https://exemplo.com/canva-page-3.mp4",
  "https://exemplo.com/canva-page-4.mp4",
  "https://exemplo.com/canva-page-5.mp4",
  "https://exemplo.com/canva-page-6.mp4",
  "https://exemplo.com/canva-page-7.mp4",
  "https://exemplo.com/canva-page-8-cta.mp4"
]'

echo "⚠️  IMPORTANTE: Substitua as URLs de PAGE_URLS com URLs reais dos vídeos do Canva!"
echo ""
read -p "Pressione ENTER para continuar com o teste (ou Ctrl+C para cancelar)..."
echo ""

# Fazer requisição
echo "📤 Enviando requisição para /api/canva-animated-video/test-pages..."
echo ""

RESPONSE=$(curl -s -X POST "${BASE_URL}/api/canva-animated-video/test-pages" \
  -H "Content-Type: application/json" \
  -d "{
    \"page_video_urls\": ${PAGE_URLS},
    \"tweets\": ${TWEETS},
    \"cta_text\": \"${CTA}\",
    \"content_id\": \"${CONTENT_ID}\",
    \"title\": \"${TITLE}\"
  }")

echo "📥 Resposta recebida:"
echo "${RESPONSE}" | jq '.'
echo ""

# Extrair URL do vídeo
VIDEO_URL=$(echo "${RESPONSE}" | jq -r '.video_url // empty')

if [ -n "${VIDEO_URL}" ]; then
  echo "✅ Vídeo gerado com sucesso!"
  echo "🎥 URL: ${VIDEO_URL}"
  echo ""
  echo "🔍 VALIDAÇÃO MANUAL:"
  echo "  1. Assista ao vídeo e verifique:"
  echo "     ✅ Página 1: Título (320px, bold 58) + Texto (645px, regular 32) + Hashtag (1350px, verde 60)"
  echo "     ✅ Páginas 2-7: Texto (645px, regular 32) + Hashtag (1350px, verde 60)"
  echo "     ✅ Página 8: CTA"
  echo ""
  echo "  2. Verifique sincronização:"
  echo "     ✅ Áudio TTS sincronizado com cada página (duração dinâmica)"
  echo "     ✅ Sem cortes abruptos ou silêncios longos"
  echo "     ✅ Transições suaves entre páginas (do Canva)"
  echo ""
  echo "  3. Verifique textos:"
  echo "     ✅ Word wrap correto (não vaza da tela)"
  echo "     ✅ Emojis removidos do texto exibido"
  echo "     ✅ Hashtag na cor verde e posição correta (bottom)"
  echo ""
else
  echo "❌ Erro ao gerar vídeo!"
  echo "Resposta completa:"
  echo "${RESPONSE}"
fi
