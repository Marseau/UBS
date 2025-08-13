# 🔧 N8N WABA Booking E2E - Instruções de Setup

## 📥 **1. IMPORTAR WORKFLOW**

1. **Acessar n8n**: https://n8n.stratfin.tec.br
2. **Menu** → **Workflows** → **Import from file**
3. **Selecionar**: `N8N-WABA-Booking-E2E-Flow.json`
4. **Salvar** o workflow importado

## ⚙️ **2. CONFIGURAR CREDENCIAIS**

### **OpenAI API** 
```
Credential Type: OpenAI
Name: openai-main
API Key: [SUA_OPENAI_API_KEY]
```

### **Supabase** 
```
Credential Type: Supabase
Name: supabase-main
Host: qsdfyffuonywmtnlycri.supabase.co
Service Key: [SEU_SUPABASE_SERVICE_ROLE_KEY]
```

## 🌐 **3. CONFIGURAR VARIÁVEIS DE AMBIENTE**

**Settings** → **Environments** → **Global**:

```bash
WHATSAPP_TOKEN=EAAGno4ZA7r...  # Seu token WhatsApp Business
WHATSAPP_PHONE_NUMBER_ID=123456789  # ID do número de telefone
DATABASE_URL=postgresql://postgres:[password]@db.qsdfyffuonywmtnlycri.supabase.co:5432/postgres
```

## 📱 **4. CONFIGURAR WEBHOOK WABA**

### **URL do Webhook**:
```
https://n8n.stratfin.tec.br/webhook/waba-inbound
```

### **No Facebook Developer Console**:
1. **App** → **WhatsApp** → **Configuration**  
2. **Callback URL**: `https://n8n.stratfin.tec.br/webhook/waba-inbound`
3. **Verify Token**: `waba_verify_token_2025`
4. **Subscribe**: `messages`

## 🔧 **5. NÓS DO WORKFLOW - VISÃO GERAL**

| Nó | Função | Configuração Crítica |
|---|---|---|
| **📱 WABA Webhook** | Recebe mensagens WhatsApp | Path: `waba-inbound` |
| **🏢 Tenant Identification** | Identifica tenant por telefone | Mapeia +5511987654321 → beauty |
| **🚦 Skip Processing?** | Valida se deve processar | Checa `skip_processing: true` |
| **🧠 AI Intent Prep** | Prepara prompt para IA | Prompts específicos por domínio |
| **🤖 OpenAI Intent** | Classifica intenção | Model: GPT-4, Max tokens: 300 |
| **📊 AI Response Processing** | Processa resposta IA | Parse JSON + enriquecimento |
| **💾 Log Conversation** | Salva no Supabase | Tabela: `conversation_history` |
| **📅 Requires Booking?** | Verifica se precisa agendar | Intent: agendar, reagendar |
| **🚨 Requires Human?** | Verifica escalação | Emergência, baixa confiança |
| **📋 Booking Orchestrator** | Orquestra agendamento | Mapeia serviços por domínio |
| **📅 Create Appointment** | Cria appointment | Tabela: `appointments` |
| **🚨 Human Escalation** | Trata escalações | Emergência médica, crises |
| **💬 WhatsApp Response** | Prepara resposta | Formata mensagem final |
| **📤 Send WhatsApp** | Envia via WABA API | POST para Graph API |
| **💰 Log Usage Costs** | Registra custos | Tabela: `usage_costs` |
| **✅ Success Response** | Resposta final | JSON de sucesso |
| **❌ Error Handler** | Trata erros | Fallback para falhas |

## 🧪 **6. TESTAR O WORKFLOW**

### **Teste Manual**:
1. **Ativar** workflow
2. **Executar** → **Manual** 
3. **Payload de teste**:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "id": "msg_test_123",
          "from": "+5511900001001",
          "timestamp": "1641024000",
          "type": "text",
          "text": {
            "body": "Oi! Gostaria de agendar um corte feminino"
          }
        }],
        "contacts": [{
          "profile": {
            "name": "Ana Paula Silva"
          }
        }],
        "metadata": {
          "phone_number_id": "123456789",
          "display_phone_number": "+5511987654321"
        }
      }
    }]
  }]
}
```

### **Teste via Script**:
```bash
# Configurar webhook URL
N8N_WEBHOOK_URL="https://n8n.stratfin.tec.br/webhook/waba-inbound" 
./Production-Enhanced-Test-Script.sh
```

## 🔍 **7. MONITORAMENTO**

### **Executions**:
- **Acessar**: Executions → Ver logs detalhados
- **Filtrar**: Por status (success/error/running)
- **Debug**: Clicar em execução para ver dados de cada nó

### **Métricas Importantes**:
- **Success Rate**: % de mensagens processadas com sucesso
- **Response Time**: Tempo médio de resposta
- **Error Rate**: Taxa de erro por tipo
- **AI Cost**: Custo médio por conversa

### **Alertas**:
- **Error Rate > 5%**: Verificar credenciais e conectividade
- **Response Time > 10s**: Verificar performance do Supabase
- **AI Cost > $0.50/conversa**: Revisar prompts

## 🚨 **8. TROUBLESHOOTING COMUM**

### **Webhook não recebe mensagens**:
- ✅ Verificar URL: `https://n8n.stratfin.tec.br/webhook/waba-inbound`
- ✅ Confirm verify token no Facebook
- ✅ Webhook ativo no n8n

### **Erro de credenciais OpenAI**:
- ✅ API Key válida e com créditos
- ✅ Rate limits não excedidos
- ✅ Modelo GPT-4 disponível

### **Erro Supabase**:
- ✅ Service Role Key correto
- ✅ RLS policies configuradas
- ✅ Tabelas existem (`conversation_history`, `appointments`, `usage_costs`)

### **Tenant não identificado**:
- ✅ Número de telefone no mapeamento
- ✅ Formato E.164 (+5511987654321)
- ✅ Metadata do WhatsApp correto

## 🎯 **9. NEXT STEPS**

Após configurar o workflow:

1. **Testar** com mensagens reais dos 6 domínios
2. **Monitorar** métricas de performance
3. **Ajustar** prompts baseado na precisão
4. **Escalar** para múltiplos números de telefone
5. **Integrar** com sistema de notificações para escalações

## 📞 **10. NÚMEROS DE TESTE**

Para usar com o framework de testes:

| Domínio | Número Business | Tenant ID |
|---------|----------------|-----------|
| Beauty | +5511987654321 | tenant_1_beleza |
| Healthcare | +5511987654322 | tenant_2_saude |
| Legal | +5511987654323 | tenant_3_juridico |
| Education | +5511987654324 | tenant_4_educacao |
| Sports | +5511987654325 | tenant_5_esportes |
| Consulting | +5511987654326 | tenant_6_consultoria |

**Framework pronto para simular conversações reais via WhatsApp!** 🚀