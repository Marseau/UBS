# 💰 Billing Flow - Modelo de Cobrança por Conversa

## 🎯 Fluxo Principal de Cobrança

```mermaid
graph TD
    A[📱 Conversa Recebida WhatsApp] --> B[📊 Sistema Conta +1 Conversa]
    B --> C{Verificar Limite do Plano}
    
    C -->|Dentro do Limite| D[✅ Conversa Processada Normalmente]
    C -->|Acima do Limite| E{Qual Plano?}
    
    E -->|Básico 200+| F[🔄 Upgrade Automático → Profissional]
    E -->|Profissional 400+| G[🔄 Upgrade Automático → Enterprise]
    E -->|Enterprise 1250+| H[💰 Cobrança R$ 0,25 por Excedente]
    
    F --> I[📧 Notificação Upgrade Básico→Profissional]
    G --> J[📧 Notificação Upgrade Profissional→Enterprise]
    H --> K[📧 Notificação Cobrança Excedentes]
    
    I --> L[✅ Conversa Processada - Novo Plano]
    J --> L
    K --> L
    D --> L
    
    L --> M[📊 Atualizar Métricas Dashboard]
    
    style F fill:#fff3e0
    style G fill:#fff3e0
    style H fill:#ffebee
    style D fill:#e8f5e8
```

## 💳 Fluxo de Pagamento Stripe

```mermaid
sequenceDiagram
    participant C as Cliente
    participant S as Sistema UBS
    participant St as Stripe
    participant W as WhatsApp
    
    Note over C,W: Início do Mês
    S->>St: Cobrança recorrente plano
    St->>S: Confirmação pagamento
    S->>C: Email confirmação
    
    Note over C,W: Durante o Mês
    C->>W: Envia mensagem
    W->>S: Webhook conversa
    S->>S: +1 contador conversas
    
    Note over C,W: Limite Atingido
    S->>S: Verifica: conversas > limite
    alt Plano Básico/Profissional
        S->>St: Upgrade automático
        St->>S: Confirmação upgrade
        S->>C: Email upgrade
    else Plano Enterprise
        S->>St: Cobrança excedentes
        St->>S: Confirmação cobrança
        S->>C: Email excedentes
    end
```

## 📊 Estados do Sistema de Billing

```mermaid
stateDiagram-v2
    [*] --> Normal
    Normal --> CheckingLimit
    CheckingLimit --> Normal : Dentro do limite
    CheckingLimit --> OverLimit : Acima do limite
    
    OverLimit --> AutoUpgrade : Básico/Profissional
    OverLimit --> ChargeOverage : Enterprise
    
    AutoUpgrade --> ProcessingUpgrade
    ProcessingUpgrade --> UpgradeComplete
    UpgradeComplete --> Normal
    
    ChargeOverage --> ProcessingCharge
    ProcessingCharge --> ChargeComplete
    ChargeComplete --> Normal
    
    state OverLimit {
        [*] --> PlanCheck
        PlanCheck --> BasicPlan
        PlanCheck --> ProfessionalPlan
        PlanCheck --> EnterprisePlan
    }
```

## 💰 Estrutura de Preços

```mermaid
graph LR
    A[Planos UBS] --> B[💼 Básico<br/>R$ 58/mês]
    A --> C[🏢 Profissional<br/>R$ 116/mês]
    A --> D[🏭 Enterprise<br/>R$ 290/mês]
    
    B --> B1[200 conversas/mês]
    B --> B2[🔄 Upgrade automático]
    B --> B3[∞ WhatsApp números]
    B --> B4[∞ Mensagens enviadas]
    B --> B5[🤖 IA 6 segmentos]
    
    C --> C1[400 conversas/mês]
    C --> C2[🔄 Upgrade automático]
    C --> C3[∞ WhatsApp números]
    C --> C4[∞ Mensagens enviadas]
    C --> C5[🤖 IA 6 segmentos]
    
    D --> D1[1250 conversas/mês]
    D --> D2[💰 R$ 0,25 excedentes]
    D --> D3[∞ WhatsApp números]
    D --> D4[∞ Mensagens enviadas]
    D --> D5[🤖 IA 6 segmentos]
    
    style B fill:#e8f5e8
    style C fill:#fff3e0
    style D fill:#f3e5f5
```

## 🔄 Lógica de Upgrade Automático

