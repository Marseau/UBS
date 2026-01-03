# AI Conversacional (SDR) - Componente 5 do Ecossistema AIC

O AI Conversacional atua como **SDR (Sales Development Representative)** automatizado - o quinto componente do pipeline AIC. Ele recebe leads ja prospectados pelo componente BDR (Outreach) e conduz dialogos contextualizados que qualificam e culminam em agendamentos automaticos.

---

## Posicao no Ecossistema

```
+------------------+     +------------------+     +------------------+
|  1. Inteligencia |---->|  2. Clusterizacao|---->|   3. Scoring     |
|   de Hashtags    |     |   por Embeddings |     |    de Fit        |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
+------------------+     +------------------+     +------------------+
|  6. Agendamento  |<----|  5. AI           |<----|  4. Outreach     |
|    Automatico    |     |  Conversacional  |     |   Humanizado     |
+------------------+     |      (SDR)       |     |      (BDR)       |
                         +------------------+     +------------------+
```

### Entradas (do Componente 4)

| Dado | Origem | Uso |
|------|--------|-----|
| Lead pre-qualificado | Scoring de Fit | Contexto da conversa |
| Cluster/Persona | Clusterizacao | Tom e abordagem |
| Canal de contato | Outreach | WhatsApp ou Instagram |
| Primeira mensagem | DM Scripts | Inicio da conversa |

### Saidas (para Componente 6)

| Dado | Destino | Condicao |
|------|---------|----------|
| Interest Score >= 0.6 | Agendamento Automatico | Lead qualificado |
| Slots selecionados | Google Calendar API | Lead aceita reuniao |
| Dados da reuniao | Confirmacao + Lembretes | Evento criado |

---

## Funcionamento

O AI Conversacional opera em duas modalidades:

### Outbound (Campanha Inicia)

```
Componente 4 envia DM inicial
         |
         v
Lead responde (webhook)
         |
         v
Carrega contexto (3 camadas)
         |
         v
AI gera resposta personalizada
         |
         v
Avalia interest_score
         |
    +----+----+
    |         |
 < 0.6      >= 0.6
    |         |
    v         v
Continua   Aciona Componente 6
dialogo    (Agendamento)
```

### Inbound (Lead Inicia)

```
Lead envia mensagem espontanea
         |
         v
Webhook recebe (Whapi/Meta)
         |
         v
Busca/cria conversa
         |
         v
Identifica campanha pelo canal
         |
         v
Carrega contexto (3 camadas)
         |
         v
AI gera resposta
         |
         v
Qualifica e prossegue
```

---

## Contexto de 3 Camadas

O diferencial do AI Conversacional e a integracao com dados dos componentes anteriores:

### Camada 1: Briefing (Componente 1-2)

Informacoes extraidas da Inteligencia de Hashtags e Clusterizacao:

```typescript
campaign: {
  nicho: string;           // Detectado por hashtags
  proposta_valor: string;  // Definido no onboarding
  diferenciais: string[];  // Mapeados na analise
  tom_voz: 'formal' | 'casual' | 'profissional';
  restricoes: string[];
}
```

### Camada 2: Lead (Componentes 1-3)

Dados enriquecidos pelo pipeline anterior:

```typescript
lead: {
  name: string;           // Extraido do perfil
  username: string;       // @instagram
  bio: string;            // Bio original
  profession: string;     // Detectado por embeddings
  city: string;           // Extraido da bio
  cluster_persona: string;// Atribuido pela clusterizacao
  fit_score: number;      // Calculado pelo scoring
  hashtags: string[];     // Usadas pelo lead
}
```

### Camada 3: Conversa (Componente 5)

Memoria da interacao atual:

```typescript
conversation: {
  messages: Message[];      // Historico
  topics_discussed: string[];
  objections_raised: string[];
  interest_score: number;   // 0.0 - 1.0
  last_topic: string;
  next_step: string;
}
```

---

## Qualificacao em Tempo Real

O AI Conversacional avalia cada interacao e atualiza o interest_score:

### Sinais de Qualificacao

| Tipo | Exemplos | Impacto |
|------|----------|---------|
| Perguntas de compra | "quanto custa", "como funciona" | +0.2 |
| Mencao de problema | "tenho dificuldade em", "preciso de" | +0.15 |
| Respostas rapidas | < 5 minutos | +0.1 |
| Engajamento | Perguntas de follow-up | +0.1 |
| Objecoes | "ta caro", "vou pensar" | -0.1 |
| Desinteresse | Respostas curtas, demora | -0.15 |

### Thresholds de Acao

| Score | Estado | Acao |
|-------|--------|------|
| 0.0 - 0.3 | Frio | Nutrir com valor |
| 0.3 - 0.5 | Morno | Explorar dores |
| 0.5 - 0.6 | Quente | Preparar para oferta |
| 0.6 - 1.0 | Pronto | Acionar Componente 6 |

---

## Integracao com Componente 6 (Agendamento)

Quando interest_score >= 0.6, o AI Conversacional aciona o agendamento:

```
AI detecta lead quente (score >= 0.6)
         |
         v
Chama tool: get_calendar_slots()
         |
         v
Recebe 3 horarios disponiveis
         |
         v
Formata e envia ao lead:

"Que tal conversarmos melhor sobre isso?
Tenho esses horarios:
1 - Amanha 10h
2 - Amanha 14h30
3 - Quinta 9h

Qual funciona pra voce?"
         |
         v
Lead responde "2"
         |
         v
Chama tool: create_calendar_event()
         |
         v
Componente 6 assume:
- Cria evento no Google Calendar
- Envia convite por email
- Agenda lembretes (24h, 1h)
```

