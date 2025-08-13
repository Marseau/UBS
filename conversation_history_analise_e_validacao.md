# 📊 CONVERSATION_HISTORY - ANÁLISE E VALIDAÇÃO COMPLETA

## 🎯 RESUMO EXECUTIVO

✅ **TABELA VALIDADA:** conversation_history existe com 16 campos  
✅ **DADOS DISPONÍVEIS:** 4.560 mensagens de 5 tenants únicos  
✅ **CONVERSATION_OUTCOME:** Campo existe com 4 valores enum  
✅ **MÉTRICAS VIÁVEIS:** 15+ métricas podem ser extraídas

---

## 📋 ESTRUTURA REAL DA TABELA

### **CAMPOS PRINCIPAIS (16 campos):**

| Campo | Tipo | Nullable | Descrição |
|-------|------|----------|-----------|
| `id` | uuid | NO | Identificador único da mensagem |
| `tenant_id` | uuid | NO | ID do tenant (negócio) |
| `user_id` | uuid | NO | ID do usuário/cliente |
| `content` | text | NO | Conteúdo da mensagem |
| `is_from_user` | boolean | NO | Se mensagem é do usuário ou sistema |
| `message_type` | text | YES | Tipo da mensagem (text, image, etc.) |
| `intent_detected` | text | YES | Intenção detectada pela IA |
| `confidence_score` | numeric | YES | Score de confiança da IA (0-1) |
| `conversation_context` | jsonb | YES | Contexto da conversa em JSON |
| `created_at` | timestamp | YES | Data/hora da mensagem |
| `tokens_used` | integer | YES | Tokens usados na API |
| `api_cost_usd` | numeric | YES | Custo da API em USD |
| `model_used` | varchar | YES | Modelo de IA usado |
| `message_source` | varchar | YES | Origem (whatsapp, web, etc.) |
| `processing_cost_usd` | numeric | YES | Custo de processamento |
| `conversation_outcome` | text | YES | **RESULTADO DA CONVERSA** |

---

## 🎯 CONVERSATION_OUTCOME - ENUM REAL

### **VALORES ENCONTRADOS (4 tipos):**

| Outcome | Quantidade | Percentual | Descrição |
|---------|------------|------------|-----------|
| `appointment_created` | 410 | 39.5% | **Agendamento criado com sucesso** |
| `info_request_fulfilled` | 221 | 21.3% | **Pedido de informação atendido** |
| `appointment_cancelled` | 207 | 19.9% | **Agendamento cancelado** |
| `price_inquiry` | 203 | 19.3% | **Consulta de preços** |

**Total de registros com outcome:** 1.041 de 4.560 mensagens (22.8%)

### **MAPEAMENTO PARA MÉTRICAS:**
- ✅ `appointment_created` → **completed_conversations**
- ✅ `appointment_cancelled` → **cancelled_conversations**  
- ✅ `info_request_fulfilled` → **fulfilled_conversations**
- ✅ `price_inquiry` → **inquiry_conversations**

---

## 💬 CONVERSATION_CONTEXT - ESTRUTURA JSON

### **CAMPOS DISPONÍVEIS:**
```json
{
  "session_id": "uuid-da-sessao",
  "duration_minutes": 3
}
```

**Uso para métricas:**
- ✅ `session_id` → Agrupar mensagens por conversa
- ✅ `duration_minutes` → Calcular tempo médio de conversa

---

## 📊 ESTATÍSTICAS GERAIS

### **DADOS AGREGADOS:**
- 📱 **Total de mensagens:** 4.560
- 🏢 **Tenants únicos:** 5
- 🤖 **Confidence score médio:** 0.916 (91.6%)
- 💰 **Custo API médio:** $0.0045 por mensagem
- 💸 **Custo processamento médio:** $0.00045 por mensagem  
- 🔢 **Tokens médios:** 50.7 por mensagem

---

