# 🎯 User Journey - Novo Cliente

## 📱 Jornada Completa do Cliente

```mermaid
journey
    title Jornada do Novo Cliente - UBS
    section Descoberta
      Busca no Google: 3: Cliente
      Encontra landing page: 4: Cliente
      Lê sobre benefícios: 4: Cliente
      Vê preços acessíveis: 5: Cliente
    section Interesse
      Clica "Começar": 5: Cliente
      Preenche dados básicos: 4: Cliente
      Seleciona segmento: 4: Cliente
      Escolhe plano básico: 5: Cliente
    section Conversão
      Insere dados cartão: 3: Cliente
      Confirma pagamento: 4: Cliente
      Recebe email confirmação: 5: Cliente
      Acessa dashboard: 5: Cliente
    section Onboarding
      Configura primeiro serviço: 4: Cliente
      Conecta WhatsApp: 3: Cliente
      Testa IA no chat: 5: Cliente
      Recebe primeira conversa: 5: Cliente
    section Primeiro Valor
      Cliente agenda pelo WhatsApp: 5: Cliente
      Comparece ao agendamento: 5: Cliente
      Avalia experiência: 5: Cliente
      Recomenda para outros: 5: Cliente
```

## 🔄 Fluxo Técnico de Conversão

```mermaid
sequenceDiagram
    participant C as Cliente
    participant LP as Landing Page
    participant R as Registro
    participant S as Stripe
    participant DB as Database
    participant E as Email
    participant D as Dashboard
    
    C->>LP: Acessa sistema
    LP->>R: Clica "Começar"
    R->>R: Preenche formulário
    R->>S: Redireciona checkout
    S->>S: Processa pagamento
    S->>DB: Webhook confirmação
    DB->>DB: Cria tenant + user
    DB->>E: Trigger email
    E->>C: Email boas-vindas
    S->>D: Redirect sucesso
    D->>C: Dashboard ativo
```

## 🎨 Touchpoints da Experiência

```mermaid
graph TD
    A[🔍 Google Search] --> B[🏠 Landing Page]
    B --> C[📝 Registro]
    C --> D[💳 Checkout Stripe]
    D --> E[✅ Confirmação]
    E --> F[📧 Email Boas-vindas]
    F --> G[📊 Dashboard]
    
    G --> H[⚙️ Configuração Inicial]
    H --> I[📱 Conexão WhatsApp]
    I --> J[🤖 Teste IA]
    J --> K[💬 Primeira Conversa]
    K --> L[📅 Primeiro Agendamento]
    
    style B fill:#e1f5fe
    style G fill:#f3e5f5
    style K fill:#e8f5e8
    style L fill:#fff3e0
```

## 📊 Métricas de Conversão

```mermaid
graph LR
    A[1000 Visitantes<br/>Landing Page] --> B[300 Clicam<br/>"Começar"]
    B --> C[200 Preenchem<br/>Formulário]
    C --> D[150 Chegam<br/>Checkout]
    D --> E[120 Completam<br/>Pagamento]
    E --> F[100 Configuram<br/>Sistema]
    F --> G[80 Recebem<br/>1ª Conversa]
    G --> H[60 Fazem<br/>1º Agendamento]
    
    A --> A1[30% CTR]
    B --> B1[67% Completam]
    C --> C1[75% Avançam]
    D --> D1[80% Convertem]
    E --> E1[83% Ativam]
    F --> F1[80% Engajam]
    G --> G1[75% Valor]
    
    style E fill:#e8f5e8
    style H fill:#fff3e0
```

## 🎯 Personas e Segmentos

```mermaid
mindmap
  root((Novos Clientes<br/>UBS))
    (💄 Beleza)
      Salão pequeno
      2-5 funcionários
      R$ 58 plano básico
      150 conversas/mês
    (🏥 Saúde)
      Consultório individual
      Psicólogo/Dentista
      R$ 58 plano básico
      120 conversas/mês
    (⚖️ Jurídico)
      Advogado solo
      Especialista
      R$ 116 profissional
      300 conversas/mês
    (📚 Educação)
      Professor particular
      Aulas online/presencial
      R$ 58 plano básico
      180 conversas/mês
    (🏃 Esportes)
      Personal trainer
      Aulas fitness
      R$ 58 plano básico
      100 conversas/mês
    (💼 Consultoria)
      Consultor independente
      Business coach
      R$ 116 profissional
      250 conversas/mês
```

