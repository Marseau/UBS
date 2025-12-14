# AIC WhatsApp AI Agent - Arquitetura e Documentação

Sistema de automação inteligente para WhatsApp com IA conversacional, RAG (Retrieval-Augmented Generation), memória de contexto e envio humanizado via Puppeteer.

## Visão Geral

O sistema AIC WhatsApp AI Agent é composto por:

1. **Workflow N8N** - Processa mensagens recebidas e gera respostas via IA
2. **Puppeteer Worker** - Envio humanizado de mensagens outbound
3. **Sistema de Filas** - Controle de envio com rate limiting
4. **Fallback Instagram DM** - Alternativa quando WhatsApp falha

---

## Arquitetura de Envio

### Separação REPLY vs OUTBOUND

| Tipo | Descrição | Método | Fila | Humanização |
|------|-----------|--------|------|-------------|
| **REPLY** | Resposta a msg recebida | Whapi API direto | Não | Apenas `typing_time` |
| **OUTBOUND** | DM frio/proativo | Puppeteer | Sim | Completa |

**Justificativa da separação:**
- **REPLY direto** elimina risco de duplicação (sem fila = sem race condition)
- **OUTBOUND via fila** permite rate limiting e humanização completa
- Puppeteer só processa fila, nunca intercepta replies

---

## Componentes

### 1. Workflow N8N: AIC WhatsApp AI Agent (RAG + Memory)

**ID:** `2WRfnvReul8k7LEu`

**Fluxo:**
```
Webhook Whapi → Extrair Dados → IF Incoming?
  ├─ TRUE → Get/Create Conversation → Salvar Msg Lead
  │         → AI Agent (GPT-4o-mini + RAG + Memory)
  │         → Salvar Msg AI → Whapi: Enviar Reply → Telegram Log
  └─ FALSE → Telegram Debug (ignora mensagens próprias)
```

**Características:**
- **Modelo:** GPT-4o-mini (rápido e econômico)
- **RAG Tool:** Busca na base de conhecimento AIC via pgvector
- **Memory:** Window Buffer com últimas 10 mensagens por sessão
- **Envio:** Whapi direto com `typing_time` de 3-8 segundos

### 2. Puppeteer Worker Service

**Arquivo:** `src/services/aic-puppeteer-worker.service.ts`

**Responsabilidades:**
- Processar fila `aic_message_queue`
- Simular digitação humana (velocidade variável, pausas, typos)
- Detectar números WhatsApp inválidos
- Mover leads para fila Instagram DM quando necessário

**Configurações de Segurança:**
```typescript
const SAFETY_CONFIG = {
  maxNewNumbersPerDay: 25,        // Limite de novos contatos/dia
  maxInvalidNumbersPerDay: 10,    // Máx números inválidos antes de pausar
  maxTotalMessagesPerDay: 50,     // Total de mensagens/dia
  delayAfterInvalidNumber: 45000, // 45s após número inválido
  delayAfterConsecutiveErrors: 120000, // 2min após 3 erros
  pauseAfterTooManyInvalids: 3600000,  // 1h pausa
  maxConsecutiveErrors: 3,
  maxInvalidBeforePause: 5,
  outboundStartHour: 9,           // Início janela de envio
  outboundEndHour: 18,            // Fim janela de envio
  outboundDays: [1, 2, 3, 4, 5]   // Seg-Sex apenas
};
```

### 3. Sistema de Humanização

**Arquivo:** `src/services/aic-humanizer.service.ts`

**Funcionalidades:**
- Velocidade de digitação variável (150-350ms por caractere)
- Pausas naturais em pontuação
- Typos controlados com correção (1-2% de chance)
- Delays entre palavras

### 4. Outreach Routes

**Arquivo:** `src/routes/aic-outreach.routes.ts`

