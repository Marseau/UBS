# REGRAS OBRIGATÓRIAS PARA CLAUDE NO PROJETO

1. **Antes de criar qualquer tabela, campo ou função:**
   - Liste todas as tabelas, funções e campos existentes no Supabase.
   - Compare e só proponha alterações se realmente não existir o item.

2. **Nunca crie ou altere algo que já existe sem validação manual.**

3. **Antes de alterar algo funcional:**
   - Rode testes automatizados e valide o impacto.
   - Documente as mudanças propostas.

4. **Nunca exclua ou sobrescreva dados sem backup.**

5. **Proponha scripts de migração reversíveis.**

6. **A cada mudança aprovada:**
   - Faça um commit no git imediatamente após a alteração.
   - A mensagem do commit deve ser clara e descritiva, explicando o que foi alterado e por quê.
   - **OBRIGATÓRIO**: Após cada commit, atualize o arquivo `CLAUDE.md` documentando:
     - O que foi implementado
     - Qual MCP Server foi utilizado (se aplicável)
     - Benefícios alcançados
     - Impacto na performance
     - Data e hora da implementação
   - Exemplo de mensagem:
     - `feat: adiciona campo telefone em clientes para integração WhatsApp`
     - `fix: corrige tipo de dado em agendamentos para evitar erro de timezone`
     - `refactor: reorganiza funções SQL para melhor performance`
   - Exemplo de documentação no CLAUDE.md:
     ```markdown
     ## 📝 Commit: feat: implementa processamento de voz com IA
     **Data:** 2024-01-15 14:30
     **MCP Server:** Supabase (queries), Filesystem (arquivos)
     **Implementação:** VoiceProcessingService com OpenAI Whisper
     **Benefícios:** 85% melhoria em transcrição, 33.4% redução tempo
     **Performance:** +110% otimização geral
     ```

7. **Nunca execute comandos destrutivos (DROP, DELETE sem WHERE, etc.) sem aprovação explícita.**

8. **Sempre comunique e documente qualquer alteração relevante no changelog do projeto.**

9. **Nunca sobrescreva arquivos de backend sem backup.**

10. **Antes de alterar endpoints, verifique se já existem e estão funcionando.**

11. **Sempre rode os testes automatizados antes e depois de qualquer alteração.**

12. **Documente toda alteração em um changelog ou commit message detalhado.**

13. **Nunca altere tabelas/colunas/funcionalidades que já estão funcionando sem antes validar e documentar o impacto.**

14. **Se possível, aplique primeiro em um ambiente de desenvolvimento/teste.**

15. **Nunca exclua ou sobrescreva dados sem backup.**

16. **Proponha scripts de migração reversíveis.**

17. **Sempre comunique e documente qualquer alteração relevante no changelog do projeto.** 

18. **🚀 USO OBRIGATÓRIO DOS MCP SERVERS:**
    - **OBRIGATÓRIO**: Sempre utilizar MCP Servers quando disponíveis para máxima eficiência
    - **MCP Servers Habilitados** (113 tools total):
      - **filesystem** (12 tools): Operações de arquivo avançadas
      - **memory** (9 tools): Otimização de memória e cache
      - **puppeteer** (7 tools): Automação de browser e testes
      - **supabase** (28 tools): Operações diretas no banco PostgreSQL
      - **playwright** (31 tools): Testes E2E e automação web
      - **github** (26 tools): Operações Git e GitHub avançadas
    - **Benefícios Comprovados**: Na otimização 110% alcançamos 85% usando MCP Postgres (33.4% melhoria database)
    - **Prioridade de Uso**:
      1. **Supabase MCP** para todas operações SQL diretas
      2. **Memory MCP** para otimizações de performance
      3. **Filesystem MCP** para operações de arquivo eficientes
      4. **GitHub MCP** para operações Git avançadas
      5. **Playwright/Puppeteer MCP** para testes automatizados
    - Documente no commit qual MCP Server foi utilizado e os benefícios alcançados 

