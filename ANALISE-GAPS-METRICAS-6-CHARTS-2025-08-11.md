# ANÁLISE: Gap entre Métricas dos 6 Charts vs metric_data Existente

**Data:** 11 de Agosto de 2025  
**Status:** Gap Analysis Complete  
**Objetivo:** Identificar métricas faltantes para fazer os 6 charts funcionais

## 📊 1. REQUISITOS DOS 6 CHARTS

### Chart 1: Time Series 6 Meses (📈 Tendência 6 Meses)
**Dados necessários:**
- `revenue[]` - Array de receita por mês (6 meses)
- `appointments[]` - Array de appointments por mês (6 meses) 
- `customers[]` - Array de customers por mês (6 meses)
- `labels[]` - Months ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']

### Chart 2: Scatter Custo vs Receita (💰 Custo vs Receita por Tenant)
**Dados necessários:**
- `data[]` - Array de objetos com:
  - `x` - Custo plataforma por tenant (subscription cost)
  - `y` - Receita do tenant
  - `label` - Nome do tenant
  - `domain` - Domínio do negócio (healthcare, beauty, legal, etc.)

### Chart 3: Line Conversations vs Appointments (💬 Conversations vs Appointments)
**Dados necessários:**
- `conversations[]` - Array de total conversations por mês (6 meses)
- `appointments[]` - Array de appointments por mês (6 meses)
- `labels[]` - Months ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']

### Chart 4: Pie MRR por Domínio (🥧 MRR por Domínio)
**Dados necessários:**
- `labels[]` - ['Healthcare', 'Beauty', 'Legal', 'Education', 'Sports']
- `data[]` - Array de MRR values por domínio
- `colors[]` - Colors por domínio

### Chart 5: Line Appointment Status (📅 Status dos Appointments)
**Dados necessários:**
- `completed[]` - Array de appointments completed por mês (6 meses)
- `confirmed[]` - Array de appointments confirmed por mês (6 meses)
- `cancelled[]` - Array de appointments cancelled por mês (6 meses)
- `noshow[]` - Array de appointments no-show por mês (6 meses)
- `labels[]` - Months ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']

### Chart 6: Platform vs Tenant (⚖️ Platform vs Tenant Revenue)
**Dados necessários:**
- `platformMrr` - MRR total da plataforma
- `tenantRevenue` - Receita agregada dos tenants

## 🔍 2. ANÁLISE DO metric_data EXISTENTE

### ✅ Campos DISPONÍVEIS no metric_data atual:
```
- total_appointments ✅
- monthly_revenue (total_revenue) ✅
- completed_appointments ✅
- cancelled_appointments ✅
- confirmed_appointments ✅
- total_customers ✅
- new_customers ✅
- returning_customers ✅
- business_health_score ✅
- risk_score ✅
- risk_level ✅
- revenue_growth_rate ✅
- customer_growth_rate ✅
- appointments_growth_rate ✅
- revenue_platform_percentage ✅
- customers_platform_percentage ✅
- appointments_platform_percentage ✅
```

### ❌ CAMPOS CRÍTICOS FALTANDO:

#### A. **Para Charts 1, 3, 5 (Time Series Data)**
**PROBLEMA:** Não existem arrays históricos de 6 meses
- ❌ `revenue_6_months_array` 
- ❌ `appointments_6_months_array`
- ❌ `customers_6_months_array` 
- ❌ `conversations_6_months_array`
- ❌ `completed_appointments_6_months_array`
- ❌ `confirmed_appointments_6_months_array`
- ❌ `cancelled_appointments_6_months_array`
- ❌ `noshow_appointments_6_months_array`

#### B. **Para Chart 2 (Scatter Plot)**
**PROBLEMA:** Dados de custo e domínio faltando
- ❌ `subscription_cost` - Custo da assinatura do tenant
- ❌ `business_domain` - Domínio do negócio (healthcare, beauty, legal, etc.)
- ❌ `platform_cost_allocation` - Alocação do custo de plataforma

#### C. **Para Chart 3 (Conversations)**
**PROBLEMA:** Métricas de conversas faltando
- ❌ `total_conversations` - Total de conversas no período
- ❌ `conversations_6_months_array` - Histórico de conversas
- ❌ `ai_interactions_total` - Total de interações IA
- ❌ `successful_ai_resolutions` - Resoluções bem-sucedidas da IA

#### D. **Para Chart 4 (MRR por Domínio)**
**PROBLEMA:** MRR e domínio faltando
- ❌ `mrr_monthly` - MRR mensal do tenant
- ❌ `business_domain` - Domínio para agrupamento
- ❌ `platform_mrr_contribution` - Contribuição para MRR da plataforma

