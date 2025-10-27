#!/usr/bin/env node

/**
 * 🎯 FASE 3: Script de Validação Automatizada Independente de Credenciais
 *
 * Valida implementação Phase 3 sem necessidade de credenciais específicas do Supabase
 * Verifica estrutura de código, tipos, imports e padrões arquiteturais
 *
 * Uso: node scripts/validate-phase3-implementation.js
 */

const fs = require('fs');
const path = require('path');

class Phase3Validator {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  log(type, message, file = null) {
    const entry = { message, file, timestamp: new Date().toISOString() };
    switch (type) {
      case 'error':
        this.errors.push(entry);
        console.error(`❌ ERROR: ${message}${file ? ` (${file})` : ''}`);
        break;
      case 'warning':
        this.warnings.push(entry);
        console.warn(`⚠️  WARNING: ${message}${file ? ` (${file})` : ''}`);
        break;
      case 'success':
        this.successes.push(entry);
        console.log(`✅ SUCCESS: ${message}${file ? ` (${file})` : ''}`);
        break;
      default:
        console.log(`ℹ️  INFO: ${message}${file ? ` (${file})` : ''}`);
    }
  }

  readFile(filePath) {
    try {
      const fullPath = path.join(this.projectRoot, filePath);
      if (!fs.existsSync(fullPath)) {
        this.log('error', `File not found: ${filePath}`, filePath);
        return null;
      }
      return fs.readFileSync(fullPath, 'utf8');
    } catch (error) {
      this.log('error', `Error reading file: ${error.message}`, filePath);
      return null;
    }
  }

  checkFileExists(filePath) {
    const fullPath = path.join(this.projectRoot, filePath);
    return fs.existsSync(fullPath);
  }

  // ✅ VALIDAÇÃO 1: Estrutura de tipos Phase 3
  validateTypesStructure() {
    console.log('\n🔍 Validando estrutura de tipos Phase 3...');

    const typesPath = 'src/types/flow-lock.types.ts';
    const content = this.readFile(typesPath);

    if (!content) return;

    // Verificar UnifiedConversationContext como interface principal
    if (content.includes('export interface UnifiedConversationContext')) {
      this.log('success', 'UnifiedConversationContext interface definida', typesPath);
    } else {
      this.log('error', 'UnifiedConversationContext interface não encontrada', typesPath);
    }

    // Verificar alias de compatibilidade
    if (content.includes('export type EnhancedConversationContext = UnifiedConversationContext')) {
      this.log('success', 'Alias de compatibilidade EnhancedConversationContext criado', typesPath);
    } else {
      this.log('error', 'Alias de compatibilidade EnhancedConversationContext não encontrado', typesPath);
    }

    // Verificar campos críticos restaurados
    const criticalFields = [
      'temporal_context',
      'timeout_stage',
      'session_timeout_warnings',
      'flow_lock_history',
      'flow_metrics',
      'recovery_attempts',
      'data_collection_state',
      'unified_context_ref'
    ];

    criticalFields.forEach(field => {
      if (content.includes(`${field}?:`)) {
        this.log('success', `Campo crítico '${field}' presente na interface`, typesPath);
      } else {
        this.log('error', `Campo crítico '${field}' ausente na interface`, typesPath);
      }
    });
  }

