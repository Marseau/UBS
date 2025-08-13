# 📱 Frontend Page Flow - UBS System (REAL ANALYSIS)

## 🎯 Fluxo Principal de Páginas

```mermaid
graph TD
    A[🏠 Landing Page<br/>landing.html] --> B{Usuário Conhece?}
    B -->|Novo| C[📝 Registro<br/>register.html]
    B -->|Existente| D[🔐 Login<br/>login.html]
    
    C --> E[💳 Seleção Plano Conversa<br/>Básico R$58/Profissional R$116/Enterprise R$290]
    E --> F[💰 Checkout Stripe<br/>Externo]
    F --> G[✅ Sucesso<br/>success.html]
    
    D --> H{Tipo de Usuário?}
    H -->|Super Admin| I[📊 Dashboard Super Admin<br/>dashboard-standardized.html]
    H -->|Tenant Admin| J[📊 Dashboard Tenant<br/>tenant-business-analytics.html]
    G --> J
    
    I --> K[🏢 Seletor Tenant<br/>Visão Plataforma vs Individual]
    K -->|Plataforma| I
    K -->|Tenant Específico| J
    
    I --> L[📅 Agendamentos<br/>appointments-standardized.html]
    I --> M[👥 Clientes<br/>customers-standardized.html]
    I --> N[💬 Conversas<br/>conversations.html]
    I --> O[🛍️ Serviços<br/>services-standardized.html]
    I --> P[💳 Pagamentos<br/>payments-standardized.html]
    I --> Q[💰 Faturamento<br/>billing.html]
    I --> R[⚙️ Configurações<br/>settings.html]
    
    J --> L
    J --> M
    J --> N
    J --> O
    J --> P
    
    style A fill:#e1f5fe
    style I fill:#f3e5f5
    style J fill:#e8f5e8
    style C fill:#fff3e0
    style D fill:#fff3e0
```

## 🔄 Fluxo de Autenticação

```mermaid
sequenceDiagram
    participant U as Usuário
    participant L as Landing
    participant R as Registro
    participant S as Stripe
    participant D as Dashboard
    
    U->>L: Acessa sistema
    L->>R: Clica "Começar"
    R->>R: Preenche dados
    R->>S: Seleciona plano
    S->>S: Checkout
    S->>D: Redirect sucesso
    D->>D: Setup tenant
    D->>U: Dashboard ativo
```

## 📊 Dashboard Super Admin - Seções Principais

```mermaid
graph TD
    A[📊 Dashboard Super Admin] --> B[⚡ Quick Actions]
    A --> C[📈 KPIs Estratégicos - 8 Métricas]
    A --> D[📊 Performance e Análise - 4 Gráficos]
    A --> E[💡 Insights Estratégicos - 3 Tabelas]
    A --> F[🔍 Análise Detalhada - Ranking]
    
    B --> B1[🔄 Atualizar Dados]
    B --> B2[📅 Período: 7/30/90 dias]
    B --> B3[📥 Exportar Dados]
    
    C --> C1[⚖️ Receita/Uso Ratio]
    C --> C2[💰 MRR Plataforma]
    C --> C3[🏢 Tenants Ativos]
    C --> C4[⚙️ Eficiência Operacional]
    C --> C5[⚠️ Spam Rate]
    C --> C6[📅 Taxa Cancelamentos]
    C --> C7[📋 Total Agendamentos]
    C --> C8[🤖 Interações IA]
    
    D --> D1[📈 Revenue vs UsageCost Scatter]
    D --> D2[🍩 Status Agendamentos Doughnut]
    D --> D3[📊 Tendências Temporais Line]
    D --> D4[💰 MRR Crescimento Line]
    
    E --> E1[⚠️ Maior Distorção R/U]
    E --> E2[📈 Oportunidades Upsell]
    E --> E3[🚨 Alertas de Risco]
    
    F --> F1[🏆 Ranking Tenants]
    F --> F2[🔍 Filtros Busca/Status]
    F --> F3[📊 Métricas Comparativas]
    
    style A fill:#e8f5e8
    style C fill:#f3e5f5
    style D fill:#e1f5fe
    style E fill:#fff3e0
    style F fill:#fce4ec
```

## 🏢 Tenant Selector - Funcionalidade Chave

```mermaid
graph TD
    A[🏢 Tenant Selector] --> B[📈 Visão Plataforma]
    A --> C[🏢 Análise Individual]
    
    B --> D[Dashboard Super Admin<br/>Métricas de toda plataforma]
    
    C --> E[Lista Dinâmica de Tenants]
    E --> F[Tenant com Dados]
    E --> G[Tenant sem Dados]
    
    F --> H[Redirect para<br/>tenant-business-analytics.html]
    G --> I[Disponível mas sem métricas]
    
    H --> J[Dashboard Tenant Específico<br/>Métricas individuais]
    
    style B fill:#e8f5e8
    style H fill:#f3e5f5
    style J fill:#e1f5fe
```