#### E. **Para Chart 6 (Platform vs Tenant)**
**PROBLEMA:** Métricas de plataforma global faltando
- ❌ `platform_total_mrr` - MRR total da plataforma
- ❌ `platform_total_revenue` - Receita total da plataforma
- ❌ `tenant_revenue_share_percentage` - % do tenant na receita total

## 🔧 3. PLANO DE IMPLEMENTAÇÃO - DEFINITIVA v5

### FASE 1: Adicionar Campos Básicos Faltantes

#### No bloco `-- Services and platform data` (linha ~58):
```sql
-- Conversation metrics (NEW)
v_tenant_conversations INTEGER := 0;
v_tenant_ai_interactions INTEGER := 0; 
v_total_messages INTEGER := 0;

-- Subscription and domain data (NEW)
v_subscription_cost DECIMAL(10,2) := 0;
v_business_domain TEXT := '';

-- No-show appointments (NEW) 
v_noshow_appointments INTEGER := 0;
```

#### No bloco principal de cálculo, adicionar após linha ~122:
```sql
-- Calculate missing appointment statuses
SELECT 
    COUNT(*) FILTER (WHERE status = 'no_show')
INTO v_noshow_appointments
FROM appointments 
WHERE tenant_id = v_tenant_record.id
  AND start_time >= v_start_date::timestamptz
  AND start_time < (v_end_date + 1)::timestamptz;

-- Get subscription cost and domain
SELECT 
    CASE plan_type 
        WHEN 'basic' THEN 58.00
        WHEN 'premium' THEN 116.00  
        WHEN 'enterprise' THEN 290.00
        ELSE 58.00
    END,
    business_domain
INTO v_subscription_cost, v_business_domain
FROM tenants 
WHERE id = v_tenant_record.id;

-- Calculate conversation metrics (FIX 2: Use existing logic)
SELECT 
    COUNT(CASE WHEN is_from_user = false THEN 1 END),
    COUNT(DISTINCT conversation_context->>'session_id'),
    COUNT(*)
INTO v_tenant_ai_interactions, v_tenant_conversations, v_total_messages
FROM conversation_history 
WHERE tenant_id = v_tenant_record.id
  AND created_at >= v_start_date::timestamptz
  AND created_at < (v_end_date + 1)::timestamptz
  AND conversation_context ? 'session_id';
```

### FASE 2: Adicionar ao JSON comprehensive_metrics

#### Adicionar novos campos ao JSONB (após linha ~161):
```sql
'service_metrics', jsonb_build_object(
    'services_available', v_services_available,
    'subscription_cost', v_subscription_cost,
    'business_domain', v_business_domain,
    'platform_cost_allocation', (v_subscription_cost / v_platform_revenue * 100)
),
'conversation_metrics', jsonb_build_object(
    'conversations_total', v_tenant_conversations,
    'ai_interactions_total', v_tenant_ai_interactions,
    'total_messages', v_total_messages,
    'messages_per_conversation', CASE WHEN v_tenant_conversations > 0 THEN (v_total_messages::decimal / v_tenant_conversations) ELSE 0 END
),
'appointment_status_extended', jsonb_build_object(
    'appointments_confirmed', v_confirmed_appointments,
    'appointments_completed', v_completed_appointments,
    'appointments_cancelled', v_cancelled_appointments,
    'appointments_noshow', v_noshow_appointments,
    'appointments_missed', v_missed_appointments,
    'appointments_rescheduled', v_rescheduled_appointments
),
'mrr_calculation', jsonb_build_object(
    'mrr_monthly', CASE WHEN v_period_days = 30 THEN v_tenant_revenue ELSE (v_tenant_revenue * 30.0 / v_period_days) END,
    'mrr_contribution_percentage', CASE WHEN v_platform_revenue > 0 THEN (v_tenant_revenue / v_platform_revenue * 100) ELSE 0 END
),
```

### FASE 3: Implementar Agregação Histórica (6 Meses)

