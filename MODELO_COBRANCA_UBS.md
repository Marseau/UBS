# 💬 Modelo de Cobrança UBS - Especificação Técnica Completa

## 📊 Resumo Executivo

Este documento define o novo modelo de cobrança por conversa do Universal Booking System (UBS), substituindo completamente o modelo anterior baseado em assinatura fixa. O sistema cobra por conversas recebidas via WhatsApp, mantendo ilimitados os números de WhatsApp, mensagens enviadas e acesso completo à IA especializada.

---

## 🎯 Definições Fundamentais

### **Conversa para Cobrança**
> **"Conversa = toda e qualquer mensagem recebida no WhatsApp do tenant"**

**Critério Técnico:**
```sql
-- Uma conversa = uma mensagem recebida (is_from_user = true)
SELECT COUNT(*) as conversations_count 
FROM conversation_history 
WHERE tenant_id = ? 
  AND is_from_user = true 
  AND created_at >= inicio_mes 
  AND created_at < fim_mes
```

### **O que é ILIMITADO**
- ✅ **Números de WhatsApp** por tenant
- ✅ **Mensagens enviadas** pelo sistema
- ✅ **Acesso à IA especializada** (6 segmentos: saúde, beleza, educação, jurídico, esportes, consultoria)
- ✅ **Funcionalidades do sistema** (dashboard, relatórios, integrações)
- ✅ **Usuários** por tenant

### **O que é LIMITADO**
- ❌ **Conversas mensais** conforme plano contratado
- ❌ **Conversas na íntegra** para relatórios (30 por mês)
- ❌ **Período de retenção** para auditoria (90 dias)

---

## 💰 Estrutura de Preços

### **Planos Disponíveis**
```
🟢 Plano Básico: R$ 58/mês (até 200 conversas)
   └── U$ 10 × R$ 5,80 = R$ 58,00
   
🔵 Plano Profissional: R$ 116/mês (até 400 conversas)  
   └── U$ 20 × R$ 5,80 = R$ 116,00
   
🟠 Plano Enterprise: R$ 290/mês (até 1250 conversas)
   └── U$ 50 × R$ 5,80 = R$ 290,00
```

### **Sistema de Excedentes e Upgrades**
#### **🟢 Plano Básico (200 conversas)**
- **Ao exceder limite:** Upgrade automático para Profissional
- **Sem cobrança** de conversas extras

#### **🔵 Plano Profissional (400 conversas)**  
- **Ao exceder limite:** Upgrade automático para Enterprise
- **Sem cobrança** de conversas extras

#### **🟠 Plano Enterprise (1250 conversas)**
- **Ao exceder limite:** Cobrança de R$ 0,25 por conversa adicional
- **Sem upgrade** (é o plano máximo)

### **Triggers de Upgrade Automático**
- **Trigger:** Exceder limite do plano atual
- **Execução:** Imediata via webhook Stripe
- **Método:** Stripe plan change automático

---

## 🔧 Funcionalidades por Plano

### **🟢 Plano Básico (R$ 58/mês)**
- **Conversas incluídas:** 200/mês
- **Conversas na íntegra:** 30/mês
- **Retenção:** 90 dias para auditoria
- **WhatsApp:** Ilimitados
- **IA:** Acesso completo aos 6 segmentos
- **Dashboard:** Básico
- **Suporte:** Email

### **🔵 Plano Profissional (R$ 116/mês)**  
- **Conversas incluídas:** 400/mês
- **Conversas na íntegra:** 30/mês
- **Retenção:** 90 dias para auditoria
- **WhatsApp:** Ilimitados
- **IA:** Acesso completo aos 6 segmentos
- **Dashboard:** Avançado com analytics
- **Suporte:** Chat prioritário

### **🟠 Plano Enterprise (R$ 290/mês)**
- **Conversas incluídas:** 1250/mês
- **Conversas na íntegra:** 30/mês
- **Retenção:** 90 dias para auditoria
- **WhatsApp:** Ilimitados
- **IA:** Acesso completo aos 6 segmentos
- **Dashboard:** Enterprise com API
- **Suporte:** Telefone dedicado

---

## 🛠️ Implementação Técnica

### **1. Database Schema**

#### **Tabela conversation_billing** (Nova)
```sql
CREATE TABLE conversation_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) NOT NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    conversations_included INTEGER NOT NULL,    -- Limite do plano
    conversations_used INTEGER DEFAULT 0,       -- Conversas utilizadas
    conversations_overage INTEGER DEFAULT 0,    -- Excedentes
    base_amount_brl DECIMAL(10,2) NOT NULL,     -- Valor base (R$ 58, 116, 290)
    overage_amount_brl DECIMAL(10,2) DEFAULT 0, -- Valor excedentes
    total_amount_brl DECIMAL(10,2) NOT NULL,    -- Total da fatura
    stripe_usage_record_id VARCHAR(255),        -- ID do Stripe
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, billing_period_start)
);
```

