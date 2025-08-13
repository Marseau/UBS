# 🔐 Database Security Setup - Universal Booking System

Este diretório contém toda a configuração de segurança de banco de dados para o sistema multi-tenant com Row Level Security (RLS).

## 📁 Estrutura dos Arquivos

```
database/
├── README.md                    # Esta documentação
├── 00-schema-migration.sql      # Schema completo do banco
├── 01-rls-policies.sql         # Políticas de Row Level Security
└── setup-database.sql          # Script de configuração completa
```

## 🚀 Setup Rápido

### 1. **Configuração Automática**

```bash
# Tornar o script executável
chmod +x scripts/setup-database.sh

# Configurar variáveis de ambiente
export SUPABASE_URL="sua_url_do_supabase"
export SUPABASE_SERVICE_ROLE_KEY="sua_service_key"

# Executar setup completo
./scripts/setup-database.sh setup
```

### 2. **Configuração Manual**

```sql
-- 1. Executar schema base
\i database/00-schema-migration.sql

-- 2. Aplicar políticas RLS
\i database/01-rls-policies.sql

-- 3. Ou executar setup completo
\i database/setup-database.sql
```

## 🏗️ Arquitetura Multi-Tenant

### Princípios de Isolamento

1. **Application-Level Filtering**: Todos os queries filtram por `tenant_id`
2. **Database-Level RLS**: Políticas SQL impedem acesso cross-tenant
3. **Context Management**: Sistema de contexto de sessão para RLS
4. **Role-Based Access**: Diferentes níveis de acesso (tenant, admin, super admin)

### Estrutura de Tenants

```typescript
interface Tenant {
  id: UUID;                    // Identificador único
  slug: string;               // URL-friendly identifier
  business_name: string;      // Nome do negócio
  domain: BusinessDomain;     // Domínio (legal, healthcare, etc.)
  ai_settings: AISettings;    // Configurações da IA
  domain_config: DomainConfig; // Configurações específicas do domínio
  business_rules: BusinessRules; // Regras de negócio
}
```

## 🔐 Row Level Security (RLS)

### Políticas Implementadas

| Tabela | Política | Descrição |
|--------|----------|-----------|
| `tenants` | `tenant_isolation_tenants` | Super admin ou próprio tenant |
| `users` | `tenant_isolation_users` | Usuários através de `user_tenants` |
| `appointments` | `tenant_isolation_appointments` | Filtragem por `tenant_id` |
| `services` | `tenant_isolation_services` | Filtragem por `tenant_id` |
| `conversation_history` | `tenant_isolation_conversation_history` | Filtragem por `tenant_id` |
| ... | ... | Todas as tabelas tenant-scoped |

### Funções RLS Principais

```sql
-- Obter tenant atual da sessão
get_current_tenant_id() -> UUID

-- Verificar se é usuário admin
is_admin_user() -> BOOLEAN

-- Verificar se é super admin
is_super_admin() -> BOOLEAN

-- Definir contexto do tenant
set_tenant_context(tenant_id UUID, is_admin BOOLEAN)

-- Definir contexto super admin
set_super_admin_context()

-- Limpar contexto
clear_tenant_context()
```

## 💻 Uso no Código TypeScript

### 1. **Clientes Básicos**

```typescript
import { 
  supabase,           // Cliente padrão
  getTenantClient,    // Cliente com headers de tenant
  getAdminClient      // Cliente administrativo
} from './config/database';

// Cliente padrão (sem contexto)
const { data } = await supabase.from('tenants').select('*');

// Cliente específico do tenant
const tenantClient = getTenantClient('tenant-uuid');
const { data } = await tenantClient.from('services').select('*');
```

### 2. **Clientes com Contexto RLS**

```typescript
import { 
  createTenantContextClient,
  createSuperAdminClient,
  withTenantContext,
  withSuperAdminContext
} from './config/database';

// Cliente automático com contexto RLS
const client = await createTenantContextClient('tenant-uuid');
const { data } = await client.from('services').select('*');

// Executar operação com contexto
const result = await withTenantContext('tenant-uuid', async (client) => {
  return await client.from('appointments').select('*');
});

// Operações de super admin
const adminResult = await withSuperAdminContext(async (client) => {
  return await client.from('tenants').select('*');
});
```

### 3. **Middleware de Tenant**

```typescript
// Middleware automaticamente define contexto
app.use('/api/tenant/:slug', resolveTenant, async (req, res, next) => {
  // req.tenant já está disponível
  const client = await createTenantContextClient(req.tenant.id);
  req.supabase = client;
  next();
});
```

