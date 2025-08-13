# 🎯 MÉTRICAS ESTRATÉGICAS - OUTCOMES & APPOINTMENTS

**Data:** 2025-07-30  
**Objetivo:** Criar métricas inteligentes baseadas em outcomes + appointments internos/externos

## 📊 CATEGORIZAÇÃO ESTRATÉGICA DOS OUTCOMES

### **🏆 ALTA CONVERSÃO (Geram Receita Direta)**
- ✅ `appointment_created` - Criou novo agendamento
- 📅 `appointment_rescheduled` - Remarcou agendamento  
- ✅ `appointment_confirmed` - Confirmou agendamento
- 🔧 `appointment_modified` - Alterou detalhes do agendamento

### **💡 ENGAJAMENTO POSITIVO (Mantêm Cliente Ativo)**
- 📋 `info_request_fulfilled` - Só queria informação
- 🕐 `business_hours_inquiry` - Perguntou horário funcionamento
- 💰 `price_inquiry` - Perguntou preços
- 📍 `location_inquiry` - Perguntou endereço
- ❓ `appointment_inquiry` - Perguntou sobre agendamento existente

### **⚠️ RISCO/PERDA (Indicam Problemas)**
- 🔄 `booking_abandoned` - Começou agendar mas desistiu
- ⏰ `timeout_abandoned` - Não respondeu em 60s
- ❌ `appointment_cancelled` - Cancelou agendamento
- 📞 `appointment_noshow_followup` - Justificou após no_show

### **🚫 RUÍDO/SPAM (Sem Valor)**
- ❌ `wrong_number` - Número errado
- 🚫 `spam_detected` - Spam/bot
- 🧪 `test_message` - Mensagem de teste

## 🎯 MÉTRICAS PARA PLATAFORMA

### **1. 🚨 RISCO BYPASS DA PLATAFORMA**
```sql
-- Tenants com alta % de appointments externos = não usam a IA
SELECT 
  tenant_id,
  COUNT(*) as total_appointments,
  COUNT(CASE WHEN external_event_id IS NOT NULL THEN 1 END) as externos,
  COUNT(CASE WHEN external_event_id IS NULL THEN 1 END) as internos,
  (COUNT(CASE WHEN external_event_id IS NOT NULL THEN 1 END) * 100.0 / COUNT(*)) as pct_externo
FROM appointments 
GROUP BY tenant_id
HAVING pct_externo > 60  -- RISCO: Mais de 60% externo
ORDER BY pct_externo DESC;
```

**INTERPRETAÇÃO:**
- **< 20% externo:** Tenant usa bem a plataforma ✅
- **20-40% externo:** Uso misto, normal 🟡
- **40-60% externo:** Risco médio ⚠️
- **> 60% externo:** RISCO ALTO - pode cancelar 🚨

### **2. 📈 EFICIÊNCIA DE CONVERSÃO GLOBAL**
```sql
-- Appointments por conversa = eficiência da IA
WITH conversations AS (
  SELECT 
    tenant_id,
    COUNT(DISTINCT conversation_context->>'session_id') as total_conversations
  FROM conversation_history 
  WHERE conversation_context->>'session_id' IS NOT NULL
  GROUP BY tenant_id
),
appointments AS (
  SELECT 
    tenant_id,
    COUNT(*) as total_appointments,
    COUNT(CASE WHEN external_event_id IS NULL THEN 1 END) as internos
  FROM appointments 
  GROUP BY tenant_id
)
SELECT 
  c.tenant_id,
  c.total_conversations,
  a.internos as appointments_internos,
  (a.internos * 100.0 / c.total_conversations) as conversao_pct
FROM conversations c
JOIN appointments a ON c.tenant_id = a.tenant_id
ORDER BY conversao_pct DESC;
```