**Endpoints:**

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/aic/outreach/landing-page-click` | Registra click no botão WhatsApp da landing |
| POST | `/api/aic/outreach/identify-source` | Identifica origem do lead |
| GET | `/api/aic/outreach/eligible-leads/:campaignId` | Lista leads elegíveis para outreach |
| GET | `/api/aic/outreach/phones-to-validate/:campaignId` | Telefones pendentes de validação |
| POST | `/api/aic/outreach/validate-phone` | Registra resultado de validação |
| GET | `/api/aic/outreach/instagram-dm-queue/:campaignId` | Leads para fallback Instagram |
| GET | `/api/aic/outreach/stats/:campaignId` | Estatísticas de outreach |
| POST | `/api/aic/outreach/add-phone` | Adiciona telefone a um lead |
| POST | `/api/aic/outreach/opt-out` | Marca lead como opt-out |

### 5. Sistema de Agendamento Automático

**Arquivos:**
- `src/services/google-oauth.service.ts` - Gerenciamento OAuth 2.0
- `src/services/google-calendar.service.ts` - Integração Google Calendar API
- `src/services/encryption.service.ts` - Criptografia AES-256-GCM
- `src/services/meeting-reminders.service.ts` - Lembretes automáticos
- `src/routes/google-calendar-oauth.routes.ts` - Endpoints OAuth

**Funcionalidades:**
- **Detecção Inteligente:** AI Agent detecta quando lead está pronto para reunião (interest_score 0.6-0.8)
- **Busca de Slots:** Consulta Google Calendar e retorna 3 horários disponíveis
- **Oferta Automatizada:** Envia slots via WhatsApp formatados naturalmente
- **Confirmação:** Lead escolhe número (1, 2 ou 3) e sistema agenda automaticamente
- **Criação de Evento:** Insere compromisso no Google Calendar com dados do lead
- **Convite por Email:** Lead recebe convite do Google Calendar automaticamente
- **Lembretes:** Sistema envia lembretes 24h e 1h antes via WhatsApp

**Configuração por Campanha:**
```typescript
// Tabela: campaign_google_calendar
{
  campaign_id: UUID,
  google_calendar_id: 'primary',
  calendar_timezone: 'America/Sao_Paulo',
  working_hours_start: 9,
  working_hours_end: 18,
  working_days: [1,2,3,4,5],  // Seg-Sex
  slot_duration_minutes: 15,
  buffer_between_meetings_minutes: 5,
  max_meetings_per_day: 10,
  send_calendar_invites: true,
  send_reminder_24h: true,
  send_reminder_1h: true
}
```

**OAuth 2.0 por Campanha:**
- Credenciais criptografadas com AES-256-GCM
- Refresh token automático antes de expirar
- RLS policies isolam credenciais por campanha
- UI de onboarding em `/google-calendar-onboarding.html`

**Fluxo de Agendamento:**
```
1. Lead demonstra interesse → AI detecta interest_score = 0.7
2. AI busca 3 slots disponíveis no Google Calendar
3. AI envia: "📅 Tenho estes horários: 1️⃣ Amanhã 10h 2️⃣ Amanhã 14h30 3️⃣ Sexta 9h"
4. Lead responde: "2"
5. Sistema valida escolha → Cria evento no Google Calendar
6. Sistema envia confirmação + convite por email
7. Sistema agenda lembretes (24h e 1h antes)
8. Atualiza conversa: last_topic = 'scheduling_confirmed'
```

**Segurança:**
- Tokens OAuth criptografados em repouso (PBKDF2 + AES-256-GCM)
- Acesso via RLS policies (somente dono da campanha)
- Revogação de acesso a qualquer momento
- Logs de consentimento OAuth

---

## Banco de Dados

### Tabelas Principais

#### `aic_conversations`
Armazena conversas ativas com leads.

```sql
- id: UUID (PK)
- phone: VARCHAR(20)
- contact_name: VARCHAR(255)
- chat_id: VARCHAR(50)
- channel_id: VARCHAR(50)
- status: VARCHAR(20) DEFAULT 'active'
- created_at, updated_at: TIMESTAMPTZ
```

#### `aic_messages`
Histórico de mensagens por conversa.

```sql
- id: UUID (PK)
- conversation_id: UUID (FK)
- direction: 'inbound' | 'outbound'
- sender_type: 'lead' | 'ai_agent' | 'human_agent'
- content: TEXT
- message_type: VARCHAR(20)
- whatsapp_message_id: VARCHAR(100)
- model_used: VARCHAR(50)
- created_at: TIMESTAMPTZ
```

#### `aic_message_queue`
Fila de mensagens para envio via Puppeteer.

```sql
- id: UUID (PK)
- campaign_id: UUID (FK)
- lead_id: UUID (FK)
- phone: VARCHAR(20)
- message: TEXT
- status: 'pending' | 'processing' | 'sent' | 'failed'
- priority: INTEGER DEFAULT 0
- attempts: INTEGER DEFAULT 0
- scheduled_for: TIMESTAMPTZ
- created_at, processed_at: TIMESTAMPTZ
```

#### `aic_campaign_leads`
Leads por campanha com status de contato.

```sql
- id: UUID (PK)
- campaign_id: UUID (FK)
- phone: VARCHAR(20)
- instagram_username: VARCHAR(50)
- name: VARCHAR(255)
- source: VARCHAR(50)
- status: VARCHAR(20)
- whatsapp_valid: BOOLEAN
- whatsapp_validated_at: TIMESTAMPTZ
- whatsapp_validation_error: TEXT
- phone_numbers: JSONB  -- Múltiplos telefones
- preferred_channel: 'whatsapp' | 'instagram_dm'
- dm_status: VARCHAR(20)
- instagram_dm_status: VARCHAR(20)
- contact_attempts: INTEGER DEFAULT 0
- next_contact_at: TIMESTAMPTZ
- opted_out: BOOLEAN DEFAULT FALSE
- inbound_source: VARCHAR(50)
- utm_source, utm_medium, utm_campaign, utm_content: VARCHAR(255)
- created_at, updated_at: TIMESTAMPTZ
```

#### `aic_instagram_dm_queue`
Fila de DMs Instagram (fallback).

```sql
- id: UUID (PK)
- campaign_id: UUID (FK)
- lead_id: UUID (FK)
- instagram_username: VARCHAR(50)
- message: TEXT
- status: 'pending' | 'processing' | 'sent' | 'failed'
- priority: INTEGER DEFAULT 0
- attempts: INTEGER DEFAULT 0
- moved_from_whatsapp: BOOLEAN DEFAULT FALSE
- original_phone: VARCHAR(20)
- created_at, processed_at: TIMESTAMPTZ
```

### Functions Principais

| Function | Descrição |
|----------|-----------|
| `get_or_create_aic_conversation()` | Cria ou retorna conversa existente |
| `add_aic_message()` | Adiciona mensagem ao histórico |
| `enqueue_aic_message()` | Adiciona mensagem à fila de envio |
| `dequeue_aic_message()` | Retira próxima mensagem da fila (atômico) |
| `move_lead_to_instagram_dm()` | Move lead para fila Instagram |
| `validate_lead_phone()` | Registra validação de telefone |
| `register_landing_page_lead()` | Registra lead da landing page |
| `identify_lead_source()` | Identifica origem de lead |

---

## Fluxo de Validação de WhatsApp

O sistema valida números WhatsApp **sem usar API** (evita ban):

```
1. Puppeteer abre chat com número
2. Aguarda carregamento da página
3. Detecta popup de erro:
   - "phone number shared via url is invalid"
   - "número de telefone compartilhado via url é inválido"
   - "this phone number is not registered"
