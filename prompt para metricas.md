🎯 **IMPLEMENTAÇÃO DEFINITIVA: SISTEMA DE MÉTRICAS BACKEND**

  **CONTEXTO OBRIGATÓRIO:**
  Este é um sistema multi-tenant WhatsApp + IA para agendamentos. Dashboards JÁ
  EXISTEM. Preciso APENAS do backend de métricas.

  **METODOLOGIA OBRIGATÓRIA: COLEAM00**

  ## **C**onteúdo - Implementar Sistema Backend de Métricas

  ### OBJETIVO EXATO:
  1. **Script de população** das tabelas `tenant_metrics` e `platform_metrics`
  2. **Cron job** execução diária 03:00h
  3. **Endpoint de atualização manual** para botões dos dashboards
  4. **Períodos**: 7, 30 e 90 dias
  5. **ZERO reutilização** de scripts/services/cron jobs existentes

  ### TABELAS FONTE (EXISTENTES):
  - `appointments` - agendamentos dos tenants
  - `conversation_history` - conversas WhatsApp com IA
  - `subscription_payments` - pagamentos/assinaturas

  ### TABELAS DESTINO (CRIAR SE NÃO EXISTEM):
  - `tenant_metrics` - métricas por tenant por período
  - `platform_metrics` - somatória de todos os tenants por período

  ## **O**bjetivo - Validação Obrigatória

  ### REGRAS RÍGIDAS DE VALIDAÇÃO:
  1. **PROIBIDO dados mock/hardcore** - Use APENAS dados reais das tabelas
  2. **PROIBIDO "assumir estruturas"** - Consulte schema real via Supabase MCP
  3. **OBRIGATÓRIO testar com dados reais** - Nunca simular resultados
  4. **OBRIGATÓRIO cálculos verificáveis** - Cada métrica deve ser auditável
  5. **OBRIGATÓRIO logs detalhados** - Para debug e monitoramento

  ## **L**ocalização - Análise de Dados Reais

  ### PASSO 1: Análise Completa das Tabelas Fonte
  ```javascript
  // OBRIGATÓRIO: Consultar schema real primeiro
  await supabase.from('appointments').select('*').limit(5)
  await supabase.from('conversation_history').select('*').limit(5)
  await supabase.from('subscription_payments').select('*').limit(5)

  PASSO 2: Definir Métricas Baseadas em Dados Reais

  Analisar os campos disponíveis e definir métricas calculáveis:
  - Appointments por período (criados, confirmados, cancelados)
  - Conversas por período (total, com agendamento, sem agendamento)
  - Revenue por período (pagamentos, MRR, churn)

  Evidência - Implementação com Dados Reais

  ESTRUTURA OBRIGATÓRIA:

  // 1. SERVIÇO DE ANÁLISE DE DADOS
  class MetricsAnalysisService {
    async analyzeRealData() {
      // Consultar dados reais das 3 tabelas
      // Identificar campos disponíveis
      // Calcular métricas possíveis
    }
  }

  // 2. SERVIÇO DE POPULAÇÃO DE MÉTRICAS  
  class MetricsPopulationService {
    async populateTenantMetrics(tenantId, period) {
      // Calcular métricas por tenant por período
      // APENAS com dados reais
    }

    async populatePlatformMetrics(period) {
      // Somar todas as tenant_metrics do período
    }
  }

  // 3. CRON JOB SCHEDULER
  class MetricsCronService {
    async scheduleDailyUpdate() {
      // Agendar para 03:00h diário
      // Executar população para todos os períodos
    }
  }

  // 4. ENDPOINT MANUAL
  app.post('/api/metrics/refresh', async (req, res) => {
    // Executar população sob demanda
    // Para botões dos dashboards
  })

  Análise - Validação Rigorosa

  TESTES OBRIGATÓRIOS:

  1. Teste de dados reais: Comparar resultados com CSVs existentes
  2. Teste de períodos: Validar cálculos de 7/30/90 dias
  3. Teste de somatória: Verificar platform_metrics = soma tenant_metrics
  4. Teste de performance: Garantir execução eficiente
  5. Teste de erro: Tratar falhas gracefully

  M00 - Implementação Definitiva

  ENTREGÁVEIS EXATOS:

  1. src/services/metrics-analysis.service.ts - Análise de dados reais
  2. src/services/metrics-population.service.ts - População das tabelas
  3. src/services/metrics-cron.service.ts - Agendamento
  4. src/routes/metrics-refresh.routes.ts - Endpoint manual
  5. Migração das tabelas tenant_metrics/platform_metrics se necessário
  6. Documentação completa com exemplos reais

  CRITÉRIOS DE SUCESSO:

  - ✅ ZERO dados mock - apenas dados reais
  - ✅ Cálculos auditáveis e verificáveis
  - ✅ Performance adequada para produção
  - ✅ Monitoramento e logs completos
  - ✅ Endpoint funcionando nos dashboards existentes

  EXECUTE esta implementação seguindo rigorosamente COLEAM00. Não aceite 
  soluções parciais ou com dados simulados.