19. **Ao criar, modificar ou incluir qualquer coisa no frontend:**
    - Sempre respeite o padrão definido em `TEMPLATE_BASE_IMPLEMANTATIZATION_GUIDE.md`.
    - Use o arquivo `widget-demo.html` como modelo obrigatório para novos componentes/widgets.
    - Caso crie um novo widget, ele deve ser validado e aprovado antes de ser aplicado.
    - Após aprovação, aplique/insira o widget no HTML correspondente, seguindo o padrão estabelecido. 

# BOAS PRÁTICAS GERAIS PARA DESENVOLVIMENTO (.ts/.js)

1. **Padrão de Código e Lint**
   - Siga o padrão de código definido pelo projeto (ex: ESLint, Prettier).
   - Nunca faça commit com erros de lint ou formatação.
   - Use sempre o mesmo estilo de aspas, indentação, nomes de variáveis e funções.

2. **Tipagem e Segurança**
   - Em TypeScript, sempre tipar funções, parâmetros e retornos.
   - Evite usar `any` sem justificativa clara.
   - Prefira tipos e interfaces explícitos.

3. **Modularização e Reutilização**
   - Separe o código em módulos/funções pequenas e reutilizáveis.
   - Nunca duplique código: extraia funções/utilitários quando necessário.
   - Use pastas organizadas por domínio/função (ex: `services/`, `utils/`, `components/`).

4. **Documentação e Comentários**
   - Documente funções, classes e módulos com JSDoc/TSDoc.
   - Comente apenas o necessário, nunca explique o óbvio.
   - Atualize a documentação sempre que alterar o comportamento.

5. **Controle de Versão**
   - Commits pequenos, frequentes e com mensagens claras.
   - Nunca faça commit de arquivos temporários, senhas ou dados sensíveis.
   - Use branches para features, correções e experimentos.

6. **Testes**
   - Sempre escreva testes unitários para funções críticas.
   - Use testes de integração para fluxos completos.
   - Nunca altere código de produção sem rodar os testes.

7. **Tratamento de Erros**
   - Sempre trate erros e exceções de forma clara.
   - Nunca exponha mensagens sensíveis ao usuário final.
   - Use logs para rastrear problemas, mas sem vazar dados privados.

8. **Performance e Otimização**
   - Evite loops e queries desnecessárias.
   - Prefira métodos nativos e funções puras.
   - Analise e otimize pontos críticos de performance.

9. **Segurança**
   - Nunca exponha chaves, tokens ou segredos no código.
   - Valide e sanitize toda entrada de usuário.
   - Use variáveis de ambiente para dados sensíveis.

10. **Integração Contínua**
    - Sempre rode CI/CD antes de mergear código.
    - Corrija todos os erros apontados pela pipeline antes de aprovar.

# REGRAS ESPECÍFICAS PARA CLAUDE/IA

- Nunca altere arquivos de configuração sem validação manual.
- Sempre proponha PRs (pull requests) para revisão, nunca altere direto na main/master.
- Antes de remover código, verifique dependências e impactos.
- Sempre consulte a documentação do projeto antes de propor mudanças estruturais.
- Nunca altere scripts de build/deploy sem aprovação explícita. 

---

## 🏷️ **Definindo os Papéis: Executor vs. Organizador/Gerente**

### 1. **Executor (Programmer/Implementer)**
- Responsável por:  
  - Executar tasks/pedidos recebidos.
  - Escrever código, scripts, arquivos, SQL, etc.
  - Seguir rigorosamente as regras do projeto (`REGRAS_CLAUDE.md`).
  - Documentar e commitar cada alteração.
  - Nunca implementar mudanças sem validação prévia do Organizador.

### 2. **Organizador/Gerente (Project Manager/Prompt Engineer)**
- Responsável por:  
  - Criar, organizar e priorizar tasks/prompts em inglês.
  - Analisar, revisar e aprovar ou rejeitar as entregas do Executor.
  - Testar, validar e sugerir melhorias antes de qualquer implementação definitiva.
  - Garantir que todas as regras, padrões e boas práticas sejam seguidas.
  - Manter a documentação, changelog e histórico de decisões.

---

## 📄 **Documentos Recomendados para Formalizar os Papéis**

### 1. **`ROLES_AND_RESPONSIBILITIES.md`**
Um documento claro, em inglês, descrevendo o papel de cada agente no projeto.

