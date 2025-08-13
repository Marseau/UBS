# Generate Metrics Validation PRP

## Feature file: $ARGUMENTS

Gerar PRP abrangente para implementação de sistema de validação robusta de métricas usando Context Engineering. O PRP deve incluir contexto completo para permitir implementação one-pass com alta confiança.

## Research Process Específico para Métricas

1. **Análise de Codebase Existente**
   - Examinar `src/services/unified-metrics.service.ts` - Padrões de cálculo
   - Revisar `src/types/database.types.ts` - Estruturas de dados
   - Analisar scripts de validação existentes em root/
   - Identificar cron jobs em `src/services/unified-cron.service.ts`

2. **Padrões de Validação SQL**
   - Buscar funções SQL existentes para métricas
   - Documentar estruturas JSONB das tabelas
   - Identificar foreign keys e relações críticas
   - Mapear índices para performance

3. **Context Engineering Patterns**
   - Aplicar metodologia do repositório coleam00
   - Seguir padrões do CLAUDE.md do projeto
   - Implementar validação em 3 níveis obrigatória
   - Usar modularidade < 500 linhas por arquivo

## PRP Generation - Métricas WhatsApp Salon

### Contexto Crítico para IA Agent

#### **Estruturas de Dados Existentes**
```typescript
// Incluir definições reais de:
interface TenantMetrics {
  tenant_id: string;
  metric_type: MetricType;
  metric_data: MetricData;
  period: Period;
}

interface PlatformMetrics {
  total_mrr: number;
  total_appointments: number;
  active_tenants: number;
}
```

#### **Cálculos de Referência**
```typescript
// Padrões existentes a seguir:
class UnifiedMetricsService {
  formatKPIValue(value: number, format: string): FormattedKPI;
  getPlatformMetrics(filters: MetricsFilters): Promise<PlatformMetrics>;
}
```

#### **Validações SQL Necessárias**
```sql
-- Exemplos de validações diretas no banco:
CREATE OR REPLACE FUNCTION validate_tenant_revenue_consistency(tenant_uuid UUID)
RETURNS TABLE(
  field_name TEXT,
  calculated_value NUMERIC,
  expected_value NUMERIC,
  discrepancy_percent NUMERIC
);
```

### Implementation Blueprint

#### **1. Metrics Validation Framework**
- Criar `src/services/metrics-validation.service.ts`
- Implementar interfaces para validação semântica
- Factory pattern para diferentes tipos de validação
- Error handling com rollback automático

#### **2. SQL Independent Validators**
- Criar `database/functions/metrics-validation.sql`
- Implementar funções SQL puras para cálculos
- Cross-reference com dados existentes
- Performance-optimized queries

#### **3. Data Quality Framework**
- Sistema de scoring de qualidade
- Alertas automáticos para anomalias
- Dashboard de monitoramento
- Auditoria de mudanças

#### **4. Unified Calculator Refactor**
- Consolidar múltiplas fontes de receita
- Padronizar cálculos de AI efficiency
- Unificar definições de customer metrics
- Otimizar performance com cache

### Validation Gates - Métricas Específicas

#### **Nível 1: Sintaxe & Estrutura**
```bash
npm run lint:fix
npm run build
npx tsc --noEmit --strict
```

#### **Nível 2: Testes de Validação**
```bash
npm run test:metrics-validation     # Testes específicos de validação
npm run test:sql-consistency       # Testes de consistência SQL
npm run test:field-semantics       # Testes semânticos
```

#### **Nível 3: Integração e Performance**
```bash
npm run validate:live-data          # Validação com dados reais
npm run benchmark:validation-speed  # Performance das validações
npm run audit:data-quality         # Auditoria completa
```

### Error Handling Strategy

#### **Validation Failures**
- Categorizar erros por severidade (WARNING, ERROR, CRITICAL)
- Auto-recovery para problemas menores
- Manual intervention para discrepâncias críticas
- Rollback automático para falhas de integridade

#### **Performance Issues**
- Timeout handling para validações longas
- Memory optimization para datasets grandes
- Batch processing para validações massivas
- Circuit breaker para falhas recorrentes

### Success Criteria

#### **Data Quality**
- 95%+ accuracy em todos os cálculos
- Zero false positives em alertas críticos
- <30 segundos para validação completa por tenant
- 99% uptime do sistema de validação

#### **Code Quality**
- 90%+ test coverage em validações críticas
- Modularidade < 500 linhas por arquivo
- Documentação completa de todas as regras
- Zero hardcoded values em cálculos

### Arquivos de Saída

1. **`src/services/metrics-validation.service.ts`** - Serviço principal de validação
2. **`src/types/metrics-validation.types.ts`** - Interfaces e tipos
3. **`database/functions/metrics-validation.sql`** - Funções SQL independentes
4. **`src/utils/metrics-calculator.ts`** - Calculadora unificada
5. **`tests/metrics-validation.test.ts`** - Testes abrangentes

## Quality Checklist Final

- [ ] Todo contexto de métricas existentes incluído
- [ ] Padrões SQL para validação independente documentados
- [ ] Error handling e rollback strategy definida
- [ ] Performance benchmarks estabelecidos
- [ ] Modularidade < 500 linhas garantida
- [ ] Validação em 3 níveis implementada
- [ ] Context Engineering patterns aplicados
- [ ] Success criteria mensuráveis definidos

**Confidence Score**: 9/10 para implementação one-pass

O PRP deve garantir implementação robusta e confiável do sistema de validação de métricas para WhatsAppSalon-N8N.