# CLAUDE.md

Este arquivo contém as regras globais e diretrizes de desenvolvimento para o sistema **WhatsAppSalon-N8N / Universal Booking System**. Estas regras são obrigatórias para TODOS os desenvolvimentos e seguem os princípios de **Context Engineering**.

## 🎯 METODOLOGIA DE EXECUÇÃO OBRIGATÓRIA

### **Execute Prompt - Contrato de Desenvolvimento Claude**

**IMPORTANTE: Esta metodologia deve ser seguida RIGOROSAMENTE para todas as tarefas e implementações.**

#### **1. 📋 CONTEXTO OBRIGATÓRIO - CONSULTE NESTA ORDEM:**

**Primeira Consulta Obrigatória:**
- **📄 `src/frontend/LANDING.HTML`**: Leia PRIMEIRO para entender o SaaS
  - Proposta de valor
  - Funcionalidades oferecidas  
  - Público-alvo
  - Escopo real do produto

**Recursos de Apoio MCPs Disponíveis:**
- 🧠 **Memory MCP**: Acesso ao grafo de decisões, entidades e definições
- 📂 **Filesystem MCP**: Leitura/escrita de arquivos do projeto
- 🌐 **Crawled Pages**: Documentação raspada (Google Calendar, Stripe, WhatsApp, Engenharia de Contexto)
- 🧪 **Playwright MCP**: Testes automatizados web
- 🤖 **Puppeteer MCP**: Automação de browser real
- 🛠️ **GitHub MCP**: Histórico de commits, branches, pull requests
- 🗃️ **Supabase MCP**: Banco de dados do projeto e sua estrutura
- ⚡ **N8N MCP**: Acesso direto aos workflows

#### **2. 🧭 Metodologia COLEAM00 (Obrigatória)**

**Você deve seguir rigorosamente estas etapas:**

1. **C**onteúdo – Entenda completamente a tarefa descrita
2. **O**bjetivo – Determine a entrega exata e sucesso esperado
3. **L**ocalização – Consulte as fontes (filesystem, memory, crawled_pages)
4. **E**vidência – Fundamente sua resposta em dados verificáveis
5. **A**nálise – Explique sua escolha e caminho técnico
6. **M00** – Documente o raciocínio, mantendo consistência futura

#### **3. 🚫 REGRAS RÍGIDAS - NUNCA VIOLE:**

- ✅ **SEMPRE** alinhe respostas com a proposta da `landing.html`
- ✅ **SEMPRE** siga método Coleam00 das crawled_pages
- ❌ **NÃO** sugira funcionalidades fora do escopo da landing
- ❌ **NÃO** invente informações não encontradas
- ❌ **SE não souber, PERGUNTE** em vez de assumir
- ✅ **CITE fontes** (landing.html + MCPs utilizados + crawled_pages)
- ❌ **PROIBIDO** dar soluções rápidas/temporárias
- ✅ **SOLUÇÃO DEFINITIVA É OBRIGATÓRIA**

#### **4. 📝 FORMATO DE RESPOSTA OBRIGATÓRIO:**

```markdown
# 📌 Análise Inicial (COLEAM00)
[Aplicação da metodologia COLEAM00]

# 🗂️ Consultas Realizadas via MCPs
[Fontes consultadas e dados coletados]

# 💡 Proposta Técnica com Justificativa
[Solução técnica fundamentada]

# ✅ Passos para Execução
[Steps detalhados de implementação]

# 🧪 Testes Recomendados
[Estratégia de validação]

# 🔁 Memória Atualizada (se necessário)
[Documentação de decisões]
```

---

## 📄 Context Engineering - Princípios Fundamentais

**IMPORTANTE: Estes princípios se aplicam a TODOS os desenvolvimentos:**

### Workflow de Context Engineering
- **Sempre comece com INITIAL.md** - Defina requisitos antes de gerar PRPs
- **Use o padrão PRP**: INITIAL.md → `/generate-prp INITIAL.md` → `/execute-prp PRPs/filename.md`
- **Siga loops de validação** - Cada PRP deve incluir testes executáveis em 3 níveis
- **Context is King** - Inclua TODOS os padrões necessários, exemplos e documentação

### Metodologia de Pesquisa
- **Web search extensivamente** - Sempre pesquise padrões e melhores práticas
- **Estude documentação oficial** - APIs, bibliotecas e frameworks utilizados
- **Extração de padrões** - Identifique arquiteturas reutilizáveis
- **Documentação de armadilhas** - Documente async patterns, limites de modelo e problemas comuns

