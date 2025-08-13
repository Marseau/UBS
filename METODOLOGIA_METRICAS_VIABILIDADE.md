# 📊 METODOLOGIA E VIABILIDADE DAS MÉTRICAS PROPOSTAS

**Data:** 30 de Julho de 2025  
**Sistema:** Universal Booking System (UBS)  
**Análise:** Metodologia + Disponibilidade de Dados

---

## 📋 **DADOS DISPONÍVEIS NO SISTEMA**

### **📊 Base de Dados Atual:**
- **3.124 agendamentos** (708 completos, 738 cancelados, 773 no-shows)
- **4.560 conversas** (410 geraram agendamentos)
- **16 pagamentos** (R$ 928 de receita total)
- **11 tenants** com dados de pagamento
- **5 tenants** com conversas ativas
- **Período:** Maio-Setembro 2025

---

## 🎯 **ANÁLISE DETALHADA POR MÉTRICA**

### **🔥 CATEGORIA: CRÍTICAS (Implementar Imediatamente)**

---

#### **1. CUSTOMER LIFETIME VALUE (CLV)**

**📊 Metodologia:**
```sql
CLV = (Receita Média por Cliente × Frequência de Compra × Tempo de Relacionamento) - Custo de Aquisição

-- Fórmula específica para UBS:
CLV = (Ticket Médio por Agendamento × Agendamentos por Mês × Tempo de Retenção em Meses)
```

**🔍 Implementação Técnica:**
```sql
WITH customer_metrics AS (
  SELECT 
    a.tenant_id,
    a.user_id,
    COUNT(*) as total_appointments,
    AVG(a.final_price) as avg_appointment_value,
    EXTRACT(EPOCH FROM (MAX(a.start_time) - MIN(a.start_time))) / (60*60*24*30) as lifetime_months,
    MIN(a.start_time) as first_appointment,
    MAX(a.start_time) as last_appointment
  FROM appointments a 
  WHERE a.status = 'completed'
  GROUP BY a.tenant_id, a.user_id
)
SELECT 
  tenant_id,
  user_id,
  (avg_appointment_value * (total_appointments / GREATEST(lifetime_months, 1))) * 
  GREATEST(lifetime_months, 1) as clv_estimate
FROM customer_metrics;
```

**✅ VIABILIDADE: ALTA**
- **Dados Disponíveis:** ✅ appointments (final_price, start_time, user_id)
- **Qualidade dos Dados:** ✅ 3.124 agendamentos com pricing
- **Período de Análise:** ✅ 4+ meses de histórico
- **Implementação:** 1-2 dias

**⚠️ Limitações:**
- Período ainda curto para CLV preciso (ideal: 12+ meses)
- Necessita tracking de churn para precisão

---

#### **2. CHURN RATE**

**📊 Metodologia:**
```sql
Churn Rate = (Clientes Perdidos no Período / Total de Clientes Ativos no Início do Período) × 100

-- Para SaaS/Subscription:
Tenant Churn Rate = (Tenants Cancelados no Mês / Tenants Ativos no Início do Mês) × 100
```

**🔍 Implementação Técnica:**
```sql
WITH monthly_tenant_status AS (
  SELECT 
    DATE_TRUNC('month', payment_date) as month,
    tenant_id,
    COUNT(*) as payments_in_month,
    MAX(payment_date) as last_payment
  FROM subscription_payments 
  WHERE payment_status = 'completed'
  GROUP BY 1, 2
),
churn_analysis AS (
  SELECT 
    month,
    COUNT(DISTINCT tenant_id) as active_tenants,
    COUNT(DISTINCT tenant_id) - 
      LAG(COUNT(DISTINCT tenant_id)) OVER (ORDER BY month) as churn_count
  FROM monthly_tenant_status
  GROUP BY month
)
SELECT 
  month,
  active_tenants,
  COALESCE(ABS(churn_count), 0) as churned_tenants,
  CASE 
    WHEN LAG(active_tenants) OVER (ORDER BY month) > 0 
    THEN (COALESCE(ABS(churn_count), 0) * 100.0) / LAG(active_tenants) OVER (ORDER BY month)
    ELSE 0 
  END as churn_rate_pct
FROM churn_analysis;
```

