# AIC - Checklist Pre-Lancamento

> **Data**: 2026-01-29
> **Campanha**: AIC - Teste de Validacao (`fc171ccf-db60-4e1c-9d61-118458a48712`)
> **Status atual**: `test` | Pipeline: `outreach_in_progress`

---

## 1. ESTADO DA CAMPANHA

| Item | Valor | Status |
|------|-------|--------|
| Leads alocados | 2.086 | OK |
| Leads WhatsApp | 958 (46%) | OK |
| Leads Instagram | 1.128 (54%) | OK |
| Subclusters/Personas | 2 | OK |
| Documentos RAG | 3 | OK |
| Briefing | 82% | OK (minimo 30%) |
| Conta Instagram | 1 (@ubs.sistemas) | OK |
| Canal WhatsApp (Whapi) | Configurado | OK |
| Conversas iniciadas | 2 | OK (modo teste) |
| Mensagens enviadas | 14 | OK (modo teste) |

### Test Mode

| Canal | Conta Teste | Configurado |
|-------|-------------|-------------|
| WhatsApp | `5511999040605` | OK |
| Instagram | `@marseaufranco` | OK |
| Instagram User ID | `2446394792464748` | OK (auto-capturado) |

---

## 2. WORKFLOWS N8N

### 2.1 Workflows AIC ATIVOS (devem permanecer)

| Workflow | ID | Status |
|----------|-----|--------|
| WA AI Agent v23 (Tools) | `2WRfnvReul8k7LEu` | ATIVO |
| IG AI Agent v25 (Dynamic Recipient) | `msXwN1pEc23RuZmu` | ATIVO |
| WA NoIG Agent v8 (Campaign Isolation) | `jeThTHI2TKrVKZLq` | ATIVO |
| Cold Outreach Unified v9 | `H8MHjPU9AHNu1ZhF` | ATIVO |
| Message Queue Worker v5 | `fqrC0gRcJs8R26Xg` | ATIVO |
| Sub WA Inbound Handler v18 | `GzjJR2TZvBYARP4z` | ATIVO |
| Sub IG Inbound Handler v19 | `Ew4BuwfuPqgQHQxo` | ATIVO |
| Tool RAG (Busca Empresa) | `BSUkoynjiYpjjQFT` | ATIVO |
| RAG Lead Profile Search | `KpIjONCQ2ANMaFns` | ATIVO |
| Generate Conversation Embedding | `GU57XIe0UKa4pkD8` | ATIVO |
| Conversation Chunking Pipeline | `mwZCxRywzmc8W2uW` | ATIVO |
| Summary Generation Pipeline | `itCdTUEVLHLc073h` | ATIVO |
| Follow Up Inteligente | `fny9SAeBL3roSP9R` | ATIVO |
| Instagram Follow After DM | `Agn7D8vJ3gA95DlJ` | ATIVO |
| Instagram Auto Unfollow v2 | `OE62WxtzVulL3qK7` | ATIVO |
| Instagram Lead Scraper V2 | `7b8hgtIj7Ea99RBF` | ATIVO |
| Embedar Hashtags (Refatorado) | `kPrJyBJ1Jn66DNKi` | ATIVO |
| Monitor Execucoes Travadas | `KCw9cv6c6ZQKZj47` | ATIVO |
| Scraper Rescue 45 dias | `NFZGwr7w8GfOt4By` | ATIVO |
| Browser Watchdog | `NDDVzkG3j3IpuHmR` | ATIVO |
| Watchdog - Scraper V2 | `aYS7tqSYMkX5xvEh` | ATIVO |
| Watchdog - Scraper Rescue | `Myzi2LydX4xsve32` | ATIVO |

### 2.2 Workflows UBS AINDA ATIVOS (DESATIVAR ANTES DO LANCAMENTO)

| Workflow | ID | Acao |
|----------|-----|------|
| WhatsAppSalonOriginal | `2JiMustQofSujglu` | DESATIVAR |
| WhatsAppSalon V1 | `GJno3Afkq0jHMwl4` | DESATIVAR |
| WABA Inbound - Booking E2E | `emxzi66gOVEkljLL` | DESATIVAR |
| Human-Escalation-Management | `jMbu2yAcYDh05C5L` | DESATIVAR |
| Appointment-Confirmation-Reminders | `2QnBgl6WR2nqiYQL` | DESATIVAR |
| Business-Analytics-Metrics | `0R9D6dNyG8RlXfB6` | DESATIVAR |
| WharsAppSalonV2 | `CKj2mYnRVWNG0sTh` | DESATIVAR |

---

## 3. LACUNAS CORRIGIDAS (Auditoria Pipeline)

