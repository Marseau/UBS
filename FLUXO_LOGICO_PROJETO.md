# 🔄 Fluxo Lógico - Sistema Universal de Agendamentos Multi-Tenant

## 📱 Visão Geral do Fluxo Principal

```mermaid
graph TD
    A[📱 Mensagem WhatsApp] --> B{🎯 Tipo de Mídia?}
    
    B -->|Texto| C[📝 Processamento Direto]
    B -->|Áudio| D[🎤 OpenAI Whisper<br/>Transcrição]
    B -->|Imagem| E[👁️ GPT-4 Vision<br/>Análise]
    
    D --> C
    E --> C
    
    C --> F[🧠 Agente de Classificação<br/>de Intenção]
    
    F --> G{🎯 Qual Intenção?}
    
    G -->|📅 Agendamento| H[🤖 BOOKING_AGENT]
    G -->|❌ Cancelamento| I[🤖 CANCELLATION_AGENT]
    G -->|✏️ Alteração| J[🤖 UPDATE_AGENT]
    G -->|❓ Informações| K[🤖 GENERAL_INQUIRY_AGENT]
    
    H --> L[🛠️ Ferramentas Externas]
    I --> L
    J --> L
    K --> L
    
    L --> M[💾 Atualização Banco de Dados]
    M --> N[📅 Sincronização Calendário]
    N --> O[📧 Notificações Email]
    O --> P[📱 Resposta WhatsApp]
```

## 🏗️ Arquitetura Técnica Multi-Tenant

```mermaid
graph TB
    subgraph "🌐 Entrada de Dados"
        WA[📱 WhatsApp<br/>Business API]
        WH[🔗 N8N Webhook]
    end
    
    subgraph "🤖 Camada de Processamento N8N"
        IT[🎯 Intent Recognition]
        BA[📅 Booking Agent]
        CA[❌ Cancel Agent]
        UA[✏️ Update Agent]
        GA[❓ General Agent]
    end
    
    subgraph "🧠 Inteligência Artificial"
        GPT[🧠 OpenAI GPT-4]
        WIS[🎤 Whisper Speech-to-Text]
        VIS[👁️ Vision API]
        MEM[💭 Conversation Memory]
    end
    
    subgraph "🏢 Backend Multi-Tenant"
        API[🚀 Express API<br/>TypeScript]
        TM[🏢 Tenant Middleware]
        RLS[🔐 Row Level Security]
    end
    
    subgraph "💾 Banco de Dados"
        SUP[🗄️ Supabase PostgreSQL]
        TEN[🏢 Tenants Table]
        USR[👥 Users Table]
        SER[🎯 Services Table]
        APP[📅 Appointments Table]
    end
    
    subgraph "🔗 Integrações Externas"
        GC[📅 Google Calendar]
        AT[📊 Airtable]
        EM[📧 Email Service]
    end
    
    WA --> WH
    WH --> IT
    
    IT --> BA
    IT --> CA
    IT --> UA
    IT --> GA
    
    BA -.-> GPT
    CA -.-> GPT
    UA -.-> GPT
    GA -.-> GPT
    
    IT -.-> WIS
    IT -.-> VIS
    IT -.-> MEM
    
    BA --> API
    CA --> API
    UA --> API
    GA --> API
    
    API --> TM
    TM --> RLS
    RLS --> SUP
    
    SUP --> TEN
    SUP --> USR
    SUP --> SER
    SUP --> APP
    
    API --> GC
    API --> AT
    API --> EM
    
    GC --> WA
    AT --> WA
    EM --> WA
```

## 🎯 Fluxo Detalhado por Agente

### 📅 BOOKING_AGENT - Agendamento

```mermaid
sequenceDiagram
    participant U as 👤 Usuário
    participant W as 📱 WhatsApp
    participant N as 🤖 N8N
    participant B as 📅 Booking Agent
    participant A as 📊 Airtable
    participant G as 📅 Google Calendar
    participant D as 💾 Database
    participant E as 📧 Email

    U->>W: "Quero agendar corte de cabelo"
    W->>N: Mensagem recebida
    N->>B: Roteamento para Booking Agent
    
    B->>A: Buscar serviços disponíveis
    A-->>B: Lista de serviços
    
    B->>G: Verificar disponibilidade
    G-->>B: Horários livres
    
    B->>D: Criar agendamento
    D-->>B: Confirmação salva
    
    B->>G: Criar evento no calendário
    G-->>B: Evento criado
    
    B->>E: Enviar notificação
    E-->>B: Email enviado
    
    B->>W: Resposta de confirmação
    W->>U: "Agendamento confirmado!"
```

### ❌ CANCELLATION_AGENT - Cancelamento

```mermaid
sequenceDiagram
    participant U as 👤 Usuário
    participant W as 📱 WhatsApp
    participant N as 🤖 N8N
    participant C as ❌ Cancel Agent
    participant D as 💾 Database
    participant G as 📅 Google Calendar
    participant E as 📧 Email

    U->>W: "Preciso cancelar meu agendamento"
    W->>N: Mensagem recebida
    N->>C: Roteamento para Cancel Agent
    
    C->>D: Buscar agendamentos do usuário
    D-->>C: Lista de agendamentos
    
    C->>W: "Qual agendamento cancelar?"
    W->>U: Opções de agendamentos
    U->>W: Seleciona agendamento
    W->>C: Confirmação de cancelamento
    
    C->>D: Atualizar status para 'cancelled'
    D-->>C: Agendamento cancelado
    
    C->>G: Remover evento do calendário
    G-->>C: Evento removido
    
    C->>E: Notificar cancelamento
    E-->>C: Notificação enviada
    
    C->>W: Confirmação de cancelamento
    W->>U: "Agendamento cancelado com sucesso"
```

