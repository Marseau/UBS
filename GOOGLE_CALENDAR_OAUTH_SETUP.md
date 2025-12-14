# GOOGLE CALENDAR OAUTH SETUP - AIC CAMPAIGNS

Documentação completa para configuração do Google Calendar OAuth no sistema AIC (AI Conversational).

## 📋 VISÃO GERAL

Este sistema permite que cada campanha AIC tenha seu próprio calendário Google integrado, possibilitando agendamento automático de reuniões com leads antes da transferência para clientes.

### Benefícios

✅ **Calendário por Campanha** - Cada campanha pode ter suas próprias credenciais OAuth
✅ **Segurança** - Credenciais criptografadas com AES-256-GCM
✅ **Refresh Automático** - Access tokens renovados automaticamente
✅ **Configuração Visual** - Interface amigável para onboarding
✅ **Integração Nativa** - Google Meet links automáticos

---

## 🏗️ ARQUITETURA DO SISTEMA

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE CALENDAR OAUTH                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. campaign_google_calendar (Database)                    │
│     ├─ Armazena credenciais OAuth criptografadas          │
│     ├─ Configurações de agendamento                        │
│     └─ Status da autenticação                              │
│                                                             │
│  2. encryption.service.ts                                   │
│     ├─ Criptografia AES-256-GCM                            │
│     ├─ encryptOAuthCredentials()                           │
│     └─ decryptOAuthCredentials()                           │
│                                                             │
│  3. google-oauth.service.ts                                 │
│     ├─ generateAuthUrl()                                    │
│     ├─ handleOAuthCallback()                                │
│     ├─ refreshAccessToken()                                 │
│     ├─ getValidAccessToken()                                │
│     └─ revokeOAuthAccess()                                  │
│                                                             │
│  4. google-calendar-oauth.routes.ts                         │
│     ├─ POST /api/campaigns/:id/google-calendar/auth/start  │
│     ├─ GET  /api/campaigns/google-calendar/auth/callback   │
│     ├─ GET  /api/campaigns/:id/google-calendar/auth/status │
│     ├─ POST /api/campaigns/:id/google-calendar/auth/revoke │
│     └─ POST /api/campaigns/:id/google-calendar/config      │
│                                                             │
│  5. google-calendar.service.ts (UPDATED)                    │
│     ├─ Usa OAuth por campanha (não mais global)            │
│     ├─ ensureAuth() - Inicializa OAuth dinamicamente       │
│     └─ createCalendarService() - Factory por campanha      │
│                                                             │
│  6. google-calendar-onboarding.html                         │
│     └─ Interface visual de configuração                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 SETUP INICIAL (DESENVOLVIMENTO)

### 1. Criar Projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Crie um novo projeto ou selecione existente
3. Nome sugerido: "AIC Calendar Integration"

### 2. Habilitar Google Calendar API

```bash
# Navegue até "APIs & Services" > "Library"
# Busque por "Google Calendar API"
# Clique em "Enable"
```

### 3. Criar Credenciais OAuth 2.0

**Passo a passo:**

1. Vá em "APIs & Services" > "Credentials"
2. Clique em "Create Credentials" > "OAuth client ID"
3. Configure OAuth consent screen (se necessário):
   - User type: **External**
   - App name: **AIC Calendar Integration**
   - User support email: seu email
   - Developer contact: seu email
   - Scopes: Adicione `../auth/calendar` e `../auth/calendar.events`

4. Crie OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: **AIC Calendar OAuth Client**
   - Authorized redirect URIs:
     ```
     http://localhost:3000/api/campaigns/google-calendar/auth/callback
     https://dev.ubs.app.br/api/campaigns/google-calendar/auth/callback
     ```

5. Anote as credenciais:
   - **Client ID**: `xxxxxxxxxxxx.apps.googleusercontent.com`
   - **Client Secret**: `GOCSPX-xxxxxxxxxxxxxx`

### 4. Configurar Variáveis de Ambiente

Adicione ao `.env`:

```bash
# Google Calendar OAuth
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/campaigns/google-calendar/auth/callback

# Encryption Key (GERE UMA CHAVE FORTE!)
ENCRYPTION_KEY=YOUR_STRONG_32_CHAR_KEY_HERE_CHANGE_IN_PRODUCTION
```

**⚠️ IMPORTANTE: Gerar chave de criptografia forte:**

```bash
# Linux/Mac
openssl rand -base64 32

# Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Resultado exemplo:
# aB3fG9kL2pQ7sT1vW5xY8zA4cE6hI0jM2nO9pR3sU7w=
```

---

