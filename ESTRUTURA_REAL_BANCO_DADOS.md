# Estrutura Real do Banco de Dados WhatsAppSalon-N8N

## Visão Geral Descoberta

**Total de Tabelas Encontradas:** 46 tabelas no schema public

**Status dos Dados:**
- Sistema ativo com dados reais populados
- 10 tenants ativos em diferentes domínios (beauty, healthcare, legal, education, sports)
- 4.560 registros de conversas (maio-julho 2025)
- 1.149 agendamentos (julho-agosto 2025)
- 840 usuários cadastrados
- Sistema de métricas funcionando com 6 registros de platform_metrics

## 📊 Tabelas Principais para Métricas

### 1. TENANTS (Inquilinos/Clientes SaaS)
**Registros:** 10 tenants ativos
**Schema:**
```sql
- id (uuid, PK)
- name, business_name (text)
- domain (enum: beauty, healthcare, legal, education, sports)
- subscription_plan (text: 'basico', 'profissional', 'enterprise')
- subscription_status (varchar: 'active')
- monthly_subscription_fee (numeric: 79.90 padrão)
- subscription_start_date (date)
- created_at, updated_at (timestamptz)
```

**Distribuição por Domínio:**
- Beauty: 3 tenants (profissional)
- Healthcare: 2 tenants (enterprise) 
- Legal: 2 tenants (profissional)
- Education: 2 tenants (básico)
- Sports: 1 tenant (básico)

### 2. APPOINTMENTS (Agendamentos)
**Registros:** 1.149 agendamentos
**Schema:**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK)
- user_id (uuid, FK) 
- professional_id, service_id (uuid, nullable)
- start_time, end_time (timestamptz)
- status (enum: confirmed, completed, cancelled, no_show)
- quoted_price, final_price (numeric)
- currency (text: 'BRL')
- appointment_data (jsonb)
- created_at, updated_at (timestamptz)
```

**Distribuição por Status:**
- Confirmed: 819 (71.3%)
- Completed: 284 (24.7%)
- Cancelled: 23 (2.0%)
- No Show: 23 (2.0%)

### 3. CONVERSATION_HISTORY (Histórico de Conversas IA)
**Registros:** 4.560 conversas
**Schema:**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK)
- user_id (uuid, FK)
- content (text)
- is_from_user (boolean)
- message_type (text: 'text')
- intent_detected (text, nullable)
- confidence_score (numeric, nullable)
- conversation_outcome (text, nullable)
- tokens_used (integer, default: 0)
- api_cost_usd (numeric, default: 0)
- processing_cost_usd (numeric, default: 0)
- model_used (varchar: 'gpt-3.5-turbo')
- message_source (varchar: 'whatsapp')
- created_at (timestamptz)
```

**Outcomes de Conversas:**
- appointment_created: 410 (39.5%)
- info_request_fulfilled: 221 (21.3%)
- appointment_cancelled: 207 (19.9%)
- price_inquiry: 203 (19.6%)

### 4. PLATFORM_METRICS (Métricas Consolidadas da Plataforma)
**Registros:** 6 registros de métricas
**Schema:**
```sql
- id (uuid, PK)
- calculation_date (date)
- period_days (integer: 7, 30, 90)
- data_source (varchar: 'new_metrics_function')
- total_revenue (numeric)
- total_appointments (integer)
- total_customers (integer)
- total_ai_interactions (integer)
- active_tenants (integer)
- platform_mrr (numeric)
- total_chat_minutes (integer)
- total_conversations (integer)
- total_valid_conversations (integer)
- total_spam_conversations (integer)
- receita_uso_ratio (numeric)
- operational_efficiency_pct (numeric)
- spam_rate_pct (numeric)
- cancellation_rate_pct (numeric)
- revenue_usage_distortion_index (numeric)
- platform_health_score (numeric)
- tenants_above_usage, tenants_below_usage (integer)
- platform_avg_clv (numeric)
- platform_avg_conversion_rate (numeric)
- platform_high_risk_tenants (integer)
- platform_domain_breakdown (jsonb)
- platform_quality_score (numeric)
- created_at, updated_at (timestamp)
```

