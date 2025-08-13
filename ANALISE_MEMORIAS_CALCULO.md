# 🔍 ANÁLISE MEMÓRIAS DE CÁLCULO - JOBS DE MÉTRICAS

**Data:** 2025-07-30  
**Status:** ⚠️ PROBLEMAS IDENTIFICADOS  
**Objetivo:** Validar se jobs consideram alterações de Google Calendar sync e conversations

## 📊 DISCREPÂNCIAS IDENTIFICADAS

### **Platform Metrics (última: 29/07)**
- **Appointments:** 27 (salvo) vs **1000** (real) = **973 de diferença!**
- **Tenants:** 47 (salvo) vs **10** (real) = **37 de diferença!**
- **Users:** 27 (salvo) vs **835** (real) = **808 de diferença!**

### **Dados Reais Atuais**
- ✅ **1000 appointments** total
- ✅ **760 internos** (WhatsApp) + **240 externos** (Google Calendar)
- ✅ **Consistência perfeita** na diferenciação
- ⚠️ **0 conversations** detectadas (problema na lógica)

## 🔧 ANÁLISE DOS SERVIÇOS DE CÁLCULO

### **1. Analytics Service** (`analytics.service.ts`)
**PROBLEMA:** Não considera diferenciação interna/externa

```typescript
// LINHA 200-205: Busca TODOS os appointments sem filtro
const { data: appointments } = await getAdminClient()
    .from('appointments')
    .select('created_at, final_price, quoted_price, status')
    .eq('tenant_id', tenantId)
    .gte('created_at', thirtyDaysAgo.toISOString())
```

**FALTAM:**
- ❌ Filtro `external_event_id` para separar internos/externos
- ❌ Campo `appointment_data->>source` para validação
- ❌ Métricas específicas para Google Calendar sync

### **2. SaaS Metrics Service** (`saas-metrics.service.ts`)
**PROBLEMA:** Lógica de revenue incorreta

```typescript
// LINHA 238-249: Só busca appointment_data.price (pode estar NULL)
const { data: appointments } = await this.supabase
    .from('appointments')
    .select('appointment_data')
    .eq('status', 'completed')

const totalRevenue = appointments?.reduce((sum, app) => {
    return sum + ((app.appointment_data as any)?.price || 0);  // ❌ PROBLEMA!
}, 0) || 0;
```

**PROBLEMAS:**
- ❌ Não usa `quoted_price` ou `final_price` (campos principais)
- ❌ Não considera appointments externos
- ❌ Revenue baseado apenas em `appointment_data.price` (pode ser NULL)

### **3. Unified Metrics Service** (`unified-metrics.service.ts`)
**STATUS:** Parece mais novo, precisa verificar implementação completa

### **4. Conversation Analysis**
**PROBLEMA CRÍTICO:** Conversations = 0 detectadas

**Possíveis causas:**
- ❌ Lógica de detecção de `session_id` não funciona
- ❌ Parsing do `conversation_context` com problemas
- ❌ Campo `conversation_history.conversation_context` malformado

## 🚨 PROBLEMAS ESPECÍFICOS IDENTIFICADOS

### **A. Appointments Externos Ignorados**
Todos os serviços fazem:
```sql
SELECT * FROM appointments WHERE tenant_id = ?
```

**DEVERIA ser:**
```sql
-- Para appointments internos (WhatsApp)
SELECT * FROM appointments 
WHERE tenant_id = ? AND external_event_id IS NULL

-- Para appointments externos (Google Calendar)  
SELECT * FROM appointments 
WHERE tenant_id = ? AND external_event_id IS NOT NULL

-- Para validação adicional
SELECT * FROM appointments 
WHERE tenant_id = ? AND appointment_data->>'source' = 'whatsapp'
```

### **B. Revenue Calculation Incorreto**
**Atual:**
```typescript
(app.appointment_data as any)?.price || 0
```