## 📊 SCHEMA DO BANCO DE DADOS

### Tabela: `campaign_google_calendar`

Criada pela migration `add_google_calendar_oauth_aic`:

```sql
CREATE TABLE campaign_google_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES cluster_campaigns(id) ON DELETE CASCADE,

  -- OAuth Credentials (criptografados)
  google_client_id VARCHAR(255),
  google_client_secret TEXT,
  google_refresh_token TEXT,
  google_access_token TEXT,
  access_token_expires_at TIMESTAMP WITH TIME ZONE,

  -- Calendar Configuration
  google_calendar_id VARCHAR(255) DEFAULT 'primary',
  calendar_timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',

  -- OAuth Status
  oauth_status VARCHAR(50) DEFAULT 'pending',
  oauth_error_message TEXT,
  last_oauth_check_at TIMESTAMP WITH TIME ZONE,

  -- Configurações de Agendamento
  working_hours_start INTEGER DEFAULT 9,
  working_hours_end INTEGER DEFAULT 18,
  working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
  slot_duration_minutes INTEGER DEFAULT 15,
  buffer_between_meetings_minutes INTEGER DEFAULT 5,
  max_meetings_per_day INTEGER DEFAULT 10,

  -- Preferências de Notificação
  send_calendar_invites BOOLEAN DEFAULT true,
  send_reminder_24h BOOLEAN DEFAULT true,
  send_reminder_1h BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(campaign_id)
);
```

**Status possíveis:**
- `pending` - Aguardando configuração OAuth
- `active` - Autenticado e funcionando
- `expired` - Token expirado (será renovado automaticamente)
- `error` - Erro na autenticação
- `revoked` - Acesso revogado pelo usuário

---

## 🔐 SEGURANÇA

### Criptografia de Credenciais

Todas as credenciais sensíveis são criptografadas antes de armazenar no banco:

```typescript
// Criptografia (ao salvar)
const encrypted = encryptOAuthCredentials({
  client_secret: 'GOCSPX-xxxxxx',
  refresh_token: '1//xxxxx',
  access_token: 'ya29.xxxxx'
});

// Descriptografia (ao usar)
const decrypted = decryptOAuthCredentials({
  encrypted_client_secret: 'base64:encrypted:data',
  encrypted_refresh_token: 'base64:encrypted:data',
  encrypted_access_token: 'base64:encrypted:data'
});
```

**Algoritmo:** AES-256-GCM
**Derivação de Chave:** PBKDF2 com 100,000 iterações
**Salt:** 64 bytes aleatórios por registro
**IV:** 16 bytes aleatórios por operação

### Row Level Security (RLS)

Políticas RLS garantem que apenas service role acessa as credenciais:

```sql
CREATE POLICY campaign_google_calendar_service_role_policy
ON campaign_google_calendar
USING (true)
WITH CHECK (true);
```

---

## 🎯 FLUXO DE AUTENTICAÇÃO OAUTH

### 1. Usuário Inicia Configuração

```
Usuário acessa: /src/frontend/google-calendar-onboarding.html?campaign_id=xxx
        ↓
Interface carrega status OAuth via GET /api/campaigns/:id/google-calendar/auth/status
        ↓
Status = 'pending' → Mostrar botão "Conectar Google Calendar"
```

### 2. Início do Fluxo OAuth

```
Usuário clica "Conectar Google Calendar"
        ↓
POST /api/campaigns/:campaignId/google-calendar/auth/start
        ↓
Backend gera URL de autenticação Google:
  - Scopes: calendar + calendar.events
  - State: campaign_id (para identificar no callback)
  - Access type: offline (para obter refresh_token)
        ↓
Frontend redireciona para URL do Google
```

### 3. Autorização no Google

```
Usuário faz login no Google
        ↓
Google mostra tela de consentimento:
  "AIC Calendar Integration quer acessar seu Google Calendar"
  [Permitir] [Negar]
        ↓
Usuário clica "Permitir"
```

### 4. Callback OAuth

```
Google redireciona para:
  /api/campaigns/google-calendar/auth/callback?code=xxx&state=campaign_id
        ↓
Backend processa callback:
  1. Troca 'code' por tokens (access_token + refresh_token)
  2. Criptografa credenciais
  3. Salva no banco (campaign_google_calendar)
  4. Define oauth_status = 'active'
        ↓
Redireciona usuário de volta para configuração
```

### 5. Configuração Concluída

