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

### 5. Sistema de Handoff para Consultor

O sistema de handoff permite que a IA transfira leads qualificados para consultores humanos de forma transparente.

**Configuração por Campanha:**
```sql
-- Tabela: cluster_campaigns
{
  consultant_name: 'Marseau',           -- Nome do consultor
  consultant_phone: '5511999040605'     -- WhatsApp do consultor
}
```

**Comportamento por Canal:**

| Canal | Handoff | Ação |
|-------|---------|------|
| **WhatsApp** | Mesma conversa | Consultor assume o chat diretamente |
| **Instagram** | Redireciona para WhatsApp | AI envia link wa.me/{phone} |

**Quando Lead Pergunta Preço (AI responde):**
```
1. Lead pergunta sobre preço/valor
2. AI RESPONDE com:
   - Preço real (do briefing/landing page)
   - Argumentação de valor (retorno vs investimento)
   - Destaca ofertas/oportunidades se houver
3. AI aguarda reação do lead
4. Se lead continuar interessado → Lead Quente → Handoff
```

**Fluxo WhatsApp (Handoff):**
```
1. Lead demonstra interesse APÓS saber o preço
2. AI informa: "Perfeito! Vou passar você para o Marseau que vai continuar seu atendimento aqui mesmo."
3. AI usa tool notificar_consultor → Envia WhatsApp para celular do consultor
4. Consultor recebe notificação com contexto da conversa
5. Consultor assume A MESMA conversa no WhatsApp
```

**Fluxo Instagram (Handoff):**
```
1. Lead demonstra interesse APÓS saber o preço no Instagram DM
2. AI informa: "Perfeito! Vou passar você para o Marseau que vai continuar seu atendimento pelo WhatsApp."
3. AI envia: "Pode continuar por aqui: wa.me/5511999040605"
4. Lead clica no link e inicia conversa no WhatsApp
5. Consultor recebe notificação e atende no WhatsApp
```

**Funções SQL:**

| Function | Descrição |
|----------|-----------|
| `resolve_campaign_from_contact()` | Retorna `consultant_name` e `consultant_phone` |
| `resolve_campaign_by_recipient_id()` | Retorna `consultant_name` e `consultant_phone` (Instagram) |

**Tool de Notificação:**
```
Tool: notificar_consultor
- Envia WhatsApp para consultant_phone
- Inclui nome do lead, campanha e resumo da conversa
- Marca conversa como handoff_status = 'pending'
```

**Sinais de Lead Quente (trigger handoff):**
- Continua interessado APÓS saber o preço
- Quer saber como começar/contratar APÓS o preço
- Pede proposta formal APÓS o preço
- Demonstra urgência para fechar

**NÃO são sinais de lead quente (AI deve responder):**
- Perguntar preço/valor (AI responde com preço + argumentação)
- Perguntas sobre funcionalidades (AI responde)
- Dúvidas sobre o serviço (AI responde)

**Importante:**
- AI DEVE informar preços (do briefing da campanha)
- AI argumenta valor e destaca ofertas
- AI NÃO menciona agendamento de reunião (consultor fará isso)
- Handoff só após lead demonstrar interesse PÓS-PREÇO
- Handoff é irreversível na sessão (consultor assume até o fim)

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

- **2026-01-24**: Sistema de Handoff para Consultor
  - WhatsApp: Consultor assume mesma conversa
  - Instagram: Redireciona para WhatsApp do consultor via wa.me/
  - Funções SQL atualizadas: `resolve_campaign_from_contact()`, `resolve_campaign_by_recipient_id()`
  - Campos `consultant_name` e `consultant_phone` em cluster_campaigns
  - Removidas referências a agendamento de reunião (consultor fará isso)
- **2025-12-05**: Separação REPLY (Whapi direto) vs OUTBOUND (Puppeteer fila)
- **2025-12-05**: Implementação de detecção de números inválidos via popup
- **2025-12-05**: Sistema de fallback WhatsApp → Instagram DM
- **2025-12-05**: Controles de segurança (rate limiting, horário, pausas)
