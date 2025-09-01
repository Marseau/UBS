# 🚀 Sistema Universal de Agendamentos Multi-Tenant

## 📋 VISÃO GERAL

Sistema **SaaS multi-tenant** criado para atender **qualquer domínio de negócios** que necessite de agendamentos automatizados via WhatsApp com IA. Suporte nativo para:

- 🏛️ **Jurídico** (advogados, consultórios)
- 🏥 **Saúde** (psicólogos, terapeutas, médicos)  
- 🎓 **Educação** (professores particulares, tutores)
- 💅 **Beleza** (salões, estética, barbearias)
- ⚽ **Esportes** (personal trainers, professores de modalidades)
- 💼 **Consultoria** (consultores, coaches)
- 🔧 **Outros** (extensível para qualquer serviço)

---

## 🔧 CONFIGURAÇÕES DO PROJETO

### **Supabase Credentials**
```env
SUPABASE_URL=https://qsdfyffuonywmtnlycri.supabase.co
SUPABASE_ANON_KEY=your-supabase-service-role-key
SUPABASE_PROJECT_ID=qsdfyffuonywmtnlycri
```

### **Stack Tecnológica Recomendada**
- **Backend**: Node.js + TypeScript + Express
- **Banco**: PostgreSQL (Supabase)
- **IA**: OpenAI GPT-4 + Function Calling
- **WhatsApp**: WhatsApp Business API
- **Email**: Zoho Mail (conforme solicitado)
- **Frontend**: Next.js + Tailwind CSS
- **ORM**: Supabase Client + TypeScript Types

---

## 🏗️ ARQUITETURA DO BANCO DE DADOS
*Atualizado com dados reais de produção - Janeiro 2025*

### **Produção: 60 Tabelas Ativas**
- **Status**: ACTIVE_HEALTHY (PostgreSQL 17.4.1.45)
- **Análise**: Via MCP Supabase direto
- **Total Registros**: Sistema ativo com dados reais

### **Tabelas Principais (Verificadas em Produção)**

#### `tenants` - Multi-tenancy Core
```sql
✅ PRODUÇÃO CONFIRMADA:
- id UUID PRIMARY KEY (gen_random_uuid())
- name TEXT NOT NULL
- slug TEXT UNIQUE NOT NULL
- business_name TEXT NOT NULL
- domain business_domain ENUM (legal|healthcare|education|beauty|sports|consulting|other)
- email CITEXT UNIQUE NOT NULL
- phone TEXT UNIQUE NOT NULL
- ai_settings JSONB (greeting_message, domain_keywords, escalation_triggers)
- business_rules JSONB (working_hours, payment_methods, cancellation_policy)  
- domain_config JSONB
- monthly_subscription_fee NUMERIC (default: 79.90)
- plan_type VARCHAR (standard|profissional|enterprise)
- subscription_status VARCHAR (default: 'active')
- account_type VARCHAR (real|test) -- isolamento demo
```

#### `users` - Cross-Tenant Users (Híbrido Supabase Auth)
```sql
✅ ESTRUTURA HÍBRIDA CONFIRMADA:
-- Campos de Negócio:
- id UUID PRIMARY KEY  
- phone TEXT UNIQUE (identificador principal)
- name, email CITEXT
- account_type VARCHAR (real|test)
- preferences, address, emergency_contact JSONB
- birth_date DATE, gender TEXT

-- Campos Supabase Auth (herdados):
- encrypted_password VARCHAR
- email_confirmed_at, phone_confirmed_at TIMESTAMPTZ
- raw_app_meta_data, raw_user_meta_data JSONB
- is_sso_user BOOLEAN
```

#### `appointments` - Sistema Enterprise de Agendamentos
```sql
✅ PRODUÇÃO COM RECURSOS AVANÇADOS:
- id UUID PRIMARY KEY
- tenant_id, user_id, professional_id, service_id (FKs)
- start_time, end_time TIMESTAMPTZ NOT NULL
- status appointment_status ENUM (7 estados)
- quoted_price, final_price NUMERIC(10,2)
- appointment_data JSONB
- external_event_id TEXT (sync Google Calendar)

-- NOVOS CAMPOS DE PRODUÇÃO:
- confirmation_status TEXT (default: 'confirmed')
- requires_explicit_confirmation BOOLEAN (default: false)
- confirmation_expires_at TIMESTAMPTZ
- confirmation_confirmed_at TIMESTAMPTZ
- customer_notes, internal_notes TEXT
- cancelled_at TIMESTAMPTZ, cancelled_by TEXT
```

#### `conversation_history` - IA + Tracking de Custos
```sql
✅ SISTEMA AVANÇADO DE IA EM PRODUÇÃO:
- tenant_id, user_id UUID (isolamento multi-tenant)
- content TEXT, is_from_user BOOLEAN
- intent_detected TEXT, confidence_score NUMERIC
- conversation_context JSONB

-- TRACKING DE CUSTOS REAL:
- tokens_used INTEGER (default: 0)
- api_cost_usd NUMERIC (default: 0)
- processing_cost_usd NUMERIC (default: 0)
- model_used VARCHAR (default: 'gpt-4')
- conversation_outcome TEXT
- session_id_uuid UUID
```