**⚠️ VIABILIDADE: MÉDIA**
- **Dados Disponíveis:** ⚠️ subscription_payments (apenas 2 meses)
- **Qualidade dos Dados:** ⚠️ Volume baixo (16 pagamentos)
- **Período de Análise:** ❌ Insuficiente (precisa 3+ meses)
- **Implementação:** 2-3 dias

**📝 Recomendação:**
- Implementar tracking mas aguardar mais dados
- Usar subscription_status do Stripe como complemento

---

#### **3. RECEITA POR CLIENTE**

**📊 Metodologia:**
```sql
Receita por Cliente = Receita Total do Período / Número de Clientes Únicos no Período

-- Detalhada por tenant:
RPC = SUM(final_price WHERE status='completed') / COUNT(DISTINCT user_id)
```

**🔍 Implementação Técnica:**
```sql
SELECT 
  a.tenant_id,
  t.business_name,
  COUNT(DISTINCT a.user_id) as unique_customers,
  COUNT(*) as total_appointments,
  SUM(CASE WHEN a.status = 'completed' THEN a.final_price ELSE 0 END) as total_revenue,
  AVG(CASE WHEN a.status = 'completed' THEN a.final_price END) as avg_appointment_value,
  SUM(CASE WHEN a.status = 'completed' THEN a.final_price ELSE 0 END) / 
    NULLIF(COUNT(DISTINCT a.user_id), 0) as revenue_per_customer
FROM appointments a
JOIN tenants t ON a.tenant_id = t.id
WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.tenant_id, t.business_name;
```

**✅ VIABILIDADE: MUITO ALTA**
- **Dados Disponíveis:** ✅ appointments (final_price, user_id, status)
- **Qualidade dos Dados:** ✅ 708 agendamentos completados com pricing
- **Período de Análise:** ✅ Dados suficientes
- **Implementação:** 1 dia

---

#### **4. TAXA DE CONVERSÃO (Conversa → Agendamento)**

**📊 Metodologia:**
```sql
Taxa de Conversão = (Conversas que Geraram Agendamento / Total de Conversas) × 100

-- Considerando apenas conversas com intenção de agendamento:
Conversão Qualificada = (appointment_created / (appointment_created + booking_abandoned)) × 100
```

**🔍 Implementação Técnica:**
```sql
WITH conversation_outcomes AS (
  SELECT 
    tenant_id,
    conversation_context->>'session_id' as session_id,
    MAX(CASE WHEN conversation_outcome = 'appointment_created' THEN 1 ELSE 0 END) as converted,
    COUNT(*) as messages_in_session
  FROM conversation_history 
  WHERE conversation_context->>'session_id' IS NOT NULL
  GROUP BY tenant_id, conversation_context->>'session_id'
)
SELECT 
  co.tenant_id,
  t.business_name,
  COUNT(*) as total_conversations,
  SUM(co.converted) as appointments_created,
  (SUM(co.converted) * 100.0 / COUNT(*)) as conversion_rate_pct,
  AVG(co.messages_in_session) as avg_messages_per_conversation
FROM conversation_outcomes co
JOIN tenants t ON co.tenant_id = t.id
GROUP BY co.tenant_id, t.business_name;
```

**✅ VIABILIDADE: MUITO ALTA**
- **Dados Disponíveis:** ✅ conversation_history (conversation_outcome, session_id)
- **Qualidade dos Dados:** ✅ 410 conversas com outcome 'appointment_created'
- **Período de Análise:** ✅ 4.560 conversas para análise
- **Implementação:** 1 dia

---

#### **5. MONTHLY GROWTH RATE (MRR)**

