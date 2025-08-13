#!/bin/bash
# Test-WhatsApp-Integration.sh
# Teste direto da integração WhatsApp → n8n → Supabase
# Simula mensagens reais dos 6 domínios de negócio

echo "🧪 TESTE DE INTEGRAÇÃO WHATSAPP → N8N"
echo "===================================="
echo ""

# Configurações
N8N_WEBHOOK_URL="https://n8n.stratfin.tec.br/webhook/waba-inbound"
WHATSAPP_PHONE_ID="747283711790670"

# Verificar dependências
command -v curl >/dev/null 2>&1 || { echo "❌ curl não encontrado" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "❌ jq não encontrado" >&2; exit 1; }

echo "📡 Webhook URL: $N8N_WEBHOOK_URL"
echo "📱 Phone ID: $WHATSAPP_PHONE_ID"
echo ""

# Função para enviar mensagem de teste
send_test_message() {
    local domain="$1"
    local business_phone="$2" 
    local user_phone="$3"
    local user_name="$4"
    local message="$5"
    local scenario="$6"
    
    echo "🔄 Testando: $domain - $scenario"
    
    # Payload WhatsApp Business API format
    local payload=$(jq -n \
        --arg phone_id "$WHATSAPP_PHONE_ID" \
        --arg business_phone "$business_phone" \
        --arg user_phone "$user_phone" \
        --arg user_name "$user_name" \
        --arg message "$message" \
        --arg timestamp "$(date +%s)" \
        '{
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            id: ("msg_test_" + $timestamp),
                            from: $user_phone,
                            timestamp: $timestamp,
                            type: "text",
                            text: {
                                body: $message
                            }
                        }],
                        contacts: [{
                            profile: {
                                name: $user_name
                            }
                        }],
                        metadata: {
                            phone_number_id: $phone_id,
                            display_phone_number: $business_phone
                        }
                    }
                }]
            }]
        }')
    
    # Enviar request
    local response=$(curl -s -w "%{http_code}" \
        -X POST "$N8N_WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "X-Test-Scenario: $scenario" \
        -d "$payload" \
        -o /tmp/response_$$.json)
    
    local http_code="${response: -3}"
    
    if [ "$http_code" = "200" ]; then
        echo "   ✅ HTTP $http_code - Sucesso"
        
        # Mostrar resposta se disponível
        if [ -f /tmp/response_$$.json ] && [ -s /tmp/response_$$.json ]; then
            local status=$(jq -r '.status // "unknown"' /tmp/response_$$.json 2>/dev/null)
            local action=$(jq -r '.data.action_taken // "unknown"' /tmp/response_$$.json 2>/dev/null)
            echo "   📊 Status: $status | Action: $action"
        fi
    else
        echo "   ❌ HTTP $http_code - Falha"
        if [ -f /tmp/response_$$.json ]; then
            cat /tmp/response_$$.json | jq . 2>/dev/null || cat /tmp/response_$$.json
        fi
    fi
    
    # Cleanup
    rm -f /tmp/response_$$.json
    
    # Rate limiting
    sleep 2
    echo ""
}

echo "🎭 EXECUTANDO TESTES POR DOMÍNIO"
echo "================================"
echo ""

# 1. BEAUTY - Salão Elegância
echo "💄 1. BEAUTY DOMAIN"
send_test_message "beauty" "+5511987654321" "+5511900001001" "Ana Paula Silva" \
    "Oi! Gostaria de agendar um corte feminino com a Maria para amanhã de manhã" \
    "beauty_booking_simple"

send_test_message "beauty" "+5511987654321" "+5511900001002" "Beatriz Santos" \
    "Não sei se faço corte ou coloração... pode me ajudar?" \
    "beauty_indecision"

# 2. HEALTHCARE - Clínica Vida  
echo "🏥 2. HEALTHCARE DOMAIN"
send_test_message "healthcare" "+5511987654322" "+5511900002004" "Diego Costa" \
    "Preciso marcar consulta com Dr. João, é meio urgente" \
    "healthcare_urgent"

send_test_message "healthcare" "+5511987654322" "+5511900002005" "Elena Rodrigues" \
    "EMERGÊNCIA! Meu marido está com dor no peito muito forte!" \
    "healthcare_emergency"

# 3. LEGAL - Advocacia Silva
echo "⚖️ 3. LEGAL DOMAIN" 
send_test_message "legal" "+5511987654323" "+5511900003007" "Gabriela Ferreira" \
    "Olá, fui demitida ontem e preciso de orientação trabalhista" \
    "legal_employment"

send_test_message "legal" "+5511987654323" "+5511900003008" "Henrique Alves" \
    "Urgente! Tenho prazo até sexta para contestar uma reclamação trabalhista" \
    "legal_deadline_critical"

# 4. EDUCATION - EduTech
echo "📚 4. EDUCATION DOMAIN"
send_test_message "education" "+5511987654324" "+5511900004009" "Isabel Mãe" \
    "Meu filho precisa de reforço em matemática para o vestibular" \
    "education_tutoring"

send_test_message "education" "+5511987654324" "+5511900004010" "João Pai" \
    "Minha filha está muito ansiosa com o ENEM, precisa de apoio urgente" \
    "education_emotional_support"

# 5. SPORTS - FitPro
echo "💪 5. SPORTS DOMAIN"
send_test_message "sports" "+5511987654325" "+5511900005011" "Karla Fitness" \
    "E aí! Quero começar personal training para hipertrofia" \
    "sports_personal_training"

send_test_message "sports" "+5511987654325" "+5511900005012" "Lucas Atleta" \
    "Carlos, machuquei o joelho durante o treino ontem, está doendo muito" \
    "sports_injury"

# 6. CONSULTING - BizConsult
echo "📈 6. CONSULTING DOMAIN"
send_test_message "consulting" "+5511987654326" "+5511900006013" "Mariana CEO" \
    "Patricia, nossa startup precisa de um diagnóstico empresarial completo" \
    "consulting_diagnosis"

send_test_message "consulting" "+5511987654326" "+5511900006014" "Nelson CEO" \
    "Patricia, estamos em crise financeira severa, precisamos de ajuda urgente" \
    "consulting_crisis"

echo "🎯 TESTES EDGE CASES"
echo "==================="
echo ""

# Spam detection
send_test_message "beauty" "+5511987654321" "+5511900999999" "Spammer" \
    "PROMOÇÃO IMPERDÍVEL! Corte + coloração por apenas R$20!! GARANTIDO 100%!" \
    "spam_detection"

# Low confidence message
send_test_message "healthcare" "+5511987654322" "+5511900002006" "Cliente Confuso" \
    "sei la, queria marcar alguma coisa, mas nao sei bem o que" \
    "low_confidence"

echo ""
echo "🎉 TESTES CONCLUÍDOS!"
echo "===================="
echo ""
echo "📊 Para verificar os resultados:"
echo "1. Acesse n8n.stratfin.tec.br → Executions"
echo "2. Verifique logs de cada execução"
echo "3. Confirme criação de registros no Supabase:"
echo "   - conversation_history"
echo "   - appointments (para agendamentos)"
echo "   - usage_costs"
echo ""
echo "🔍 Métricas esperadas:"
echo "- Success Rate: >90%"
echo "- Agendamentos criados: ~8-10"
echo "- Escalações humanas: ~4-5"
echo "- Detecção de spam: 1"
echo "- Emergências: 1"
echo ""
echo "🚨 Se algum teste falhou:"
echo "1. Verificar credenciais no n8n"
echo "2. Confirmar webhook URL ativo"
echo "3. Validar conectividade Supabase"
echo "4. Checar créditos OpenAI"
echo ""