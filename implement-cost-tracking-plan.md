# 📊 PLANO DE IMPLEMENTAÇÃO: Cost Tracking & Sustainability Metrics

## 🎯 OBJETIVO
Implementar rastreamento completo de custos vs receita para identificar tenants em prejuízo e otimizar sustentabilidade do negócio.

## 📋 STATUS ATUAL (Baseado na Auditoria)

### ✅ O QUE TEMOS
- ✅ `conversation_history` - dados de IA (sem custo)
- ✅ `whatsapp_media` - dados de WhatsApp (sem custo)
- ✅ `tenants` - dados básicos (sem preço)
- ✅ Frontend funcionando
- ✅ Sistema de métricas funcionando

### ❌ O QUE FALTA
- ❌ Campos de custo nas tabelas existentes
- ❌ Tabela dedicada para usage costs
- ❌ Campos de pricing em tenants
- ❌ Rastreamento de origem das mensagens
- ❌ Métricas de margem no dashboard

## 🏗️ FASE 1: ESTRUTURA DE DADOS

### 1.1 Adicionar Campos em `conversation_history`
```sql
ALTER TABLE conversation_history ADD COLUMN IF NOT EXISTS
    tokens_used INTEGER DEFAULT 0,
    api_cost_usd DECIMAL(10,6) DEFAULT 0,
    model_used VARCHAR(50) DEFAULT 'gpt-3.5-turbo',
    message_source VARCHAR(20) DEFAULT 'whatsapp',
    processing_cost_usd DECIMAL(10,6) DEFAULT 0;
```

### 1.2 Adicionar Campos em `tenants`
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS
    monthly_subscription_fee DECIMAL(10,2) DEFAULT 79.90,
    plan_type VARCHAR(20) DEFAULT 'standard',
    billing_cycle_day INTEGER DEFAULT 1,
    subscription_status VARCHAR(20) DEFAULT 'active';
```

### 1.3 Criar Tabela `usage_costs`
```sql
CREATE TABLE usage_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    cost_date DATE NOT NULL,
    
    -- Custos de IA
    ai_requests_count INTEGER DEFAULT 0,
    ai_tokens_used INTEGER DEFAULT 0,
    ai_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Custos de WhatsApp
    whatsapp_messages_sent INTEGER DEFAULT 0,
    whatsapp_messages_received INTEGER DEFAULT 0,
    whatsapp_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Custos de infraestrutura
    storage_cost_usd DECIMAL(10,6) DEFAULT 0,
    bandwidth_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    -- Total
    total_cost_usd DECIMAL(10,6) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, cost_date)
);
```

## 🔧 FASE 2: INSTRUMENTAÇÃO DE CÓDIGO

### 2.1 Logging de Custos de IA
```typescript
// No ai.service.ts
async processAIRequest(prompt: string, tenantId: string) {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
    });
    
    // Calcular custo
    const tokensUsed = response.usage?.total_tokens || 0;
    const costUSD = tokensUsed * 0.000002; // $0.002/1K tokens
    
    // Salvar conversa com custo
    await supabase.from('conversation_history').insert({
        tenant_id: tenantId,
        content: response.choices[0].message.content,
        tokens_used: tokensUsed,
        api_cost_usd: costUSD,
        model_used: 'gpt-3.5-turbo',
        message_source: 'whatsapp'
    });
    
    // Acumular custo diário
    await this.updateDailyCosts(tenantId, { ai_cost: costUSD, ai_tokens: tokensUsed });
}
```

### 2.2 Logging de Custos WhatsApp
```typescript
// No whatsapp.service.ts
async sendMessage(to: string, message: string, tenantId: string) {
    const response = await whatsappAPI.sendMessage(to, message);
    
    // WhatsApp custa ~$0.005 por mensagem
    const whatsappCost = 0.005;
    
    await this.updateDailyCosts(tenantId, { 
        whatsapp_cost: whatsappCost,
        whatsapp_messages_sent: 1 
    });
}
```

## 📊 FASE 3: MÉTRICAS DE SUSTENTABILIDADE

### 3.1 Função de Cálculo de Margem
```sql
CREATE OR REPLACE FUNCTION calculate_tenant_margins(
    p_calculation_date DATE DEFAULT CURRENT_DATE,
    p_period_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    tenant_id UUID,
    revenue_usd DECIMAL(10,2),
    total_cost_usd DECIMAL(10,6),
    margin_usd DECIMAL(10,2),
    margin_percentage DECIMAL(5,2),
    is_profitable BOOLEAN,
    cost_per_conversation DECIMAL(10,6)
) 
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id as tenant_id,
        t.monthly_subscription_fee as revenue_usd,
        COALESCE(SUM(uc.total_cost_usd), 0) as total_cost_usd,
        (t.monthly_subscription_fee - COALESCE(SUM(uc.total_cost_usd), 0)) as margin_usd,
        CASE 
            WHEN t.monthly_subscription_fee > 0 THEN
                ((t.monthly_subscription_fee - COALESCE(SUM(uc.total_cost_usd), 0)) / t.monthly_subscription_fee * 100)
            ELSE 0
        END as margin_percentage,
        (t.monthly_subscription_fee > COALESCE(SUM(uc.total_cost_usd), 0)) as is_profitable,
        CASE 
            WHEN COUNT(ch.id) > 0 THEN 
                COALESCE(SUM(uc.total_cost_usd), 0) / COUNT(ch.id)
            ELSE 0
        END as cost_per_conversation
    FROM tenants t
    LEFT JOIN usage_costs uc ON t.id = uc.tenant_id 
        AND uc.cost_date >= p_calculation_date - INTERVAL '1 day' * p_period_days
        AND uc.cost_date <= p_calculation_date
    LEFT JOIN conversation_history ch ON t.id = ch.tenant_id
        AND ch.created_at >= p_calculation_date - INTERVAL '1 day' * p_period_days
        AND ch.created_at <= p_calculation_date
    WHERE t.subscription_status = 'active'
    GROUP BY t.id, t.monthly_subscription_fee;