## 📚 Consciência do Projeto & Contexto

### Arquitetura Principal
- **Sistema SaaS Multi-Tenant** universal de agendamentos
- **WhatsApp Business API** + **OpenAI GPT-4** para IA conversacional
- **Supabase PostgreSQL** com Row Level Security (RLS)
- **Agentes IA especializados** por domínio (saúde, beleza, jurídico, educação, esportes, consultoria)
- **Dashboard de analytics** com métricas de plataforma

### Estrutura de Diretórios Estabelecida
```
src/
├── services/           # Lógica de negócio por domínio/feature
│   ├── agents/        # Agentes IA especializados por domínio
│   ├── adapters/      # Adaptadores para APIs externas
│   ├── tenant-metrics/ # Sistema otimizado de métricas (NEW)
│   │   ├── tenant-metrics-calculator.service.ts
│   │   ├── tenant-metrics-redis-cache.service.ts
│   │   ├── concurrency-manager.service.ts
│   │   ├── database-pool-manager.service.ts
│   │   └── platform-aggregation-optimized.service.ts
│   ├── redis-cache.service.ts          # Cache Redis principal
│   ├── redis-monitor.service.ts        # Monitoramento Redis avançado
│   ├── tenant-metrics-cron-optimized.service.ts  # Sistema 25x mais rápido
│   └── *.service.ts   # Serviços centrais do sistema
├── routes/            # Endpoints da API REST
├── types/             # Interfaces/tipos TypeScript
├── middleware/        # Middlewares Express
├── config/            # Configurações e conexões
├── frontend/          # Dashboard web (HTML/JS/CSS)
├── utils/             # Utilitários do sistema
│   ├── structured-logger.service.ts    # Logging estruturado
│   └── memory-optimizer.ts             # Otimização de memória
└── tests/             # Testes automatizados
```

### Padrões de Naming Consolidados
- **Serviços**: `*.service.ts`
- **Tipos**: `*.types.ts` ou `*.types.d.ts`
- **Rotas**: Organizadas por recurso em `routes/`
- **Agentes IA**: `*-agent.ts` em `services/agents/`
- **Middlewares**: `*-middleware.ts`

## 🧱 Estrutura de Código & Modularidade

### Limites de Arquivo & Organização
- **Nunca crie arquivos com mais de 500 linhas** - Refatore dividindo em módulos
- **Organize código em módulos separados** agrupados por feature/responsabilidade:
  - `agent.ts` - Definição principal do agente e lógica de execução
  - `tools.ts` - Funções de ferramenta usadas pelo agente
  - `types.ts` - Modelos Pydantic e classes de dependência
- **Use importações consistentes** - Prefira importações relativas dentro de pacotes
- **Use dotenv** - Todas as variáveis de ambiente via `.env`

### Padrões Multi-Tenant Obrigatórios
- **Row Level Security (RLS)** - Todas as queries são tenant-scoped via políticas Supabase
- **Isolamento de dados** - Tabelas incluem `tenant_id` como foreign key
- **Autenticação por tenant** - Usuários podem interagir com múltiplos tenants
- **Configuração por domínio** - Cada tenant opera em domínios específicos de negócio

## 🤖 Padrões de Desenvolvimento de IA

### Criação de Agentes IA
- **Design agnóstico de modelo** - Suporte múltiplos providers (OpenAI, Anthropic)
- **Injeção de dependência** - Use deps_type para serviços externos e contexto
- **Saídas estruturadas** - Use modelos Pydantic para validação de resultado
- **Prompts de sistema abrangentes** - Instruções estáticas e dinâmicas

### Padrões de Integração de Ferramentas
- **Context-aware tools** - Use RunContext[DepsType] para ferramentas com contexto
- **Ferramentas simples** - Use decorators plain para ferramentas sem dependências de contexto
- **Validação de parâmetros** - Use modelos Pydantic para parâmetros de ferramenta
- **Tratamento de erros** - Implemente mecanismos de retry e recuperação de erro

### WhatsApp Business API Integration
- **Processamento de webhook** - Trata mensagens WhatsApp via `/api/whatsapp/webhook`
- **Roteamento multi-tenant** - Baseado em mapeamento de número de telefone
- **Suporte a mídia** - Imagens, áudio, documentos processados via IA multimodal
- **Gerenciamento de templates** - Templates de mensagens WhatsApp armazenados por tenant

## ✅ Gestão de Tarefas & Validação