**DEVERIA ser:**
```typescript
app.final_price || app.quoted_price || (app.appointment_data as any)?.price || 0
```

### **C. Conversations Not Detected**
**Problema:** `conversation_context` parsing falha

**Atual logic (provavelmente):**
```typescript
const context = JSON.parse(c.conversation_context);
if (context?.session_id) { ... }
```

**PODE SER:**
- Context já é objeto (não string)
- Campo `session_id` com nome diferente
- Sessions não estão sendo agrupadas corretamente

## 💡 CORREÇÕES NECESSÁRIAS

### **1. Analytics Service**
```typescript
// ADICIONAR campos para diferenciação
.select(`
    created_at, 
    final_price, 
    quoted_price, 
    status,
    external_event_id,
    appointment_data
`)

// SEPARAR métricas internas vs externas
const internosCount = appointments?.filter(a => !a.external_event_id).length || 0;
const externosCount = appointments?.filter(a => a.external_event_id).length || 0;
```

### **2. SaaS Metrics Service**
```typescript
// CORRIGIR cálculo de revenue
const totalRevenue = appointments?.reduce((sum, app) => {
    const revenue = app.final_price || app.quoted_price || 
                   (app.appointment_data as any)?.price || 0;
    return sum + revenue;
}, 0) || 0;

// ADICIONAR métricas de fonte
const whatsappAppointments = appointments?.filter(a => 
    a.appointment_data?.source === 'whatsapp').length || 0;
const calendarAppointments = appointments?.filter(a => 
    a.appointment_data?.source === 'google_calendar').length || 0;
```

### **3. Conversation Detection**
```typescript
// DEBUGAR conversation_context parsing
console.log('Raw context:', c.conversation_context);
console.log('Type:', typeof c.conversation_context);

const context = typeof c.conversation_context === 'string' 
    ? JSON.parse(c.conversation_context) 
    : c.conversation_context;

console.log('Parsed context:', context);
console.log('Session ID:', context?.session_id || context?.sessionId);
```

## 🔄 PLANO DE AÇÃO

### **FASE 1: Diagnóstico Detalhado**
1. ✅ Analisar lógica atual dos serviços
2. 🔄 Verificar conversation_context parsing
3. ⏳ Identificar todos os campos necessários

### **FASE 2: Correções Críticas**
1. ⏳ Corrigir Analytics Service para considerar external_event_id
2. ⏳ Corrigir SaaS Metrics Service revenue calculation
3. ⏳ Fix conversation detection logic

### **FASE 3: Validação**
1. ⏳ Executar jobs corrigidos
2. ⏳ Comparar métricas antes/depois
3. ⏳ Validar consistency com dados reais

### **FASE 4: Monitoramento**
1. ⏳ Estabelecer alertas para discrepâncias
2. ⏳ Dashboard de validação de métricas
3. ⏳ Logs detalhados de cálculos

## 🎯 OBJETIVOS PÓS-CORREÇÃO

### **Platform Metrics Esperadas:**
- **Total Appointments:** 1000
- **Appointments Internos:** 760 (76%)
- **Appointments Externos:** 240 (24%)
- **Total Tenants:** 10
- **Total Users:** 835
- **Conversations:** >0 (após fix do parsing)

### **Tenant Metrics Esperadas:**
- **Diferenciação por fonte:** WhatsApp vs Google Calendar
- **Participation metrics:** Baseadas em dados reais
- **Revenue calculations:** Usando final_price/quoted_price

## ⚠️ RECOMENDAÇÃO

**NÃO EXECUTAR** os jobs de recálculo até:

1. ✅ **Corrigir** lógica de appointments (internal/external)
2. ✅ **Corrigir** cálculo de revenue (usar campos corretos)
3. ✅ **Fix** conversation detection (session_id parsing)
4. ✅ **Testar** com dados pequenos primeiro

**MOTIVO:** Executar agora iria **perpetuar dados incorretos** e mascarar os problemas reais do sistema.