### **3. 🎯 QUALIDADE DA BASE (Health Score)**
```sql
-- % outcomes positivos vs negativos
WITH outcome_analysis AS (
  SELECT 
    tenant_id,
    conversation_context->>'conversation_outcome' as outcome,
    COUNT(*) as count
  FROM conversation_history 
  WHERE conversation_context->>'conversation_outcome' IS NOT NULL
  GROUP BY tenant_id, conversation_context->>'conversation_outcome'
)
SELECT 
  tenant_id,
  SUM(CASE WHEN outcome IN ('appointment_created', 'appointment_confirmed', 'info_request_fulfilled', 'appointment_rescheduled') 
      THEN count ELSE 0 END) as positivos,
  SUM(CASE WHEN outcome IN ('booking_abandoned', 'timeout_abandoned', 'spam_detected', 'wrong_number') 
      THEN count ELSE 0 END) as negativos,
  SUM(count) as total,
  (SUM(CASE WHEN outcome IN ('appointment_created', 'appointment_confirmed', 'info_request_fulfilled', 'appointment_rescheduled') 
       THEN count ELSE 0 END) * 100.0 / SUM(count)) as quality_score
FROM outcome_analysis
GROUP BY tenant_id
ORDER BY quality_score DESC;
```

## 🏢 MÉTRICAS PARA TENANT

### **1. 💰 ROI WHATSAPP (Revenue per Conversation)**
```sql
-- Receita gerada por conversa via WhatsApp
WITH tenant_conversations AS (
  SELECT 
    tenant_id,
    COUNT(DISTINCT conversation_context->>'session_id') as conversations
  FROM conversation_history 
  WHERE conversation_context->>'session_id' IS NOT NULL
  GROUP BY tenant_id
),
tenant_revenue AS (
  SELECT 
    tenant_id,
    SUM(final_price) as revenue_total,
    SUM(CASE WHEN external_event_id IS NULL THEN final_price ELSE 0 END) as revenue_whatsapp
  FROM appointments 
  WHERE status = 'completed'
  GROUP BY tenant_id
)
SELECT 
  tc.tenant_id,
  tc.conversations,
  tr.revenue_whatsapp,
  (tr.revenue_whatsapp / tc.conversations) as revenue_per_conversation,
  (tr.revenue_whatsapp * 100.0 / tr.revenue_total) as pct_revenue_whatsapp
FROM tenant_conversations tc
JOIN tenant_revenue tr ON tc.tenant_id = tr.tenant_id
ORDER BY revenue_per_conversation DESC;
```

### **2. ⚡ EFICIÊNCIA OPERACIONAL (Conversion Funnel)**
```sql
-- Funil de conversão: Conversas → Agendamentos → Completados
WITH funnel AS (
  SELECT 
    tenant_id,
    COUNT(DISTINCT conversation_context->>'session_id') as conversations,
    COUNT(DISTINCT CASE WHEN conversation_context->>'conversation_outcome' = 'appointment_created'
          THEN conversation_context->>'session_id' END) as conversions,
    (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = ch.tenant_id AND external_event_id IS NULL) as appointments,
    (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = ch.tenant_id AND external_event_id IS NULL AND status = 'completed') as completed
  FROM conversation_history ch
  WHERE conversation_context->>'session_id' IS NOT NULL
  GROUP BY tenant_id
)
SELECT 
  tenant_id,
  conversations,
  conversions,
  appointments,
  completed,
  (conversions * 100.0 / conversations) as conversion_rate,
  (appointments * 100.0 / conversations) as appointment_rate,
  (completed * 100.0 / appointments) as completion_rate
FROM funnel
ORDER BY conversion_rate DESC;
```