#### **Atualização tabela tenants**
```sql
-- Remover campos de limite
ALTER TABLE tenants DROP COLUMN IF EXISTS max_messages;
ALTER TABLE tenants DROP COLUMN IF EXISTS max_numbers;

-- Adicionar campos de conversas
ALTER TABLE tenants 
ADD COLUMN max_conversations INTEGER DEFAULT 200,
ADD COLUMN conversation_plan VARCHAR(20) DEFAULT 'basico';
```

### **2. Stripe Integration**

#### **Produtos Stripe** (Novos)
```javascript
// Produtos com upgrade automático (Básico/Profissional) e usage-based (Enterprise)
const products = {
  basico: {
    name: 'UBS Básico - Por Conversa',
    base_price: 5800, // R$ 58,00 em centavos
    included_conversations: 200,
    auto_upgrade_to: 'profissional', // Upgrade automático
    overage_price: null // Sem cobrança de excedente
  },
  profissional: {
    name: 'UBS Profissional - Por Conversa', 
    base_price: 11600, // R$ 116,00 em centavos
    included_conversations: 400,
    auto_upgrade_to: 'enterprise', // Upgrade automático
    overage_price: null // Sem cobrança de excedente
  },
  enterprise: {
    name: 'UBS Enterprise - Por Conversa',
    base_price: 29000, // R$ 290,00 em centavos 
    included_conversations: 1250,
    auto_upgrade_to: null, // Não há upgrade (plano máximo)
    overage_price: 25   // R$ 0,25 em centavos por excedente
  }
}
```

#### **Lógica de Upgrade e Cobrança**
```javascript
// Processar excedente de conversas
async function processConversationOverage(tenantId, conversationsUsed) {
  const tenant = await getTenant(tenantId);
  const plan = tenant.conversation_plan;
  
  if (conversationsUsed > getPlanLimit(plan)) {
    if (plan === 'basico') {
      // Upgrade automático para Profissional
      await upgradeToNextPlan(tenantId, 'profissional');
    } else if (plan === 'profissional') {
      // Upgrade automático para Enterprise  
      await upgradeToNextPlan(tenantId, 'enterprise');
    } else if (plan === 'enterprise') {
      // Cobrança de excedentes R$ 0,25 por conversa
      const overage = conversationsUsed - 1250;
      await reportUsageToStripe(tenantId, overage);
    }
  }
}
```

### **3. Service Layer** 

#### **ConversationBillingService** (Novo)
```typescript
export class ConversationBillingService {
  // Contar conversas do mês atual
  async countMonthlyConversations(tenantId: string): Promise<number>
  
  // Calcular fatura mensal
  async calculateMonthlyBill(tenantId: string): Promise<BillingResult>
  
  // Processar excedentes via Stripe
  async processOverages(tenantId: string): Promise<void>
  
  // Upgrade/downgrade automático
  async evaluatePlanChange(tenantId: string): Promise<void>
  
  // Gerar relatório de uso
  async generateUsageReport(tenantId: string): Promise<UsageReport>
}
```

### **4. Cron Jobs** (Automação)

#### **Daily Jobs**
```javascript
// Executar todo dia às 23:59
'59 23 * * *': async () => {
  await conversationBillingService.updateDailyUsage();
  await conversationBillingService.checkUsageAlerts();
}
```

#### **Monthly Jobs** 
```javascript
// Executar dia 1 de cada mês às 00:01
'1 0 1 * *': async () => {
  await conversationBillingService.processMonthlyBilling();
  await conversationBillingService.evaluateAllPlanChanges();
}
```

---

## 📊 Relatórios e Auditoria

### **1. Relatório Mensal de Cobrança**
```
Tenant: Salão Bella Vista
Período: 01/07/2024 - 31/07/2024
Plano: Profissional (400 conversas)

Conversas utilizadas: 450
- Incluídas no plano: 400
- Excedentes: 50

Valores:
- Base mensal: R$ 116,00
- Excedentes (50 × R$ 0,25): R$ 12,50
- TOTAL: R$ 128,50
```

### **2. Conversas na Íntegra** (30/mês)
- Acesso completo ao histórico de 30 conversas por mês
- Seleção automática das mais recentes
- Download em PDF/CSV

### **3. Auditoria de 90 dias**
- Metadados de todas as conversas por 90 dias
- Contadores de uso por dia/semana/mês
- Logs de cobrança e upgrades

---

## 🚀 Processo de Migração

### **Fase 1: Preparação (2 semanas)**
1. ✅ Criar tabela `conversation_billing`
2. ✅ Implementar `ConversationBillingService`
3. ✅ Configurar produtos Stripe
4. ✅ Atualizar webhooks

### **Fase 2: Teste Piloto (1 semana)**
1. 🔄 Migrar 10 tenants voluntários
2. 🔄 Validar contagem de conversas
3. 🔄 Testar cobrança de excedentes
4. 🔄 Ajustar parâmetros

