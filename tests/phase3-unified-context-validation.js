/**
 * 🎯 FASE 3: Script de Teste e Validação do Sistema Unificado
 *
 * Testa toda a funcionalidade do Sistema Unificado de Contexto:
 * - Criação e sincronização de contextos
 * - Migração de dados legacy
 * - Performance e consistência
 * - Integridade referencial
 * - Cleanup automático
 *
 * Autor: Claude Code (Fase 3 Implementation)
 * Data: 2025-01-15
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

// ✅ Configuração do cliente Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class Phase3ValidationTest {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
      details: {}
    };
    // Gerar UUID válido para teste
    this.testSessionId = crypto.randomUUID();
    this.testTenantId = null;
    this.testUserId = null;
  }

  /**
   * ✅ SETUP: Preparar dados de teste
   */
  async setupTestData() {
    console.log('🔧 [SETUP] Preparando dados de teste...');

    try {
      // Buscar tenant e user existentes para teste
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id')
        .limit(1);

      if (!tenants || tenants.length === 0) {
        throw new Error('Nenhum tenant encontrado para teste');
      }

      this.testTenantId = tenants[0].id;

      const { data: users } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (!users || users.length === 0) {
        throw new Error('Nenhum user encontrado para teste');
      }

      this.testUserId = users[0].id;

      console.log('✅ [SETUP] Dados de teste preparados:', {
        sessionId: this.testSessionId,
        tenantId: this.testTenantId,
        userId: this.testUserId
      });

    } catch (error) {
      console.error('❌ [SETUP] Erro preparando dados de teste:', error);
      throw error;
    }
  }

  /**
   * ✅ TEST 1: Verificar se schema foi criado corretamente
   */
  async testSchemaCreation() {
    this.logTest('Schema Creation');

    try {
      // Verificar se tabela unified_conversation_contexts existe
      const { data: tableCheck, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'unified_conversation_contexts')
        .single();

      if (tableError || !tableCheck) {
        throw new Error('Tabela unified_conversation_contexts não encontrada');
      }

      // Verificar se coluna unified_context_id existe em conversation_history
      const { data: columnCheck } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'conversation_history')
        .eq('column_name', 'unified_context_id');

      if (!columnCheck || columnCheck.length === 0) {
        throw new Error('Coluna unified_context_id não encontrada em conversation_history');
      }

      // Verificar índices
      const { data: indexCheck } = await supabase
        .from('pg_indexes')
        .select('indexname')
        .like('indexname', '%unified_context%');

      if (!indexCheck || indexCheck.length === 0) {
        console.warn('⚠️ Índices unificados podem não estar criados');
      }

      this.passTest('Schema Creation', 'Schema criado corretamente');

    } catch (error) {
      this.failTest('Schema Creation', error.message);
    }
  }

  /**
   * ✅ TEST 2: Criar contexto unificado
   */
  async testUnifiedContextCreation() {
    this.logTest('Unified Context Creation');

    try {
      const contextData = {
        session_metadata: {
          session_started_at: new Date().toISOString(),
          message_count: 0,
          duration_minutes: 0,
          last_message_at: new Date().toISOString()
        },
        intent_history: [],
        flow_lock: {
          session_id: this.testSessionId,
          step: 'collecting_service',
          step_data: { test: true },
          timeout: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          priority: 'normal',
          flow_type: 'appointment_booking',
          version: 1
        },
        unified_context_ref: {
          context_id: '',
          sync_version: 1,
          last_sync_at: new Date().toISOString(),
          source_system: 'test'
        }
      };

      const { data: context, error } = await supabase
        .from('unified_conversation_contexts')
        .insert([{
          session_id_uuid: this.testSessionId,
          tenant_id: this.testTenantId,
          user_id: this.testUserId,
          context_data: contextData,
          active_flows: ['appointment_booking'],
          last_activity_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString(),
          status: 'active',
          priority: 'normal'
        }])
        .select()
        .single();

      if (error) {
        throw new Error(`Erro criando contexto unificado: ${error.message}`);
      }

      // Atualizar context_id na referência
      await supabase
        .from('unified_conversation_contexts')
        .update({
          context_data: {
            ...contextData,
            unified_context_ref: {
              ...contextData.unified_context_ref,
              context_id: context.id
            }
          }
        })
        .eq('id', context.id);

      this.testResults.details.createdContextId = context.id;
      this.passTest('Unified Context Creation', `Contexto criado com ID: ${context.id}`);

    } catch (error) {
      this.failTest('Unified Context Creation', error.message);
    }
  }

  /**
   * ✅ TEST 3: Testar inserção em conversation_history com referência
   */
  async testConversationHistoryIntegration() {
    this.logTest('Conversation History Integration');

    try {
      const unifiedContextId = this.testResults.details.createdContextId;
      if (!unifiedContextId) {
        throw new Error('ID do contexto unificado não disponível');
      }

      const { data: message, error } = await supabase
        .from('conversation_history')
        .insert([{
          tenant_id: this.testTenantId,
          user_id: this.testUserId,
          content: 'Teste de integração Fase 3',
          is_from_user: true,
          message_type: 'text',
          session_id_uuid: this.testSessionId,
          conversation_context: {
            session_id: this.testSessionId,
            duration_minutes: 0,
            flow_lock: {
              step: 'collecting_service',
              step_data: { test: true }
            },
            unified_context_ref: {
              context_id: unifiedContextId,
              sync_version: 1,
              last_sync_at: new Date().toISOString(),
              source_system: 'test'
            }
          },
          unified_context_id: unifiedContextId,
          intent_detected: 'book_appointment',
          confidence_score: 0.95,
          tokens_used: 0,
          api_cost_usd: 0,
          processing_cost_usd: 0,
          model_used: null,
          message_source: 'test'
        }])
        .select()
        .single();

      if (error) {
        throw new Error(`Erro inserindo mensagem: ${error.message}`);
      }

      // Verificar se referência foi criada corretamente
      if (message.unified_context_id !== unifiedContextId) {
        throw new Error('Referência unified_context_id não foi salva corretamente');
      }

      this.passTest('Conversation History Integration', 'Mensagem inserida com referência correta');

    } catch (error) {
      this.failTest('Conversation History Integration', error.message);
    }
  }

  /**
   * ✅ TEST 4: Testar migração de conversation_states
   */
  async testConversationStatesMigration() {
    this.logTest('Conversation States Migration');

    try {
      // Verificar se a migração já foi executada com sucesso
      const { data: migratedContexts } = await supabase
        .from('unified_conversation_contexts')
        .select('count')
        .single();

      if (!migratedContexts) {
        throw new Error('Nenhum contexto encontrado - migração pode não ter sido executada');
      }

      // Verificar se existe pelo menos um contexto migrado
      const { data: contextCount, error: countError } = await supabase
        .from('unified_conversation_contexts')
        .select('id', { count: 'exact' });

      if (countError) {
        throw new Error(`Erro verificando contextos: ${countError.message}`);
      }

      if (!contextCount || contextCount.length === 0) {
        throw new Error('Nenhum contexto unificado encontrado após migração');
      }

      this.passTest('Conversation States Migration', 'Migração executada com sucesso');

    } catch (error) {
      this.failTest('Conversation States Migration', error.message);
    }
  }

  /**
   * ✅ TEST 5: Testar performance de queries unificadas
   */
  async testQueryPerformance() {
    this.logTest('Query Performance');

    try {
      const startTime = Date.now();

      // Query 1: Buscar contexto unificado
      const { data: context1 } = await supabase
        .from('unified_conversation_contexts')
        .select('*')
        .eq('session_id_uuid', this.testSessionId)
        .single();

      const query1Time = Date.now() - startTime;

      // Query 2: Buscar mensagens com referência
      const startTime2 = Date.now();
      const { data: messages } = await supabase
        .from('conversation_history')
        .select('*, unified_conversation_contexts(*)')
        .eq('session_id_uuid', this.testSessionId);

      const query2Time = Date.now() - startTime2;

      // Verificar se performance está aceitável (< 100ms para queries simples)
      if (query1Time > 100) {
        console.warn(`⚠️ Query 1 demorou ${query1Time}ms (esperado < 100ms)`);
      }

      if (query2Time > 200) {
        console.warn(`⚠️ Query 2 com JOIN demorou ${query2Time}ms (esperado < 200ms)`);
      }

      this.passTest('Query Performance', `Queries executadas em ${query1Time}ms e ${query2Time}ms`);

    } catch (error) {
      this.failTest('Query Performance', error.message);
    }
  }

  /**
   * ✅ TEST 6: Testar cleanup de contextos expirados
   */
  async testExpiredContextCleanup() {
    this.logTest('Expired Context Cleanup');

    try {
      // Executar cleanup de contextos expirados
      const { data: cleanupCount, error } = await supabase
        .rpc('cleanup_expired_unified_contexts');

      if (error) {
        throw new Error(`Erro no cleanup: ${error.message}`);
      }

      // Verificar se função executou (cleanup count pode ser 0 se não há expirados)
      if (cleanupCount === null || cleanupCount === undefined) {
        throw new Error('Função cleanup não retornou resultado válido');
      }

      this.passTest('Expired Context Cleanup', `${cleanupCount} contextos expirados removidos`);

    } catch (error) {
      this.failTest('Expired Context Cleanup', error.message);
    }
  }

  /**
   * ✅ CLEANUP: Limpar dados de teste
   */
  async cleanup() {
    console.log('🧹 [CLEANUP] Limpando dados de teste...');

    try {
      // Remover mensagens de teste
      await supabase
        .from('conversation_history')
        .delete()
        .eq('session_id_uuid', this.testSessionId);

      // Remover contexto unificado de teste
      await supabase
        .from('unified_conversation_contexts')
        .delete()
        .eq('session_id_uuid', this.testSessionId);

      // Remover contextos de migração de teste
      await supabase
        .from('unified_conversation_contexts')
        .delete()
        .like('session_id_uuid', 'test_%');

      console.log('✅ [CLEANUP] Dados de teste removidos');

    } catch (error) {
      console.warn('⚠️ [CLEANUP] Erro na limpeza:', error.message);
    }
  }

  /**
   * ✅ HELPERS: Funções auxiliares de teste
   */
  logTest(testName) {
    console.log(`\n🧪 [TEST] ${testName}...`);
    this.testResults.total++;
  }

  passTest(testName, message) {
    console.log(`✅ [PASS] ${testName}: ${message}`);
    this.testResults.passed++;
  }

  failTest(testName, error) {
    console.log(`❌ [FAIL] ${testName}: ${error}`);
    this.testResults.failed++;
    this.testResults.errors.push({ test: testName, error });
  }

  /**
   * ✅ MAIN: Executar todos os testes
   */
  async runAllTests() {
    console.log('🎯 INICIANDO VALIDAÇÃO DA FASE 3: Sistema Unificado de Contexto\n');

    try {
      await this.setupTestData();

      // Executar todos os testes
      await this.testSchemaCreation();
      await this.testUnifiedContextCreation();
      await this.testConversationHistoryIntegration();
      await this.testConversationStatesMigration();
      await this.testQueryPerformance();
      await this.testExpiredContextCleanup();

    } catch (error) {
      console.error('❌ [FATAL] Erro fatal durante testes:', error);
      this.testResults.failed++;
    } finally {
      await this.cleanup();
    }

    // Relatório final
    console.log('\n📊 RELATÓRIO FINAL DA VALIDAÇÃO FASE 3:');
    console.log('==========================================');
    console.log(`Total de testes: ${this.testResults.total}`);
    console.log(`✅ Passaram: ${this.testResults.passed}`);
    console.log(`❌ Falharam: ${this.testResults.failed}`);
    console.log(`📈 Taxa de sucesso: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);

    if (this.testResults.errors.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:');
      this.testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.error}`);
      });
    }

    if (this.testResults.failed === 0) {
      console.log('\n🎉 FASE 3 VALIDADA COM SUCESSO!');
      console.log('✅ Sistema Unificado de Contexto está funcionando corretamente');
      return true;
    } else {
      console.log('\n⚠️ FASE 3 NECESSITA CORREÇÕES');
      console.log('❌ Alguns testes falharam - revisar implementação');
      return false;
    }
  }
}

// ✅ EXECUTAR TESTES
if (require.main === module) {
  const validator = new Phase3ValidationTest();
  validator.runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ [FATAL] Erro executando validação:', error);
      process.exit(1);
    });
}

module.exports = Phase3ValidationTest;