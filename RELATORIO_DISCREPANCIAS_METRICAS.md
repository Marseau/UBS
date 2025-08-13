# RELATÓRIO DE DISCREPÂNCIAS NAS MÉTRICAS
**Data:** 2025-08-01  
**Análise:** Sistema de Métricas UBS/WhatsAppSalon-N8N

## 🚨 DISCREPÂNCIAS CRÍTICAS IDENTIFICADAS

### 1. **DISCREPÂNCIA DE RECEITA TOTAL**
**Problema:** Diferença dramática entre dados reais e metrics calculadas
- **Dados Reais (últimos 30 dias):** R$ 98.793,58
- **Platform Metrics:** R$ 0,00  
- **Tenant Metrics:** R$ 79,90 (todos os tenants têm o mesmo valor)
- **Discrepância:** 100% - Métricas totalmente incorretas

### 2. **DISCREPÂNCIA DE TENANTS ATIVOS**
**Problema:** Contagem inconsistente
- **Dados Reais:** 10 tenants (5 com conversas + 5 só com appointments)
- **Platform Metrics:** 33 tenants ativos
- **Discrepância:** 230% diferença - Dados inflacionados

### 3. **DISCREPÂNCIA DE APPOINTMENTS**
**Problema:** Números não batem
- **Dados Reais:** 1.000 appointments (últimos 30 dias)
- **Platform Metrics:** 1.432 appointments
- **Tenant Metrics:** Soma individual ≈ 899 appointments
- **Discrepância:** Múltiplas versões da verdade

### 4. **DISCREPÂNCIA DE CONVERSAS**
**Problema:** Dados de conversas incorretos
- **Dados Reais:** 222 sessões únicas de conversa
- **Platform Metrics:** 1.432 conversas
- **Discrepância:** 544% inflação - Dados completamente incorretos

### 5. **PROBLEMA DE MINUTOS DE CHAT**
**Problema:** Dados de duration_minutes zerados
- **Dados Reais:** 0 minutos (campo duration_minutes vazio)
- **Platform Metrics:** 3.580 minutos
- **Discrepância:** Dados inventados ou calculados incorretamente

## 📊 ANÁLISE DETALHADA POR TABELA

### **TENANT_METRICS (JSONB Structure)**
```json
{
  "revenue": {
    "participation_pct": 0.26,
    "participation_value": 79.9  // ❌ TODOS OS TENANTS = R$ 79,90
  },
  "customers": {
    "count": 42-62,              // ✅ Varia por tenant
    "participation_pct": 0       // ❌ Sempre 0%
  },
  "appointments": {
    "count": 42-123,             // ✅ Varia por tenant
    "participation_pct": 0       // ❌ Sempre 0%
  },
  "ai_interactions": {
    "count": 0,                  // ❌ Impossível - temos conversas
    "participation_pct": 0
  },
  "business_intelligence": {
    "risk_score": 45,            // ❌ TODOS = 45
    "efficiency_score": 0,       // ❌ TODOS = 0
    "spam_detection_score": 100  // ❌ TODOS = 100
  }
}
```

### **PLATFORM_METRICS**
```sql
Date: 2025-07-31
Period: 30 dias
Total Revenue: R$ 0           -- ❌ DEVERIA SER R$ 98.793,58
Total Appointments: 1432      -- ❌ DEVERIA SER 1.000
Total Customers: 1432        -- ❌ Inconsistente
Active Tenants: 33           -- ❌ DEVERIA SER 10
Platform MRR: R$ 0           -- ❌ DEVERIA SER > 0
Total Chat Minutes: 3580     -- ❌ Campo duration_minutes vazio
Total Conversations: 1432    -- ❌ DEVERIA SER 222
```

### **DADOS REAIS (Validation)**
```sql
-- ÚLTIMOS 30 DIAS (2025-07-02 até 2025-08-01)
Conversation History: 1.000 mensagens
Sessões Únicas: 222
Tenants com Conversas: 5 (beauty/healthcare)
Tenants só Appointments: 5 (legal/education/sports)

Appointments: 1.000 total
Receita Real: R$ 98.793,58
Receita Média: R$ 98,79 por appointment
```

## 🔧 CAUSAS RAIZ IDENTIFICADAS

### 1. **FÓRMULAS DE CÁLCULO INCORRETAS**
- Revenue sendo calculado como valor fixo (R$ 79,90)
- Participation percentages sempre 0%
- Business Intelligence scores padronizados

### 2. **PERÍODO DE DADOS INCONSISTENTE**
- Platform metrics usando dados de períodos diferentes
- Tenant metrics não correspondem aos dados reais do período

### 3. **CAMPOS CALCULADOS vs DADOS REAIS**
- `duration_minutes` está vazio mas platform_metrics mostra 3.580 min
- `total_conversations` inflacionado (1.432 vs 222 real)

### 4. **PROBLEMA DE AGREGAÇÃO**
- Soma dos tenant_metrics não bate com platform_metrics
- Active tenants contando tenants sem atividade

## ✅ PLANO DE CORREÇÃO IMEDIATA

### **FASE 1: Correção de Receita**
```sql
-- Recalcular receita real por tenant e período
UPDATE tenant_metrics 
SET metric_data = jsonb_set(
    metric_data, 
    '{revenue,participation_value}', 
    to_jsonb(REAL_CALCULATED_REVENUE)
)
WHERE period = '30d';
```

### **FASE 2: Correção de Platform Metrics**
```sql
-- Recalcular platform_metrics com dados reais
UPDATE platform_metrics 
SET 
    total_revenue = 98793.58,
    total_appointments = 1000,
    total_conversations = 222,
    active_tenants = 10
WHERE calculation_date = '2025-07-31';
```

### **FASE 3: Correção de Participation Percentages**
```sql
-- Calcular percentuais reais de participação
-- revenue_participation = (tenant_revenue / total_platform_revenue) * 100
-- appointments_participation = (tenant_appointments / total_appointments) * 100
```

### **FASE 4: Correção de Duration Minutes**
```sql
-- Implementar cálculo real de duration_minutes
-- Baseado em timestamps de início/fim de conversa
```

## 🎯 VALIDAÇÃO NECESSÁRIA

1. **Recalcular todas as métricas com dados reais**
2. **Validar fórmulas de participação percentual**
3. **Corrigir contagem de tenants ativos**
4. **Implementar cálculo correto de duration_minutes**
5. **Sincronizar tenant_metrics com platform_metrics**

## 📈 IMPACTO NO BUSINESS

- **Dashboards mostrando dados incorretos**
- **Decisões business baseadas em métricas falsas**
- **Revenue tracking completamente quebrado**
- **Performance analytics inúteis**

---

**PRIORIDADE:** 🔴 CRÍTICA - Correção imediata necessária
**PRÓXIMO PASSO:** Implementar script de correção das métricas