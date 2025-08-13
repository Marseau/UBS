# 📊 MAPEAMENTO COMPLETO DAS PROCEDURES DO SISTEMA

## 🎯 OVERVIEW GERAL

O sistema possui **2 tipos de métricas** principais:
- **TENANT METRICS**: Dados individuais por tenant
- **PLATFORM METRICS**: Dados agregados de todos os tenants

---

## 🔥 PROCEDURES PRINCIPAIS ATIVAS

### 1. **TENANT METRICS** - Dados Individuais

#### 📁 Arquivo: `database/DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql`
- **Função**: `calculate_tenant_metrics_definitiva_total_fixed_v5(date, uuid)`
- **Tabela destino**: `tenant_metrics`
- **Períodos**: 7d, 30d, 90d
- **Tipo**: Individual por tenant
- **Status**: ✅ **ATIVA** - Usada pelo sistema de cron otimizado
- **Métricas**: 73+ métricas em 8 módulos JSONB

**Módulos incluídos:**
- `financial_metrics` - Receita, margem, ROI
- `appointment_metrics` - Agendamentos por status
- `customer_metrics` - Clientes novos/retorno
- `conversation_outcomes` - Resultados das conversas
- `service_metrics` - Serviços utilizados  
- `ai_metrics` - Performance da IA
- `tenant_outcomes` - Health score, risco
- `historical_metrics` - Tendências temporais
- `platform_participation` - % de participação
- `cost_breakdown` - Custos detalhados

### 2. **PLATFORM METRICS** - Dados Agregados

#### 📁 Arquivo: `database/platform-metrics-aggregation-procedure.sql`
- **Função**: `aggregate_platform_metrics_from_tenants(date, text)`
- **Tabela destino**: `platform_metrics`
- **Períodos**: 7d, 30d, 90d
- **Tipo**: Agregação de todos os tenants
- **Status**: ✅ **ATIVA** - Usada após o cálculo de tenant metrics
- **Fonte**: Agrega dados da tabela `tenant_metrics`

**Funções auxiliares:**
- `aggregate_platform_metrics_all_periods()` - Todos os períodos
- `aggregate_platform_metrics_today('30d')` - Período específico hoje

---

## 🗂️ PROCEDURES SECUNDÁRIAS/LEGADAS

### 3. **ALTERNATIVAS/BACKUP**

#### 📁 Arquivo: `database/unified-tenant-metrics-function.sql`
- **Função**: `calculate_tenant_metrics_unified(date, integer, uuid)`
- **Status**: 🟡 **BACKUP** - Procedure alternativa
- **Uso**: Fallback caso a DEFINITIVA falhe

#### 📁 Arquivo: `database/platform-metrics-unified-schema.sql`
- **Função**: `aggregate_platform_metrics_unified(date, text)`
- **Status**: 🟡 **BACKUP** - Aggregação alternativa

#### 📁 Arquivo: `database/consolidate-tenant-platform-system.sql`
- **Função**: `calculate_tenant_platform_metrics_consolidated()`
- **Status**: 🟡 **EXPERIMENTAL** - Sistema consolidado

---

## 🚀 SERVICES TYPESCRIPT QUE EXECUTAM AS PROCEDURES

### 1. **Cron Service Principal**
📁 `src/services/tenant-metrics-cron-optimized.service.ts`
- Executa `DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql` para todos os tenants
- Depois executa `aggregate_platform_metrics_from_tenants()` para agregar
- Performance: 25x mais rápido, suporte 10k+ tenants
- **Status**: ✅ **ATIVO**

### 2. **Platform Aggregation Service**
📁 `src/services/tenant-metrics/platform-aggregation-optimized.service.ts`
- Classe: `PlatformAggregationOptimizedService`
- Método: `aggregatePlatformMetrics(period, forceRecalculation)`
- Cache Redis: 30min TTL
- **Status**: ✅ **ATIVO**

---

## 📋 FLUXO DE EXECUÇÃO ATUAL

```
1. CRON DIÁRIO (3:00 AM)
   ↓
2. tenant-metrics-cron-optimized.service.ts
   ↓
3. calculate_tenant_metrics_definitiva_total_fixed_v5() 
   → Popula tenant_metrics (individual)
   ↓
4. aggregate_platform_metrics_from_tenants()
   → Popula platform_metrics (agregado)
   ↓
5. Cache Redis atualizado
```

---

## 🎯 ONDE ADICIONAR MÉTRICAS DE AI COSTS

### ✅ Para métricas INDIVIDUAIS por tenant:
**Arquivo**: `database/DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql`
- Adicionar variáveis AI costs
- Adicionar queries para `ai_usage_logs` 
- Adicionar cálculos
- Adicionar seção `ai_costs_metrics` no JSONB

### ✅ Para métricas AGREGADAS da plataforma:
**Arquivo**: `database/platform-metrics-aggregation-procedure.sql`
- Agregar custos totais de IA
- Calcular médias ponderadas
- Adicionar ao JSONB platform final

---

## 📊 ESTRUTURA DAS TABELAS

### `tenant_metrics`
```sql
- tenant_id (UUID)
- metric_type ('comprehensive', 'risk_assessment', 'participation')
- metric_data (JSONB) - 73+ métricas organizadas em módulos
- period ('7d', '30d', '90d')
- calculated_at (timestamp)
```

### `platform_metrics`
```sql  
- platform_id ('PLATFORM')
- metric_data (JSONB) - Agregações de todos os tenants
- period ('7d', '30d', '90d')
- calculation_date (date)
- created_at (timestamp)
```

### `ai_usage_logs` (NOVA - Para AI Costs)
```sql
- tenant_id, conversation_id
- model, request_type
- prompt_tokens, completion_tokens, total_tokens
- prompt_cost_usd, completion_cost_usd, total_cost_usd  
- created_at
```

---

## 🔧 COMANDOS DE EXECUÇÃO

### Tenant Metrics
```sql
-- Todos os tenants, períodos padrão
SELECT calculate_tenant_metrics_definitiva_total_fixed_v5();

-- Tenant específico
SELECT calculate_tenant_metrics_definitiva_total_fixed_v5(CURRENT_DATE, 'tenant-uuid');
```

### Platform Metrics  
```sql
-- Todos os períodos
SELECT aggregate_platform_metrics_all_periods();

-- Período específico
SELECT aggregate_platform_metrics_today('30d');
```

---

## 🚨 IMPORTANTE - REGRAS

1. **NUNCA assumir** qual procedure usar - sempre consultar este documento
2. **AI Costs** devem ser adicionadas em AMBAS as procedures:
   - Individual: `DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql`  
   - Agregada: `platform-metrics-aggregation-procedure.sql`
3. **Sempre testar** após modificações
4. **Manter versionamento** das procedures modificadas
5. **Documentar mudanças** neste arquivo

---

## 📈 PRÓXIMOS PASSOS - AI COSTS INTEGRATION

1. ✅ Deploy schema `ai-costs-tracking-schema.sql`
2. 🔄 Modificar `DEFINITIVA-TOTAL-FIXED-ALL-ISSUES-V5.sql` (tenant individual)
3. 🔄 Modificar `platform-metrics-aggregation-procedure.sql` (agregação)
4. 🔄 Testar integração completa
5. 🔄 Atualizar APIs para expor as novas métricas

**Status atual**: Schema criado, procedures identificadas, integração pendente.