  // ✅ VALIDAÇÃO 2: Helper consolidado
  validateConversationContextHelper() {
    console.log('\n🔍 Validando helper consolidado...');

    const helperPath = 'src/utils/conversation-context-helper.ts';
    const content = this.readFile(helperPath);

    if (!content) return;

    // Verificar função principal mergeUnifiedContext
    if (content.includes('export async function mergeUnifiedContext(')) {
      this.log('success', 'Função mergeUnifiedContext presente', helperPath);
    } else {
      this.log('error', 'Função mergeUnifiedContext não encontrada', helperPath);
    }

    // Verificar lógica de resolução de session_id
    if (content.includes('sessionId = existingContext?.context_data?.session_metadata?.session_id || uuidv4()')) {
      this.log('success', 'Lógica de resolução de session_id implementada', helperPath);
    } else {
      this.log('warning', 'Lógica de resolução de session_id pode estar inconsistente', helperPath);
    }

    // Verificar criação real de usuário (não UUID temporário)
    if (content.includes('from(\'users\')') && content.includes('insert({')) {
      this.log('success', 'Criação real de usuário implementada', helperPath);
    } else {
      this.log('error', 'Criação real de usuário não encontrada - risco de FK violation', helperPath);
    }

    // Verificar operações diretas no unified_conversation_contexts
    if (content.includes('unified_conversation_contexts') && content.includes('(supabaseAdmin as any)')) {
      this.log('success', 'Operações diretas na tabela unified_conversation_contexts', helperPath);
    } else {
      this.log('error', 'Operações diretas na tabela unificada não encontradas', helperPath);
    }

    // Verificar funções depreciadas com wrapper
    if (content.includes('@deprecated') && content.includes('mergeEnhancedConversationContext')) {
      this.log('success', 'Funções depreciadas com wrapper de compatibilidade', helperPath);
    } else {
      this.log('warning', 'Funções depreciadas podem não ter wrapper adequado', helperPath);
    }
  }

  // ✅ VALIDAÇÃO 3: Marcação de deprecação
  validateDeprecationPatterns() {
    console.log('\n🔍 Validando padrões de depreciação...');

    const deprecatedFiles = [
      'src/utils/unified-context-helper.ts',
      'src/services/unified-context-manager.service.ts'
    ];

    deprecatedFiles.forEach(filePath => {
      const content = this.readFile(filePath);
      if (!content) return;

      if (content.includes('@deprecated') || content.includes('ESTE SERVIÇO FOI ABSORVIDO')) {
        this.log('success', 'Arquivo marcado como depreciado adequadamente', filePath);
      } else {
        this.log('warning', 'Arquivo não marcado como depreciado', filePath);
      }

      // Verificar se ainda tem implementação ativa
      if (content.includes('export class') && !content.includes('@deprecated')) {
        this.log('warning', 'Classe ativa em arquivo que deveria estar depreciado', filePath);
      }
    });
  }

  // ✅ VALIDAÇÃO 4: Integração do orchestrator
  validateOrchestratorIntegration() {
    console.log('\n🔍 Validando integração do orchestrator...');

    const orchestratorPath = 'src/services/orchestrator/orchestrator-core.service.ts';
    const content = this.readFile(orchestratorPath);

    if (!content) return;

    // Verificar import correto
    if (content.includes("import { mergeUnifiedContext } from '../../utils/conversation-context-helper'")) {
      this.log('success', 'Import do mergeUnifiedContext correto no orchestrator', orchestratorPath);
    } else {
      this.log('error', 'Import do mergeUnifiedContext não encontrado no orchestrator', orchestratorPath);
    }

    // Verificar que não usa mais unifiedContextManager
    if (!content.includes('unifiedContextManager')) {
      this.log('success', 'unifiedContextManager removido do orchestrator', orchestratorPath);
    } else {
      this.log('warning', 'unifiedContextManager ainda presente no orchestrator', orchestratorPath);
    }
  }

  // ✅ VALIDAÇÃO 5: ConversationHistoryPersistence simplificado
  validateConversationHistoryPersistence() {
    console.log('\n🔍 Validando ConversationHistoryPersistence simplificado...');

    const persistencePath = 'src/services/conversation-history-persistence.service.ts';
    const content = this.readFile(persistencePath);

    if (!content) return;

    // Verificar uso do mergeUnifiedContext
    if (content.includes('mergeUnifiedContext')) {
      this.log('success', 'ConversationHistoryPersistence usa mergeUnifiedContext', persistencePath);
    } else {
      this.log('error', 'ConversationHistoryPersistence não usa mergeUnifiedContext', persistencePath);
    }

    // Verificar resolução de userId
    if (content.includes('resolveUserId') || content.includes('userPhone')) {
      this.log('success', 'Resolução de userId implementada', persistencePath);
    } else {
      this.log('warning', 'Resolução de userId pode estar ausente', persistencePath);
    }

    // Verificar construção de contexto mínimo
    if (content.includes('buildConversationContext') && content.includes('session_id') && content.includes('duration_minutes')) {
      this.log('success', 'Construção de contexto mínimo implementada', persistencePath);
    } else {
      this.log('error', 'Construção de contexto mínimo não encontrada', persistencePath);
    }
  }

