# Database Examples

Patterns para operações de banco de dados com Supabase/PostgreSQL.

## Arquivos de Exemplo

### `migration-patterns.sql`
- Estrutura de migrações reversíveis
- Adição de colunas com defaults
- Índices para performance
- RLS policy migrations

### `rls-policy-examples.sql`
- RLS policies para diferentes cenários
- Performance-optimized policies
- Complex join policies
- Audit trail policies

### `complex-queries.ts`
- Queries com múltiplas tabelas
- Aggregations com tenant isolation
- Performance-optimized joins
- Bulk operations patterns

### `performance-optimization.sql`
- Índices estratégicos
- Query optimization patterns
- Materialized views
- Partitioning strategies

## Database Best Practices

1. **Always Tenant-Scoped**: Every query includes tenant_id
2. **RLS First**: Use RLS policies, not application-level filtering
3. **Index Strategy**: Composite indexes with tenant_id first
4. **Migration Safety**: Always reversible migrations
5. **Performance Monitoring**: Track query performance per tenant