## ⏱️ Timeline de Ativação

```mermaid
gantt
    title Timeline de Ativação - Primeiros 30 Dias
    dateFormat  YYYY-MM-DD
    section Dia 1
    Registro e pagamento     :done, d1, 2024-01-01, 1d
    Email boas-vindas        :done, d1-email, 2024-01-01, 1d
    Acesso dashboard         :done, d1-dash, 2024-01-01, 1d
    section Primeiros 3 Dias
    Configuração inicial     :active, config, 2024-01-01, 3d
    Conexão WhatsApp         :config-wa, 2024-01-02, 2d
    Primeiro teste IA        :test-ai, 2024-01-03, 1d
    section Primeira Semana
    Primeira conversa real   :first-conv, 2024-01-04, 4d
    Primeiro agendamento     :first-appt, 2024-01-06, 2d
    section Primeiros 30 Dias
    Uso regular sistema      :regular-use, 2024-01-08, 23d
    Avaliação satisfação     :satisfaction, 2024-01-30, 1d
```

## 🎭 Estados Emocionais

```mermaid
graph TD
    A[😐 Neutro<br/>Descoberta] --> B[🤔 Curioso<br/>Investigação]
    B --> C[😟 Ansioso<br/>Decisão]
    C --> D[😊 Aliviado<br/>Compra]
    D --> E[😕 Confuso<br/>Setup]
    E --> F[😃 Confiante<br/>Uso]
    F --> G[😍 Encantado<br/>Valor]
    
    style A fill:#f5f5f5
    style B fill:#e3f2fd
    style C fill:#fff3e0
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#e8f5e8
    style G fill:#e1f5fe
```

## 📞 Pontos de Contato

```mermaid
graph LR
    A[📱 WhatsApp Business] --> B[🤖 IA Automática]
    C[📧 Email Marketing] --> D[💌 Sequência Onboarding]
    E[📊 Dashboard] --> F[🎯 Gamificação]
    G[📞 Suporte] --> H[🆘 Chat Help]
    
    B --> I[✨ Experiência Mágica]
    D --> I
    F --> I
    H --> I
    
    style I fill:#e1f5fe
```

## 🏆 Marcos de Sucesso

```mermaid
graph TD
    A[🎯 Marco 1<br/>Registro + Pagamento] --> B[🎯 Marco 2<br/>Configuração Completa]
    B --> C[🎯 Marco 3<br/>WhatsApp Conectado]
    C --> D[🎯 Marco 4<br/>Primeira Conversa IA]
    D --> E[🎯 Marco 5<br/>Primeiro Agendamento]
    E --> F[🏆 Cliente Ativado<br/>Valor Percebido]
    
    A --> A1[Day 0 - 100%]
    B --> B1[Day 1 - 83%]
    C --> C1[Day 2 - 75%]
    D --> D1[Day 3 - 80%]
    E --> E1[Day 7 - 75%]
    F --> F1[Day 30 - 85%]
    
    style F fill:#e8f5e8
```

## 💡 Insights e Otimizações

### 🔍 **Pontos de Fricção Identificados:**
1. **Conexão WhatsApp** - Processo técnico complexo
2. **Configuração inicial** - Muitas opções confundem
3. **Primeira conversa** - Expectativa vs realidade

### 🚀 **Oportunidades de Melhoria:**
1. **Onboarding guiado** - Wizard step-by-step
2. **Templates prontos** - Configuração rápida por segmento
3. **Simulador IA** - Teste antes da primeira conversa real

### 📊 **KPIs Críticos:**
- **Time to First Value:** 3 dias (primeiro agendamento)
- **Activation Rate:** 75% (uso regular em 30 dias)
- **Setup Completion:** 83% (configuração completa)

Este fluxo mapeia toda a jornada do cliente desde a descoberta até se tornar um usuário ativo, identificando pontos críticos para otimização da conversão e experiência.