## 🎯 MÉTRICAS QUE PODEM SER EXTRAÍDAS

### **1. CONVERSATION OUTCOMES (4 métricas):**

#### ✅ **COMPLETED_CONVERSATIONS**
```sql
COUNT(*) WHERE conversation_outcome = 'appointment_created'
```
- **Fonte:** Campo `conversation_outcome`
- **Esperado:** ~410 por período total
- **Validação:** Deve ser > 0 para tenants ativos

#### ✅ **CANCELLED_CONVERSATIONS**  
```sql
COUNT(*) WHERE conversation_outcome = 'appointment_cancelled'
```
- **Fonte:** Campo `conversation_outcome`
- **Esperado:** ~207 por período total
- **Validação:** Pode ser 0

#### ✅ **FULFILLED_CONVERSATIONS**
```sql
COUNT(*) WHERE conversation_outcome = 'info_request_fulfilled'
```
- **Fonte:** Campo `conversation_outcome`
- **Esperado:** ~221 por período total
- **Validação:** Deve ser > 0

#### ✅ **INQUIRY_CONVERSATIONS**
```sql
COUNT(*) WHERE conversation_outcome = 'price_inquiry'
```
- **Fonte:** Campo `conversation_outcome`
- **Esperado:** ~203 por período total
- **Validação:** Deve ser > 0

---

### **2. CONVERSATION AGGREGATES (6 métricas):**

#### ✅ **AVG_MINUTES_PER_CONVERSATION**
```sql
AVG(CAST(conversation_context->>'duration_minutes' AS INTEGER))
```
- **Fonte:** `conversation_context.duration_minutes`
- **Esperado:** 2-8 minutos
- **Validação:** Deve ser entre 1-20 minutos

#### ✅ **TOTAL_CHAT_MINUTES**
```sql
SUM(CAST(conversation_context->>'duration_minutes' AS INTEGER))
```
- **Fonte:** `conversation_context.duration_minutes`
- **Validação:** Deve crescer com mais conversas

#### ✅ **AVG_MESSAGES_PER_SESSION**
```sql
COUNT(*) / COUNT(DISTINCT conversation_context->>'session_id')
```
- **Fonte:** Agrupamento por `session_id`
- **Esperado:** 3-10 mensagens por sessão
- **Validação:** Deve ser > 1

#### ✅ **UNIQUE_SESSIONS_COUNT**
```sql
COUNT(DISTINCT conversation_context->>'session_id')
```
- **Fonte:** `conversation_context.session_id`
- **Validação:** Deve ser <= total de mensagens

#### ✅ **AVG_CONFIDENCE_SCORE**
```sql
AVG(confidence_score) WHERE confidence_score IS NOT NULL
```
- **Fonte:** Campo `confidence_score`
- **Esperado:** ~0.916 (91.6%)
- **Validação:** Deve ser entre 0.0-1.0

#### ✅ **UNIQUE_CUSTOMERS_COUNT**
```sql
COUNT(DISTINCT user_id)
```
- **Fonte:** Campo `user_id`
- **Validação:** Deve ser <= sessões únicas

---

### **3. COST METRICS (3 métricas):**

#### ✅ **AVG_PROCESSING_COST_USD**
```sql
AVG(processing_cost_usd) WHERE processing_cost_usd IS NOT NULL
```
- **Fonte:** Campo `processing_cost_usd`
- **Esperado:** ~$0.00045
- **Validação:** Deve ser > 0

#### ✅ **TOTAL_PROCESSING_COST_USD**
```sql
SUM(processing_cost_usd) WHERE processing_cost_usd IS NOT NULL
```
- **Validação:** Deve crescer com volume

#### ✅ **AVG_API_COST_USD**
```sql
AVG(api_cost_usd) WHERE api_cost_usd IS NOT NULL
```
- **Fonte:** Campo `api_cost_usd`
- **Esperado:** ~$0.0045
- **Validação:** Deve ser > processing_cost