---

## Canais de Operacao

O AI Conversacional opera nos mesmos canais do Componente 4:

| Canal | Uso | Integracao | Limite/Campanha |
|-------|-----|------------|-----------------|
| WhatsApp | 60% | Whapi (Puppeteer) | 120 msg/dia |
| Instagram DM | 40% | Meta Graph API | 80 msg/dia |

### Fallback Automatico

Se WhatsApp falha, o lead e movido para Instagram (se disponivel):

```
Mensagem falha no WhatsApp
         |
         v
Verifica whatsapp_validation_error
         |
         v
Lead tem @instagram?
    |         |
   SIM       NAO
    |         |
    v         v
Move para   Arquiva
IG queue    lead
```

---

## Configuracao do AI Agent

### System Prompt

```
Voce e um assistente de qualificacao da AIC.

SEU PAPEL: Conduzir conversas naturais para entender se o lead
tem fit com a solucao e, se positivo, oferecer agendamento.

CONTEXTO DO NEGOCIO:
{campaign.briefing}

DADOS DO LEAD (pre-qualificado pelo ecossistema):
- Nome: {lead.name}
- Cluster: {lead.cluster_persona}
- Fit Score inicial: {lead.fit_score}
- Hashtags: {lead.hashtags}

HISTORICO:
{conversation.messages}

INSTRUCOES:
1. Seja conversacional e natural
2. Faca perguntas para entender a dor especifica
3. Quando interest_score >= 0.6, use get_calendar_slots()
4. Nunca seja insistente
5. Respeite opt-out imediatamente

HANDOFF:
- Para Componente 6 quando: lead confirma interesse em reuniao
- Para humano quando: situacao complexa ou reclamacao
```

### Tools Disponiveis

| Tool | Componente | Uso |
|------|------------|-----|
| `search_knowledge_base` | RAG (Comp. 5) | Buscar informacoes |
| `get_calendar_slots` | Comp. 6 | Buscar horarios |
| `create_calendar_event` | Comp. 6 | Agendar reuniao |
| `update_interest_score` | Comp. 5 | Atualizar qualificacao |
| `escalate_to_human` | Comp. 5 | Situacoes complexas |

---

## Integracao RAG

O AI Conversacional usa RAG para responder perguntas especificas:

```sql
-- Base de conhecimento por campanha
CREATE TABLE aic_knowledge_base (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES cluster_campaigns(id),
  title VARCHAR(255),
  content TEXT,
  category VARCHAR(50),  -- 'faq', 'produto', 'objecao'
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ
);
```

### Fluxo RAG

```
Lead: "Como funciona o pagamento?"
         |
         v
Gera embedding da pergunta
         |
         v
Busca top 3 docs (cosine similarity)
         |
         v
Injeta no contexto do prompt
         |
         v
AI gera resposta informada
```

---

## Metricas do Componente

### Entradas (do Componente 4)

| Metrica | Descricao | Esperado |
|---------|-----------|----------|
| Leads recebidos | Total de leads que responderam | - |
| Fit score medio | Media de scoring inicial | > 0.4 |

### Processamento (Componente 5)

| Metrica | Descricao | Meta |
|---------|-----------|------|
| Tempo de resposta | Ate primeira resposta | < 30s |
| Mensagens/conversa | Media ate qualificacao | 5-8 |
| Taxa de qualificacao | % que atinge score >= 0.6 | 30-50% |

### Saidas (para Componente 6)

| Metrica | Descricao | Meta |
|---------|-----------|------|
| Leads qualificados | Score >= 0.6 | 6-15% do total |
| Taxa de agendamento | % que aceita reuniao | > 50% |
| Handoffs | Escalados para humano | < 5% |

---

## Dependencias do Ecossistema

O AI Conversacional depende diretamente de:

| Componente | Dependencia | Impacto se falhar |
|------------|-------------|-------------------|
| 1. Inteligencia | Hashtags do lead | Menos contexto |
| 2. Clusterizacao | Persona atribuida | Abordagem generica |
| 3. Scoring | Fit score inicial | Sem priorizacao |
| 4. Outreach | Primeira mensagem | Sem inicio de conversa |
| 6. Agendamento | Google Calendar | Nao agenda automaticamente |

### Resiliencia

Se um componente anterior falhar:
- AI Conversacional continua operando
- Usa contexto disponivel (menos rico)
- Qualidade da conversa pode diminuir
- Metricas de conversao afetadas

---

## Troubleshooting

### AI responde de forma inadequada

1. Verificar se Componente 2 atribuiu cluster correto
2. Revisar briefing da campanha
3. Checar se RAG tem conteudo relevante
4. Analisar fit_score do Componente 3

### Lead qualificado mas nao agenda

1. Verificar se Componente 6 esta ativo
2. Checar credenciais OAuth do calendario
3. Confirmar se ha slots disponiveis
4. Verificar se tool foi chamada corretamente

### Tempo de resposta alto

1. Verificar latencia do modelo (OpenAI)
2. Checar tempo de busca RAG
3. Monitorar fila de mensagens
4. Verificar webhooks dos canais

---

## Referencias no Ecossistema

- [AIC_UNIFIED_ARCHITECTURE.md](./AIC_UNIFIED_ARCHITECTURE.md) - Visao geral do ecossistema
- [AIC-WHATSAPP-AGENT.md](./AIC-WHATSAPP-AGENT.md) - Detalhes do canal WhatsApp
- [CLAUDE.md](../CLAUDE.md) - Regras globais do projeto

---

**Componente:** 5 de 6
**Ultima atualizacao:** 2025-01-02
**Versao:** 2.0 (Abordagem Ecossistema)
