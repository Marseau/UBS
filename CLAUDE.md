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

### 3.5 Modo Teste (Status de Campanha)

Campanhas possuem status que controla o comportamento dos AI Agents:

| Status | Comportamento |
|--------|---------------|
| `draft` | Mensagens NAO processadas (campanha em configuracao) |
| `test` | Mensagens processadas, mas redirecionadas para contas de TESTE |
| `active` | Mensagens processadas e enviadas para leads REAIS |
| `paused` | Mensagens NAO processadas (campanha pausada) |

**Contas de Teste Oficiais**:

| Canal | Conta | Campo no BD | Uso |
|-------|-------|-------------|-----|
| **WhatsApp** | `5511999040605` | `test_whatsapp_number` | Replies WA em modo teste |
| **Instagram** | `@marseaufranco` | `test_instagram_username` | Replies IG em modo teste |

**Configuracao no Banco de Dados** (`cluster_campaigns`):
```sql
-- Campos de teste por campanha
test_whatsapp_number VARCHAR(20) DEFAULT '5511999040605',
test_instagram_username VARCHAR(50) DEFAULT 'marseaufranco',
test_instagram_user_id VARCHAR(50)  -- Preenchido automaticamente via trigger
```

**Auto-preenchimento do Instagram User ID**:
- Trigger `trg_propagate_test_instagram_user_id` em `aic_conversations`
- Quando conta de teste envia mensagem, captura o `instagram_user_id`
- Propaga automaticamente para `cluster_campaigns.test_instagram_user_id`
- Necessario: @marseaufranco deve enviar msg para @ubs.sistemas uma vez

**Comportamento dos Workflows em Modo Teste**:

| Workflow | Comportamento Test Mode |
|----------|------------------------|
| WA Agent v22 | Envia reply para `5511999040605` |
| IG Agent v23 | Se `test_instagram_user_id` existe: envia DM para conta teste. Se nao: apenas log Telegram |
| NoIG Agent v7 | Envia reply para `5511999040605` |

**Fluxo de Validacao**:
1. AI Agent processa a mensagem normalmente (gera resposta)
2. Em vez de enviar para o lead real, envia para conta de teste
3. Log no Telegram indica `🧪 TESTE`
4. Permite validar fluxo completo sem impactar leads reais

**Funcoes SQL com Test Mode**:
- `resolve_campaign_from_contact()` → retorna `test_mode`, `test_whatsapp_number`
- `resolve_campaign_by_recipient_id()` → retorna `test_mode`, `test_instagram_username`, `test_instagram_user_id`

---

## 4. ESTRUTURA DE BANCO DE DADOS

### 4.1 Tabelas Principais (USAR)

| Tabela | Proposito | Colunas Chave |
|--------|-----------|---------------|
| `instagram_leads` | Base de leads | `whatsapp_number`, `captured_at`, `updated_at` |
| `lead_embedding_components` | Embeddings bio/website/hashtags | `embedding_bio`, `embedding_website`, `embedding_hashtags`, `needs_final_recompute` |
| `lead_embedding_final` | Embedding final (clustering/search) | `embedding_final` (HNSW indexed), `computed_at` |
| `lead_embedding_d2p` | Embedding D2P (profissao) | `embedding_d2p`, `embedding_d2p_text` |
| `cluster_campaigns` | Campanhas | `campaign_name`, `outreach_enabled`, `whapi_channel_uuid` |
| `campaign_leads` | Leads por campanha | `campaign_id`, `lead_id`, `fit_score`, `outreach_channel` |
| `campaign_subclusters` | Clusters/personas | `cluster_name`, `persona`, `dm_scripts` |
| `aic_conversations` | Conversas unificadas | `channel` ('whatsapp' ou 'instagram') |
| `aic_message_queue` | Fila de mensagens | `channel`, `status`, `priority` |
| `instagram_accounts` | Contas IG por campanha | `instagram_username`, `campaign_id` |
| `v_my_campaigns_enriched` | VIEW otimizada para dashboard | Pre-agrega leads_count, whatsapp_count, docs_count |

### 4.2 Tabelas DEPRECADAS (NAO USAR)