### Loops de Validação Obrigatórios
- **Nível 1: Sintaxe & Estilo**
  ```bash
  npm run lint          # ESLint check
  npm run lint:fix      # Auto-fix issues
  npm run format        # Prettier formatting
  npm run build         # TypeScript compilation
  ```

- **Nível 2: Testes Unitários**
  ```bash
  npm run test:ai              # Sistema de testes IA
  npm run test:ai-full         # Testes abrangentes IA
  npm run test:whatsapp        # Integração WhatsApp
  npm run test:all             # Todos os testes IA
  ```

- **Nível 3: Testes de Integração**
  ```bash
  npm run test:e2e             # End-to-end Playwright
  npm run test:security        # Testes RLS security
  npm run analytics:health-check # Sistema de analytics
  ```

### Gestão de Tarefas Context Engineering
- **Marque tarefas completas IMEDIATAMENTE** após finalizar implementações
- **Atualize status de tarefa em tempo real** conforme progresso do desenvolvimento
- **Teste comportamento** antes de marcar tarefas de implementação como completas
- **Crie sub-tarefas** descobertas durante desenvolvimento

## 🔎 Padrões de Código & Convenções

### TypeScript Standards
- **Use TypeScript strict mode** - Configuração rigorosa habilitada
- **Path aliases configurados**: `@/` mapeia para `src/` para importações limpas
- **Tipos explícitos** - Anotações de tipo para todos os parâmetros e retornos de função
- **Documentação JSDoc** - Para todas as funções e classes exportadas
- **Async/await** - Para todas as operações assíncronas

### Segurança & Autenticação
- **JWT-based authentication** - Com controle de acesso baseado em função
- **Sistema de permissões** - Permissões granulares para diferentes features
- **Isolamento de tenant** - Acesso automaticamente scoped por tenant para tenant admins
- **Gerenciamento de senhas** - Hash seguro de senhas com bcrypt
- **Gerenciamento de sessão** - Refresh de token e logout seguro

### Padrões de Base de Dados
- **Migrations obrigatórias**: Use `npm run db:migrate` para mudanças de schema
- **RLS policies** - Testadas com `npm run test:rls-security`
- **Seed data** - Use `npm run db:populate` para dados de desenvolvimento
- **Connection pooling** - Com reconexão automática e limites de conexão

### Otimizações de Performance & Escala (NEW)

#### Redis Cache Strategy
- **Cache principal**: `redis-cache.service.ts` para sessões WhatsApp e rate limiting
- **Cache especializado**: `tenant-metrics-redis-cache.service.ts` para métricas com fallback
- **TTL otimizado**: 10min para dados dinâmicos, 30min para métricas, 1h para dados estáticos
- **Eviction policy**: LRU com limite de 1GB para produção
- **Monitoring**: `redis-monitor.service.ts` com alertas automáticos

#### Concorrência Inteligente
- **Adaptive batching**: Lotes de 25-100 itens baseado na carga do sistema
- **Dynamic concurrency**: 10-100 threads conforme número de tenants
- **Circuit breaker**: Proteção contra cascata de falhas
- **Health checks**: Monitoramento contínuo de recursos do sistema

#### Database Pool Management
- **Pool size**: 10-100 conexões baseado na demanda
- **Connection lifecycle**: Timeout de 30s para aquisição, 5min idle
- **Query optimization**: Prepared statements e índices otimizados
- **Deadlock prevention**: Retry automático com backoff exponencial

## 📄 Comandos de Desenvolvimento Essenciais

### Core Development Workflow
```bash
# Desenvolvimento
npm run dev                    # Servidor desenvolvimento com hot reload
npm run dev:alt               # Servidor dev na porta 3001 (alternativo)
npm run build                 # Compilar TypeScript para dist/
npm run start                 # Executar build de produção

# Qualidade de Código
npm run lint                  # Verificação ESLint
npm run lint:fix              # Auto-fix problemas de linting
npm run format                # Formatação Prettier

# Testes & Sistema IA
npm run test:ai               # Cenários de teste do sistema IA
npm run test:ai-full          # Testes IA abrangentes
npm run test:whatsapp         # Teste integração WhatsApp
npm run test:all              # Executar todos os testes IA

# Base de Dados
npm run db:migrate            # Executar migrações de banco
npm run db:populate           # Popular com dados de teste
npm run db:setup              # Setup completo do banco

# Analytics & Métricas (High-Scale Optimized)
npm run analytics:aggregate      # Agregação diária de métricas
npm run analytics:health-check   # Verificação de saúde do sistema
npm run metrics:comprehensive    # Execução manual sistema otimizado (10k+ tenants)
npm run metrics:risk-assessment  # Avaliação de risco semanal
npm run metrics:platform-agg     # Agregação plataforma manual
npm run redis:monitor            # Monitoramento Redis em tempo real
npm run redis:optimize           # Otimização cache Redis
```