## 🏢 Isolamento Multi-Tenant

```mermaid
graph TD
    subgraph "🌐 Request Processing"
        REQ[📥 HTTP Request]
        TEN[🏢 Tenant Resolution]
        RLS[🔐 Row Level Security]
    end
    
    subgraph "🏢 Tenant A - Salão de Beleza"
        TA_DATA[💾 Tenant A Data]
        TA_USERS[👥 Customers A]
        TA_SERVICES[💅 Beauty Services]
        TA_APPS[📅 Appointments A]
    end
    
    subgraph "🏢 Tenant B - Consultório Médico"
        TB_DATA[💾 Tenant B Data]
        TB_USERS[👥 Patients B]
        TB_SERVICES[🏥 Medical Services]
        TB_APPS[📅 Appointments B]
    end
    
    subgraph "🏢 Tenant C - Escritório Advocacia"
        TC_DATA[💾 Tenant C Data]
        TC_USERS[👥 Clients C]
        TC_SERVICES[⚖️ Legal Services]
        TC_APPS[📅 Appointments C]
    end
    
    REQ --> TEN
    TEN --> RLS
    
    RLS -->|tenant_id = A| TA_DATA
    RLS -->|tenant_id = B| TB_DATA
    RLS -->|tenant_id = C| TC_DATA
    
    TA_DATA --> TA_USERS
    TA_DATA --> TA_SERVICES
    TA_DATA --> TA_APPS
    
    TB_DATA --> TB_USERS
    TB_DATA --> TB_SERVICES
    TB_DATA --> TB_APPS
    
    TC_DATA --> TC_USERS
    TC_DATA --> TC_SERVICES
    TC_DATA --> TC_APPS
```

## 🧠 Sistema de IA Especializada

```mermaid
graph LR
    subgraph "🎯 Classificação de Domínio"
        MSG[📝 Mensagem Usuário] --> CLS[🧠 Classificador AI]
        CLS --> DOM{🏢 Domínio?}
    end
    
    subgraph "👨‍⚖️ Legal"
        DOM -->|Legal| LEG[⚖️ Agente Jurídico]
        LEG --> LEG_CFG[📋 Config: Consultas,<br/>Documentos, Honorários]
    end
    
    subgraph "🏥 Healthcare"
        DOM -->|Saúde| HEA[🩺 Agente Médico]
        HEA --> HEA_CFG[📋 Config: Sessões,<br/>Emergências, Histórico]
    end
    
    subgraph "💅 Beauty"
        DOM -->|Beleza| BEA[💄 Agente Beleza]
        BEA --> BEA_CFG[📋 Config: Serviços,<br/>Combos, Walk-ins]
    end
    
    subgraph "🎓 Education"
        DOM -->|Educação| EDU[📚 Agente Educação]
        EDU --> EDU_CFG[📋 Config: Matérias,<br/>Níveis, Locais]
    end
    
    subgraph "⚽ Sports"
        DOM -->|Esportes| SPO[🏃‍♂️ Agente Esportes]
        SPO --> SPO_CFG[📋 Config: Modalidades,<br/>Equipamentos, Clima]
    end
```

## 📊 Fluxo de Dados Completo

```mermaid
graph TD
    A[📱 WhatsApp Message] --> B[🎯 N8N Processing]
    B --> C[🧠 AI Analysis]
    C --> D[🤖 Specialized Agent]
    D --> E[🛠️ External Tools]
    E --> F[💾 Database Update]
    F --> G[📅 Calendar Sync]
    G --> H[📧 Email Notifications]
    H --> I[📱 WhatsApp Response]
    
    subgraph "🔄 Feedback Loop"
        I --> J[💭 Memory Update]
        J --> K[📈 Learning Data]
        K --> C
    end
    
    subgraph "🏢 Multi-Tenant Layer"
        F --> L[🔐 RLS Filter]
        L --> M[🏢 Tenant-Specific Data]
    end
    
    subgraph "🔗 External Integrations"
        E --> N[📅 Google Calendar API]
        E --> O[📊 Airtable API]
        E --> P[📧 Email Service API]
    end
```

## 🚀 Características Técnicas Principais

### ✅ **Multi-Tenancy Verdadeiro**
- Isolamento completo de dados por `tenant_id`
- Row Level Security (RLS) automático
- Suporte a usuários cross-tenant

### ✅ **IA Especializada por Domínio**
- Agentes configuráveis por tipo de negócio
- Personalidade e terminologia específica
- Triggers de escalação por domínio

### ✅ **Processamento Inteligente de Mídia**
- Transcrição de áudio com Whisper
- Análise de imagem com GPT-4 Vision
- Contexto unificado independente do tipo

### ✅ **Sincronização Multi-Sistema**
- Google Calendar para disponibilidade
- Airtable para dados de serviços
- Database principal para persistência
- Email para notificações

### ✅ **Memória Conversacional**
- Context buffer por sessão
- Histórico de agendamentos
- Preferências do usuário

Este fluxo garante uma experiência automatizada completa, desde a recepção da mensagem até a confirmação final, mantendo isolamento de dados e especialização por domínio de negócio.