| Tabela | Motivo | Substituida por |
|--------|--------|-----------------|
| `aic_campaigns` | Duplicada | `cluster_campaigns` |
| `aic_campaign_leads` | Duplicada | `campaign_leads` + `instagram_leads` |
| `aic_instagram_conversations` | Migrada | `aic_conversations` com `channel='instagram'` |
| `aic_instagram_dm_queue` | Migrada | `aic_message_queue` com `channel='instagram'` |
| `campaign_outreach_queue` | Duplicada | `aic_message_queue` |
| `lead_embeddings` | Splitada em 3 tabelas (2026-02-01) | `lead_embedding_components` + `lead_embedding_final` + `lead_embedding_d2p` |
| `lead_embeddings_old` | Tabela original renomeada (dropar apos 2026-02-15) | Substituida pelas 3 tabelas acima |

### 4.3 Arquitetura de Embeddings (3 Tabelas)

A tabela monolitica `lead_embeddings` foi splitada em 3 tabelas especializadas para eliminar TOAST bloat (~30KB/row → ~6KB/row por operacao).

```
lead_embedding_components (bio, website, hashtags)
  - fillfactor=70 para HOT updates
  - Trigger: IS DISTINCT FROM seta needs_final_recompute=TRUE
  - embedded_at para logica de TTL

lead_embedding_final (embedding_final)
  - HNSW index (vector_cosine_ops, m=16, ef_construction=64)
  - Write-once (so reescrito pelo worker async)
  - Trigger: sync para instagram_leads.embedding (temporario)

lead_embedding_d2p (embedding_d2p + texto)
  - HNSW index (vector_cosine_ops)
  - Ciclo de vida independente
```

**Formula do embedding_final (4 componentes, pesos normalizados):**

```
embedding_final = normalize_L2(
    0.40 * embedding_d2p       -- profissao + categoria + bio limpa
  + 0.25 * embedding_bio       -- bio completa
  + 0.20 * embedding_website   -- texto do website
  + 0.15 * embedding_hashtags  -- hashtags bio + posts
)
```

Quando componentes sao NULL, pesos sao redistribuidos proporcionalmente (soma sempre = 1.0).

**Worker async:** `recompute_final_embeddings_batch()` processa leads com `needs_final_recompute=TRUE` usando `FOR UPDATE SKIP LOCKED`.

**View de compatibilidade:** `lead_embeddings` e agora uma VIEW read-only (JOIN das 3 tabelas). INSERT/UPDATE nela falhara. Todo codigo deve usar as tabelas individuais.

**IMPORTANTE - Deletes em scrapers:** Ao deletar embeddings de um lead, deletar das 3 tabelas (nao ha cascade entre elas):
```typescript
await Promise.all([
  supabase.from('lead_embedding_components').delete().eq('lead_id', id),
  supabase.from('lead_embedding_final').delete().eq('lead_id', id),
  supabase.from('lead_embedding_d2p').delete().eq('lead_id', id),
]);
```

### 4.4 Funcoes SQL Criticas

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

### 5.1 Workflows OFICIAIS AIC (MANTER ATIVOS)

| Categoria | Workflow | ID | Status | Test Mode |
|-----------|----------|-----|--------|-----------|
| **INBOUND WhatsApp** | AIC WhatsApp AI Agent v22 | `2WRfnvReul8k7LEu` | ATIVO | ✅ `5511999040605` |
| **INBOUND Instagram** | AIC Instagram AI Agent v23 | `msXwN1pEc23RuZmu` | ATIVO | ✅ `test_instagram_user_id` |
| **INBOUND Landing** | AIC WhatsApp NoIG Agent v7 | `jeThTHI2TKrVKZLq` | ATIVO | ✅ `5511999040605` |
| **OUTBOUND Unified** | Cold Outreach Unified v1 | `H8MHjPU9AHNu1ZhF` | ATIVAR | - |
| **FILA** | Message Queue Worker | `fqrC0gRcJs8R26Xg` | ATIVO | - |
| **SUB WA** | Sub WhatsApp Inbound Handler v16 | `GzjJR2TZvBYARP4z` | ATIVO | - |
| **SUB IG** | Sub Instagram Inbound Handler v18 | `Ew4BuwfuPqgQHQxo` | ATIVO | - |
| **RAG** | AIC - Tool RAG | `BSUkoynjiYpjjQFT` | ATIVO | - |
| **EMBEDDING** | Generate Conversation Embedding | `GU57XIe0UKa4pkD8` | ATIVO | - |
| **RAG Search** | AIC - RAG Search (Multi-Campanha) | `v5EAyxM65y55kiVz` | ATIVO | - |