| # | Lacuna | Status | Detalhe |
|---|--------|--------|---------|
| 1 | Status de lead nao avanca apos DM | CORRIGIDO | Trigger atualiza `outreach_queued` -> `contacted` |
| 3 | Handoff automatico nao dispara | CORRIGIDO | Trigger seta `handoff_status = 'active'` quando hot |
| 4 | Follow-up nao filtra por status de campanha | CORRIGIDO | `get_followup_eligible_leads` filtra `active`/`test` |
| 6 | qualification_status nunca atualizado | CORRIGIDO | Trigger automatico baseado em mensagens inbound |
| 7 | Unfollow v1 quebrado | CORRIGIDO | Reescrito como v2 com endpoints corretos |
| 8 | Documentos RAG duplicados | CORRIGIDO | Limpeza feita, 4 duplicatas removidas |
| 9 | Integracao Google Calendar | N/A | Decisao: handoff somente via WhatsApp |
| 10 | Onboarding nao valida campos | CORRIGIDO | Exige WA + IG + briefing 30% + contato |

---

## 4. CORRECOES RECENTES (2026-01-29)

| Commit | Descricao |
|--------|-----------|
| `7016cc52` | Qualification & handoff data no dashboard do cliente |
| `773dcd94` | Validacao de campos obrigatorios no onboarding |
| `cf7f22c7` | Sidebar admin no dashboard do cliente por role |
| `627747b4` | Link admin campanhas aponta para /aic/campaign-analytics |

---

## 5. CHECKLIST PRE-LANCAMENTO

### 5.1 Acoes Manuais no N8N (OBRIGATORIO)

- [ ] Desativar 7 workflows UBS (secao 2.2)
- [ ] Verificar que Cold Outreach Unified v9 esta ativo

### 5.2 Validacao em Modo Teste

- [ ] Enviar DM WhatsApp para numero da campanha -> AI Agent responde para `5511999040605`
- [ ] Enviar DM Instagram para @ubs.sistemas -> AI Agent responde para @marseaufranco
- [ ] Verificar log Telegram mostra indicador de teste
- [ ] Cold Outreach envia DMs (verificar fila e execucao)
- [ ] Follow After DM executa apos outreach IG
- [ ] Follow Up Inteligente re-engaja leads inativos
- [ ] Unfollow v2 executa as 23h
- [ ] Message Queue Worker processa fila a cada 5min
- [ ] Dashboard do cliente mostra dados reais (qualification, pipeline, funnel)

### 5.3 Validacao de Dados

- [ ] Briefing preenchido >= 80% (atual: 82%)
- [ ] 2 subclusters com personas e DM scripts definidos
- [ ] Documentos RAG sem duplicatas (verificado)
- [ ] Distribuicao leads: ~46% WA / ~54% IG (ok, proximo do 60/40)
- [ ] Verificar que `whatsapp_number` e usado em todas as queries (nao `phone`)

### 5.4 Infraestrutura

- [ ] Redis rodando (rate limiting, sessoes)
- [ ] Puppeteer browser ativo (Browser Watchdog monitora)
- [ ] Whapi channel conectado e ativo
- [ ] Meta Graph API / Instagram OAuth conectado
- [ ] Telegram bot configurado para logs

### 5.5 Rate Limits Configurados

| Canal | Limite Diario | Horario |
|-------|---------------|---------|
| WhatsApp outbound | 120 DMs | 09h-18h Seg-Sex |
| Instagram outbound | 80 DMs | 09h-18h Seg-Sex |
| Instagram follows | 100/dia, 20/hora | 08h-18h |
| Instagram unfollows | 100/dia | 23h (sem restricao horaria) |

---

## 6. PROCEDIMENTO DE ATIVACAO

### Passo 1: Desativar UBS
Desativar manualmente os 7 workflows UBS listados na secao 2.2.

### Passo 2: Teste Final
Executar todos os items da secao 5.2 em modo `test`.

### Passo 3: Ativar Campanha
```sql
UPDATE cluster_campaigns
SET status = 'active'
WHERE id = 'fc171ccf-db60-4e1c-9d61-118458a48712';
```

### Passo 4: Monitorar
- Acompanhar Telegram para logs de outreach
- Verificar dashboard em `/aic/campaign-analytics`
- Monitorar rate limiting no primeiro dia
- Verificar que respostas inbound sao processadas pelos AI Agents

### Passo 5: Primeiras 24h
- Confirmar que Cold Outreach envia DMs dentro do horario comercial
- Verificar que Follow After DM executa para IG
- Confirmar que Message Queue processa replies
- Monitorar qualification_status sendo atualizado automaticamente

---

## 7. ROLLBACK

Se necessario reverter para modo teste:

```sql
UPDATE cluster_campaigns
SET status = 'test'
WHERE id = 'fc171ccf-db60-4e1c-9d61-118458a48712';
```

Isso redireciona todas as respostas para contas de teste sem parar o processamento.

Para parar completamente:

```sql
UPDATE cluster_campaigns
SET status = 'paused'
WHERE id = 'fc171ccf-db60-4e1c-9d61-118458a48712';
```

---

**Ultima atualizacao**: 2026-01-29