```mermaid
flowchart TD
    A[Conversa Recebida] --> B[Contar Conversas do Mês]
    B --> C{conversas > limite_plano?}
    
    C -->|Não| D[Processar Normal]
    C -->|Sim| E{Qual plano atual?}
    
    E -->|Básico| F[Upgrade → Profissional]
    E -->|Profissional| G[Upgrade → Enterprise]
    E -->|Enterprise| H[Cobrar Excedentes]
    
    F --> I[Atualizar Stripe Subscription]
    G --> I
    H --> J[Criar Item de Cobrança]
    
    I --> K[Atualizar BD: conversation_plan]
    J --> L[Atualizar BD: billing_record]
    
    K --> M[Notificar Cliente]
    L --> N[Notificar Excedentes]
    
    M --> O[Processar Conversa]
    N --> O
    D --> O
    
    style F fill:#fff3e0
    style G fill:#fff3e0
    style H fill:#ffebee
```

## 📈 Cenários de Uso

```mermaid
graph TD
    A[Pequeno Salão<br/>~150 conversas/mês] --> B[Plano Básico R$ 58]
    C[Clínica Média<br/>~350 conversas/mês] --> D[Plano Profissional R$ 116]
    E[Hospital Grande<br/>~1000 conversas/mês] --> F[Plano Enterprise R$ 290]
    G[Rede Hospitalar<br/>~1500 conversas/mês] --> H[Enterprise + R$ 62,50 excedentes]
    
    B --> B1[✅ Uso Normal]
    D --> D1[✅ Uso Normal]
    F --> F1[✅ Uso Normal]
    H --> H1[💰 250 × R$ 0,25 = R$ 62,50]
    
    I[Salão Crescendo<br/>220 conversas] --> J[🔄 Auto Upgrade Básico→Profissional]
    K[Clínica Expandindo<br/>450 conversas] --> L[🔄 Auto Upgrade Profissional→Enterprise]
    
    style B1 fill:#e8f5e8
    style D1 fill:#e8f5e8
    style F1 fill:#e8f5e8
    style H1 fill:#ffebee
    style J fill:#fff3e0
    style L fill:#fff3e0
```

## 🎯 User Journey - Experiência de Upgrade

```mermaid
journey
    title Experiência de Upgrade Automático
    section Uso Normal
      Cliente usa sistema: 5: Cliente
      Conversas dentro do limite: 5: Cliente
      Cobrança mensal normal: 4: Cliente
    section Crescimento
      Aumento de conversas: 5: Cliente
      Sistema detecta limite: 5: Sistema
      Upgrade automático: 5: Sistema
    section Comunicação
      Email sobre upgrade: 4: Cliente
      Dashboard mostra novo plano: 5: Cliente
      Sem interrupção serviço: 5: Cliente
    section Benefício
      Mais conversas disponíveis: 5: Cliente
      Mesmas funcionalidades: 5: Cliente
      Preço justo pelo uso: 5: Cliente
```

## 🔍 Algoritmo de Contagem de Conversas

```mermaid
graph TD
    A[Webhook WhatsApp] --> B{Tipo: message?}
    B -->|Não| C[Ignorar]
    B -->|Sim| D{message.from = cliente?}
    D -->|Não| C
    D -->|Sim| E[Identificar Tenant]
    
    E --> F[Verificar última conversa]
    F --> G{< 24h da última?}
    G -->|Sim| H[Não contar +1]
    G -->|Não| I[Contar +1 conversa]
    
    I --> J[Atualizar conversation_billing]
    J --> K[Verificar limite do plano]
    
    H --> L[Processar mensagem IA]
    K --> M{Acima do limite?}
    M -->|Não| L
    M -->|Sim| N[Trigger Upgrade/Cobrança]
    
    style I fill:#e8f5e8
    style N fill:#fff3e0
```

## 💡 Diferenciais Competitivos

```mermaid
mindmap
  root((UBS Billing<br/>Diferencial))
    (Por Conversa Recebida)
      Único no mercado
      Transparência total
      Paga só o que usar
    (Upgrade Automático)
      Sem interrupção
      Crescimento natural
      Experiência fluida
    (Funcionalidades Ilimitadas)
      WhatsApp números ∞
      Mensagens enviadas ∞
      IA 6 segmentos
    (Preço Acessível)
      Entrada R$ 58
      40% menor concorrência
      Escala com negócio
```

## 🛠️ Implementação Técnica

**Tabelas Chave:**
- `conversation_billing` - Registro de conversas e cobrança
- `tenants` - Plano atual e limites
- `stripe_subscriptions` - Integração pagamentos

**Funções SQL:**
- `count_monthly_conversations(tenant_id, date)` 
- `calculate_monthly_billing(tenant_id, date)`

**Services:**
- `ConversationBillingService` - Lógica de cobrança
- `StripeService` - Integração pagamentos
- `NotificationService` - Comunicação upgrades