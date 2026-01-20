# AIC - Fluxo Completo de Leads sem Instagram (NoIG)

Este documento descreve o ciclo de vida completo de leads que chegam pela Landing Page sem informar Instagram.

---

## 1. Visão Geral

### O que é Lead NoIG?
Lead que preencheu o formulário da Landing Page informando **nome, email e WhatsApp**, mas **não informou Instagram**.

### Por que existe?
- Nem todo lead tem Instagram comercial
- Alguns preferem não informar inicialmente
- O lead ainda pode ser qualificado e convertido via conversa

### Princípio Fundamental
> **Para o cliente, não existe diferença.** Todo lead quente entregue é igual, independente de ter vindo com ou sem Instagram. A distinção é apenas interna para operação.

---

## 2. Ciclo de Vida do Lead NoIG

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CICLO DE VIDA - LEAD NOIG                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CAPTURA (Landing Page)                                                  │
│     ├── Lead preenche: nome, email, whatsapp                               │
│     ├── NÃO informa Instagram                                              │
│     ├── Salvo em: campaign_leads_noig                                      │
│     ├── Status: 'new'                                                      │
│     └── Redirect: wa.me do WhatsApp da campanha                            │
│                                                                             │
│  2. PRIMEIRO CONTATO (WhatsApp)                                            │
│     ├── Lead manda mensagem no WhatsApp                                    │
│     ├── Dispatcher detecta: telefone em campaign_leads_noig?               │
│     ├── SIM → Roteia para NoIG Agent                                       │
│     ├── Status: 'contacted'                                                │
│     └── first_contact_at registrado                                        │
│                                                                             │
│  3. QUALIFICAÇÃO (AI Agent NoIG)                                           │
│     ├── Agent coleta informações:                                          │
│     │   • Ramo/segmento do negócio                                         │
│     │   • Produto/serviço vendido                                          │
│     │   • Ticket médio                                                     │
│     │   • Principal dor/desafio                                            │
│     │   • Instagram (se tiver)                                             │
│     ├── Status: 'qualifying'                                               │
│     ├── conversation_context atualizado                                    │
│     └── qualification_score calculado (0-100)                              │
│                                                                             │
│  4. DETECÇÃO DE INTERESSE (Lead Quente)                                    │
│     ├── Agent detecta interesse real:                                      │
│     │   • Pediu proposta/orçamento                                         │
│     │   • Quer saber valores                                               │
│     │   • Demonstra urgência                                               │
│     │   • qualification_score >= 70                                        │
│     ├── Status: 'qualified'                                                │
│     └── qualified_at + qualified_by = 'agent'                              │
│                                                                             │
│  5. ENTREGA AO CLIENTE                                                     │
│     ├── Lead é passado para cliente via WhatsApp                           │
│     ├── Criado registro em aic_lead_deliveries                             │
│     ├── Status: 'delivered' (ou 'converted' se informou IG)                │
│     ├── Aparece na UI do cliente (Leads Entregues)                         │
│     └── Cobrança gerada (R$ X por lead)                                    │
│                                                                             │
│  6. CONVERSÃO (Opcional)                                                   │
│     ├── Se lead informou Instagram durante conversa:                       │
│     │   • Chama convert_noig_to_instagram_lead()                           │
│     │   • Cria registro em instagram_leads                                 │
│     │   • Cria vínculo em campaign_leads                                   │
│     │   • Dispara pipeline de enriquecimento                               │
│     │   • Status: 'converted'                                              │
│     └── converted_to_lead_id referencia o novo lead                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Status do Lead NoIG

| Status | Descrição | Gatilho |
|--------|-----------|---------|
| `new` | Recém chegou pela LP | Formulário submetido |
| `contacted` | Primeira mensagem enviada | Agent respondeu |
| `engaged` | Lead respondeu | Lead mandou msg após reply |
| `qualifying` | Em qualificação | Agent coletando info |
| `qualified` | Lead quente | score >= 70 OU interesse detectado |
| `delivered` | Entregue ao cliente | Passado via WhatsApp |
| `converted` | Convertido para lead com IG | Informou Instagram |
| `lost` | Perdido/desistiu | Não respondeu ou opt-out |

---

## 4. Tabelas Envolvidas

### 4.1 campaign_leads_noig (Principal)
```sql
- id: UUID
- campaign_id: FK → cluster_campaigns
- name, email, whatsapp: Dados do formulário
- status: Status atual
- conversation_context: JSON com info coletada
- qualification_score: 0-100
- qualified_at, qualified_by: Quando/quem qualificou
- instagram_acquired: Se informou IG
- instagram_username: Username informado
- converted_to_lead_id: FK → instagram_leads (após conversão)
- converted_at: Quando converteu
```

