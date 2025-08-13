# DOCUMENTAÇÃO: MÉTRICAS TENANT vs PLATAFORMA

## 🎯 ESCLARECIMENTO CRÍTICO

Durante a integração do dashboard Super Admin, foi identificada uma **distinção fundamental** entre dois tipos de receita que devem ser apresentados de forma diferente:

## 💰 TIPOS DE RECEITA

### 1. **RECEITA DO TENANT** (Negócio do Tenant)
- **O que é**: Valor que o tenant fatura vendendo seus serviços para clientes finais
- **Exemplo**: R$ 7.332,28 (cortes, colorações, procedimentos)
- **Onde usar**: **GRÁFICOS** de performance do negócio
- **Fonte**: Tabela `appointments` → `final_price` ou `quoted_price`

### 2. **RECEITA DA PLATAFORMA** (Pagamento do Tenant)
- **O que é**: Valor que o tenant paga para a plataforma (MRR, taxas, assinaturas)
- **Exemplo**: R$ 179,7 (mensalidade do tenant para usar a plataforma)
- **Onde usar**: **CARDS** de participação na plataforma
- **Fonte**: Tabela `platform_metrics` → dados de MRR por tenant

## 📊 APLICAÇÃO NO DASHBOARD SUPER ADMIN

### Cards de Participação
```
┌─────────────────────────────────┐
│ Participação na Receita         │
│ 20,1%                          │
│ R$ 179,7 de R$ 894             │
└─────────────────────────────────┘
```
- **Métrica**: Quanto este tenant contribui para a receita da plataforma
- **Cálculo**: (MRR do tenant / Total MRR da plataforma) × 100
- **Significado**: Participação financeira na sustentação da plataforma

### Gráfico de Receita Diária
```
     📈 Receita Diária do Tenant
R$ 7.332,28 ┌─────────────────────┐
            │  ████████████       │
            │      ████████████   │
            │          ████████   │
            └─────────────────────┘
            Dia 1  Dia 15  Dia 30
```
- **Métrica**: Quanto o tenant está faturando no seu negócio
- **Cálculo**: Soma de `appointments.final_price` por período
- **Significado**: Performance comercial do negócio do tenant

## 🔍 PROBLEMA IDENTIFICADO

### Erro Anterior
O frontend estava **misturando** as duas métricas:
- Card mostrava R$ 7.332 de R$ 894 = 820% ❌
- Isso não faz sentido (tenant não pode contribuir mais que o total)

### Correção Necessária
- **Card**: R$ 179,7 de R$ 894 = 20,1% ✅
- **Gráfico**: R$ 7.332,28 distribuído por período ✅

## 📋 IMPLEMENTAÇÃO TÉCNICA

### Fonte dos Dados

#### Para Cards (Participação na Plataforma)
```sql
-- Receita que o tenant paga para a plataforma
SELECT mrr_value FROM platform_metrics 
WHERE tenant_id = 'tenant-id' AND metric_date = CURRENT_DATE;

-- Total da plataforma
SELECT total_mrr FROM platform_metrics 
WHERE metric_date = CURRENT_DATE;
```

#### Para Gráficos (Performance do Negócio)
```sql
-- Receita que o tenant fatura com clientes
SELECT SUM(COALESCE(final_price, quoted_price, 0)) 
FROM appointments 
WHERE tenant_id = 'tenant-id' 
  AND status = 'completed'
  AND DATE(start_time) = target_date;
```

### Estrutura de Dados Esperada
```javascript
{
  // Para cards de participação
  platformParticipation: {
    tenantMRR: 179.7,        // O que tenant paga para plataforma
    platformMRR: 894,       // Total que plataforma recebe
    percentage: 20.1         // Participação do tenant
  },
  
  // Para gráficos de performance
  tenantBusiness: {
    dailyRevenue: [245, 380, 290, ...],  // Receita diária do negócio
    totalRevenue: 7332.28                // Total faturado pelo tenant
  }
}
```

## 🎯 CONCLUSÃO

Esta distinção é **fundamental** para o Super Admin entender:

1. **Saúde Financeira da Plataforma**: Quanto cada tenant contribui (Cards)
2. **Performance dos Negócios**: Como cada tenant está se saindo (Gráficos)

São **duas perspectivas diferentes** da mesma informação, cada uma com seu propósito específico no dashboard de análise de tenants.

---

**Data da Documentação**: 2025-07-12  
**Contexto**: Integração do Dashboard Super Admin - Tenant Business Analytics  
**Status**: Especificação clara definida ✅