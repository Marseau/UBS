# Execute Metrics Validation PRP

## PRP file: $ARGUMENTS

Executar implementação completa do sistema de validação de métricas baseado no PRP gerado. Seguir metodologia Context Engineering para garantir implementação robusta e confiável.

## Execution Strategy

### 1. Context Loading
- Ler PRP completo com todos os requisitos
- Analisar estruturas de dados existentes
- Mapear dependências entre serviços
- Identificar pontos de integração críticos

### 2. Planning Phase
- Criar TodoWrite detalhado com todos os componentes
- Dividir implementação em módulos < 500 linhas
- Estabelecer ordem de desenvolvimento por dependências
- Definir validation gates por módulo

### 3. Implementation Sequence

#### **Phase 1: Foundation (Alta Prioridade)**
1. **Metrics Validation Types** - Interfaces e tipos base
2. **SQL Validation Functions** - Funções independentes no banco
3. **Base Validation Service** - Estrutura principal do serviço
4. **Error Handling Framework** - Sistema de erros e recovery

#### **Phase 2: Core Features (Média Prioridade)**
1. **Semantic Field Validation** - Validação nome vs dados
2. **Unified Calculator** - Consolidação de cálculos
3. **Data Quality Framework** - Sistema de scoring
4. **Performance Optimization** - Cache e otimizações

#### **Phase 3: Integration (Baixa Prioridade)**
1. **Cron Jobs Integration** - Integração com jobs existentes
2. **Monitoring Dashboard** - Interface de monitoramento
3. **Alerting System** - Sistema de alertas
4. **Documentation** - Documentação completa

### 4. Validation Strategy

#### **Per-Module Validation**
```bash
# Para cada módulo implementado:
npm run lint:fix                    # Auto-fix style issues
npm run build                       # Compile TypeScript
npm run test:metrics-module         # Test specific module
```

#### **Integration Validation**
```bash
# Após completar cada phase:
npm run test:metrics-integration    # Integration tests
npm run validate:sql-functions      # Test SQL functions
npm run benchmark:performance       # Performance tests
```

#### **End-to-End Validation**
```bash
# Final validation:
npm run validate:complete-system    # Full system validation
npm run test:live-data             # Test with real data
npm run audit:data-quality         # Quality audit
```

### 5. Implementation Guidelines

#### **Code Quality Standards**
- Seguir padrões do CLAUDE.md do projeto
- Máximo 500 linhas por arquivo
- Documentação JSDoc para todas as funções
- Type safety rigoroso com TypeScript
- Error handling abrangente

#### **Performance Requirements**
- Validação completa < 30 segundos por tenant
- Memory usage < 512MB para validações
- CPU usage < 70% durante execução
- Zero memory leaks em execução prolongada

#### **Integration Requirements**
- Zero breaking changes em serviços existentes
- Backward compatibility com APIs atuais
- Graceful degradation se validação falhar
- Rollback automático para dados inválidos

### 6. Testing Strategy

#### **Unit Tests (90% Coverage)**
```typescript
describe('MetricsValidationService', () => {
  it('should validate revenue calculation consistency');
  it('should detect field semantic mismatches');
  it('should handle validation errors gracefully');
});
```

#### **Integration Tests**
```typescript
describe('SQL Validation Functions', () => {
  it('should validate tenant metrics independently');
  it('should detect platform metrics discrepancies');
  it('should performance within acceptable limits');
});
```

#### **End-to-End Tests**
```typescript
describe('Complete Validation Workflow', () => {
  it('should validate entire tenant metrics pipeline');
  it('should handle large dataset validation');
  it('should integrate with existing cron jobs');
});
```

### 7. Error Recovery

#### **Validation Failures**
- Categorizar por severidade (INFO, WARNING, ERROR, CRITICAL)
- Auto-retry para falhas temporárias
- Manual intervention alerts para problemas críticos
- Detailed logging para debugging

#### **Performance Issues**
- Timeout handling com graceful degradation
- Memory monitoring com cleanup automático
- Circuit breaker para falhas recorrentes
- Load balancing para validações pesadas

### 8. Success Verification

#### **Technical Verification**
- [ ] Todos os testes passando (>90% coverage)
- [ ] Performance dentro dos SLAs estabelecidos
- [ ] Zero memory leaks detectados
- [ ] Integração com serviços existentes funcionando

#### **Business Verification**
- [ ] Validações detectando problemas reais conhecidos
- [ ] Zero false positives em alertas críticos
- [ ] Dados de qualidade melhorados mensuravelmente
- [ ] Time de desenvolvimento reporta confiança aumentada

### 9. Documentation Requirements

#### **Technical Documentation**
- README atualizado com novos comandos
- API documentation para novas interfaces
- Database schema documentation
- Performance benchmarks documentados

#### **User Documentation**
- Guia de troubleshooting para validações
- Dashboard usage guide
- Alert interpretation guide
- Maintenance procedures

## Final Checklist

- [ ] PRP requirements 100% implementados
- [ ] Validation gates todos passando
- [ ] Performance SLAs atendidos
- [ ] Integration tests passando
- [ ] Documentation completa
- [ ] Zero regressions em funcionalidade existente
- [ ] Sistema pronto para produção

**Implementation Confidence**: 9/10

Execute este PRP com confiança para implementar sistema robusto de validação de métricas no WhatsAppSalon-N8N.