**📊 Metodologia:**
```sql
Growth Rate = ((MRR Atual - MRR Anterior) / MRR Anterior) × 100

-- Incluindo new MRR, expansion MRR, contraction MRR, churned MRR:
Net MRR Growth = New MRR + Expansion MRR - Contraction MRR - Churned MRR
```

**🔍 Implementação Técnica:**
```sql
WITH monthly_mrr AS (
  SELECT 
    DATE_TRUNC('month', payment_date) as month,
    SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END) as mrr
  FROM subscription_payments
  GROUP BY DATE_TRUNC('month', payment_date)
)
SELECT 
  month,
  mrr,
  LAG(mrr) OVER (ORDER BY month) as previous_mrr,
  CASE 
    WHEN LAG(mrr) OVER (ORDER BY month) > 0 
    THEN ((mrr - LAG(mrr) OVER (ORDER BY month)) * 100.0) / LAG(mrr) OVER (ORDER BY month)
    ELSE 0 
  END as growth_rate_pct
FROM monthly_mrr
ORDER BY month;
```

**⚠️ VIABILIDADE: MÉDIA**
- **Dados Disponíveis:** ⚠️ subscription_payments (limitado)
- **Qualidade dos Dados:** ⚠️ Apenas 2 meses de dados
- **Período de Análise:** ❌ Insuficiente para tendência
- **Implementação:** 1-2 dias

**📝 Recomendação:**
- Implementar mas esperar mais períodos para análise confiável

---

### **⚡ CATEGORIA: ALTO IMPACTO**

---

#### **6. TAXA DE NO-SHOW**

**📊 Metodologia:**
```sql
No-Show Rate = (Agendamentos No-Show / Total de Agendamentos Confirmados) × 100
```

**🔍 Implementação Técnica:**
```sql
SELECT 
  a.tenant_id,
  t.business_name,
  COUNT(*) as total_appointments,
  COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_shows,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed,
  (COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) * 100.0 / COUNT(*)) as no_show_rate_pct
FROM appointments a
JOIN tenants t ON a.tenant_id = t.id
WHERE a.start_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.tenant_id, t.business_name;
```

**✅ VIABILIDADE: MUITO ALTA**
- **Dados Disponíveis:** ✅ appointments (status = 'no_show')
- **Qualidade dos Dados:** ✅ 773 no-shows identificados
- **Implementação:** 1 dia

---

#### **7. LTV/CAC RATIO**

**📊 Metodologia:**
```sql
LTV/CAC Ratio = Customer Lifetime Value / Customer Acquisition Cost

-- Benchmark: 3:1 (mínimo), 5:1 (bom), 7:1+ (excelente)
```

**🔍 Implementação Técnica:**
```sql
-- Requer implementação de CAC tracking primeiro
WITH cac_calculation AS (
  -- CAC = Marketing Spend / New Customers Acquired
  -- Para simplificar, usar custo médio por tenant
  SELECT 
    tenant_id,
    100.00 as estimated_cac -- Placeholder - requer dados de marketing
),
ltv_calculation AS (
  -- Usar CLV calculado anteriormente
  SELECT tenant_id, avg_clv FROM customer_lifetime_values
)
SELECT 
  l.tenant_id,
  l.avg_clv as ltv,
  c.estimated_cac as cac,
  l.avg_clv / c.estimated_cac as ltv_cac_ratio
FROM ltv_calculation l
JOIN cac_calculation c ON l.tenant_id = c.tenant_id;
```

**❌ VIABILIDADE: BAIXA**
- **Dados Disponíveis:** ❌ Não temos dados de Customer Acquisition Cost
- **LTV:** ✅ Pode ser calculado com dados existentes
- **CAC:** ❌ Requer tracking de marketing/vendas
- **Implementação:** 1-2 semanas (requer novos dados)

**📝 Recomendação:**
- Implementar tracking de CAC primeiro
- Usar estimativas baseadas em benchmarks inicialmente

---

#### **8. MARGEM POR SERVIÇO**