```
Status = 'active' → Mostrar configurações de agendamento
        ↓
Usuário ajusta:
  - Horário de trabalho (9h - 18h)
  - Dias da semana
  - Duração de reuniões
  - Intervalo entre reuniões
  - Preferências de lembretes
        ↓
POST /api/campaigns/:id/google-calendar/config
        ↓
Sistema salva configurações
        ↓
✅ Pronto para agendar reuniões!
```

---

## 🔄 REFRESH DE TOKENS

### Refresh Automático

O sistema renova access tokens automaticamente quando expiram:

```typescript
// Ao usar o serviço
const accessToken = await getValidAccessToken(campaignId);
  ↓
  Verifica se token está expirado (< 5min de validade)
  ↓
  [SIM] → refreshAccessToken(campaignId)
          ↓
          Usa refresh_token para obter novo access_token
          ↓
          Criptografa novo token
          ↓
          Atualiza no banco
          ↓
          Retorna novo access_token
  ↓
  [NÃO] → Retorna access_token atual
```

**Validade dos Tokens:**
- **Access Token:** ~1 hora
- **Refresh Token:** Permanente (até revogação)

---

## 📡 ENDPOINTS DA API

### 1. Iniciar Fluxo OAuth

**POST** `/api/campaigns/:campaignId/google-calendar/auth/start`

**Resposta:**
```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "campaign_id": "uuid",
  "campaign_name": "Campanha Marketing"
}
```

### 2. Callback OAuth (Automático)

**GET** `/api/campaigns/google-calendar/auth/callback?code=xxx&state=campaign_id`

Processa callback e redireciona para página de sucesso.

### 3. Verificar Status

**GET** `/api/campaigns/:campaignId/google-calendar/auth/status`

**Resposta:**
```json
{
  "success": true,
  "campaign_id": "uuid",
  "configured": true,
  "status": "active",
  "needs_reauth": false
}
```

**Status possíveis:** `pending`, `active`, `expired`, `error`, `revoked`

### 4. Revogar Acesso

**POST** `/api/campaigns/:campaignId/google-calendar/auth/revoke`

**Resposta:**
```json
{
  "success": true,
  "message": "Acesso ao Google Calendar revogado com sucesso"
}
```

### 5. Atualizar Configurações

**POST** `/api/campaigns/:campaignId/google-calendar/config`

**Body:**
```json
{
  "google_calendar_id": "primary",
  "working_hours_start": 9,
  "working_hours_end": 18,
  "working_days": [1, 2, 3, 4, 5],
  "slot_duration_minutes": 15,
  "buffer_between_meetings_minutes": 5,
  "max_meetings_per_day": 10,
  "send_calendar_invites": true,
  "send_reminder_24h": true,
  "send_reminder_1h": true
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Configurações atualizadas com sucesso",
  "updated_fields": ["working_hours_start", "working_hours_end", ...]
}
```

### 6. Obter Configurações

**GET** `/api/campaigns/:campaignId/google-calendar/config`

**Resposta:**
```json
{
  "success": true,
  "campaign_id": "uuid",
  "config": {
    "google_calendar_id": "primary",
    "working_hours_start": 9,
    "working_hours_end": 18,
    "working_days": [1, 2, 3, 4, 5],
    "slot_duration_minutes": 15,
    "buffer_between_meetings_minutes": 5,
    "max_meetings_per_day": 10,
    "send_calendar_invites": true,
    "send_reminder_24h": true,
    "send_reminder_1h": true,
    "oauth_status": "active"
  }
}
```

---

## 💻 USO NO CÓDIGO

### Criar Serviço de Calendar

```typescript
import { createCalendarService } from './services/google-calendar.service';

// Cria instância para uma campanha específica
const calendarService = await createCalendarService(campaignId);

// Buscar slots disponíveis
const slots = await calendarService.getAvailableSlots(7); // próximos 7 dias

// Agendar reunião
const result = await calendarService.scheduleAppointment(
  {
    name: 'João Silva',
    phone: '+5511999999999',
    email: 'joao@email.com',
    username: 'joaosilva'
  },
  slot,
  {
    campaignName: 'Marketing Digital',
    interestScore: 0.75,
    questions: ['Quanto custa?', 'Como funciona?'],
    signals: ['Interessado em preços', 'Tem orçamento']
  }
);

console.log(result.meetLink); // https://meet.google.com/xxx-yyyy-zzz
```

### Verificar Configuração

```typescript
import { checkOAuthStatus } from './services/google-oauth.service';

const status = await checkOAuthStatus(campaignId);

if (status.status !== 'active') {
  console.warn(`OAuth não configurado: ${status.status}`);
  // Redirecionar para onboarding
}
```

---

## 🧪 TESTES

### Testar Fluxo OAuth Completo

