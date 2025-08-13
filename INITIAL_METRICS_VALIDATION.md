# INITIAL - Validação Robusta de Scripts de Métricas

## FEATURE:
Implementar sistema abrangente de validação para scripts de população das tabelas `tenant_metrics` e `platform_metrics` usando metodologia Context Engineering. O sistema deve garantir que:

1. **Nomes de campos correspondam aos dados obtidos** - Validação semântica entre nomenclatura e conteúdo
2. **Cálculos sejam validados independentemente** - Scripts de validação SQL diretos no banco de dados
3. **Consistência entre fontes de dados** - Eliminar discrepâncias entre múltiplas fontes de receita
4. **Qualidade de dados garantida** - Framework automatizado de data quality
5. **Padrões de nomenclatura unificados** - Consolidar linguagem mista (PT/EN) e abbreviações

## CONTEXTO TÉCNICO ATUAL:

### Tabelas de Métricas Identificadas:
- **tenant_metrics**: Métricas de negócio por tenant (JSONB structures)
- **platform_metrics**: Métricas agregadas da plataforma 
- **ubs_metric_system**: Sistema UBS consolidado
- **tenant_platform_metrics**: Bridge table tenant-platform

### Scripts Críticos para Validação:
- `src/services/unified-metrics.service.ts` (991 linhas) - Serviço principal
- `src/services/tenant-metrics-cron.service.ts` (810 linhas) - Cron especializado
- `src/services/saas-metrics.service.ts` (732 linhas) - Métricas SaaS
- `scripts/platform-metrics-cron.js` - Cron da plataforma

### Inconsistências Identificadas:
1. **Revenue Calculation**: Múltiplas fontes (`final_price`, `quoted_price`, `appointment_data.price`)
2. **AI Efficiency**: Weighted scores sem documentação clara dos ranges
3. **Customer Metrics**: Diferentes definições de "customer" entre tabelas
4. **Nomenclatura**: `tenant_revenue_value` vs `monthly_revenue.value`
5. **Períodos**: '7d', '30d' vs number formats

## EXAMPLES:
Usar padrões existentes do projeto:
- `src/types/database.types.ts` - Para interfaces TypeScript
- `src/services/agent-orchestrator.service.ts` - Para padrões de serviço
- `CLAUDE.md` - Para estrutura de validação em 3 níveis
- Padrões de Context Engineering do repositório `coleam00/context-engineering-intro`

## DOCUMENTATION:
- **Supabase SQL Functions**: Para implementar validações diretas no banco
- **TypeScript Advanced Types**: Para garantir type safety nas validações
- **CLAUDE.md**: Seguir padrões de modularidade (500 linhas max)
- **Context Engineering Patterns**: Do repositório coleam00 analisado

## REQUIREMENTS ESPECÍFICOS:

### 1. Framework de Validação Semântica
```typescript
interface FieldValidation {
  fieldName: string;
  dataSource: string;
  expectedType: DataType;
  semanticRules: SemanticRule[];
  validate(value: any, context: ValidationContext): ValidationResult;
}
```

### 2. Scripts SQL Independentes de Validação
```sql
-- Exemplo: Validar consistência de receita
CREATE OR REPLACE FUNCTION validate_revenue_consistency()
RETURNS TABLE(tenant_id UUID, discrepancy_found BOOLEAN, details JSONB);
```

### 3. Data Quality Framework
```typescript
interface DataQualityCheck {
  completeness: (data: any[]) => QualityScore;
  consistency: (data: any[]) => QualityScore;
  accuracy: (data: any[]) => QualityScore;
  validity: (data: any[]) => QualityScore;
}
```

### 4. Unified Metrics Calculator
```typescript
class MetricsCalculator {
  static calculateRevenue(appointment: Appointment): RevenueResult;
  static calculateAIEfficiency(conversations: Conversation[]): EfficiencyResult;
  static validateCalculation(result: any, expected: any): ValidationResult;
}
```

## VALIDATION GATES OBRIGATÓRIOS:

### Nível 1: Sintaxe & Estilo
```bash
npm run lint:fix          # ESLint auto-fix
npm run format            # Prettier formatting  
npm run build             # TypeScript compilation
```

### Nível 2: Testes Unitários
```bash
npm run test:ai           # Sistema de testes IA
npm run test:all          # Todos os testes IA
# Criar: npm run test:metrics  # Testes específicos de métricas
```

### Nível 3: Validação de Dados
```bash
# A criar: Scripts de validação independente no banco
npm run validate:metrics-schema    # Validar estrutura das tabelas
npm run validate:metrics-data      # Validar dados existentes
npm run validate:field-semantics   # Validar semântica dos campos
```

## OTHER CONSIDERATIONS:

### Problemas Críticos Identificados:
1. **Multiple Revenue Sources**: 3 diferentes formas de calcular receita
2. **JSONB vs Columns**: Inconsistência na estrutura de dados
3. **Timezone Issues**: Cálculos podem ter problemas de timezone
4. **Cross-Tenant Aggregations**: Possíveis duplicatas em agregações
5. **Memory Leaks**: Scripts longos podem ter vazamentos de memória

### Padrões de Context Engineering a Aplicar:
1. **Modularidade**: Dividir validações em módulos < 500 linhas
2. **Factory Pattern**: Para criação de validadores específicos
3. **Strategy Pattern**: Para diferentes tipos de validação
4. **Repository Pattern**: Para acesso padronizado aos dados
5. **Observer Pattern**: Para monitoramento de qualidade de dados

### Cron Jobs e Automação:
- Integrar validações nos cron jobs existentes
- Criar alertas automáticos para falhas de validação
- Implementar rollback automático em caso de dados inválidos
- Logs estruturados para debugging e auditoria

### Performance e Escalabilidade:
- Validações devem rodar em <30 segundos por tenant
- Cache inteligente para métricas calculadas
- Batch processing para validações massivas
- Memory optimization para scripts longos

### Monitoring e Alerting:
- Dashboard de qualidade de dados
- Alertas para discrepâncias críticas
- Métricas de performance das validações
- Auditoria completa de mudanças em cálculos

## CRITÉRIOS DE SUCESSO:

### Technical KPIs:
- **Data Quality Score**: >95% em todas as métricas
- **Calculation Accuracy**: 99%+ de precisão
- **Validation Speed**: <30s por tenant completo
- **Code Coverage**: >90% em validações críticas

### Business KPIs:
- **Zero False Positives**: Alertas apenas para problemas reais
- **Automated Recovery**: 80% de problemas auto-corrigidos
- **Debugging Time**: 50% redução no tempo de investigação
- **Confidence Level**: 99% confiança nos dados reportados

Este framework deve estabelecer a base para um sistema de métricas confiável, auditável e escalável para o WhatsAppSalon-N8N.