**📊 Metodologia:**
```sql
Margem por Serviço = ((Receita do Serviço - Custos do Serviço) / Receita do Serviço) × 100

-- Custos incluem: tempo do profissional, materiais, overhead
```

**🔍 Implementação Técnica:**
```sql
-- Requer dados de custos que não existem atualmente
SELECT 
  a.service_id,
  s.name as service_name,
  COUNT(*) as appointments_count,
  AVG(a.final_price) as avg_revenue,
  -- Custos precisam ser definidos
  0 as estimated_cost, -- Placeholder
  AVG(a.final_price) - 0 as avg_profit,
  ((AVG(a.final_price) - 0) / NULLIF(AVG(a.final_price), 0)) * 100 as margin_pct
FROM appointments a
LEFT JOIN services s ON a.service_id = s.id
WHERE a.status = 'completed'
GROUP BY a.service_id, s.name;
```

**⚠️ VIABILIDADE: MÉDIA**
- **Dados de Receita:** ✅ final_price por appointment
- **Dados de Custo:** ❌ Não existem na base atual
- **Implementação:** 1-2 semanas (requer definição de custos)

**📝 Recomendação:**
- Começar com margem bruta (sem custos detalhados)
- Implementar tracking de custos gradualmente

---

#### **9. TRIAL CONVERSION RATE**

**📊 Metodologia:**
```sql
Trial Conversion = (Tenants que Viraram Pagantes / Total de Trials Iniciados) × 100
```

**🔍 Implementação Técnica:**
```sql
WITH trial_analysis AS (
  SELECT 
    tenant_id,
    MIN(CASE WHEN subscription_plan = 'free' THEN payment_date END) as trial_start,
    MIN(CASE WHEN subscription_plan != 'free' THEN payment_date END) as paid_start,
    CASE 
      WHEN MIN(CASE WHEN subscription_plan != 'free' THEN payment_date END) IS NOT NULL 
      THEN 1 ELSE 0 
    END as converted
  FROM subscription_payments
  GROUP BY tenant_id
)
SELECT 
  COUNT(*) as total_trials,
  SUM(converted) as successful_conversions,
  (SUM(converted) * 100.0 / COUNT(*)) as trial_conversion_rate_pct,
  AVG(CASE WHEN converted = 1 THEN paid_start - trial_start END) as avg_trial_duration
FROM trial_analysis
WHERE trial_start IS NOT NULL;
```

**✅ VIABILIDADE: ALTA**
- **Dados Disponíveis:** ✅ subscription_payments (subscription_plan)
- **Trial Period:** ✅ Implementado (15 dias)
- **Conversões:** ✅ Dados de upgrade disponíveis
- **Implementação:** 1-2 dias

---

#### **10. REVENUE FORECAST**

**📊 Metodologia:**
```sql
-- Modelo simples de forecast linear:
Revenue Forecast = Current MRR × (1 + Growth Rate)^n

-- Modelo mais complexo com sazonalidade:
Forecast = Trend + Seasonal + Cyclical Components
```

**🔍 Implementação Técnica:**
```sql
WITH historical_revenue AS (
  SELECT 
    DATE_TRUNC('month', payment_date) as month,
    SUM(amount) as monthly_revenue
  FROM subscription_payments 
  WHERE payment_status = 'completed'
  GROUP BY DATE_TRUNC('month', payment_date)
),
growth_calculation AS (
  SELECT 
    month,
    monthly_revenue,
    LAG(monthly_revenue) OVER (ORDER BY month) as prev_revenue,
    (monthly_revenue - LAG(monthly_revenue) OVER (ORDER BY month)) / 
      NULLIF(LAG(monthly_revenue) OVER (ORDER BY month), 0) as growth_rate
  FROM historical_revenue
),
forecast AS (
  SELECT 
    CURRENT_DATE + INTERVAL '1 month' * generate_series(1, 6) as forecast_month,
    (SELECT AVG(growth_rate) FROM growth_calculation WHERE growth_rate IS NOT NULL) as avg_growth,
    (SELECT monthly_revenue FROM historical_revenue ORDER BY month DESC LIMIT 1) as current_mrr
)
SELECT 
  forecast_month,
  current_mrr * POWER(1 + COALESCE(avg_growth, 0), 
    EXTRACT(MONTH FROM forecast_month - CURRENT_DATE)) as forecasted_revenue
FROM forecast;
```