### 4.2 aic_lead_deliveries (Entrega)
```sql
- lead_id: UUID (pode ser de instagram_leads OU noig)
- lead_type: 'instagram' ou 'noig'
- campaign_id: Campanha
- delivery_status: 'pending', 'delivered', 'invoiced'
- delivery_value: Valor cobrado
- delivered_at: Data da entrega
```

### 4.3 aic_conversations (Conversa)
```sql
- phone: WhatsApp do lead
- channel: 'whatsapp'
- contact_name: Nome do lead
- status: 'active', 'closed'
```

### 4.4 aic_messages (Histórico)
```sql
- conversation_id: FK
- direction: 'inbound' ou 'outbound'
- sender_type: 'lead', 'ai_agent', 'human_agent'
- content: Texto da mensagem
```

---

## 5. APIs Disponíveis

### 5.1 Identificar Lead NoIG
```
GET /api/landing/noig/by-phone/:phone

Response:
{
  "success": true,
  "found": true,
  "lead": {
    "id": "uuid",
    "name": "João Silva",
    "campaign_name": "Campanha X",
    "status": "qualifying",
    "conversation_context": {...},
    "qualification_score": 45
  }
}
```

### 5.2 Atualizar Contexto
```
POST /api/landing/noig/update-context

Body:
{
  "lead_id": "uuid",
  "context": {
    "ramo": "salão de beleza",
    "ticket_medio": "200-500",
    "dor_principal": "agenda vazia"
  },
  "status": "qualifying",
  "qualification_score": 65
}
```

### 5.3 Converter para Lead com Instagram
```
POST /api/landing/noig/convert

Body:
{
  "lead_id": "uuid",
  "instagram_username": "salaodamaria"
}

Response:
{
  "success": true,
  "converted": true,
  "new_lead_id": "uuid-do-instagram-lead"
}
```

### 5.4 Entregar Lead ao Cliente
```
POST /api/landing/noig/deliver

Body:
{
  "lead_id": "uuid",
  "delivery_value": 10.00,
  "notes": "Lead demonstrou interesse em proposta",
  "auto_invoice": true
}

Response:
{
  "success": true,
  "delivered": true,
  "delivery": {
    "id": "uuid",
    "campaign_id": "uuid",
    "lead_name": "João Silva",
    "lead_whatsapp": "5511999999999",
    "lead_email": "joao@email.com",
    "lead_instagram": null,
    "delivery_value": 10.00,
    "delivered_at": "2026-01-20T12:00:00Z"
  },
  "invoice": {
    "id": "uuid",
    "invoice_number": "LEAD-XXXXXX-0001",
    "amount": 10.00,
    "due_date": "2026-01-25",
    "status": "pending"
  },
  "message": "Lead entregue e fatura criada"
}
```

**Observação:** Ao entregar um lead noig, ele aparece automaticamente na UI do cliente em `/cliente/leads` pois é inserido na tabela `aic_lead_deliveries`, que é consultada pelo endpoint `/api/aic/journey/leads/delivered`.

---

## 6. Workflows N8N

### 6.1 AIC WhatsApp Dispatcher v1
**ID:** `yjEmsYc4uL6Xu1RR`

Roteador de mensagens WhatsApp:
1. Recebe webhook do Whapi
2. Verifica se telefone está em campaign_leads_noig
3. Se SIM → Chama NoIG Agent
4. Se NÃO → Chama Agent Normal

### 6.2 AIC WhatsApp NoIG Agent v1
**ID:** `jeThTHI2TKrVKZLq`

Agent para qualificação de leads sem contexto:
1. Recebe dados do lead noig (com `qualification_score` atual)
2. AI Agent com prompt de qualificação
3. Salva mensagens em aic_messages
4. Analisa resposta do lead:
   - Detecta Instagram (regex)
   - Calcula incremento de score
   - Verifica se é lead quente
5. Se lead quente (score >= 70):
   - Chama `POST /api/landing/noig/deliver`
   - Lead aparece para cliente em `/cliente/leads`
6. Se informou Instagram:
   - Chama `POST /api/landing/noig/convert`
   - Lead vira lead completo com pipeline de enriquecimento
7. Atualiza `conversation_context` e `qualification_score`

### 6.3 Sistema de Scoring
O workflow calcula automaticamente o `qualification_score`:

| Ação | Pontos |
|------|--------|
| Respondeu qualquer mensagem | +5 |
| Keywords médias (interessado, como funciona, conta mais) | +15 |
| Keywords quentes (proposta, orçamento, quanto custa, agendar) | +30 |
| Informou Instagram | +20 |

**Lead quente**: `qualification_score >= 70`

---

## 7. Prompt do AI Agent NoIG

O agent usa prompt específico focado em:
- Acolher o lead que veio da LP
- Descobrir o negócio/ramo
- Coletar ticket médio e dores
- Perguntar naturalmente pelo Instagram
- Detectar interesse real (lead quente)

**Arquivo:** `docs/AIC-NOIG-AGENT-PROMPT.md`

---

## 8. Integração com UI do Cliente