### 5. TENANT_METRICS (Métricas por Tenant)
**Registros:** 157 registros
**Schema:**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK)
- metric_type (varchar: 'participation')
- metric_data (jsonb)
- period (varchar: '7d', '30d', '90d')
- calculated_at, created_at, updated_at (timestamptz)
```

**Estrutura do JSONB metric_data:**
```json
{
  "revenue": {
    "participation_pct": 0.26,
    "participation_value": 79.9
  },
  "customers": {
    "count": 49,
    "participation_pct": 0
  },
  "appointments": {
    "count": 51,
    "participation_pct": 0
  },
  "ai_interactions": {
    "count": 0,
    "participation_pct": 0
  },
  "business_intelligence": {
    "risk_score": 45,
    "efficiency_score": 0,
    "spam_detection_score": 100
  }
}
```

## 💰 Tabelas de Receita e Billing

### 6. CONVERSATION_BILLING (Cobrança por Conversas)
**Registros:** 0 (sistema não populado ainda)
**Schema:**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK)
- billing_period_start, billing_period_end (date)
- conversations_included, conversations_used, conversations_overage (integer)
- base_amount_brl, overage_amount_brl, total_amount_brl (numeric)
- stripe_usage_record_id (varchar)
- processed_at, created_at, updated_at (timestamp)
```

### 7. SUBSCRIPTION_PAYMENTS (Pagamentos de Assinatura)
**Registros:** 0 (sistema não populado ainda)
**Schema:**
```sql
- id (uuid, PK)
- tenant_id (uuid, FK)
- payment_date (date)
- payment_period_start, payment_period_end (date)
- amount (numeric)
- currency (text: 'BRL')
- subscription_plan (text)
- payment_method (text: 'stripe')
- payment_status (text: 'completed')
- stripe_payment_intent_id, stripe_invoice_id (text)
- payment_metadata (jsonb)
- created_at, updated_at (timestamptz)
```

## 🔧 Tabelas de Suporte

### 8. USERS (Usuários Finais)
**Registros:** 840 usuários

### 9. SERVICES (Serviços Oferecidos)
**Registros:** 81 serviços

### 10. PROFESSIONALS (Profissionais)
**Registros:** 41 profissionais

### 11. USAGE_COSTS (Custos de Uso)
**Registros:** 0 (não populado)

## 📈 Campos Chave para Extração de Métricas

### Para Receita (Revenue):
1. **appointments.final_price** - Receita real por agendamento
2. **tenants.monthly_subscription_fee** - Taxa mensal de assinatura
3. **subscription_payments.amount** - Pagamentos reais (quando populado)

### Para Agendamentos:
1. **appointments.status** - Status do agendamento
2. **appointments.start_time/end_time** - Duração e horários
3. **appointments.tenant_id** - Tenant proprietário

### Para Conversas IA:
1. **conversation_history.conversation_outcome** - Resultado da conversa
2. **conversation_history.tokens_used** - Uso de tokens
3. **conversation_history.api_cost_usd** - Custo em USD
4. **conversation_history.is_from_user** - Direção da mensagem

### Para Tenants:
1. **tenants.subscription_status** - Status da assinatura
2. **tenants.domain** - Domínio de negócio
3. **tenants.subscription_start_date** - Data de início

### Para Métricas Consolidadas:
1. **platform_metrics.*** - Todas as métricas já calculadas
2. **tenant_metrics.metric_data** - Dados JSON por tenant

## 🚨 Principais Descobertas

### ✅ O que está funcionando:
- Sistema de tenants multi-domínio ativo
- Conversas IA sendo registradas com custos
- Agendamentos sendo criados e finalizados
- Sistema de métricas calculando dados consolidados
- Outcomes de conversas sendo trackados

### ⚠️ O que precisa atenção:
- `conversation_billing` e `subscription_payments` estão vazios
- `usage_costs` não está sendo populado
- Métricas mostram valores muito altos (87k+ revenue em 7 dias)
- Precisa validar se os cálculos estão corretos

### 📊 Dados para Análise:
- **Range temporal:** Mai/2025 - Ago/2025
- **Tenants ativos:** 10
- **Taxa de conversão:** ~35% (410 appointments_created / 1149 total conversations)
- **Taxa de sucesso:** ~25% (284 completed / 1149 appointments)
- **Taxa de cancelamento:** ~2% (23 cancelled / 1149 appointments)

## 🎯 Próximos Passos Recomendados

1. **Validar cálculos de receita** - Verificar se 87k+ em 7 dias está correto
2. **Popular tabelas de billing** - Implementar conversation_billing
3. **Investigar metrics discrepancies** - Comparar dados brutos vs métricas
4. **Implementar usage_costs** - Para tracking de custos operacionais
5. **Validar appointment outcomes** - Garantir consistência entre conversas e agendamentos