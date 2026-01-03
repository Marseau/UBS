# CLAUDE.md

Este arquivo contém as regras globais e diretrizes de desenvolvimento para o sistema **AIC - Applied Intelligence Clustering**. Estas regras sao obrigatorias para TODOS os desenvolvimentos.

> **IMPORTANTE**: O foco do projeto e 100% AIC. O UBS (Universal Booking System) foi descontinuado, aproveitando apenas a experiencia de agendamento de reunioes.

---

## 1. VISAO DO PRODUTO AIC

### O que e AIC?
Plataforma de prospeccao outbound inteligente que transforma dados publicos do Instagram em leads quentes qualificados, sem necessidade de trafego pago.

### Proposta de Valor
- **Scraping inteligente** de perfis Instagram por hashtags/nichos
- **Clusterizacao por embeddings** para segmentacao precisa
- **Outreach personalizado (BDR)** via WhatsApp (60%) + Instagram DM (40%)
- **Agentes IA conversacionais (SDR)** para qualificacao automatica
- **Agendamento de reunioes** entre leads quentes e clientes

### Metricas de Sucesso
| Metrica | Meta |
|---------|------|
| Leads por campanha | ~2.000 |
| Taxa de resposta WhatsApp | +15% |
| Taxa de resposta Instagram | +8% |
| Leads quentes (agendamentos) | 6-15% |
| Silhouette score clusters | >0.65 |
| Duracao campanha | <30 dias |

---

## 2. ARQUITETURA TECNICA

### Stack Principal
- **Backend**: Node.js + TypeScript + Express
- **Banco de Dados**: Supabase PostgreSQL + pgvector
- **Orquestracao**: N8N (workflows)
- **IA**: OpenAI GPT-4o-mini (agentes conversacionais)
- **WhatsApp**: Whapi (Puppeteer-based, pessoal)
- **Instagram**: Meta Graph API (oficial) + Puppeteer (DM outbound)
- **Cache**: Redis (rate limiting, sessoes)

### Modelo de Campanha (1:1)
Cada campanha possui:
- 1 numero WhatsApp pessoal (canal Whapi)
- 1 conta Instagram oficial
- ~2.000 leads segmentados em clusters
- Configuracao propria de outreach

### Limites de Outreach por Campanha
| Canal | Limite Diario | Horario | Dias |
|-------|---------------|---------|------|
| WhatsApp | 120 DMs | 09h-18h | Seg-Sex |
| Instagram | 80 DMs | 09h-18h | Seg-Sex |

---

## 3. REGRAS DE NEGOCIO CRITICAS

### 3.1 Aging de Leads
| Tipo | Janela | Regra |
|------|--------|-------|
| **Leads Zona Ativa** | 45 dias | `captured_at` ou `updated_at` |
| **Hashtags Inteligencia** | 90 dias | `captured_at` ou `updated_at` |

```sql
-- Query padrao de validade de leads
WHERE captured_at >= CURRENT_DATE - INTERVAL '45 days'
   OR updated_at >= CURRENT_DATE - INTERVAL '45 days'
```

**IMPORTANTE**: Apos alocacao em campanha, leads sao "congelados" - nao expiram durante a campanha.

### 3.2 Ratio WhatsApp/Instagram
- **Padrao**: 60% WhatsApp / 40% Instagram
- **Flexivel**: Alguns clusters podem nao ter leads com WhatsApp
- **Prioridade**: WhatsApp tem prioridade por maior taxa de conversao

### 3.3 Validacao de WhatsApp
- **`whatsapp_number`** e a fonte de verdade (coluna confiavel)
- **NAO usar** `phones_normalized.valid_whatsapp` (deprecado)
- **NAO usar** `phone` diretamente (pode nao ser WhatsApp)
- Workflows de validacao de WhatsApp estao **DEPRECADOS**

### 3.4 Clusterizacao
- **Metodo preferido**: Embeddings + vetorizacao
- **Hashtags**: Para definicao de personas, dores, objetivos
- **Silhouette score minimo**: 0.65
- **Leads por cluster**: Distribuidos uniformemente

---

## 4. ESTRUTURA DE BANCO DE DADOS

### 4.1 Tabelas Principais (USAR)