#### Exemplo de conteúdo:

```markdown
# Roles and Responsibilities

## 1. Project Manager / Prompt Engineer (Claude Organizer)
- Creates and organizes all tasks/prompts for the Executor.
- Reviews, tests, and validates all deliverables before implementation.
- Approves or rejects changes based on project standards and best practices.
- Maintains documentation, changelog, and project history.
- Ensures all project rules (`REGRAS_CLAUDE.md`) are followed.

## 2. Programmer / Executor (Claude Executor)
- Executes all tasks as defined by the Project Manager.
- Writes code, scripts, and documentation as requested.
- Never implements changes without prior validation and approval.
- Commits all changes with clear messages.
- Follows all project rules and best practices.
```

---

### 2. **`TASKS_BOARD.md` ou `TASKS_TODO.md`**
- Lista de tasks em inglês, organizadas pelo Organizador, para o Executor seguir.
- Pode ser um quadro Kanban, lista de tarefas ou backlog.

---

### 3. **`CHANGELOG.md`**
- Documento de registro de todas as mudanças aprovadas e implementadas.

---

### 4. **`REGRAS_CLAUDE.md`**
- Já criado, com todas as regras técnicas e de conduta.

---

## ✅ **Resumo prático**
- Crie um arquivo `ROLES_AND_RESPONSIBILITIES.md` na raiz do projeto, em inglês, com a definição clara dos papéis.
- Oriente cada agente a ler e seguir esse documento ao iniciar a sessão.
- Use o `TASKS_BOARD.md` para organizar o fluxo de trabalho entre Organizador e Executor.

Se quiser, posso criar agora mesmo o arquivo `ROLES_AND_RESPONSIBILITIES.md` com o modelo acima! 

# PROMPTS OBRIGATÓRIOS APÓS CADA COMMIT NO GIT

Após cada commit realizado no git, execute obrigatoriamente os seguintes prompts:

1. **Verificação de Segurança:**
   > Please check through all the code you just wrote and make sure it follows security best practices. Make sure no sensitive information is in the front end and there are no vulnerabilities people can exploit.

2. **Explicação Detalhada:**
   > Please explain the functionality and code you just built out in detail. Walk me through what you changed and how it works. Act like you're a senior engineer teaching me a code.

Esses prompts devem ser seguidos rigorosamente para garantir a qualidade, segurança e clareza do desenvolvimento no projeto.

# REGRAS ESPECÍFICAS PARA AUDITORIA E RECUPERAÇÃO DE DADOS

## 1. **Auditoria de Dados em Produção**
- Sempre criar scripts de auditoria antes de qualquer operação em dados de produção
- Gerar relatórios detalhados sobre o estado dos dados antes e depois das alterações
- Documentar todas as descobertas em arquivos de auditoria com timestamp
- Nunca executar operações em massa sem validação prévia dos dados

## 2. **Estratégia de Backup e Rollback**
- Criar backups completos antes de qualquer operação de manipulação de dados
- Implementar scripts de rollback para todas as operações realizadas
- Manter arquivos de backup organizados por data e operação
- Testar procedimentos de rollback em ambiente de desenvolvimento

## 3. **Manipulação Segura de Dados Órfãos**
- Identificar e categorizar dados órfãos antes de qualquer correção
- Criar dados sintéticos quando necessário, mas sempre com identificação clara
- Aplicar descontos ou ajustes apropriados para dados sintéticos
- Manter rastreabilidade completa entre dados reais e sintéticos

## 4. **Relacionamentos de Dados Multi-Tenant**
- Validar integridade referencial em todos os relacionamentos
- Garantir que RLS (Row Level Security) seja respeitado em todas as operações
- Verificar isolamento entre tenants após qualquer mudança
- Implementar validações específicas para relacionamentos multi-tenant

## 5. **Métricas e Recálculos**
- Implementar lógica de domínio específica para cálculos de métricas
- Criar funções de validação para verificar consistência dos cálculos
- Documentar fórmulas e lógica de negócio usadas nos cálculos
- Implementar verificações automáticas de sanidade para métricas calculadas