### Variáveis de Ambiente Requeridas
```bash
# Base de Dados
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# WhatsApp Business API  
WHATSAPP_TOKEN=your_whatsapp_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_WEBHOOK_VERIFY_TOKEN=your_verify_token

# Serviços IA
OPENAI_API_KEY=your_openai_api_key

# Email Service (Zoho)
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=587
ZOHO_SMTP_USER=your_zoho_email
ZOHO_SMTP_PASSWORD=your_zoho_password

# Redis Configuration (CRITICAL for 10k+ tenants)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_MAX_MEMORY=1073741824          # 1GB memory limit
REDIS_EVICTION_POLICY=allkeys-lru    # LRU eviction policy  
REDIS_CONNECTION_TIMEOUT=10000       # 10s connection timeout
REDIS_COMMAND_TIMEOUT=5000           # 5s command timeout
ENABLE_REDIS_CACHE=true              # Enable Redis caching

# High-Scale Metrics System
ENABLE_UNIFIED_CRON=true             # Enable optimized metrics system
ENABLE_DAILY_METRICS=true            # Daily comprehensive metrics  
ENABLE_WEEKLY_RISK=true              # Weekly risk assessment
ENABLE_MONTHLY_EVOLUTION=true        # Monthly evolution metrics
DAILY_METRICS_SCHEDULE="0 2 * * *"   # 2 AM daily execution
```

## 🚫 Anti-Padrões a Sempre Evitar

### Desenvolvimento IA
- ❌ Não pule testes de agente - Sempre use TestModel/FunctionModel para validação
- ❌ Não hardcode strings de modelo - Use configuração baseada em ambiente
- ❌ Não ignore padrões async - IA tem considerações específicas de async/sync
- ❌ Não crie grafos de dependência complexos - Mantenha dependências simples e testáveis
- ❌ Não esqueça tratamento de erro de ferramenta - Implemente retry adequado e degradação graceful

### Desenvolvimento Geral
- ❌ **PROIBIDO: NUNCA criar implementações mock ou hardcoded** - Use sempre integrações reais (Supabase, APIs, etc.)
- ❌ Não assuma contexto faltante - Faça perguntas se incerto
- ❌ Não alucine bibliotecas ou funções - Use apenas pacotes Python conhecidos e verificados
- ❌ Não ignore validação de entrada - Use modelos Pydantic para todas as entradas externas
- ❌ Não delete ou sobrescreva código existente - A menos que explicitamente instruído
- ❌ Não pule loops de validação - Cada etapa deve incluir verificação

## 🔧 Padrões de Uso de Ferramentas

### Pesquisa & Documentação
- **Use web search extensivamente** para pesquisa de IA e documentação
- **Siga padrões de comando** para comandos slash e workflows de agente
- **Use loops de validação de agente** para garantir qualidade em cada etapa de desenvolvimento
- **Teste com múltiplos provedores de modelo** para garantir compatibilidade de agente

### Multi-Modal AI Processing
- **Imagens**: Processadas via GPT-4 Vision para análise de conteúdo
- **Áudio**: Transcritas via API Whisper
- **Documentos**: Extração de texto para processamento IA
- **Mídia storage**: Todas as mídias armazenadas na tabela `whatsapp_media` com resultados de processamento

## 📊 Sistema de Analytics & Métricas

### UBS Metric System (Otimizado para +10.000 Tenants)
- **Tabela central**: `ubs_metric_system` para métricas consolidadas da plataforma
- **Métricas por tenant**: `tenant_platform_metrics` com períodos de 7/30/90 dias
- **Cache de dados**: `chart_data_cache` para dados de gráfico pré-computados
- **Sistema otimizado**: `tenant-metrics-cron-optimized.service.ts` com performance 25x superior

### Arquitetura de Alto Desempenho (NEW)
**Migration Path**: `unified-cron.service` → `tenant-metrics-cron-optimized.service`