END;
$$;
```

### 3.2 Adicionar na Função Principal
```sql
-- Adicionar na calculate_new_metrics_system()
-- Após calcular métricas básicas, calcular custos e margem

-- Buscar custos do tenant
SELECT 
    COALESCE(SUM(ai_cost_usd), 0),
    COALESCE(SUM(whatsapp_cost_usd), 0),
    COALESCE(SUM(total_cost_usd), 0)
INTO v_tenant_ai_cost, v_tenant_whatsapp_cost, v_tenant_total_cost
FROM usage_costs uc
WHERE uc.tenant_id = v_tenant_data.tenant_id
AND uc.cost_date >= (p_calculation_date - INTERVAL '1 day' * p_period_days)
AND uc.cost_date <= p_calculation_date;

-- Calcular margem
v_tenant_margin := v_tenant_revenue - v_tenant_total_cost;
v_tenant_margin_pct := CASE 
    WHEN v_tenant_revenue > 0 THEN (v_tenant_margin / v_tenant_revenue * 100)
    ELSE 0
END;
v_tenant_is_profitable := v_tenant_margin > 0;
```

## 🌐 FASE 4: DASHBOARD ENHANCEMENTS

### 4.1 Novos KPIs para Super Admin
```typescript
// Adicionar aos KPIs existentes:
{
    // KPI 9: Margem Média da Plataforma
    averageMargin: {
        value: metrics.average_margin_pct || 0,
        formatted: `${(metrics.average_margin_pct || 0).toFixed(1)}%`,
        subtitle: 'Margem média todos tenants',
        trend: {
            direction: (metrics.average_margin_pct || 0) > 20 ? 'up' : 'down',
            text: (metrics.average_margin_pct || 0) > 20 ? 'Saudável' : 'Preocupante'
        }
    },
    
    // KPI 10: Tenants em Prejuízo
    unprofitableTenants: {
        value: metrics.unprofitable_tenants_count || 0,
        formatted: `${metrics.unprofitable_tenants_count || 0} tenants`,
        subtitle: 'Tenants com margem negativa',
        trend: {
            direction: (metrics.unprofitable_tenants_count || 0) === 0 ? 'up' : 'down',
            text: (metrics.unprofitable_tenants_count || 0) === 0 ? 'Todos lucrativos' : 'Atenção necessária'
        }
    }
}
```

### 4.2 Novos Widgets
- **"Sustainability Alert"** - Lista tenants em prejuízo
- **"Cost vs Revenue Chart"** - Scatter plot custo x receita por tenant
- **"Margin Distribution"** - Histograma de margens
- **"Top Cost Drivers"** - Tenants com maior custo absoluto

## 🚨 FASE 5: ALERTAS E MONITORAMENTO

### 5.1 Sistema de Alertas
```typescript
// Verificar daily se algum tenant está em prejuízo
async checkUnprofitableTenantsDaily() {
    const unprofitableTenantsQuery = `
        SELECT * FROM calculate_tenant_margins(CURRENT_DATE, 30)
        WHERE is_profitable = false
    `;
    
    const { data: unprofitableTenants } = await supabase.rpc('exec_sql', {
        sql: unprofitableTenantsQuery
    });
    
    if (unprofitableTenants?.length > 0) {
        await this.sendAlertEmail({
            subject: '🚨 Tenants em Prejuízo Detectados',
            tenants: unprofitableTenants,
            action: 'Revisar pricing ou otimizar uso'
        });
    }
}
```

## 📊 FASE 6: MÉTRICAS AVANÇADAS

### 6.1 Business Intelligence
- **Customer Lifetime Value (CLV)** vs **Customer Acquisition Cost (CAC)**
- **Usage Elasticity**: Como uso muda com preço
- **Churn Risk**: Correlação alta custo vs cancelamento
- **Pricing Optimization**: Sugestões de ajuste de preço

### 6.2 Forecasting
- **Projeção de custos** baseada em tendências
- **Break-even analysis** por tenant
- **Scenario planning**: "E se custo de IA subir 50%?"

## 🎯 PRIORIZAÇÃO

### Alta Prioridade (Implementar primeiro)
1. ✅ Adicionar campos de custo nas tabelas
2. ✅ Implementar logging de custos de IA
3. ✅ Criar função de cálculo de margem
4. ✅ Dashboard básico de sustainability

### Média Prioridade
5. ✅ Sistema de alertas
6. ✅ Métricas avançadas
7. ✅ Forecasting básico

### Baixa Prioridade
8. ✅ BI avançado
9. ✅ Pricing optimization automático

## 💰 IMPACT ESPERADO

- **Identificação imediata** de tenants problem áticos
- **Otimização de margem** através de dados reais
- **Sustentabilidade** do modelo de negócio
- **Decisões baseadas em dados** para pricing
- **Alertas proativos** antes de prejuízos grandes

Esse plano transforma o sistema atual de "revenue-only" para um **sistema completo de profitability tracking**.