**⚠️ VIABILIDADE: BAIXA**
- **Dados Históricos:** ❌ Apenas 2 meses (mínimo 6-12 para forecast confiável)
- **Sazonalidade:** ❌ Período insuficiente para detectar padrões
- **Growth Rate:** ⚠️ Calculável mas pouco confiável
- **Implementação:** 2-3 dias (mas com baixa precisão)

**📝 Recomendação:**
- Aguardar mais dados históricos
- Implementar forecast simples inicialmente

---

## 📊 **RESUMO DE VIABILIDADE**

### **✅ IMPLEMENTAÇÃO IMEDIATA (Dados Suficientes)**

| Métrica | Viabilidade | Implementação | Valor |
|---------|-------------|---------------|--------|
| **Receita por Cliente** | 🟢 Muito Alta | 1 dia | 🔥🔥🔥🔥🔥 |
| **Taxa de Conversão** | 🟢 Muito Alta | 1 dia | 🔥🔥🔥🔥🔥 |
| **Taxa de No-Show** | 🟢 Muito Alta | 1 dia | 🔥🔥🔥🔥 |
| **Customer Lifetime Value** | 🟢 Alta | 1-2 dias | 🔥🔥🔥🔥🔥 |
| **Trial Conversion Rate** | 🟢 Alta | 1-2 dias | 🔥🔥🔥🔥 |

### **⚠️ IMPLEMENTAÇÃO PARCIAL (Dados Limitados)**

| Métrica | Limitação | Solução | Prazo |
|---------|-----------|---------|--------|
| **Churn Rate** | Apenas 2 meses de dados | Aguardar + usar Stripe data | 1 mês |
| **Monthly Growth Rate** | Volume baixo | Complementar com projeções | 2 semanas |
| **Margem por Serviço** | Sem dados de custos | Definir estrutura de custos | 2-4 semanas |

### **❌ IMPLEMENTAÇÃO FUTURA (Requer Novos Dados)**

| Métrica | Dados Necessários | Implementação | Prazo |
|---------|-------------------|---------------|--------|
| **LTV/CAC Ratio** | Customer Acquisition Cost | Tracking de marketing | 4-6 semanas |
| **Revenue Forecast** | 6+ meses de histórico | Aguardar dados | 3-6 meses |

---

## 🚀 **PLANO DE IMPLEMENTAÇÃO RECOMENDADO**

### **📅 Semana 1-2: Quick Wins**
1. **Receita por Cliente** - Implementação completa
2. **Taxa de Conversão** - Dashboard em tempo real  
3. **Taxa de No-Show** - Alertas automáticos
4. **CLV Básico** - Versão inicial

### **📅 Semana 3-4: Métricas Avançadas**
1. **Trial Conversion Rate** - Tracking completo
2. **Churn Rate** - Versão inicial com alertas
3. **Monthly Growth Rate** - Projeções básicas

### **📅 Mês 2-3: Expansão**
1. **Margem por Serviço** - Definir custos e implementar
2. **LTV/CAC Ratio** - Implementar tracking de CAC
3. **Revenue Forecast** - Modelo preditivo básico

---

## 🎯 **CONCLUSÃO**

**Status:** **60% das métricas críticas** podem ser implementadas imediatamente com os dados existentes.

**Recomendação:** Focar nas **5 métricas com viabilidade alta** para criar valor imediato, enquanto se coleta dados para as métricas mais avançadas.

**ROI Esperado:** Implementação das métricas viáveis pode gerar **15-25% de melhoria na performance** dos tenants em 30-60 dias.