## 🎨 Componentes e Widgets

```mermaid
graph TD
    A[Dashboard Layout] --> B[Header Navigation]
    A --> C[Sidebar Menu]
    A --> D[Main Content Area]
    A --> E[Footer]
    
    D --> F[Widget System]
    F --> G[📊 KPI Cards]
    F --> H[📈 Charts]
    F --> I[📋 Data Tables]
    F --> J[💬 Conversations Panel]
    F --> K[📱 Usage Widget]
    
    G --> G1[Total Agendamentos]
    G --> G2[Receita Mensal]
    G --> G3[Conversas IA]
    G --> G4[Clientes Ativos]
    
    H --> H1[Doughnut Charts]
    H --> H2[Line Charts]
    H --> H3[Bar Charts]
    H --> H4[Heatmaps]
    
    style F fill:#f0f0f0
    style G fill:#e8f5e8
    style H fill:#fff3e0
```

## 📱 Responsividade

```mermaid
graph LR
    A[🖥️ Desktop<br/>1920x1080] --> D[Dashboard Completo]
    B[💻 Laptop<br/>1366x768] --> D
    C[📱 Tablet<br/>768x1024] --> E[Dashboard Adaptado]
    F[📱 Mobile<br/>375x667] --> G[Dashboard Mobile]
    
    D --> D1[Sidebar Fixa]
    D --> D2[4 Colunas Widgets]
    D --> D3[Charts Grandes]
    
    E --> E1[Sidebar Colapsável]
    E --> E2[2 Colunas Widgets]
    E --> E3[Charts Médios]
    
    G --> G1[Menu Hamburger]
    G --> G2[1 Coluna Widgets]
    G --> G3[Charts Pequenos]
    
    style A fill:#e1f5fe
    style B fill:#e1f5fe
    style C fill:#fff3e0
    style F fill:#f3e5f5
```

## 🔒 Controle de Acesso

```mermaid
graph TD
    A[Usuário Acessa] --> B{Authenticated?}
    B -->|Não| C[Redirect Login]
    B -->|Sim| D{Role Check}
    
    D -->|Super Admin| E[Full Access]
    D -->|Tenant Admin| F[Tenant Scope]
    D -->|Support| G[Read Only]
    
    E --> H[Super Admin Dashboard]
    F --> I[Tenant Dashboard]
    G --> J[Support Dashboard]
    
    C --> K[Login Form]
    K --> L{Valid Credentials?}
    L -->|Não| M[Error Message]
    L -->|Sim| D
    
    style B fill:#fff3e0
    style D fill:#f3e5f5
    style L fill:#fff3e0
```

## 📊 Estados de Dados

```mermaid
stateDiagram-v2
    [*] --> Loading
    Loading --> DataLoaded
    Loading --> Error
    
    DataLoaded --> Refreshing
    Refreshing --> DataLoaded
    Refreshing --> Error
    
    Error --> Retry
    Retry --> Loading
    
    DataLoaded --> FilterApplied
    FilterApplied --> DataLoaded
    
    state DataLoaded {
        [*] --> DisplayingCards
        DisplayingCards --> DisplayingCharts
        DisplayingCharts --> DisplayingTables
    }
```

## 🎯 User Journey - Primeiro Uso

```mermaid
journey
    title Primeiro Uso do Sistema
    section Descoberta
      Encontra landing page: 5: Usuário
      Lê sobre benefícios: 4: Usuário
      Decide testar: 5: Usuário
    section Registro
      Clica "Começar": 5: Usuário
      Preenche dados: 3: Usuário
      Seleciona plano: 4: Usuário
      Paga com Stripe: 3: Usuário
    section Onboarding
      Recebe email boas-vindas: 5: Usuário
      Acessa dashboard: 5: Usuário
      Configura primeiro serviço: 4: Usuário
      Conecta WhatsApp: 4: Usuário
    section Primeiro Uso
      Recebe primeira conversa: 5: Usuário
      IA responde automaticamente: 5: Usuário
      Cliente agenda pelo chat: 5: Usuário
      Vê agendamento no dashboard: 5: Usuário
```

## 🔧 Ferramentas de Desenvolvimento

Para visualizar estes diagramas:

1. **VS Code**: Instale extensão "Mermaid Preview"
2. **Online**: Cole código em [mermaid.live](https://mermaid.live)
3. **CLI**: 
```bash
npm install -g @mermaid-js/mermaid-cli
mmdc -i frontend-page-flow.md -o frontend-flow.png
```