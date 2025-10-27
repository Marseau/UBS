#!/bin/bash

echo "🎨 ========== TESTE PLACID CAROUSEL =========="
echo ""

# Criar conteúdo de teste via API do Supabase
echo "📝 Criando conteúdo de teste..."

CONTENT_ID=$(curl -s -X POST "https://qsdfyffuonywmtnlycri.supabase.co/rest/v1/editorial_content" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMjY0NzgsImV4cCI6MjA2NjcwMjQ3OH0.IDJdOApiNM0FJvRe5mp28L7U89GWeHpPoPlPreexwbg" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "week_number": 1,
    "day_of_week": "monday",
    "x_thread_part1": "Slide 1:\n30% dos agendamentos falham em PMEs (HubSpot, 2024)\n\n👉 Sua agenda está vazando receita?\n\nSlide 2:\nAgendamento manual = caos:\n\n📲 WhatsApp + planilhas + telefone\n❌ Zero integração\n💥 Equipe sobrecarregada\n\nSlide 3:\nExemplo:\n\nSalão com 5 profissionais\n2 faltas/semana cada → R$1.500/semana perdidos\nAnual: R$78.000 indo embora\n\nSlide 4:\nConsequências:\n\n1️⃣ Agenda furada\n2️⃣ Clientes frustrados\n3️⃣ Profissionais desmotivados\n\nSlide 5:\nE piora quando:\n\n⚠️ Sem lembretes\n⚠️ Agenda compartilhada\n⚠️ Cliente muda última hora\n\nSlide 6:\nSintomas claros:\n\n✅ Tudo manual\n✅ Não sabe quem confirmou\n✅ Muitos cancelamentos\n\nSlide 7:\n👉 Resumindo: sua agenda pode estar drenando receita.\n\nSalve este carrossel e siga para aprender como evitar!",
    "instagram_caption": "30% dos agendamentos falham em PMEs. Sua agenda está vazando receita? 💰"
  }' | jq -r '.[0].id')

if [ -z "$CONTENT_ID" ] || [ "$CONTENT_ID" = "null" ]; then
  echo "❌ Erro ao criar conteúdo"
  exit 1
fi

echo "✅ Conteúdo criado com ID: $CONTENT_ID"
echo ""

# Aguardar um momento
sleep 2

# Chamar API Placid para gerar carrossel
echo "🎬 Gerando carrossel via Placid..."
echo "📡 POST http://localhost:3000/api/placid-carousel/generate/$CONTENT_ID"
echo ""

RESPONSE=$(curl -s -X POST "http://localhost:3000/api/placid-carousel/generate/$CONTENT_ID")

echo "✅ Resposta da API:"
echo "$RESPONSE" | jq '.'
echo ""

# Extrair informações
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
TOTAL_SLIDES=$(echo "$RESPONSE" | jq -r '.total_slides')
COST=$(echo "$RESPONSE" | jq -r '.cost')

if [ "$SUCCESS" = "true" ]; then
  echo "📊 Resumo:"
  echo "   Content ID: $CONTENT_ID"
  echo "   Total de slides: $TOTAL_SLIDES"
  echo "   Custo: \$$COST"
  echo ""
  echo "📸 URLs das imagens geradas:"
  echo "$RESPONSE" | jq -r '.carousel_urls[]' | nl
  echo ""
  echo "✅ Teste concluído com sucesso!"
  echo ""
  echo "👉 Visualize as imagens copiando as URLs acima"
else
  echo "❌ Erro na geração do carrossel"
  echo "$RESPONSE" | jq -r '.error, .message'
fi