## 6. **Logs e Rastreabilidade**
- Registrar todas as operações de manipulação de dados com timestamp
- Manter log detalhado das decisões tomadas durante a correção
- Criar relatórios de execução com estatísticas antes/depois
- Implementar sistema de auditoria para operações críticas

## 7. **Validação Pós-Operação**
- Executar testes de integridade após qualquer operação em dados
- Verificar se todas as relações foram estabelecidas corretamente
- Validar se os cálculos de métricas estão refletindo os dados corretos
- Executar health checks do sistema após mudanças significativas

## 8. **Documentação de Operações**
- Criar documentação detalhada para cada fase de correção de dados
- Manter changelog específico para operações de dados
- Documentar lições aprendidas e melhores práticas descobertas
- Incluir exemplos de código e queries utilizadas

## 9. **Procedimentos de Emergência**
- Definir procedimentos claros para situações de emergência
- Manter scripts de recuperação rápida disponíveis
- Implementar alertas para situações críticas de dados
- Ter planos de contingência para falhas durante operações

## 10. **Ambiente de Teste**
- Sempre testar operações complexas em ambiente de desenvolvimento
- Usar subconjuntos representativos de dados para testes
- Validar performance de operações em massa antes da produção
- Implementar testes automatizados para operações recorrentes

# FLUXO DE TRABALHO PARA CORREÇÃO DE DADOS EM PRODUÇÃO

## **Modelo de Fases para Operações Críticas**

### **Fase 1: Auditoria e Análise**
1. **Audit Scripts**: Criar scripts de auditoria para identificar problemas
2. **Relationship Mapping**: Mapear relacionamentos entre tabelas
3. **Backup Strategy**: Implementar estratégia completa de backup
4. **Impact Analysis**: Analisar impacto das mudanças propostas

### **Fase 2: Correção de Relacionamentos**
1. **User-Tenant Links**: Estabelecer relacionamentos usuário-tenant
2. **Data Linking**: Conectar dados órfãos a registros existentes
3. **Synthetic Data**: Criar dados sintéticos quando necessário
4. **Timezone Validation**: Validar consistência temporal

### **Fase 3: Recálculo de Métricas**
1. **Business Logic**: Implementar lógica de negócio específica por domínio
2. **Cost Calculation**: Recalcular custos com modelos de pricing corretos
3. **Metric Refresh**: Atualizar métricas agregadas do sistema
4. **Performance Optimization**: Otimizar consultas e cálculos

### **Fase 4: Validação e Monitoramento**
1. **Data Integrity**: Validar integridade dos dados corrigidos
2. **Health Checks**: Executar verificações de saúde do sistema
3. **Performance Tests**: Testar performance com dados corrigidos
4. **Documentation**: Documentar todas as mudanças realizadas

## **Exemplo de Execução Bem-Sucedida**

```bash
# Exemplo baseado na correção realizada no projeto
# Fase 1: Auditoria
node audit-metrics-orphans.js          # 137 usage costs órfãos identificados
node analyze-metrics-relationships.js   # Análise de relacionamentos
node backup-metrics-tables.js          # Backup completo criado

# Fase 2: Correção
node fix-user-tenant-relationships.js   # 995 relacionamentos criados
node execute-usage-costs-linking.js     # 87 conversas sintéticas + 50 reais
node generate-realistic-appointments.js # 353 appointments realistas
node fix-platform-metrics-timezone.js   # Validação timezone

# Fase 3: Recálculo
node recalculate-usage-costs-phase3.js  # Pricing por domínio implementado
# Métricas de plataforma atualizadas automaticamente

# Fase 4: Validação
npm run analytics:health-check          # Verificação de saúde
# Auditoria final e documentação
```

## **Indicadores de Sucesso**

### **Métricas Técnicas**
- ✅ **Relacionamentos**: 0 dados órfãos
- ✅ **Integridade**: 100% dos foreign keys válidos
- ✅ **Performance**: Tempos de resposta mantidos
- ✅ **Rollback**: Procedimentos testados e funcionais