### 5.2 Workflows OUTBOUND DEPRECADOS (NAO USAR)

| Workflow | ID | Motivo | Substituido por |
|----------|-----|--------|-----------------|
| AIC - Cold Outreach WhatsApp | `9UG4OVwWQ3th4Nx3` | Usa `phones_normalized` | Cold Outreach Unified v1 |
| Cold Outreach Instagram DM | `Y4HRHYIqkXADHk8Z` | Hardcoded, antigo | Cold Outreach Unified v1 |
| Instagram DM Outreach - 2/hora | `7VpgPOzgm1MpUnIc` | Query direta, antigo | Cold Outreach Unified v1 |
| Outreach Inteligente | `POPWjaDgbwoCNvqX` | API diferente | Cold Outreach Unified v1 |

### 5.3 Workflows UBS DEPRECADOS (DESATIVADOS)

> **STATUS**: Todos os workflows UBS foram desativados em 2026-02-06

| Workflow | ID | Status |
|----------|-----|--------|
| WhatsAppSalonOriginal | `2JiMustQofSujglu` | ✅ DESATIVADO |
| WhatsAppSalon V1 | `GJno3Afkq0jHMwl4` | ✅ DESATIVADO |
| WABA Inbound -> Booking E2E | `emxzi66gOVEkljLL` | ✅ DESATIVADO |
| Human-Escalation-Management | `jMbu2yAcYDh05C5L` | ✅ DESATIVADO |
| Appointment-Confirmation-Reminders | `2QnBgl6WR2nqiYQL` | ✅ DESATIVADO |
| Business-Analytics-Metrics | `0R9D6dNyG8RlXfB6` | ✅ DESATIVADO |
| WharsAppSalonV2 | `CKj2mYnRVWNG0sTh` | ✅ DESATIVADO |

### 5.4 Arquitetura de Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE WORKFLOWS AIC                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INBOUND WHATSAPP                                                           │
│  ┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐   │
│  │ Whapi Webhook   │───>│ WA AI Agent v22      │───>│ Sub WA Handler  │   │
│  └─────────────────┘    │ (2WRfnvReul8k7LEu)   │    │ (GzjJR2TZvBYARP4z)│ │
│                         │ [Test Mode: ✅]      │    └─────────────────┘   │
│                         └──────────────────────┘                           │
│                                                                             │
│  INBOUND INSTAGRAM                                                          │
│  ┌─────────────────┐    ┌──────────────────────┐                           │
│  │ Meta Webhook    │───>│ IG AI Agent v23      │───> Meta API / Telegram   │
│  └─────────────────┘    │ (msXwN1pEc23RuZmu)   │                           │
│                         │ [Test Mode: ✅]      │                           │
│                         └──────────────────────┘                           │
│                                                                             │
│  INBOUND LANDING (SEM INSTAGRAM)                                            │
│  ┌─────────────────┐    ┌──────────────────────┐                           │
│  │ Webhook NoIG    │───>│ NoIG Agent v7        │───> Whapi API             │
│  └─────────────────┘    │ (jeThTHI2TKrVKZLq)   │                           │
│                         │ [Test Mode: ✅]      │                           │
│                         └──────────────────────┘                           │
│                                                                             │
│  OUTBOUND                                                                   │
│  ┌─────────────────┐    ┌──────────────────────┐                           │
│  │ Cron Trigger    │───>│ Cold Outreach v1     │───> Whapi / Puppeteer     │
│  └─────────────────┘    │ (H8MHjPU9AHNu1ZhF)   │                           │
│                         └──────────────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

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

### 6.4 Landing Pages Dinamicas por Campanha

Sistema de landing pages personalizadas por slug da campanha, permitindo que clientes usem URLs exclusivas em suas acoes de marketing.

**Rota:** `/lp/:slug`

**Exemplo:** `https://aic.ubs.app.br/lp/social-media-booster-360`

