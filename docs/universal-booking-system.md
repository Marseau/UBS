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

### **Tabelas Principais**

#### `tenants` - Multi-tenancy Core
```sql
- id (UUID, PK)
- slug (UNIQUE) - Ex: "maria-silva-advocacia"
- domain (ENUM) - business_domain
- business_name, email, phone, whatsapp_phone
- domain_config (JSONB) - Configurações específicas do domínio
- ai_settings (JSONB) - Configurações de IA personalizadas
- business_rules (JSONB) - Regras de negócio
```

#### `users` - Cross-Tenant Users
```sql
- id (UUID, PK)
- phone (UNIQUE) - Chave principal de identificação
- email, name
- preferences (JSONB)
```

#### `user_tenants` - Relacionamento Many-to-Many
```sql
- user_id + tenant_id (PK composta)
- role - 'customer', 'admin', 'professional'
- tenant_preferences (JSONB)
- total_bookings, first_interaction, last_interaction
```

#### `services` - Serviços Universais
```sql
- id (UUID, PK)
- tenant_id (FK)
- category_id (FK)
- name, description
- duration_type (ENUM) - 'fixed', 'variable', 'estimated', 'session'
- price_model (ENUM) - 'fixed', 'hourly', 'package', 'dynamic'
- service_config (JSONB) - Configurações específicas
```

#### `appointments` - Agendamentos
```sql
- id (UUID, PK)
- tenant_id, user_id, service_id (FKs)
- start_time, end_time, timezone
- status (ENUM) - 'pending', 'confirmed', 'completed', etc.
- quoted_price, final_price
- appointment_data (JSONB) - Dados específicos do agendamento
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