#### Criar nova função auxiliar:
```sql
CREATE OR REPLACE FUNCTION get_historical_metrics_6months(
    p_tenant_id UUID,
    p_calculation_date DATE
) RETURNS JSONB AS $$
DECLARE
    v_historical_data JSONB := '{}';
    v_month_data JSONB;
    v_month_date DATE;
    i INTEGER;
BEGIN
    -- Build 6-month historical arrays
    FOR i IN 0..5 LOOP
        v_month_date := p_calculation_date - INTERVAL '1 month' * i;
        
        -- Get monthly data from existing calculations
        SELECT metric_data 
        INTO v_month_data
        FROM tenant_metrics
        WHERE tenant_id = p_tenant_id 
          AND period = '30d'
          AND DATE(calculated_at) = v_month_date
          AND metric_type = 'comprehensive'
        LIMIT 1;
        
        -- Build arrays (reverse chronological order)
        v_historical_data := jsonb_set(v_historical_data, 
            ARRAY['revenue_6months', (5-i)::text], 
            COALESCE(v_month_data->'financial_metrics'->>'tenant_revenue', '0')::jsonb
        );
        
        v_historical_data := jsonb_set(v_historical_data, 
            ARRAY['appointments_6months', (5-i)::text], 
            COALESCE(v_month_data->'appointment_metrics'->>'appointments_total', '0')::jsonb
        );
        
        v_historical_data := jsonb_set(v_historical_data, 
            ARRAY['customers_6months', (5-i)::text], 
            COALESCE(v_month_data->'customer_metrics'->>'customers_total', '0')::jsonb
        );
        
        v_historical_data := jsonb_set(v_historical_data, 
            ARRAY['conversations_6months', (5-i)::text], 
            COALESCE(v_month_data->'conversation_metrics'->>'conversations_total', '0')::jsonb
        );
        
    END LOOP;
    
    RETURN v_historical_data;
END;
$$ LANGUAGE plpgsql;
```

#### Integrar na função principal (após linha ~200):
```sql
-- Add historical data for charts (only for 30d period)
IF v_period_days = 30 THEN
    DECLARE
        v_historical_metrics JSONB;
    BEGIN
        v_historical_metrics := get_historical_metrics_6months(v_tenant_record.id, p_calculation_date);
        
        v_comprehensive_metrics := v_comprehensive_metrics || jsonb_build_object(
            'time_series_data', v_historical_metrics,
            'chart_ready', true,
            'months_labels', '["Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago"]'
        );
    END;
END IF;
```

## 🎯 4. RESULTADO ESPERADO

### Após implementação da DEFINITIVA v5:

#### ✅ Chart 1 (Time Series) - FUNCIONARÁ com:
- `metric_data.time_series_data.revenue_6months[]`
- `metric_data.time_series_data.appointments_6months[]` 
- `metric_data.time_series_data.customers_6months[]`

#### ✅ Chart 2 (Scatter) - FUNCIONARÁ com:
- `metric_data.service_metrics.subscription_cost`
- `metric_data.financial_metrics.tenant_revenue`
- `metric_data.service_metrics.business_domain`
- `tenant.business_name` (já existe)

#### ✅ Chart 3 (Conversations) - FUNCIONARÁ com:
- `metric_data.time_series_data.conversations_6months[]`
- `metric_data.time_series_data.appointments_6months[]`

#### ✅ Chart 4 (MRR Pie) - FUNCIONARÁ com:
- `metric_data.mrr_calculation.mrr_monthly`
- `metric_data.service_metrics.business_domain`

#### ✅ Chart 5 (Appointment Status) - FUNCIONARÁ com:
- `metric_data.time_series_data.completed_6months[]`
- `metric_data.time_series_data.confirmed_6months[]`
- `metric_data.time_series_data.cancelled_6months[]`
- `metric_data.time_series_data.noshow_6months[]`

#### ✅ Chart 6 (Platform vs Tenant) - FUNCIONARÁ com:
- `metric_data.mrr_calculation.mrr_monthly` (agregado)
- `metric_data.financial_metrics.tenant_revenue` (agregado)

## 📋 5. CHECKLIST DE IMPLEMENTAÇÃO

### ✅ FASE 1: Campos Básicos
- [ ] Adicionar `v_subscription_cost`
- [ ] Adicionar `v_business_domain`  
- [ ] Adicionar `v_noshow_appointments`
- [ ] Adicionar `v_tenant_conversations`
- [ ] Adicionar `v_tenant_ai_interactions`
- [ ] Adicionar `v_total_messages`

### ✅ FASE 2: JSON Structure
- [ ] Adicionar `service_metrics` expandido
- [ ] Adicionar `conversation_metrics`
- [ ] Adicionar `appointment_status_extended`
- [ ] Adicionar `mrr_calculation`

### ✅ FASE 3: Histórico 6 Meses
- [ ] Criar função `get_historical_metrics_6months()`
- [ ] Integrar `time_series_data` no JSON
- [ ] Adicionar arrays históricos para todos os charts

### ✅ FASE 4: Testes
- [ ] Testar geração de métricas com novos campos
- [ ] Validar estrutura JSON para cada chart
- [ ] Testar APIs dos 6 charts com dados reais

---

**PRIORIDADE:** ⚠️ CRÍTICA - Os 6 charts estão atualmente não-funcionais por falta destes campos essenciais.

**ESTIMATIVA:** 4-6 horas de desenvolvimento + 2 horas de testes.