**Funcionamento:**
1. Slug e gerado automaticamente a partir do nome da campanha (trigger no banco)
2. Rota busca campanha pelo slug e injeta `CAMPAIGN_ID` na landing page
3. Lead preenche formulario (nome, email, WhatsApp, Instagram opcional)
4. API captura lead e redireciona para WhatsApp da campanha
5. AI Agent inicia qualificacao automatica

**Tabela:** `cluster_campaigns.slug` (VARCHAR, UNIQUE, auto-gerado)

**API de Captura de Leads:**

| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/api/landing/capture` | POST | Captura lead e retorna URL do WhatsApp |
| `/api/landing/campaign/:id` | GET | Info publica da campanha |
| `/api/landing/check-lead` | POST | Verifica se lead ja existe |

**Fluxo de Captura:**
- **Com Instagram:** Verifica em `campaign_leads`, se novo cria em `instagram_leads` + `campaign_leads` com `source='landing'`
- **Sem Instagram:** Redireciona para WhatsApp da campanha (AI Agent solicita IG na conversa)

**Portal do Cliente:** A URL da LP aparece na pagina `/cliente/credenciais` com instrucoes detalhadas de uso.

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
- [x] Atualizar funcoes SQL para usar `whatsapp_number` (PARCIAL - workflows corrigidos)
- [x] Desativar workflows UBS deprecados (7 workflows) ✅ 2026-02-06
- [x] Corrigir Cold Outreach Unified v1 para usar `whatsapp_number`
- [x] Corrigir Sub WhatsApp Inbound Handler para usar `whatsapp_number`
- [ ] Ativar Cold Outreach Unified v1 (fazer manualmente no N8N)

### Fase 2: Consolidacao
- [ ] Unificar tabelas duplicadas
- [ ] Implementar ratio 60/40 configuravel no Cold Outreach Unified
- [ ] Remover workflows outbound redundantes (4 workflows)

### Fase 3: Escala (10 campanhas)
- [x] Dashboard multi-campanha ✅ 2026-02-06
  - VIEW `v_my_campaigns_enriched` elimina N+1 queries (40 → 1)
  - Lazy loading de charts com Intersection Observer
  - Debounce de 300ms na busca
- [ ] Monitoramento de rate limiting
- [ ] Alertas automaticos

---

## 13. HISTORICO DE CORRECOES

### 2026-01-24 - Auditoria e Correcao de Workflows

**Analise Realizada:**
- Identificados 100 workflows no N8N
- Categorizados em: INBOUND, OUTBOUND, FILA, SUB-WORKFLOWS, UBS DEPRECADOS
- Encontrados 7 workflows UBS ainda ativos que devem ser desativados
- Encontrados 4 workflows outbound redundantes

**Correcoes Aplicadas:**

1. **Cold Outreach Unified v1** (`H8MHjPU9AHNu1ZhF`)
   - ANTES: Usava `phones_normalized` (DEPRECADO)
   - DEPOIS: Usa `whatsapp_number` diretamente
   - Query SQL corrigida no no "Buscar Leads Elegiveis"
   - No "Verificar WhatsApp Valido" atualizado

2. **Sub WhatsApp Inbound Handler** (`GzjJR2TZvBYARP4z`)
   - ANTES: Buscava perfil via `phones_normalized` com jsonb_array_elements
   - DEPOIS: Busca via `whatsapp_number` com LIKE simples
   - Versao atualizada: v15 → v16
   - Query SQL no no "Buscar Perfil Lead":
   ```sql
   -- ANTES (DEPRECADO)
   WHERE EXISTS (
     SELECT 1 FROM jsonb_array_elements(COALESCE(il.phones_normalized, '[]'::jsonb)) AS elem
     WHERE elem->>'number' LIKE '%...'
   )

   -- DEPOIS (CORRETO)
   WHERE il.whatsapp_number LIKE '%...'
   ```

**Pendencias (Fazer Manualmente no N8N):**
- Ativar: Cold Outreach Unified v1 (`H8MHjPU9AHNu1ZhF`)
- Desativar: 7 workflows UBS (ver secao 5.3)

### 2026-01-27 - Implementacao Completa de Test Mode

**Objetivo:** Permitir validar fluxo completo de campanhas sem impactar leads reais.

**Implementacoes Realizadas:**

1. **AIC WhatsApp AI Agent v22** (`2WRfnvReul8k7LEu`)
   - Validacao de status de campanha (só processa `active` ou `test`)
   - Test mode: redireciona replies para `5511999040605`
   - Log Telegram indica `🧪 TESTE`

2. **AIC Instagram AI Agent v23** (`msXwN1pEc23RuZmu`)
   - Validacao de status de campanha
   - Test mode com fallback:
     - Se `test_instagram_user_id` configurado → envia DM para conta teste
     - Se nao configurado → apenas log Telegram
   - Campos de teste vem da funcao SQL `resolve_campaign_by_recipient_id`

3. **AIC WhatsApp NoIG Agent v7** (`jeThTHI2TKrVKZLq`)
   - Validacao de status de campanha
   - Test mode: redireciona replies para `5511999040605`
   - Log Telegram indica `🧪 TESTE`

4. **Funcoes SQL Atualizadas:**
   - `resolve_campaign_from_contact()` → retorna `test_whatsapp_number`
   - `resolve_campaign_by_recipient_id()` → retorna `test_instagram_username`, `test_instagram_user_id`

5. **Trigger Automatico** (`trg_propagate_test_instagram_user_id`):
   - Dispara em INSERT/UPDATE de `instagram_user_id` em `aic_conversations`
   - Propaga automaticamente para `cluster_campaigns.test_instagram_user_id`
   - Quando @marseaufranco enviar msg para @ubs.sistemas, user_id sera capturado

**Campos Adicionados em `cluster_campaigns`:**
```sql
test_whatsapp_number VARCHAR(20) DEFAULT '5511999040605'
test_instagram_username VARCHAR(50) DEFAULT 'marseaufranco'
test_instagram_user_id VARCHAR(50) -- auto-preenchido via trigger
```

**Para Ativar Test Mode:**
1. Alterar status da campanha para `test` no banco
2. Para Instagram: @marseaufranco deve enviar uma msg para @ubs.sistemas (captura user_id)
3. Todas as respostas serao redirecionadas para contas de teste

### 2026-02-01 - Split lead_embeddings em 3 Tabelas

**Problema:** Tabela `lead_embeddings` com 5 colunas VECTOR(1536) (~30KB TOAST por row) causava upserts lentos (3.6s/lead), VACUUM de 23+ min, e 3.3GB de storage.

**Solucao:** Split em 3 tabelas especializadas com ciclos de vida independentes.

**Migracoes Executadas (Fases 0-7):**

1. **Fase 0:** Criacao de `lead_embedding_components`, `lead_embedding_final`, `lead_embedding_d2p` com indexes parciais e HNSW
2. **Fase 1:** Triggers — `trg_components_changed` (flag recompute via IS DISTINCT FROM), `trg_sync_final` (sync para instagram_leads.embedding)
3. **Fase 2:** Migracao de 73.5k+ rows em batches, HNSW indexes construidos (595MB final, 298MB d2p)
4. **Fase 3:** 26 funcoes SQL atualizadas (6 grupos: D2P, Clustering/Search, Calculo Final, Export, Hashtags, Legacy)
5. **Fase 4:** 4 views atualizadas (`v_embedding_stats`, `v_leads_embedding_queue`, `v_leads_needing_final_embedding`, `v_leads_ready_for_embedding`)
6. **Fase 5:** Worker async `recompute_final_embeddings_batch()` com FOR UPDATE SKIP LOCKED
7. **Fase 6:** Codigo atualizado — 5 servicos TS, 5 scripts Python, 2 workflows N8N (SQL inline), 1 Edge Function, 2 scripts JS
8. **Fase 7:** Cutover — `lead_embeddings` renomeada para `lead_embeddings_old`, view read-only criada

**Arquivos TypeScript Modificados:**
- `src/services/embedding-calculator.service.ts` — formula 4 componentes, le de components + d2p
- `src/services/vector-clustering.service.ts` — JOINs com final + components
- `src/services/instagram-scraper.service.ts` — delete das 3 tabelas
- `src/services/instagram-scraper-single.service.ts` — delete das 3 tabelas
- `src/services/instagram-scraper-user-search.service.ts` — delete das 3 tabelas

**N8N Workflows Modificados:**
- D2P Lead Enrichment Pipeline (`UkrFIYSpe9Eqifba`) — SQL inline → `lead_embedding_d2p`
- Bulk Upsert D2P (`6FbulZ82ImfITehh`) — SQL inline → `lead_embedding_d2p`

**Edge Function:** `generate-d2p-embedding` v3 — escreve em `lead_embedding_d2p`

**Fase 8 (Cleanup - apos 2026-02-15):**
- [ ] DROP VIEW lead_embeddings (compatibilidade)
- [ ] DROP TABLE lead_embeddings_old (~2.7 GB)
- [ ] Remover trigger trg_sync_final de lead_embedding_final
- [ ] Avaliar remocao de instagram_leads.embedding
- [ ] VACUUM FULL nas 3 novas tabelas

### 2026-02-02 - Criacao de HNSW Index em lead_embedding_final

**Problema:** Apos o split das 3 tabelas (2026-02-01), o index HNSW em `lead_embedding_final` nao existia. Buscas por similaridade vetorial faziam sequential scan em 75k+ rows.

**Tentativa 1 (falhou):** `CREATE INDEX CONCURRENTLY` com `maintenance_work_mem = 1GB` em instancia Micro (1GB RAM total). O index build consumiu toda a RAM e I/O burst (30 min/dia a 2 Gbps), deixando o BD completamente inacessivel. Necessario restart do projeto via Supabase Dashboard.

**Tentativa 2 (falhou):** Apos restart, o `statement_timeout` default do Supabase cancelou o CREATE INDEX antes de completar, deixando index invalido.

**Tentativa 3 (sucesso):**
1. `ALTER DATABASE postgres SET statement_timeout = 0;` — desabilitar timeout
2. `ALTER DATABASE postgres SET maintenance_work_mem = '512MB';` — metade da RAM
3. `CREATE INDEX CONCURRENTLY idx_lef_hnsw ON public.lead_embedding_final USING hnsw (embedding_final vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
4. `ALTER DATABASE postgres RESET maintenance_work_mem;` — resetar
5. `ALTER DATABASE postgres RESET statement_timeout;` — resetar

**Resultado:** Index `idx_lef_hnsw` criado com 587 MB, valido, 75,087 vetores.

**Licoes aprendidas para instancia Micro (1GB RAM):**
- **NUNCA** usar `maintenance_work_mem = 1GB` — nao deixa margem para o Postgres operar
- **Maximo seguro**: `512MB` para index builds
- **SEMPRE** desabilitar `statement_timeout` antes de CREATE INDEX grandes (via `ALTER DATABASE`, nao `SET`, pois CONCURRENTLY nao roda em transacao)
- **SEMPRE** resetar os settings apos o index build (`ALTER DATABASE ... RESET`)
- Burst de I/O da Micro: 2 Gbps por 30 min/dia, depois throttle a 87 Mbps
- Index HNSW de 75k vetores 1536d leva ~10-15 min com burst disponivel

**Estado final das 3 tabelas (validado):**

| Tabela | Rows | HNSW Index | Tamanho Index |
|--------|------|------------|---------------|
| `lead_embedding_components` | 75,545 | N/A (sem vetores de busca) | — |
| `lead_embedding_final` | 75,087 | `idx_lef_hnsw` ✅ | 587 MB |
| `lead_embedding_d2p` | 75,131 | `idx_led2p_hnsw` ✅ | 574 MB |

**Consistencia entre tabelas:**
- 470 leads em components sem final (`needs_final_recompute=true`, worker async resolve)
- 367 leads em final sem d2p (leads sem profissao classificada — esperado)
- 0 orphans (todas as embeddings tem lead correspondente em instagram_leads)

**Triggers ativos:** `trg_components_changed`, `trg_sync_final`, `trg_d2p_changed` — todos operacionais.

---

## 14. CONTATO E SUPORTE

- **Projeto**: AIC - Applied Intelligence Clustering
- **Supabase**: `qsdfyffuonywmtnlycri` (Universal Booking System - nome legado)
- **Documentacao**: `/docs/AIC*.md`

---

**Ultima atualizacao**: 2026-02-02
**Versao**: 2.4 (HNSW Index em lead_embedding_final)