| Tabela | Proposito | Colunas Chave |
|--------|-----------|---------------|
| `instagram_leads` | Base de leads | `whatsapp_number`, `captured_at`, `updated_at` |
| `cluster_campaigns` | Campanhas | `campaign_name`, `outreach_enabled`, `whapi_channel_uuid` |
| `campaign_leads` | Leads por campanha | `campaign_id`, `lead_id`, `fit_score`, `outreach_channel` |
| `campaign_subclusters` | Clusters/personas | `cluster_name`, `persona`, `dm_scripts` |
| `aic_conversations` | Conversas unificadas | `channel` ('whatsapp' ou 'instagram') |
| `aic_message_queue` | Fila de mensagens | `channel`, `status`, `priority` |
| `instagram_accounts` | Contas IG por campanha | `instagram_username`, `campaign_id` |

### 4.2 Tabelas DEPRECADAS (NAO USAR)

| Tabela | Motivo | Substituida por |
|--------|--------|-----------------|
| `aic_campaigns` | Duplicada | `cluster_campaigns` |
| `aic_campaign_leads` | Duplicada | `campaign_leads` + `instagram_leads` |
| `aic_instagram_conversations` | Migrada | `aic_conversations` com `channel='instagram'` |
| `aic_instagram_dm_queue` | Migrada | `aic_message_queue` com `channel='instagram'` |
| `campaign_outreach_queue` | Duplicada | `aic_message_queue` |

### 4.3 Funcoes SQL Criticas

```sql
-- Usar whatsapp_number (CORRETO)
SELECT * FROM instagram_leads WHERE whatsapp_number IS NOT NULL;

-- NAO usar phone (INCORRETO)
SELECT * FROM instagram_leads WHERE phone IS NOT NULL; -- DEPRECADO
```

**Funcoes que PRECISAM ser atualizadas**:
- `select_outreach_channel()` - Usar `whatsapp_number`
- `distribute_outreach_channels()` - Usar `whatsapp_number`
- `get_eligible_leads_for_outreach()` - Usar `whatsapp_number`

---

## 5. WORKFLOWS N8N

### 5.1 Workflows Ativos (MANTER)

| Workflow | ID | Funcao |
|----------|-----|--------|
| AIC WhatsApp AI Agent v15 | `2WRfnvReul8k7LEu` | Inbound WhatsApp |
| AIC Instagram AI Agent v15 | `msXwN1pEc23RuZmu` | Inbound Instagram |
| AIC - Message Queue Worker | `fqrC0gRcJs8R26Xg` | Processa fila de envio |
| Sub WhatsApp Inbound Lead Handler | `GzjJR2TZvBYARP4z` | Cria leads inbound |
| Sub Instagram Inbound Lead Handler v18 | `Ew4BuwfuPqgQHQxo` | Cria leads inbound IG |
| AIC - Tool RAG | `BSUkoynjiYpjjQFT` | Busca conhecimento |
| AIC - Generate Conversation Embedding | `GU57XIe0UKa4pkD8` | Embeddings |

### 5.2 Workflows DEPRECADOS (DESATIVAR)

| Workflow | ID | Motivo |
|----------|-----|--------|
| AIC - Validar Numeros WhatsApp | `9AsVuewEnxkrHins` | `whatsapp_number` ja e confiavel |
| AIC - Cold Outreach WhatsApp | `9UG4OVwWQ3th4Nx3` | Substituido pelo Unified |
| AIC - Cold Outreach Unified v1 | `H8MHjPU9AHNu1ZhF` | Usa validacao antiga |

### 5.3 Workflows UBS (DEPRECADOS)

Todos os workflows com prefixo UBS, WhatsAppSalon, ou relacionados a multi-tenant booking:
- `WhatsAppSalonOriginal`
- `WhatsAppSalon V1`
- `WABA Inbound -> Booking E2E`
- `Human-Escalation-Management`
- `Appointment-Confirmation-Reminders`
- `Business-Analytics-Metrics`

---

## 6. FRONTEND / UIs

### 6.1 UIs Principais AIC (MANTER)

