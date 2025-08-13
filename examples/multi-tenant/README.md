# Multi-Tenant Examples

Patterns para arquitetura multi-tenant com Row Level Security (RLS).

## Arquivos de Exemplo

### `rls-policy-patterns.sql`
- RLS policy creation patterns
- Tenant isolation enforcement
- Cross-tenant data access prevention
- Performance-optimized policies

### `tenant-scoped-queries.ts`
- Automatic tenant_id injection
- Query builders with tenant context
- Join patterns preserving tenant isolation
- Bulk operations with tenant safety

### `cross-tenant-user-handling.ts`
- User access to multiple tenants
- Permission management patterns
- Context switching between tenants
- Audit trail for cross-tenant access

### `data-isolation-patterns.ts`
- Complete data separation strategies
- Shared vs. isolated table patterns
- Migration patterns for multi-tenancy
- Testing data isolation

## Critical Security Patterns

1. **Always Include tenant_id**: Every query must be tenant-scoped
2. **RLS Policy Testing**: Automated tests for data isolation
3. **User Context**: Always verify user has access to tenant
4. **Audit Trails**: Log all cross-tenant operations
5. **Default Deny**: RLS policies should default to deny access