1. Acesse: `http://localhost:3000/src/frontend/google-calendar-onboarding.html?campaign_id=xxx`

2. Clique em "Conectar Google Calendar"

3. Faça login no Google

4. Autorize permissões

5. Verifique se foi redirecionado de volta com sucesso

6. Configure preferências de agendamento

7. Salve configurações

### Verificar Credenciais no Banco

```sql
SELECT
  campaign_id,
  oauth_status,
  access_token_expires_at,
  working_hours_start,
  working_hours_end,
  created_at
FROM campaign_google_calendar
WHERE campaign_id = 'xxx';
```

### Testar Refresh de Token

```typescript
import { refreshAccessToken } from './services/google-oauth.service';

const result = await refreshAccessToken(campaignId);

if (result.success) {
  console.log('✅ Token renovado:', result.access_token);
} else {
  console.error('❌ Erro:', result.error);
}
```

---

## 🚨 TROUBLESHOOTING

### Problema 1: "OAuth não configurado"

**Sintomas:**
- Erro ao criar eventos: `Google Calendar não configurado para campanha`

**Diagnóstico:**
```sql
SELECT oauth_status FROM campaign_google_calendar WHERE campaign_id = 'xxx';
```

**Solução:**
- Se não existe registro → Usuário precisa configurar OAuth pela primeira vez
- Se status = 'expired' → Sistema tentará refresh automático
- Se status = 'error' → Verificar `oauth_error_message`
- Se status = 'revoked' → Usuário precisa autorizar novamente

### Problema 2: "Invalid grant" ao fazer refresh

**Sintomas:**
- Erro ao renovar token: `invalid_grant`

**Causa:**
- Refresh token foi revogado pelo usuário
- Credenciais OAuth foram alteradas no Google Cloud

**Solução:**
1. Revogar acesso atual:
   ```typescript
   await revokeOAuthAccess(campaignId);
   ```

2. Usuário deve autorizar novamente via interface

### Problema 3: Redirect URI mismatch

**Sintomas:**
- Erro ao autorizar: `redirect_uri_mismatch`

**Causa:**
- URI de callback não está registrado no Google Cloud

**Solução:**
1. Acesse Google Cloud Console
2. Vá em "Credentials" > OAuth 2.0 Client ID
3. Adicione o URI em "Authorized redirect URIs"
4. Aguarde alguns minutos para propagar

### Problema 4: Credenciais não descriptografam

**Sintomas:**
- Erro: `Falha ao descriptografar credenciais OAuth`

**Causa:**
- `ENCRYPTION_KEY` foi alterada após criptografar
- Dados corrompidos no banco

**Solução:**
1. Verificar se `ENCRYPTION_KEY` está correta
2. Revogar e reautorizar OAuth para gerar novas credenciais

---

## 📚 REFERÊNCIAS

### Arquivos do Sistema

- `src/services/encryption.service.ts` - Criptografia de credenciais
- `src/services/google-oauth.service.ts` - Gerenciamento OAuth
- `src/services/google-calendar.service.ts` - API do Google Calendar
- `src/routes/google-calendar-oauth.routes.ts` - Endpoints REST
- `src/frontend/google-calendar-onboarding.html` - Interface de onboarding

### Documentação Externa

- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [OAuth 2.0 for Web Server Apps](https://developers.google.com/identity/protocols/oauth2/web-server)

### Documentação Relacionada

- `MEETING_SCHEDULING_SYSTEM.md` - Sistema de agendamento completo
- `LEAD_HANDOFF_BILLING_SYSTEM.md` - Sistema de transferência de leads

---

## ✅ CHECKLIST DE ONBOARDING

### Setup Inicial (Uma vez)

- [ ] Criar projeto no Google Cloud
- [ ] Habilitar Google Calendar API
- [ ] Criar credenciais OAuth 2.0
- [ ] Configurar OAuth consent screen
- [ ] Adicionar redirect URIs
- [ ] Gerar chave de criptografia forte
- [ ] Adicionar variáveis de ambiente ao `.env`
- [ ] Reiniciar servidor para carregar variáveis

### Por Campanha

- [ ] Acessar interface de onboarding
- [ ] Clicar em "Conectar Google Calendar"
- [ ] Fazer login no Google
- [ ] Autorizar permissões
- [ ] Configurar horário de trabalho
- [ ] Configurar dias da semana
- [ ] Definir duração de reuniões
- [ ] Configurar preferências de lembretes
- [ ] Salvar configurações
- [ ] Testar criação de evento

---

**Última Atualização:** 2024-12-14
**Versão:** 1.0
**Status:** ✅ Implementado e Documentado