| Rota | Arquivo | Proposito |
|------|---------|-----------|
| `/aic` | `aic-landing.html` | Landing page AIC |
| `/aic/onboarding` | `aic-campaign-onboarding.html` | Setup de campanha |
| `/campaigns` | `aic-campaigns-dashboard.html` | Dashboard admin |
| `/campaign/:slug/briefing` | `aic-campaign-briefing.html` | Briefing |
| `/campaign/:slug/analytics` | `aic-dashboard-prova.html` | Analytics |
| `/aic-docs.html` | `aic-docs.html` | Documentacao |

### 6.2 UIs de Inteligencia (MANTER)

| Rota | Proposito |
|------|-----------|
| `/dynamic-intelligence-dashboard.html` | Dashboard de hashtags |
| `/cluster-intention-dashboard.html` | Clusterizacao |
| `/niche-validator.html` | Validacao de nichos |

### 6.3 UIs DEPRECADAS (UBS)

- `super-admin-dashboard.html` (metricas UBS)
- `tenant-business-analytics.html` (metricas tenant)
- `landing.html` (landing UBS)
- `landingTM.html` (Taylor Made)

---

## 7. FLUXO DE DADOS COMPLETO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PIPELINE AIC COMPLETO                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. SCRAPING (Instagram)                                                    │
│     ├── Busca por hashtags/nichos                                          │
│     ├── Extrai perfis publicos                                             │
│     ├── Captura WhatsApp de bio/website                                    │
│     └── Salva em: instagram_leads                                          │
│                                                                             │
│  2. ENRIQUECIMENTO                                                          │
│     ├── Extrai hashtags (bio + posts)                                      │
│     ├── Gera embeddings (bio + website)                                    │
│     ├── Classifica business_category                                       │
│     └── Valida whatsapp_number (evidencias reais)                          │
│                                                                             │
│  3. CLUSTERIZACAO                                                           │
│     ├── KMeans por embeddings                                              │
│     ├── Silhouette score > 0.65                                            │
│     ├── Define personas por cluster                                        │
│     └── Gera DM scripts personalizados                                     │
│                                                                             │
│  4. ALOCACAO EM CAMPANHA                                                    │
│     ├── ~2.000 leads por campanha                                          │
│     ├── Distribui 60% WhatsApp / 40% Instagram                             │
│     ├── Calcula fit_score                                                  │
│     └── "Congela" leads (nao expiram)                                      │
│                                                                             │
│  5. OUTREACH (BDR - Business Development Representative)                    │
│     ├── Prospeccao ativa outbound                                          │
│     ├── Round-robin entre campanhas                                        │
│     ├── 120 WA + 80 IG por dia/campanha                                    │
│     ├── Puppeteer humanizado (todos outbound)                              │
│     └── Minutos randomizados, horario comercial                            │
│                                                                             │
│  6. CONVERSACAO (SDR - Sales Development Representative)                    │
│     ├── Qualificacao automatica de leads                                   │
│     ├── Inbound: Whapi webhook / Meta webhook                              │
│     ├── Contexto 3 camadas (briefing + lead + memoria)                     │
│     ├── GPT-4o-mini gera resposta                                          │
│     └── Enfileira reply (aic_message_queue)                                │
│                                                                             │
│  7. QUALIFICACAO                                                            │
│     ├── Detecta interesse (fit_score)                                      │
│     ├── Identifica lead quente                                             │
│     ├── Agenda reuniao (Google Calendar)                                   │
│     └── Meta: 6-15% agendamentos                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. METODOLOGIA DE DESENVOLVIMENTO

### 8.1 COLEAM00 (Obrigatorio)

1. **C**onteudo - Entenda completamente a tarefa
2. **O**bjetivo - Determine a entrega exata
3. **L**ocalizacao - Consulte as fontes (BD, N8N, docs)
4. **E**videncia - Fundamente em dados verificaveis
5. **A**nalise - Explique sua escolha tecnica
6. **M00** - Documente o raciocinio

### 8.2 Consulta Obrigatoria

**ANTES de qualquer desenvolvimento, consulte**:
1. `src/frontend/aic-landing.html` - Proposta de valor
2. `docs/AIC_UNIFIED_ARCHITECTURE.md` - Arquitetura
3. `docs/AIC-WHATSAPP-AGENT.md` - Agente WhatsApp
4. `docs/CARTA-OPERACAO-AIC.md` - Operacao