### **Fase 3: Rollout Gradual (2 semanas)**
1. 📅 Semana 1: 50% dos tenants
2. 📅 Semana 2: 100% dos tenants
3. 📅 Monitoramento intensivo
4. 📅 Suporte dedicado

### **Fase 4: Otimização (ongoing)**
1. 🔄 Análise de uso real
2. 🔄 Ajuste de limites de planos
3. 🔄 Otimização de preços
4. 🔄 Novos recursos

---

## ⚠️ Alertas e Notificações

### **Sistema de Alertas**
#### **🟢 Plano Básico e 🔵 Profissional:**
```
🟡 80% do limite: "Você utilizou 160 de 200 conversas este mês"
🟠 95% do limite: "Atenção! Apenas 10 conversas restantes"  
🔴 100% limite: "Limite atingido. Upgrade automático para próximo plano ativado!"
📈 Upgrade realizado: "Conta atualizada para Profissional. Sem interrupção do serviço."
```

#### **🟠 Plano Enterprise:**
```
🟡 80% do limite: "Você utilizou 1000 de 1250 conversas este mês"
🟠 95% do limite: "Atenção! Apenas 63 conversas restantes"  
🔴 100% limite: "Limite atingido. Próximas conversas: R$ 0,25 cada"
💰 Excedente: "Cobrança de 25 conversas extras: R$ 6,25 no próximo ciclo"
```

### **Canais de Notificação**
- 📧 **Email:** Alertas de uso e faturamento
- 📱 **WhatsApp:** Notificações críticas
- 🖥️ **Dashboard:** Widget de uso em tempo real
- 📊 **Relatórios:** Análise mensal detalhada

---

## 🔒 Segurança e Compliance

### **Proteção de Dados**
- 🔐 **Criptografia:** Todas as conversas criptografadas
- 🛡️ **LGPD:** Retenção controlada de 90 dias
- 🏛️ **Auditoria:** Logs completos de acesso
- 👥 **RLS:** Isolamento total entre tenants

### **Backup e Recuperação**
- 💾 **Backup diário:** Todas as conversas
- ⚡ **Recovery:** RPO < 1 hora
- 🌎 **Redundância:** Multi-região
- 🔄 **Sync:** Tempo real com Stripe

---

## 📈 Métricas de Sucesso

### **KPIs Principais**
- 📊 **Conversão:** Taxa de upgrade automático
- 💰 **ARPU:** Receita média por tenant
- 📈 **Crescimento:** % aumento de receita
- 😊 **Satisfação:** NPS dos clientes
- 🔄 **Churn:** Taxa de cancelamento

### **Metas Q1 2024**
- 🎯 **ARPU:** Aumentar 25% vs modelo anterior
- 🎯 **Conversão:** 60% upgrade automático
- 🎯 **Satisfação:** NPS > 70
- 🎯 **Churn:** < 5% mensal

---

## 💡 Diferenciais Competitivos

### **1. Transparência Total**
- 💎 **Sem surpresas:** Preço claro por conversa
- 📊 **Dashboard:** Uso em tempo real
- 📈 **Projeções:** Estimativa de fatura mensal
- 📋 **Histórico:** Todas as cobranças detalhadas

### **2. Flexibilidade Máxima**
- 🔧 **Escala automática:** Cresce com o negócio
- 📱 **WhatsApp ilimitado:** Quantos números quiser
- 🤖 **IA completa:** 6 segmentos especializados
- 🔄 **Sem contratos:** Cancele quando quiser

### **3. Tecnologia Avançada**
- ⚡ **Tempo real:** Contadores instantâneos
- 🤖 **Automação:** Upgrades inteligentes
- 📱 **Mobile:** App nativo para gestão
- 🔗 **Integrações:** API completa

---

## 📞 Suporte à Implementação

### **Equipe Dedicada**
- 👨‍💻 **Tech Lead:** Implementação técnica
- 💼 **Product Manager:** Definição de requisitos
- 🎨 **UX Designer:** Interface do usuário
- 📊 **Data Analyst:** Métricas e otimização

### **Cronograma de Entrega**
```
Semana 1-2: Implementação backend
Semana 3: Testes e validação
Semana 4: Deploy piloto
Semana 5-6: Rollout completo
Semana 7-8: Monitoramento e ajustes
```

### **Canais de Suporte**
- 📧 **Email:** suporte@universalbooking.com
- 💬 **Chat:** WhatsApp +55 11 9xxxx-xxxx
- 📱 **App:** Suporte integrado no dashboard
- 📞 **Telefone:** 0800-xxx-xxxx (Enterprise)

---

*Documento técnico versão 1.0 - Modelo de Cobrança UBS por Conversa*  
*Última atualização: 26/07/2024*  
*Aprovação: CEO + CTO*