### **Métricas de Negócio**
- ✅ **Custos**: Modelo de pricing realista implementado
- ✅ **Domínios**: Lógica específica por área de negócio
- ✅ **Sintéticos**: Dados sintéticos identificados e descontados
- ✅ **Agregações**: Métricas de plataforma precisas

### **Métricas de Qualidade**
- ✅ **Auditoria**: Trilha completa de todas as operações
- ✅ **Documentação**: Processo documentado e reproduzível
- ✅ **Testes**: Validação automática implementada
- ✅ **Backup**: Procedimentos de recuperação testados

## **Lições Aprendidas**

1. **Sempre auditar antes de corrigir**: Identificar o problema real vs. percebido
2. **Backups são essenciais**: Implementar múltiplos pontos de rollback
3. **Dados sintéticos são válidos**: Quando identificados e tratados adequadamente
4. **Lógica de domínio importa**: Implementar pricing e regras específicas por área
5. **Validação contínua**: Verificar integridade em cada etapa
6. **Documentação é crucial**: Manter registro detalhado de todas as decisões
7. **Performance monitoring**: Acompanhar impacto das mudanças no sistema
8. **Teste incremental**: Testar cada fase antes de prosseguir

Essas regras devem ser seguidas rigorosamente em todas as operações de correção de dados em produção.

---

# METODOLOGIA "INVESTIGATE FIRST" - LIÇÕES APRENDIDAS

## **Regra Fundamental: SEMPRE VERIFICAR ANTES DE ASSUMIR**

**Baseado no case study do projeto de racionalização de dashboards:**
- Um projeto planejado para **8 semanas** foi resolvido em **2 horas** através de **uma pergunta simples**
- Sistema considerado "quebrado" estava **95% funcional**
- Economia de **96% do tempo** através da abordagem "Investigate First"

## **Metodologia Obrigatória**

### **1. INVESTIGATE FIRST - Verificar Estado Atual**
```javascript
// ❌ ERRADO: Assumir problemas
const problema = "Sistema precisa ser reconstruído";
const solucao = criarNovaArquitetura();

// ✅ CORRETO: Verificar realidade
const estadoAtual = await verificarSistemaReal();
if (estadoAtual.funcional >= 90%) {
    aplicarCorrecaoMinima();
} else {
    considerarReconstrucao();
}
```

### **2. DATA-DRIVEN DECISIONS - Decisões Baseadas em Dados**
```javascript
// ❌ ERRADO: Trabalhar com suposições
const suposicao = "Tabelas duplicadas precisam ser consolidadas";

// ✅ CORRETO: Analisar dados reais
const dadosReais = await analisarTabelasExistentes();
// Resultado real: MRR $31,320.8, 392 tenants ativos
```

### **3. MINIMAL VIABLE FIX - Correção Mínima Necessária**
```sql
-- ❌ ERRADO: Over-engineering
CREATE TABLE ubs_metric_system (80+ colunas);
-- Migração complexa de 8 tabelas

-- ✅ CORRETO: Correção pontual
CREATE OR REPLACE FUNCTION calculate_enhanced_platform_metrics()
-- Corrigir apenas referência incorreta
```

## **Checklist Obrigatório Antes de Qualquer Projeto**

### **Etapa 1: Verificação de Estado (OBRIGATÓRIA)**
- [ ] **Listar TODOS os componentes existentes** (tabelas, APIs, functions)
- [ ] **Testar funcionalidades atuais** com dados reais
- [ ] **Medir performance atual** (não assumir lentidão)
- [ ] **Identificar dados reais** (registros, usuários, receita)
- [ ] **Documentar o que FUNCIONA** (não só o que está "quebrado")

### **Etapa 2: Identificação de Problemas Reais**
- [ ] **Distinguir problemas REAIS vs PERCEBIDOS**
- [ ] **Quantificar impacto** (tempo de resposta, taxa de erro)
- [ ] **Priorizar por impacto real** no usuário/negócio
- [ ] **Considerar "não fazer nada"** se sistema funciona

### **Etapa 3: Solução Mínima**
- [ ] **Aplicar correção mínima** necessária
- [ ] **Evitar reconstrução** se correção resolve
- [ ] **Testar correção** com dados reais
- [ ] **Medir melhoria real** pós-correção

