# 📊 REGRAS DE NEGÓCIO - SISTEMA DE MÉTRICAS UBS

**Sistema:** Universal Booking System (UBS)  
**Data:** 31 de Julho de 2025  
**Versão:** 1.0  
**Escopo:** Todas as regras de negócio para cálculos de métricas, KPIs e analytics

---

## 🎯 **1. MODELO DE COBRANÇA E PREÇOS**

### **💰 Planos de Assinatura**
```
🟢 Plano Básico: R$ 58/mês (até 200 conversas)
🔵 Plano Profissional: R$ 116/mês (até 400 conversas)  
🟠 Plano Enterprise: R$ 290/mês (até 1250 conversas)
```

### **📊 MRR (Monthly Recurring Revenue) - Regras**
**Fonte de Dados:** `appointments.final_price` > `appointments.quoted_price` > `appointment_data.price`

```sql
-- CÁLCULO DE MRR CORRETO
SELECT 
    SUM(
        COALESCE(final_price, quoted_price, (appointment_data->>'price')::numeric, 0)
    ) as mrr
FROM appointments
WHERE status = 'completed'
    AND created_at >= start_of_month
    AND created_at <= end_of_month;
```

**Valor Padrão por Tenant:** R$ 79.90/mês (usado quando não há dados de cobrança específicos)

### **💸 Sistema de Excedentes**
- **Básico → Profissional:** Upgrade automático ao exceder 200 conversas
- **Profissional → Enterprise:** Upgrade automático ao exceder 400 conversas  
- **Enterprise:** R$ 0,25 por conversa adicional após 1250 conversas

---

## 🗣️ **2. DEFINIÇÃO DE CONVERSAS E AI INTERACTIONS**

### **📱 Conversa Válida para Cobrança**
```sql
-- REGRA: Uma conversa = uma mensagem recebida do usuário
SELECT COUNT(*) as conversations_count 
FROM conversation_history 
WHERE tenant_id = ? 
    AND is_from_user = true 
    AND message_type = 'user'
    AND created_at >= inicio_periodo 
    AND created_at < fim_periodo;
```

### **🤖 AI Interactions Válidas**
**Critério de Qualidade:** `confidence_score >= 0.7`

```sql
-- REGRA: AI interactions válidas vs spam
SELECT 
    COUNT(*) FILTER (WHERE confidence_score >= 0.7) as valid_ai_interactions,
    COUNT(*) FILTER (WHERE confidence_score < 0.7 OR confidence_score IS NULL) as spam_interactions
FROM conversation_history
WHERE message_type = 'user' 
    AND created_at >= start_date 
    AND created_at <= end_date;
```

### **📊 Spam Detection Score**
```sql
-- FÓRMULA: (Mensagens válidas / Total de mensagens) × 100
spam_score = (valid_conversations * 100.0 / total_conversations)
```

**Thresholds:**
- **≥ 0.7:** Mensagem válida/confiável
- **< 0.7:** Spam ou baixa confiança
- **NULL:** Considerado spam

---

## 📅 **3. APPOINTMENT STATUS E REGRAS**

### **📋 Status Válidos**
```typescript
enum AppointmentStatus {
    "pending",     // Agendado, aguardando confirmação
    "confirmed",   // Confirmado pelo cliente
    "in_progress", // Em andamento
    "completed",   // Finalizado com sucesso
    "cancelled"    // Cancelado
}
```

### **💰 Appointments para Receita**
**REGRA:** Apenas `status = 'completed'` conta para MRR e receita

### **📊 Cancellation Rate**
```sql
-- FÓRMULA: (Cancelados / Total) × 100
cancellation_rate = (cancelled_appointments / total_appointments) * 100
```

### **📈 No-Show Rate**
**Benchmarks:**
- **< 15%:** Saudável
- **15-20%:** Zona de atenção  
- **> 20%:** Crítico

---

## 🏢 **4. TENANTS ATIVOS E CLASSIFICAÇÃO**

### **✅ Tenant Ativo**
**Critério:** `tenants.status = 'active'`

```sql
-- REGRA: Contar tenants ativos
SELECT COUNT(*) as active_tenants
FROM tenants 
WHERE status = 'active'
    AND created_at <= calculation_date;
```

### **📊 Tenant Risk Levels**
**Baseado em Efficiency Score:**
- **≥ 80:** 🟢 Baixo Risco
- **60-79:** 🟡 Médio Risco  
- **< 60:** 🔴 Alto Risco

---

## ⏰ **5. PERÍODOS DE CÁLCULO**

### **📅 Períodos Padrão**
- **7 dias:** Métricas de curto prazo
- **30 dias:** Métricas mensais (padrão)
- **90 dias:** Análise trimestral

### **🗓️ Cálculo de Períodos**
```sql
-- REGRA: Período retroativo
v_start_date := calculation_date - INTERVAL '1 day' * period_days;
v_end_date := calculation_date;
```

---

## 📊 **6. KPIs ESTRATÉGICOS - FÓRMULAS**

### **💹 Receita/Uso Ratio**
```sql
-- FÓRMULA: MRR / Total Chat Minutes
receita_uso_ratio = monthly_revenue / total_chat_minutes
```

**Interpretação:**
- **> R$ 2.0/min:** Excelente eficiência
- **R$ 0.5-2.0/min:** Zona saudável
- **< R$ 0.5/min:** Baixa eficiência

### **⚡ Operational Efficiency**
```sql
-- FÓRMULA: (Agendamentos / Conversas) × 100
operational_efficiency = (total_appointments / total_conversations) * 100
```

### **🎯 External Appointment Ratio**
```sql
-- FÓRMULA: (Agendamentos Externos / Total Agendamentos) × 100
external_ratio = (external_appointments / total_appointments) * 100
```