## 🔧 Funções Utilitárias

### Gerenciamento de Tenants

```typescript
// Criar tenant com dados padrão
const tenantId = await createTenantWithDefaults(
  'Minha Empresa',      // name
  'minha-empresa',      // slug  
  'Minha Empresa LTDA', // business_name
  'healthcare',         // domain
  'contato@empresa.com', // email
  '+5511999999999'      // phone
);

// Obter estatísticas do tenant
const stats = await getTenantStats('tenant-uuid');
// Returns: { total_users, total_appointments, revenue_this_month, ... }

// Validar integridade dos dados
const validation = await validateTenantIntegrity('tenant-uuid');
```

### Backup e Manutenção

```typescript
// Backup completo dos dados do tenant
const backup = await backupTenantData('tenant-uuid');

// Limpeza de conversas antigas (90+ dias)
const deletedCount = await cleanupOldConversations();

// Atualizar contadores de bookings
await refreshUserBookingCounts();
```

## 🧪 Testes de Segurança

### 1. **Teste de Conexão**

```typescript
import { testDatabaseConnection } from './config/database';

const isConnected = await testDatabaseConnection();
console.log('Database connected:', isConnected);
```

### 2. **Teste de Políticas RLS**

```typescript
import { testRLSPolicies } from './config/database';

const rlsWorking = await testRLSPolicies('tenant-uuid');
console.log('RLS policies working:', rlsWorking);
```

### 3. **Script de Teste Completo**

```bash
# Testar conexão
./scripts/setup-database.sh test

# Executar testes de aplicação
npm run test:ai              # Testes de IA com contexto
npm run test:whatsapp        # Testes de WhatsApp multi-tenant
npm run db:test-connections  # Testes específicos de DB
```

## 📊 Monitoramento e Logs

### Views de Monitoramento

```sql
-- Performance por tenant
SELECT * FROM tenant_performance_summary;

-- Saúde do sistema
SELECT * FROM system_health_overview;
```

### Logs de Auditoria

```sql
-- Log de violações RLS
SELECT * FROM rls_audit_log 
WHERE action = 'policy_violation'
ORDER BY timestamp DESC;

-- Execuções de funções AI
SELECT * FROM function_executions 
WHERE tenant_id = 'tenant-uuid'
ORDER BY created_at DESC;
```

## 🔍 Troubleshooting

### Problemas Comuns

#### 1. **RLS Policies Não Funcionam**

```sql
-- Verificar se RLS está habilitado
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;

-- Verificar políticas existentes
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

#### 2. **Contexto de Tenant Não Definido**

```typescript
// Sempre definir contexto antes de operações
await setTenantContext(client, tenantId);

// Ou usar helpers automáticos
const client = await createTenantContextClient(tenantId);
```

#### 3. **Cross-Tenant Data Leakage**

```sql
-- Verificar dados vazados
SELECT tenant_id, COUNT(*) 
FROM appointments 
GROUP BY tenant_id;

-- Testar isolamento
SELECT set_config('app.current_tenant', 'tenant-1', false);
SELECT COUNT(*) FROM appointments; -- Deve retornar apenas dados do tenant-1
```

### Debug Mode

```bash
# Ativar logs detalhados
export DEBUG="supabase:*"
export LOG_LEVEL="debug"

# Executar aplicação
npm run dev
```

## 🔒 Segurança Best Practices

### 1. **Sempre Use RLS Context**

```typescript
// ❌ Perigoso - sem contexto
const client = getAdminClient();
await client.from('appointments').select('*');

// ✅ Seguro - com contexto
const client = await createTenantContextClient(tenantId);
await client.from('appointments').select('*');
```

### 2. **Validação de Permissões**

```typescript
// Verificar se usuário pode acessar tenant
const hasAccess = await checkUserTenantAccess(userId, tenantId);
if (!hasAccess) {
  throw new Error('Access denied');
}
```

### 3. **Auditoria de Operações**

```typescript
// Log operações críticas
await logRLSViolation('appointments', 'unauthorized_access', tenantId);
```

## 📚 Referências

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant Architecture Patterns](https://docs.microsoft.com/en-us/azure/sql-database/sql-database-design-patterns-multi-tenancy-saas-applications)

## 🆘 Suporte

Em caso de problemas:

1. **Verificar logs**: `npm run logs`
2. **Testar conexão**: `./scripts/setup-database.sh test`
3. **Validar RLS**: `npm run test:db`
4. **Contactar suporte**: marseau@email.com

---

**⚠️ IMPORTANTE**: Sempre testar mudanças em ambiente de desenvolvimento antes de aplicar em produção!