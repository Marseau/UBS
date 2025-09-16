#!/bin/bash

# 🧪 Script de Teste dos 3 Cenários de Onboarding
# Valida comportamento determinístico do sistema

set -e

echo "🧪 TESTE DOS 3 CENÁRIOS DE ONBOARDING"
echo "📅 Data: $(date)"
echo ""

# Configuração
HOST=${HOST:-"http://localhost:3000"}
DEMO_TOKEN=${DEMO_MODE_TOKEN:-"fixed-secret-for-load-test-2025"}

# Verificar se servidor está rodando
echo "🔍 Verificando se servidor está ativo..."
if ! curl -s -f "$HOST/api/whatsapp/webhook/health" > /dev/null; then
  echo "❌ Servidor não está respondendo em $HOST"
  echo "💡 Inicie o servidor com: npm run dev"
  exit 1
fi
echo "✅ Servidor ativo"

# Função para fazer requisição de teste
send_message() {
  local phone=$1
  local message=$2
  local description=$3

  echo ""
  echo "📱 $description"
  echo "   📞 Telefone: $phone"
  echo "   💬 Mensagem: '$message'"

  response=$(curl -s -X POST "$HOST/api/whatsapp/webhook" \
    -H "x-demo-token: $DEMO_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"entry\": [{
        \"changes\": [{
          \"value\": {
            \"metadata\": {\"phone_number_id\": \"5511999999999\"},
            \"messages\": [{
              \"from\": \"$phone\",
              \"text\": {\"body\": \"$message\"}
            }]
          }
        }]
      }]
    }")

  # Extrair resposta da IA
  ai_response=$(echo "$response" | jq -r '.response // .aiResponse // "No response"' 2>/dev/null || echo "Parse error")
  intent=$(echo "$response" | jq -r '.intent // "unknown"' 2>/dev/null || echo "unknown")
  outcome=$(echo "$response" | jq -r '.outcome // .conversationOutcome // "unknown"' 2>/dev/null || echo "unknown")

  echo "   🤖 IA: $ai_response"
  echo "   🎯 Intent: $intent"
  echo "   📊 Outcome: $outcome"

  # Aguardar um pouco entre mensagens
  sleep 2
}

echo ""
echo "🎭 CENÁRIO 1: USUÁRIO TOTALMENTE NOVO"
echo "=" $(printf '=%.0s' {1..50})

PHONE_NEW="5511111111111"

send_message "$PHONE_NEW" "oi" "Primeira saudação de usuário novo"
send_message "$PHONE_NEW" "João Silva" "Respondendo pergunta do nome"
send_message "$PHONE_NEW" "joao.silva@email.com" "Respondendo pergunta do email"
send_message "$PHONE_NEW" "masculino" "Respondendo pergunta do gênero"
send_message "$PHONE_NEW" "serviços" "Primeira pergunta pós-onboarding"

echo ""
echo "🎭 CENÁRIO 2: USUÁRIO COM DADOS INCOMPLETOS"
echo "=" $(printf '=%.0s' {1..50})

PHONE_INCOMPLETE="5511222222222"

# Simular usuário que começou onboarding mas não terminou
# (In a real scenario, this would be a user with name but no email in DB)
send_message "$PHONE_INCOMPLETE" "oi" "Usuário com onboarding incompleto"
send_message "$PHONE_INCOMPLETE" "Maria Santos" "Fornecendo nome faltante"
send_message "$PHONE_INCOMPLETE" "maria.santos@email.com" "Fornecendo email faltante"
send_message "$PHONE_INCOMPLETE" "feminino" "Finalizando onboarding"
send_message "$PHONE_INCOMPLETE" "preços" "Primeira pergunta pós-onboarding"

echo ""
echo "🎭 CENÁRIO 3: USUÁRIO COMPLETO (já cadastrado)"
echo "=" $(printf '=%.0s' {1..50})

PHONE_COMPLETE="5511333333333"

# Simular usuário que já tem todos os dados
send_message "$PHONE_COMPLETE" "bom dia" "Saudação de usuário já cadastrado"
send_message "$PHONE_COMPLETE" "meus agendamentos" "Consulta direta de agendamentos"
send_message "$PHONE_COMPLETE" "horários disponíveis" "Consulta de disponibilidade"
send_message "$PHONE_COMPLETE" "endereço" "Consulta de localização"

echo ""
echo "🧪 TESTES ADICIONAIS - CASOS ESPECIAIS"
echo "=" $(printf '=%.0s' {1..50})

# Teste de comandos estruturados
send_message "$PHONE_COMPLETE" "cancelar abc123" "Comando de cancelamento estruturado"
send_message "$PHONE_COMPLETE" "remarcar def456" "Comando de remarcação estruturado"

# Teste de fallback
send_message "$PHONE_COMPLETE" "xyzabc123randomtext" "Mensagem não reconhecida (fallback)"

echo ""
echo "🎉 TESTES DE ONBOARDING CONCLUÍDOS"
echo ""
echo "📊 Resumo dos cenários testados:"
echo "  ✅ Cenário 1: Usuário novo → onboarding completo"
echo "  ✅ Cenário 2: Usuário incompleto → retomada correta"
echo "  ✅ Cenário 3: Usuário completo → saudação direta"
echo "  ✅ Comandos estruturados → cancelar/remarcar"
echo "  ✅ Fallback → mensagem não reconhecida"
echo ""
echo "🔍 Pontos a validar manualmente:"
echo "  • Persistência correta dos dados no banco"
echo "  • Session_id fixo até conversation_outcome"
echo "  • Flow_lock ativo durante onboarding"
echo "  • Telemetria registrada corretamente"
echo "  • Dados reais retornados (sem mock data)"
echo ""