**Risk Levels:**
- **< 20%:** 🟢 Plataforma saudável
- **20-35%:** 🟡 Zona de atenção
- **> 35%:** 🔴 Risco de churn

### **💬 Chat Duration**
**Estimativa:** 5 minutos por conversa (quando dados reais não disponíveis)

```sql
-- CÁLCULO: Tempo médio entre mensagens do usuário
avg_chat_duration = total_chat_minutes / total_conversations
```

---

## 📈 **7. PARTICIPATION METRICS**

### **💰 Revenue Participation**
```sql
-- FÓRMULA: (Receita do Tenant / Receita Total da Plataforma) × 100
revenue_participation = (tenant_revenue / platform_total_revenue) * 100
```

### **👥 Customer Participation**
```sql
-- FÓRMULA: (Clientes únicos do Tenant / Total de Clientes da Plataforma) × 100
customer_participation = (tenant_unique_customers / platform_total_customers) * 100
```

### **📅 Appointments Participation**
```sql
-- FÓRMULA: (Agendamentos do Tenant / Total de Agendamentos da Plataforma) × 100
appointments_participation = (tenant_appointments / platform_total_appointments) * 100
```

---

## 🔍 **8. BUSINESS INTELLIGENCE RULES**

### **📊 Platform Health Score**
**Baseado em múltiplos fatores:**
- **Churn Rate < 5%:** +20 pontos
- **Conversion Rate > 20%:** +15 pontos  
- **Growth Rate > 10%:** +15 pontos
- **Base Score:** 50 pontos

### **⚠️ Risk Assessment**
**Critérios de Alto Risco:**
- Revenue < R$ 50/mês
- Efficiency < 10%
- Spam Rate > 30%
- External Ratio > 35%

### **🎯 Upsell Opportunities**
**Identificação:** Tenants usando mais recursos do que pagam
```sql
-- REGRA: Usage > Revenue indica oportunidade de upsell
WHERE usage_cost_brl > monthly_revenue
```

### **📉 Distortion Analysis**
**Identificação:** Tenants pagando mais do que usam
```sql
-- REGRA: Revenue > Usage indica possível distorção
WHERE monthly_revenue > (usage_cost_brl * 1.5)
```

---

## 💾 **9. TABELAS DE ARMAZENAMENTO**

### **🗄️ Core Tables**
- **`ubs_metric_system`:** Métricas consolidadas da plataforma
- **`tenant_platform_metrics`:** Analytics por tenant (7/30/90 dias)
- **`conversation_history`:** Dados de conversas e confidence scores
- **`appointments`:** Agendamentos com status e valores
- **`tenants`:** Informações de tenants e status ativo

### **📊 Chart Data Cache**
- **`chart_data_cache`:** Dados pré-computados para gráficos
- **TTL:** Renovação a cada cálculo de métricas

---

## 🔄 **10. PERIODICIDADE DE CÁLCULOS**

### **⏰ Automated Jobs**
- **Tenant Metrics:** Diário às 02:00 UTC
- **Platform Metrics:** Diário às 03:00 UTC  
- **Chart Cache:** Após cada cálculo de métricas
- **Manual Trigger:** Via API `/api/super-admin/trigger-calculation`

### **🎯 Manual Calculations**
```sql
-- FUNÇÃO PRINCIPAL
SELECT * FROM calculate_enhanced_platform_metrics(
    current_date,  -- calculation_date
    30,           -- period_days  
    null          -- tenant_id (null = todos os tenants)
);
```

---

## 📋 **11. VALIDATION RULES**

### **✅ Data Quality Checks**
- **Appointments:** Deve ter `tenant_id` e `user_id`
- **Conversations:** Deve ter `confidence_score` para spam detection
- **Revenue:** Prioridade `final_price` > `quoted_price` > `appointment_data.price`
- **Dates:** Período válido entre 1 e 365 dias

### **🔍 Business Rules Validation**
- **Active Tenants:** Apenas `status = 'active'`
- **Completed Revenue:** Apenas `appointment.status = 'completed'`
- **Valid AI:** Apenas `confidence_score >= 0.7`
- **User Messages:** Apenas `is_from_user = true` para conversas

---

## 🎯 **12. SUCCESS METRICS**

### **✅ Platform KPIs**
- **MRR Target:** R$ 10.000/mês (125+ tenants ativos)
- **Operational Efficiency:** > 30%
- **Spam Rate:** < 15%
- **Cancellation Rate:** < 20%
- **Active Tenants Growth:** > 5%/mês

### **📊 Tenant KPIs**
- **Revenue per Customer:** > R$ 150
- **Conversion Rate:** > 25%
- **No-Show Rate:** < 15%
- **External Ratio:** < 20%
- **Risk Level:** Baixo ou Médio

---

## 🔗 **13. API ENDPOINTS**

### **📊 Super Admin APIs**
- `GET /api/super-admin/kpis` - KPIs da plataforma
- `GET /api/super-admin/charts/revenue-vs-usage-cost` - Scatter plot
- `GET /api/super-admin/insights/distortion` - Análise de distorção
- `GET /api/super-admin/insights/upsell` - Oportunidades upsell
- `POST /api/super-admin/trigger-calculation` - Cálculo manual

### **🏢 Tenant APIs**  
- `GET /api/tenant-platform/participation` - Métricas de participação
- `GET /api/tenant-platform/evolution` - Evolução histórica
- `GET /api/tenant-platform/ranking` - Posição no ranking

---

**📌 NOTA IMPORTANTE:** Estas regras são aplicadas consistentemente em todas as funções de cálculo de métricas e APIs do sistema. Qualquer alteração deve ser validada em ambiente de teste antes da implementação em produção.

**🔄 Última Atualização:** 31/07/2025 - Sistema completamente implementado e validado.