#### `professionals` - Integração Google Calendar
```sql
✅ INTEGRAÇÃO CALENDAR ATIVA:
- tenant_id UUID, name TEXT NOT NULL
- specialties TEXT[], working_hours JSONB
- google_calendar_credentials JSONB
- google_calendar_id TEXT (default: 'primary')
- is_active BOOLEAN (default: true)
```

---

## 📊 DADOS DE DEMONSTRAÇÃO CRIADOS

### **5 Tenants de Exemplo**
1. **Maria Silva Advocacia** (legal) - 4 serviços
2. **Dr. Carlos Psicólogo** (healthcare) - 3 serviços  
3. **Prof. Ana Matemática** (education) - 3 serviços
4. **Salão Beleza Total** (beauty) - 3 serviços
5. **Tennis Pro João** (sports) - 2 serviços

### **5 Usuários Cross-Tenant**
- João usa serviços jurídicos E beleza
- Maria usa psicologia E beleza
- Pedro usa educação
- Ana usa jurídico
- Carlos usa esportes

### **Agendamentos de Exemplo**
- Consulta jurídica para Ana Executiva
- Sessão de terapia para Maria
- Aula de matemática para Pedro
- Corte de cabelo para João
- Aula de tênis para Carlos

---

## 🎯 CARACTERÍSTICAS ÚNICAS

### **🔄 Multi-Tenancy Verdadeiro**
- **Row Level Security (RLS)** implementado
- Isolamento completo de dados por tenant
- Usuários podem usar múltiplos tenants
- Políticas de segurança automáticas

### **🧠 IA Configurável por Domínio**
```json
{
  "ai_settings": {
    "greeting_message": "Personalizada por negócio",
    "domain_keywords": ["específicas", "do", "domínio"],
    "escalation_triggers": ["urgente", "emergência"],
    "sensitive_topics": ["suicídio"] // Para healthcare
  }
}
```

### **⚙️ Flexibilidade de Serviços**
- **Duração**: Fixa, Variável, Estimada, Por Sessão
- **Preço**: Fixo, Por Hora, Pacote, Dinâmico
- **Configuração**: JSONB permite campos específicos
- **Categorização**: Personalizável por tenant

### **📱 WhatsApp + IA Universal**
- Detecção de intenção automática
- Roteamento para agente especializado
- Histórico de conversas por tenant
- Suporte a mídia (texto, áudio, imagem)

---

## 🚀 PRÓXIMOS PASSOS RECOMENDADOS

### **1. Backend API (Node.js + TypeScript)**
```bash
npm init -y
npm install express @supabase/supabase-js
npm install --save-dev @types/node typescript
```

### **2. Estrutura de Pastas Sugerida**
```
src/
├── routes/
│   ├── tenants.ts
│   ├── appointments.ts
│   ├── whatsapp.ts
│   └── ai.ts
├── services/
│   ├── supabase.ts
│   ├── ai-agents.ts
│   ├── whatsapp-client.ts
│   └── zoho-email.ts
├── middleware/
│   ├── tenant-resolver.ts
│   └── auth.ts
└── types/
    └── database.ts
```

### **3. Implementações Prioritárias**
1. **API de Tenants** - CRUD + onboarding
2. **WhatsApp Webhook** - Recebimento de mensagens
3. **Sistema de IA** - Agentes especializados
4. **Gestão de Agendamentos** - CRUD + validações
5. **Dashboard Admin** - Interface de gestão

### **4. Integrações Necessárias**
- **WhatsApp Business API**
- **OpenAI GPT-4** (Function Calling)
- **Zoho Mail API**
- **Google Calendar** (opcional)
- **Stripe/PagSeguro** (billing)

---

## 💡 DIFERENCIAIS COMPETITIVOS

✅ **Universal** - Funciona para qualquer domínio  
✅ **Multi-Tenant Real** - Isolamento completo  
✅ **Cross-Tenant Users** - Usuários entre múltiplos negócios  
✅ **IA Especializada** - Agentes por domínio  
✅ **Configuração JSONB** - Extremamente flexível  
✅ **TypeScript Types** - Desenvolvimento type-safe  
✅ **RLS Automático** - Segurança por design  
✅ **Escalável** - Arquitetura cloud-native  

---

## 🔐 SEGURANÇA E COMPLIANCE

- **Row Level Security** em todas as tabelas
- **Isolamento de dados** por tenant
- **Validação de entrada** com constraints
- **Criptografia** automática (Supabase)
- **Backup** automático (Supabase)
- **LGPD Ready** - Dados estruturados para compliance

---

Este sistema está **pronto para desenvolvimento** e pode ser rapidamente adaptado para qualquer vertical de mercado! 