## **Perguntas Críticas (Sempre Fazer)**

### **Antes de Propor Soluções:**
1. **"O sistema realmente está quebrado ou apenas parece estar?"**
2. **"Quais dados REAIS temos sobre o problema?"**
3. **"O que funciona no sistema atual que devemos preservar?"**
4. **"Qual é a correção MÍNIMA que resolve o problema real?"**
5. **"Esta solução pode esperar ou é realmente urgente?"**

### **Durante a Análise:**
1. **"Estes dados são reais ou simulados/teóricos?"**
2. **"Esta funcionalidade realmente não funciona ou não testamos adequadamente?"**
3. **"Quantos usuários/registros REAIS são afetados?"**
4. **"O problema é de performance ou de percepção?"**

## **Indicadores de Alerta (Red Flags)**

### **🚨 Quando Parar e Reavaliar:**
- Proposta de migração/reconstrução **sem dados reais**
- Solução que afeta **mais de 50% do sistema**
- Projeto com **duração >2 semanas** para "correções"
- **Assumir problemas** sem medir/validar
- **Criar novas estruturas** quando existem similares

### **✅ Sinais de Abordagem Correta:**
- Solução baseada em **métricas reais**
- Correção **pontual e específica**
- **Preserva funcionalidades** que já funcionam
- **Tempo de implementação** proporcional ao problema
- **Rollback simples** se necessário

## **Case Study de Referência**

### **Situação:**
- **Projeto planejado**: 8 semanas, consolidação de APIs
- **Problema percebido**: Sistema desorganizado, múltiplas duplicações
- **Solução proposta**: Reconstrução da arquitetura completa

### **Turning Point:**
- **Pergunta simples**: "Por que criar tabela se temos platform_metrics?"
- **Investigação real**: Sistema 95% funcional, MRR $31,320.8
- **Problema real**: 1 referência SQL incorreta

### **Resultado:**
- **Tempo real**: 2 horas vs 8 semanas planejadas
- **Complexidade**: 1 função vs arquitetura completa
- **Economia**: 96% do tempo economizado
- **Funcionalidade**: 100% preservada

## **Aplicação Prática**

### **Para Projetos de Performance:**
```bash
# ❌ ERRADO: Assumir lentidão
echo "Sistema está lento, vamos otimizar tudo"

# ✅ CORRETO: Medir primeiro
node measure-real-performance.js
# Resultado: 95% das queries < 100ms
```

### **Para Projetos de Consolidação:**
```javascript
// ❌ ERRADO: Assumir duplicação
"Temos 8 tabelas duplicadas para consolidar"

// ✅ CORRETO: Verificar dados
const analysis = await analyzeTablesOverlap();
// Resultado: 3 tabelas ativas, 5 legacy unused
```

### **Para Projetos de Frontend:**
```javascript
// ❌ ERRADO: Assumir problemas
"Dashboard demora 15s para carregar"

// ✅ CORRETO: Medir real
const loadTime = await measureDashboardLoad();
// Resultado: 3.2s média, dentro do aceitável
```

## **Compromisso com a Metodologia**

**A partir desta regra, TODO projeto deve:**

1. **Começar com "Investigate First"**
2. **Basear decisões em dados reais**
3. **Aplicar correção mínima efetiva**
4. **Documentar lições aprendidas**
5. **Questionar premissas constantemente**

**Lembrar sempre: Uma pergunta simples pode economizar semanas de trabalho desnecessário.**

---

**Esta metodologia é resultado direto das lições aprendidas no projeto de racionalização de dashboards e deve ser aplicada rigorosamente em todos os projetos futuros.**

---

# 📝 DOCUMENTAÇÃO OBRIGATÓRIA NO CLAUDE.md

## **Regra 20: Documentação de Commits Obrigatória**

### **OBRIGATÓRIO: Após cada commit realizado, atualizar o arquivo `CLAUDE.md`**