  // ✅ VALIDAÇÃO 6: Verificar imports de sistema unificado
  validateUnifiedImports() {
    console.log('\n🔍 Validando imports do sistema unificado...');

    const filesToCheck = [
      'src/services/orchestrator/telemetry-orchestrator.ts',
      'src/services/conversation-outcome-analyzer.service.ts',
      'src/services/flow-lock-manager.service.ts'
    ];

    filesToCheck.forEach(filePath => {
      const content = this.readFile(filePath);
      if (!content) return;

      // Verificar se usa mergeUnifiedContext
      if (content.includes('mergeUnifiedContext')) {
        this.log('success', 'Arquivo migrado para mergeUnifiedContext', filePath);
      } else if (content.includes('unifiedContextManager') || content.includes('UnifiedContextManager')) {
        this.log('warning', 'Arquivo ainda usa unifiedContextManager depreciado', filePath);
      } else {
        this.log('info', 'Arquivo não usa sistema de contexto unificado', filePath);
      }
    });
  }

  // ✅ VALIDAÇÃO 7: Verificar estrutura de package.json e dependências
  validateProjectConfiguration() {
    console.log('\n🔍 Validando configuração do projeto...');

    const packagePath = 'package.json';
    const content = this.readFile(packagePath);

    if (!content) return;

    try {
      const packageJson = JSON.parse(content);

      // Verificar dependências essenciais
      const essentialDeps = ['@supabase/supabase-js', 'uuid'];
      essentialDeps.forEach(dep => {
        if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
          this.log('success', `Dependência essencial '${dep}' presente`, packagePath);
        } else {
          this.log('error', `Dependência essencial '${dep}' ausente`, packagePath);
        }
      });

      // Verificar scripts de validação
      if (packageJson.scripts?.build) {
        this.log('success', 'Script de build presente', packagePath);
      } else {
        this.log('error', 'Script de build ausente', packagePath);
      }

    } catch (error) {
      this.log('error', `Erro ao parsear package.json: ${error.message}`, packagePath);
    }
  }

  // ✅ VALIDAÇÃO 8: Verificar tipos TypeScript
  validateTypeScriptConfiguration() {
    console.log('\n🔍 Validando configuração TypeScript...');

    const tsconfigPath = 'tsconfig.json';
    const content = this.readFile(tsconfigPath);

    if (!content) return;

    try {
      const tsconfig = JSON.parse(content);

      if (tsconfig.compilerOptions?.strict) {
        this.log('success', 'TypeScript strict mode habilitado', tsconfigPath);
      } else {
        this.log('warning', 'TypeScript strict mode não habilitado', tsconfigPath);
      }

      if (tsconfig.compilerOptions?.paths) {
        this.log('success', 'Path aliases configurados', tsconfigPath);
      } else {
        this.log('info', 'Path aliases não configurados', tsconfigPath);
      }

    } catch (error) {
      this.log('error', `Erro ao parsear tsconfig.json: ${error.message}`, tsconfigPath);
    }
  }

  // ✅ VALIDAÇÃO 9: Verificar se ainda existem padrões problemáticos
  validateAntiPatterns() {
    console.log('\n🔍 Verificando anti-padrões...');

    const filesToCheck = [
      'src/utils/conversation-context-helper.ts',
      'src/services/conversation-history-persistence.service.ts',
      'src/services/orchestrator/orchestrator-core.service.ts'
    ];

    const antiPatterns = [
      { pattern: /uuid\(\).*userId/gi, message: 'UUID temporário usado como userId' },
      { pattern: /user_id.*userPhone/gi, message: 'userPhone enviado como user_id' },
      { pattern: /updateContextData\([^,]*,\s*[^,]*,\s*{}\)/gi, message: 'updateContextData com parâmetros vazios' },
      { pattern: /TODO|FIXME|HACK/gi, message: 'Código temporário ou comentários de TODO' }
    ];

    filesToCheck.forEach(filePath => {
      const content = this.readFile(filePath);
      if (!content) return;

      antiPatterns.forEach(({ pattern, message }) => {
        if (pattern.test(content)) {
          this.log('warning', `Anti-padrão detectado: ${message}`, filePath);
        }
      });
    });
  }

  // ✅ VALIDAÇÃO 10: Verificar consistência de session_id
  validateSessionIdConsistency() {
    console.log('\n🔍 Verificando consistência de session_id...');

    const helperPath = 'src/utils/conversation-context-helper.ts';
    const content = this.readFile(helperPath);

    if (!content) return;

    // Verificar lógica de busca de session_id existente
    if (content.includes('existingContext?.context_data?.session_metadata?.session_id')) {
      this.log('success', 'Lógica de busca de session_id existente implementada', helperPath);
    } else {
      this.log('error', 'Lógica de busca de session_id existente não encontrada', helperPath);
    }

    // Verificar que session_id não é sempre gerado novo
    if (content.includes('uuidv4()') && content.includes('sessionId = updates.session_id')) {
      this.log('success', 'session_id reutiliza existente antes de gerar novo', helperPath);
    } else {
      this.log('warning', 'Lógica de session_id pode estar gerando sempre novos IDs', helperPath);
    }
  }

  // ✅ EXECUTAR TODAS AS VALIDAÇÕES
  async runAllValidations() {
    console.log('🎯 INICIANDO VALIDAÇÃO AUTOMATIZADA PHASE 3');
    console.log('=' .repeat(60));

    this.validateTypesStructure();
    this.validateConversationContextHelper();
    this.validateDeprecationPatterns();
    this.validateOrchestratorIntegration();
    this.validateConversationHistoryPersistence();
    this.validateUnifiedImports();
    this.validateProjectConfiguration();
    this.validateTypeScriptConfiguration();
    this.validateAntiPatterns();
    this.validateSessionIdConsistency();

    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 RELATÓRIO DE VALIDAÇÃO PHASE 3');
    console.log('=' .repeat(60));

    console.log(`\n✅ Sucessos: ${this.successes.length}`);
    console.log(`⚠️  Avisos: ${this.warnings.length}`);
    console.log(`❌ Erros: ${this.errors.length}`);

    const total = this.successes.length + this.warnings.length + this.errors.length;
    const successRate = total > 0 ? ((this.successes.length / total) * 100).toFixed(1) : 0;

    console.log(`\n📈 Taxa de Sucesso: ${successRate}%`);

    if (this.errors.length > 0) {
      console.log('\n❌ ERROS CRÍTICOS QUE PRECISAM SER CORRIGIDOS:');
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.message}${error.file ? ` (${error.file})` : ''}`);
      });
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  AVISOS PARA REVISÃO:');
      this.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning.message}${warning.file ? ` (${warning.file})` : ''}`);
      });
    }

    // Determinar status geral
    let status = '🟢 APROVADO';
    if (this.errors.length > 0) {
      status = '🔴 REPROVADO - Erros críticos encontrados';
    } else if (this.warnings.length > 3) {
      status = '🟡 APROVADO COM RESSALVAS - Muitos avisos';
    }

    console.log(`\n🎯 STATUS FINAL: ${status}`);

    // Salvar relatório em arquivo
    this.saveReport();
  }

  saveReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        successes: this.successes.length,
        warnings: this.warnings.length,
        errors: this.errors.length,
        successRate: ((this.successes.length / (this.successes.length + this.warnings.length + this.errors.length)) * 100).toFixed(1)
      },
      details: {
        successes: this.successes,
        warnings: this.warnings,
        errors: this.errors
      }
    };

    const reportPath = path.join(this.projectRoot, 'validation-report-phase3.json');
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n💾 Relatório salvo em: validation-report-phase3.json`);
    } catch (error) {
      console.error(`❌ Erro ao salvar relatório: ${error.message}`);
    }
  }
}

// Executar validação se chamado diretamente
if (require.main === module) {
  const validator = new Phase3Validator();
  validator.runAllValidations()
    .then(() => {
      process.exit(validator.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Erro durante validação:', error);
      process.exit(1);
    });
}

module.exports = Phase3Validator;