---

### **4. TEMPORAL METRICS (2 métricas):**

#### ✅ **CONVERSATIONS_LAST_7D**
```sql
COUNT(DISTINCT conversation_context->>'session_id') 
WHERE created_at >= NOW() - INTERVAL '7 days'
```

#### ✅ **CONVERSATIONS_LAST_30D**
```sql
COUNT(DISTINCT conversation_context->>'session_id') 
WHERE created_at >= NOW() - INTERVAL '30 days'
```

---

## 🔧 CORREÇÕES NECESSÁRIAS NO SISTEMA

### **MÉTRICAS ATUALMENTE QUEBRADAS:**

| Métrica Atual | Campo Inventado | Campo Real | Status |
|---------------|-----------------|------------|--------|
| `completed_conversations` | `outcome='completed'` | `conversation_outcome='appointment_created'` | 🔧 CORRIGIR |
| `abandoned_conversations` | `outcome='abandoned'` | **NÃO EXISTE** | ❌ REMOVER |
| `cancelled_conversations` | `outcome='cancelled'` | `conversation_outcome='appointment_cancelled'` | 🔧 CORRIGIR |
| `unique_customers_count` | `customer_phone` | `user_id` | 🔧 CORRIGIR |
| `avg_cost_usd_per_conversation` | `processing_cost` | `processing_cost_usd` | 🔧 CORRIGIR |
| `avg_confidence_per_conversation` | `confidence_score` | `confidence_score` | ✅ OK |

---

## 📝 PLANO DE CORREÇÃO

### **ETAPA 1: Corrigir Conversation Outcomes**
```javascript
// ANTES (ERRADO)
conversation_context.outcome === 'completed'

// DEPOIS (CORRETO)  
conversation_outcome === 'appointment_created'
```

### **ETAPA 2: Corrigir Customer Count**
```javascript
// ANTES (ERRADO)
COUNT(DISTINCT conversation_context.customer_phone)

// DEPOIS (CORRETO)
COUNT(DISTINCT user_id)
```

### **ETAPA 3: Corrigir Processing Cost**
```javascript
// ANTES (ERRADO)
conversation_context.processing_cost

// DEPOIS (CORRETO)
processing_cost_usd
```

### **ETAPA 4: Adicionar Novas Métricas**
- `fulfilled_conversations` (info_request_fulfilled)
- `inquiry_conversations` (price_inquiry)  
- `unique_sessions_count` (session_id)
- `total_api_cost_usd`

---

## 🎯 MÉTRICAS FINAIS DISPONÍVEIS

### ✅ **TOTALMENTE VIÁVEIS (15 métricas):**
1. `appointment_created_conversations` 
2. `appointment_cancelled_conversations`
3. `info_request_fulfilled_conversations`
4. `price_inquiry_conversations`
5. `avg_minutes_per_conversation`
6. `total_chat_minutes`
7. `avg_messages_per_session`  
8. `unique_sessions_count`
9. `unique_customers_count`
10. `avg_confidence_score`
11. `avg_processing_cost_usd`
12. `total_processing_cost_usd`
13. `avg_api_cost_usd`
14. `conversations_last_7d`
15. `conversations_last_30d`

### ❌ **NÃO VIÁVEIS (remover):**
- `abandoned_conversations` (outcome não existe)
- `no_show_conversations` (outcome não existe) 
- `rescheduled_conversations` (outcome não existe)
- `failed_conversations` (outcome não existe)

---

## 🚀 PRÓXIMOS PASSOS

1. **Corrigir** script `execute-all-metrics.js` com campos reais
2. **Testar** métricas corrigidas com dados reais
3. **Remover** métricas inexistentes  
4. **Adicionar** novas métricas descobertas
5. **Validar** resultados com dados esperados

**CONCLUSÃO:** Sistema tem base sólida, precisa apenas corrigir mapeamento de campos para usar dados reais da tabela conversation_history.