#### Redis Cache System
```bash
# Configurações otimizadas para 10k+ tenants
REDIS_HOST=localhost
REDIS_PORT=6379  
REDIS_MAX_MEMORY=1073741824        # 1GB limite
REDIS_EVICTION_POLICY=allkeys-lru  # LRU eviction
ENABLE_REDIS_CACHE=true
```

#### Processamento Inteligente
- **Concorrência adaptativa**: 10-100 threads baseado no número de tenants
- **Batching inteligente**: 25-100 tenants por lote conforme carga
- **Circuit breaker**: Proteção contra falhas em cascata
- **Connection pooling**: 10-100 conexões de banco otimizadas

#### Performance Metrics
- **25x mais rápido** que sistema anterior
- **Suporte para 10.000+ tenants** simultâneos  
- **Cache hit rate >90%** com Redis otimizado
- **Processamento paralelo** para períodos 7d/30d/90d
- **Tempo de execução**: <2 horas para todos os tenants

### Dashboards Duplos
1. **Super Admin Dashboard** (`/super-admin-dashboard`):
   - 8 KPIs estratégicos da plataforma (MRR, Tenants Ativos, Ratio Receita/Uso, etc.)
   - 4 gráficos analíticos (Revenue vs Usage scatter, Appointment Status donut, etc.)
   - Análise de distorção e oportunidades de upsell
   - **Monitoring Redis**: Performance, latência e health check em tempo real

2. **Tenant Business Analytics** (`/tenant-business-analytics`):
   - Métricas de performance individual do tenant
   - Percentuais de participação nos totais da plataforma
   - Scoring de business intelligence e avaliação de risco

### Endpoints de Administração (High-Scale Operations)
```bash
# Health & Monitoring
GET  /api/health                           # Health check básico
GET  /api/health/redis                     # Health check Redis detalhado
GET  /api/monitoring/system                # Métricas do sistema completas

# Execução Manual de Métricas (Requer Auth)
POST /api/admin/execute-comprehensive-metrics    # Executar todas as métricas
POST /api/cron/trigger/comprehensive             # Trigger via cron management
POST /api/cron/trigger/risk-assessment           # Trigger avaliação de risco
POST /api/cron/trigger/platform-aggregation     # Trigger agregação plataforma

# Redis Management
GET  /api/redis/stats                      # Estatísticas Redis
POST /api/redis/optimize                   # Otimizar cache Redis
POST /api/redis/clear                      # Limpar cache (desenvolvimento)

# Super Admin Endpoints (Bypass Auth em Development)
GET  /api/super-admin/platform-metrics    # Métricas plataforma completas
GET  /api/super-admin/tenant-stats         # Estatísticas por tenant
GET  /api/super-admin/system-health        # Health check completo do sistema
```

---

## 🎯 Implementação de Context Engineering

### Ao Criar Novas Features
1. **Crie INITIAL.md** descrevendo requisitos específicos
2. **Execute `/generate-prp INITIAL.md`** para criar blueprint abrangente
3. **Execute `/execute-prp PRPs/feature-name.md`** para implementação
4. **Valide em 3 níveis** (sintaxe, testes, integração)
5. **Documente padrões** descobertos durante implementação

### Ao Modificar Sistemas Existentes
1. **Estude padrões existentes** no código base
2. **Siga convenções estabelecidas** de arquitetura e naming
3. **Preserve funcionalidade multi-tenant** e isolamento RLS
4. **Teste compatibilidade** com agentes IA existentes
5. **Atualize documentação** relevante

---

## 📋 CONTRATO DE DESENVOLVIMENTO - RESUMO EXECUTIVO

**🎯 EXECUÇÃO OBRIGATÓRIA PARA CADA TAREFA:**

1. **📄 Consulte `landing.html` PRIMEIRO**
2. **🧭 Aplique metodologia COLEAM00**
3. **🗂️ Use MCPs para coleta de dados**
4. **📝 Responda no formato obrigatório**
5. **✅ Implemente solução definitiva**
6. **🧪 Valide em 3 níveis**
7. **🔁 Documente decisões**

**🚫 NUNCA:**
- Sugerir funcionalidades fora do escopo
- Inventar informações não verificadas
- Dar soluções temporárias
- Violar padrões estabelecidos

**✅ SEMPRE:**
- Alinhar com proposta de valor do SaaS
- Citar fontes consultadas
- Implementar soluções robustas
- Seguir arquitetura multi-tenant
- Preservar performance e segurança

Estas regras garantem desenvolvimento consistente, seguro e alinhado com os princípios de Context Engineering para o sistema WhatsAppSalon-N8N / Universal Booking System.