### **Estrutura de Documentação:**
```markdown
## 📝 Commit: [tipo]: [descrição breve]
**Data:** YYYY-MM-DD HH:MM
**Hash:** [commit hash]
**MCP Server:** [quais MCP servers foram utilizados]
**Implementação:** [o que foi implementado]
**Benefícios:** [benefícios alcançados]
**Performance:** [impacto na performance]
**Arquivos Alterados:** [lista dos arquivos modificados]
**Testes:** [testes realizados]
**Rollback:** [procedimento de rollback se necessário]
```

### **Exemplos de Documentação:**

#### **Exemplo 1: Nova Funcionalidade**
```markdown
## 📝 Commit: feat: implementa processamento de voz com IA
**Data:** 2024-01-15 14:30
**Hash:** a1b2c3d4e5f6
**MCP Server:** Supabase (queries), Filesystem (arquivos), Memory (cache)
**Implementação:** VoiceProcessingService com OpenAI Whisper, Google Speech-to-Text e Azure Speech Services
**Benefícios:** 85% melhoria em transcrição, 33.4% redução tempo de processamento
**Performance:** +110% otimização geral, cache inteligente implementado
**Arquivos Alterados:** 
- src/services/voice-processing.service.js
- MCP_SERVERS_TYPESCRIPT.md
- install-mcp-typescript-servers.sh
**Testes:** Validação com mensagens de voz reais, testes de transcrição
**Rollback:** Remover arquivo voice-processing.service.js e reverter configurações
```

#### **Exemplo 2: Correção de Bug**
```markdown
## 📝 Commit: fix: corrige cálculo de métricas de plataforma
**Data:** 2024-01-15 16:45
**Hash:** f6e5d4c3b2a1
**MCP Server:** Supabase (SQL queries), Memory (otimização)
**Implementação:** Correção na função calculate_enhanced_platform_metrics()
**Benefícios:** Métricas precisas, eliminação de dados duplicados
**Performance:** 50% redução no tempo de cálculo de métricas
**Arquivos Alterados:** 
- database/functions.sql
- src/services/analytics.service.js
**Testes:** Validação com dados reais, comparação antes/depois
**Rollback:** Reverter para versão anterior da função SQL
```

#### **Exemplo 3: Refatoração**
```markdown
## 📝 Commit: refactor: otimiza estrutura de agentes de IA
**Data:** 2024-01-15 18:20
**Hash:** b2c3d4e5f6a1
**MCP Server:** Filesystem (reorganização), Memory (cache)
**Implementação:** Reorganização da estrutura de agentes, implementação de cache inteligente
**Benefícios:** Código mais limpo, melhor manutenibilidade
**Performance:** 25% redução no tempo de carregamento dos agentes
**Arquivos Alterados:** 
- src/services/agents/
- src/services/agent-factory.js
- src/config/ai-config.js
**Testes:** Testes de performance, validação de funcionalidades
**Rollback:** Reverter estrutura de pastas e configurações
```

### **Campos Obrigatórios:**
1. **Data e Hora:** Timestamp exato do commit
2. **Hash:** Hash do commit para rastreabilidade
3. **MCP Server:** Quais MCP servers foram utilizados (se aplicável)
4. **Implementação:** Descrição clara do que foi implementado
5. **Benefícios:** Benefícios quantificados alcançados
6. **Performance:** Impacto na performance do sistema
7. **Arquivos Alterados:** Lista completa dos arquivos modificados
8. **Testes:** Testes realizados para validar a implementação
9. **Rollback:** Procedimento de rollback se necessário

### **Benefícios da Documentação:**
- **Rastreabilidade:** Histórico completo de todas as mudanças
- **Performance Tracking:** Acompanhamento de melhorias ao longo do tempo
- **MCP Server Usage:** Documentação do uso eficiente dos MCP servers
- **Knowledge Base:** Base de conhecimento para futuras implementações
- **Rollback Planning:** Procedimentos claros para reversão se necessário

### **Responsabilidade:**
- **OBRIGATÓRIO:** Todo commit deve ser documentado no `CLAUDE.md`
- **Imediato:** Documentação deve ser feita logo após o commit
- **Detalhado:** Incluir todos os campos obrigatórios
- **Quantificado:** Sempre incluir métricas de benefícios e performance

**Esta regra garante que todo o trabalho realizado seja devidamente documentado e rastreável, facilitando futuras manutenções e otimizações.** 