### 8.1 Leads Entregues
A página `/cliente/leads` mostra todos os leads entregues, incluindo:
- Leads normais (com Instagram)
- Leads noig qualificados e entregues

**Query unificada:**
```sql
-- Leads normais entregues
SELECT ... FROM aic_lead_deliveries d
JOIN campaign_leads cl ON d.lead_id = cl.lead_id
WHERE d.lead_type = 'instagram'

UNION ALL

-- Leads noig entregues
SELECT ... FROM aic_lead_deliveries d
JOIN campaign_leads_noig cn ON d.lead_id = cn.id
WHERE d.lead_type = 'noig'
```

### 8.2 O que o cliente vê
| Campo | Lead Normal | Lead NoIG |
|-------|-------------|-----------|
| Nome | full_name | name |
| WhatsApp | whatsapp_number | whatsapp |
| Instagram | @username | (vazio ou @username se converteu) |
| Email | email | email |
| Status | status | status |

---

## 9. Cobrança

### 9.1 Quando Cobrar
- Lead NoIG é cobrado quando **entregue** ao cliente
- Mesmo valor de lead normal (R$ X por lead)
- Não há distinção de preço

### 9.2 Registro de Cobrança
```sql
INSERT INTO aic_lead_deliveries (
  lead_id,
  lead_type,
  campaign_id,
  delivery_value,
  delivery_status,
  delivered_at
) VALUES (
  'uuid-do-noig',
  'noig',
  'uuid-da-campanha',
  15.00,
  'delivered',
  NOW()
);
```

---

## 10. Métricas e Relatórios

### 10.1 Por Campanha
```sql
-- Total de leads noig
SELECT COUNT(*) FROM campaign_leads_noig WHERE campaign_id = ?;

-- Taxa de qualificação
SELECT
  COUNT(*) FILTER (WHERE status = 'qualified') * 100.0 / COUNT(*) as taxa_qualificacao
FROM campaign_leads_noig
WHERE campaign_id = ?;

-- Taxa de conversão (informou IG)
SELECT
  COUNT(*) FILTER (WHERE instagram_acquired) * 100.0 / COUNT(*) as taxa_conversao
FROM campaign_leads_noig
WHERE campaign_id = ?;
```

### 10.2 Dashboard Admin
- Total leads noig por campanha
- Taxa de qualificação
- Taxa de conversão para lead com IG
- Tempo médio de qualificação
- Score médio

---

## 11. Fluxo Técnico Resumido

```
1. LP Submit (sem IG)
   └── POST /api/landing/capture
       └── createNoigLead() → campaign_leads_noig

2. Lead manda WhatsApp
   └── Whapi Webhook → Dispatcher
       └── GET /api/landing/noig/by-phone/:phone
           └── found=true → NoIG Agent

3. NoIG Agent processa
   └── AI gera resposta
   └── Salva em aic_messages
   └── POST /api/landing/noig/update-context

4. Detecta Instagram
   └── Regex encontra @username
   └── POST /api/landing/noig/convert
       └── convert_noig_to_instagram_lead()
       └── Dispara pipeline de enriquecimento

5. Detecta Lead Quente
   └── qualification_score >= 70
   └── POST /api/landing/noig/deliver
       └── Cria aic_lead_deliveries
       └── Passa para cliente via WhatsApp

6. Cliente vê lead
   └── GET /api/aic/journey/leads/delivered
       └── Retorna leads normais + noig entregues
```

---

## 12. Checklist de Implementação

- [x] Migration 094: Tabela campaign_leads_noig
- [x] Service: landing-lead-capture.service.ts (createNoigLead)
- [x] Routes: landing-lead.routes.ts (endpoints noig)
- [x] Workflow: AIC WhatsApp Dispatcher v1
- [x] Workflow: AIC WhatsApp NoIG Agent v1
- [x] Prompt: AIC-NOIG-AGENT-PROMPT.md
- [x] API: Endpoint de entrega de lead noig (`POST /api/landing/noig/deliver`)
- [x] API: Incluir noig em leads entregues (usa `aic_lead_deliveries` existente)
- [ ] UI: Testar exibição de lead noig entregue
- [x] Workflow: Lógica de detecção de lead quente (qualification_score)
- [x] Workflow: Passagem automática para cliente (via API deliver)

---

## 13. Próximos Passos

1. **Aplicar migration 094** no Supabase (se ainda não aplicada)
2. **Testar fluxo completo** com lead real
3. **Ativar workflows** no N8N:
   - `yjEmsYc4uL6Xu1RR` - AIC WhatsApp Dispatcher v1
   - `jeThTHI2TKrVKZLq` - AIC WhatsApp NoIG Agent v1
4. **Validar UI** em `/cliente/leads` para verificar exibição de leads noig entregues

---

*Documento criado em: 2026-01-20*
*Última atualização: 2026-01-20 (workflow com scoring e hot lead detection)*