### **3. 🎭 QUALIDADE ATENDIMENTO (Experience Score)**
```sql
-- Score baseado nos tipos de conversa recebidos
WITH outcome_weights AS (
  SELECT 
    'appointment_created' as outcome, 10 as weight, 'conversion' as category
  UNION ALL SELECT 'appointment_confirmed', 8, 'engagement'
  UNION ALL SELECT 'info_request_fulfilled', 6, 'engagement'  
  UNION ALL SELECT 'price_inquiry', 5, 'engagement'
  UNION ALL SELECT 'booking_abandoned', -5, 'risk'
  UNION ALL SELECT 'timeout_abandoned', -8, 'risk'
  UNION ALL SELECT 'spam_detected', -10, 'spam'
),
tenant_scores AS (
  SELECT 
    ch.tenant_id,
    ch.conversation_context->>'conversation_outcome' as outcome,
    COUNT(*) as count,
    ow.weight,
    ow.category
  FROM conversation_history ch
  JOIN outcome_weights ow ON ch.conversation_context->>'conversation_outcome' = ow.outcome
  WHERE ch.conversation_context->>'conversation_outcome' IS NOT NULL
  GROUP BY ch.tenant_id, ch.conversation_context->>'conversation_outcome', ow.weight, ow.category
)
SELECT 
  tenant_id,
  SUM(count * weight) as weighted_score,
  SUM(count) as total_conversations,
  (SUM(count * weight) / SUM(count)) as avg_conversation_quality,
  SUM(CASE WHEN category = 'conversion' THEN count ELSE 0 END) as conversions,
  SUM(CASE WHEN category = 'engagement' THEN count ELSE 0 END) as engagements,
  SUM(CASE WHEN category = 'risk' THEN count ELSE 0 END) as risks,
  SUM(CASE WHEN category = 'spam' THEN count ELSE 0 END) as spam
FROM tenant_scores
GROUP BY tenant_id
ORDER BY avg_conversation_quality DESC;
```

## 🚨 ALERTAS ESTRATÉGICOS

### **Para Plataforma:**
1. **🔥 Risco Churn:** Tenant com >60% appointments externos
2. **📉 Low Engagement:** Conversion rate <10%
3. **🚫 Spam Increase:** >20% outcomes negativos
4. **⚡ High Performer:** >50% conversion rate (case study)

### **Para Tenant:**
1. **💰 Revenue Opportunity:** Alta conversão + baixa receita por conversa
2. **⚠️ Quality Issue:** Muitos timeouts/abandonos
3. **🎯 Optimization:** Compare com benchmarks do domínio
4. **📈 Growth:** Aumento significativo em conversations

## 🔄 IMPLEMENTAÇÃO NOS SERVIÇOS

### **Analytics Service - Adicionar:**
```typescript
// Métricas de appointments por fonte
const appointmentsBySource = {
  internal: appointments?.filter(a => !a.external_event_id).length || 0,
  external: appointments?.filter(a => a.external_event_id).length || 0,
  whatsapp: appointments?.filter(a => a.appointment_data?.source === 'whatsapp').length || 0,
  calendar: appointments?.filter(a => a.appointment_data?.source === 'google_calendar').length || 0
};

const bypassRisk = appointmentsBySource.external / (appointmentsBySource.internal + appointmentsBySource.external) * 100;
```

### **SaaS Metrics Service - Adicionar:**
```typescript
// Métricas de outcome por tenant
const outcomeAnalysis = await this.calculateOutcomeMetrics(tenantId);
const platformHealth = await this.calculatePlatformHealth();
const tenantRisk = await this.calculateTenantRisks();
```

## 🎯 MÉTRICAS FINAIS ESPERADAS

### **Dashboard Plataforma:**
- **Bypass Risk Index:** 0-100 (quanto maior, pior)
- **Platform Conversion Rate:** appointments internos / total conversations
- **Quality Score:** % outcomes positivos
- **Health Score:** Combinação de todas as métricas

### **Dashboard Tenant:**
- **WhatsApp ROI:** R$/conversa
- **Conversion Funnel:** Conversas → Appointments → Completed
- **Experience Score:** Qualidade média das conversas
- **Benchmark Position:** Comparação com domínio

**🎉 RESULTADO:** Métricas que realmente importam para decisões de negócio!