### 8.3 MCPs Disponiveis

- **Supabase MCP**: Banco de dados (project_id: `qsdfyffuonywmtnlycri`)
- **N8N MCP**: Workflows
- **Filesystem MCP**: Arquivos do projeto
- **Memory MCP**: Grafo de decisoes
- **Playwright/Puppeteer MCP**: Testes automatizados

### 8.4 Regras Rigidas

- **SEMPRE** use `whatsapp_number` (nunca `phone` ou `phones_normalized`)
- **SEMPRE** aplique aging de 45 dias para leads
- **SEMPRE** respeite ratio 60/40 WhatsApp/Instagram
- **NUNCA** use tabelas deprecadas (aic_campaigns, etc.)
- **NUNCA** crie implementacoes mock ou hardcoded
- **NUNCA** sugira funcionalidades fora do escopo AIC

---

## 9. ESTRUTURA DE DIRETORIOS

```
src/
├── services/
│   ├── instagram-scraper-*.service.ts    # Scraping
│   ├── instagram-lead-enrichment.service.ts  # Enriquecimento
│   ├── clustering-engine.service.ts      # Clusterizacao
│   ├── vector-clustering.service.ts      # Embeddings
│   ├── niche-validator.service.ts        # Validacao nichos
│   ├── outreach-agent.service.ts         # Outreach
│   ├── aic-puppeteer-worker.service.ts   # Envio humanizado
│   └── instagram-context-manager.service.ts  # Contexto IA
├── routes/
│   ├── hashtag-intelligence.routes.ts    # APIs de inteligencia
│   ├── instagram-scraper.routes.ts       # APIs scraping
│   ├── campaign-credentials.routes.ts    # Credenciais campanha
│   └── instagram-dm-webhook.routes.ts    # Webhooks
├── frontend/
│   ├── aic-*.html                        # UIs AIC
│   ├── dynamic-intelligence-dashboard.html
│   └── cluster-intention-dashboard.html
└── types/
    └── *.types.ts                        # Tipos TypeScript
```

---

## 10. COMANDOS DE DESENVOLVIMENTO

```bash
# Desenvolvimento
npm run dev                    # Servidor com hot reload
npm run build                  # Compilar TypeScript
npm run start                  # Producao

# Qualidade
npm run lint                   # ESLint
npm run lint:fix               # Auto-fix
npm run format                 # Prettier

# Database
npm run db:migrate             # Executar migracoes

# Scripts AIC
npx ts-node scripts/backfill-whatsapp-from-bio.ts    # Backfill WhatsApp
npx ts-node scripts/export-hashtags-csv.ts           # Exportar hashtags
```

---

## 11. VARIAVEIS DE AMBIENTE

```bash
# Supabase
SUPABASE_URL=https://qsdfyffuonywmtnlycri.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_key

# Whapi (WhatsApp)
WHAPI_API_URL=https://gate.whapi.cloud
# Tokens por canal configurados em whapi_channels

# Instagram (Meta)
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Telegram (logs)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## 12. PROXIMOS PASSOS (ROADMAP)

### Fase 1: Limpeza (Prioridade Alta)
- [ ] Atualizar funcoes SQL para usar `whatsapp_number`
- [ ] Desativar workflows deprecados
- [ ] Remover referencias a tabelas deprecadas

### Fase 2: Consolidacao
- [ ] Unificar tabelas duplicadas
- [ ] Criar workflow Outreach Unified v2
- [ ] Implementar ratio 60/40 configuravel

### Fase 3: Escala (10 campanhas)
- [ ] Dashboard multi-campanha
- [ ] Monitoramento de rate limiting
- [ ] Alertas automaticos

---

## 13. CONTATO E SUPORTE

- **Projeto**: AIC - Applied Intelligence Clustering
- **Supabase**: `qsdfyffuonywmtnlycri` (Universal Booking System - nome legado)
- **Documentacao**: `/docs/AIC*.md`

---

**Ultima atualizacao**: 2024-12-28
**Versao**: 2.0 (Foco AIC)