4. Se popup detectado:
   - Marca telefone como inválido
   - Tenta próximo telefone do lead (se houver)
   - Se todos inválidos → move para fila Instagram DM
5. Se não detectou erro → número válido → envia mensagem
```

---

## Fluxo de Fallback WhatsApp → Instagram DM

```
Lead com múltiplos telefones
    │
    ▼
Tenta telefone 1 ──────────────────┐
    │                               │
    ▼                               │
  Válido? ──YES──► Envia mensagem   │
    │                               │
   NO                               │
    │                               │
    ▼                               │
Marca inválido, tenta telefone 2 ◄─┘
    │
    ▼
Todos inválidos?
    │
   YES
    │
    ▼
Move para aic_instagram_dm_queue
    │
    ▼
Puppeteer Instagram Worker processa
```

---

## Configuração de Campanhas

### Modelo 1:1 (Campanha : Número WhatsApp)

Cada campanha tem seu próprio número WhatsApp porque:
- Um lead pode estar em múltiplas campanhas
- Evita conflito de contexto nas conversas
- Permite métricas isoladas por campanha
- Facilita gestão de limites e warmup

---

## Controles de Segurança

### Rate Limiting
- Máx 25 novos números/dia
- Máx 50 mensagens totais/dia
- Delay progressivo após erros

### Horário de Envio (Outbound)
- Segunda a Sexta apenas
- 9h às 18h
- Replies não têm restrição de horário

### Detecção de Problemas
- 3 erros consecutivos → pausa 2 minutos
- 5 números inválidos → pausa 1 hora
- 10 números inválidos/dia → pausa até próximo dia

### Opt-out
- Endpoint `/api/aic/outreach/opt-out`
- Marca lead para nunca mais receber mensagens
- Respeitado em todas as campanhas

---

## Monitoramento

### Logs Telegram
Todas as interações são logadas em grupo Telegram:
- Mensagem recebida
- Resposta gerada
- Canal utilizado (Whapi direto / Puppeteer)
- Erros de validação

### Métricas de Campanha
Endpoint `/api/aic/outreach/stats/:campaignId` retorna:
- Total de leads
- Leads contatados
- Respostas recebidas
- Conversões
- Taxa de números inválidos

---

## Arquivos do Sistema

```
src/
├── services/
│   ├── aic-puppeteer-worker.service.ts   # Worker principal
│   ├── aic-puppeteer-manager.service.ts  # Gerenciador de sessões
│   └── aic-humanizer.service.ts          # Humanização de digitação
├── routes/
│   ├── aic-outreach.routes.ts            # APIs de outreach
│   └── aic-puppeteer.routes.ts           # APIs Puppeteer
└── index.ts                               # Registro de rotas

n8n-workflows/
└── whatsapp-ai-agent.json                # Export do workflow

docs/
└── AIC-WHATSAPP-AGENT.md                 # Esta documentação
```

---

## Próximos Passos

1. [ ] Implementar worker de Instagram DM
2. [ ] Dashboard de monitoramento em tempo real
3. [ ] Sistema de warmup de números novos
4. [ ] A/B testing de mensagens
5. [ ] Integração com CRM externo

---

## Changelog

- **2025-12-05**: Separação REPLY (Whapi direto) vs OUTBOUND (Puppeteer fila)
- **2025-12-05**: Implementação de detecção de números inválidos via popup
- **2025-12-05**: Sistema de fallback WhatsApp → Instagram DM
- **2025-12-05**: Controles de segurança (rate limiting, horário, pausas)
