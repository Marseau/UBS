/**
 * Schema Validation Routes
 * 
 * Endpoints para testar e monitorar a integridade dos schemas do banco
 */

import { Router } from 'express';
import { schemaValidator } from '../services/schema-validator.service';

const router = Router();

/**
 * GET /api/schema/validate
 * Executa validação completa de todos os schemas críticos
 */
router.get('/validate', async (req, res) => {
  try {
    console.log('🔍 [SCHEMA-API] Executando validação manual de schemas...');
    
    const result = await schemaValidator.validateCriticalSchemas();
    
    const response = {
      timestamp: new Date().toISOString(),
      status: result.isValid ? 'VALID' : 'INVALID',
      summary: {
        tablesValidated: Object.keys(require('../services/schema-validator.service').CRITICAL_SCHEMAS || {}).length,
        missingTables: result.missingTables.length,
        missingColumns: result.missingColumns.length,
        warnings: result.warnings.length,
        errors: result.errors.length
      },
      details: {
        missingTables: result.missingTables,
        missingColumns: result.missingColumns,
        warnings: result.warnings,
        errors: result.errors
      }
    };

    if (result.isValid) {
      res.status(200).json({
        success: true,
        message: '✅ Todos os schemas críticos são válidos',
        data: response
      });
    } else {
      res.status(200).json({
        success: false,
        message: '⚠️ Problemas encontrados nos schemas',
        data: response
      });
    }

  } catch (error) {
    console.error('❌ [SCHEMA-API] Erro na validação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na validação de schemas',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/schema/validate/:table
 * Valida schema de uma tabela específica
 */
router.get('/validate/:table', async (req, res) => {
  try {
    const { table } = req.params;
    console.log(`🔍 [SCHEMA-API] Validando tabela específica: ${table}`);

    // Verificar se a tabela está nos schemas críticos
    const CRITICAL_SCHEMAS = {
      conversation_history: [],
      tenants: [],
      appointments: [],
      users: [],
      tenant_metrics: [],
      chart_data_cache: []
    };

    if (!(table in CRITICAL_SCHEMAS)) {
      res.status(400).json({
        success: false,
        message: `Tabela '${table}' não está nos schemas críticos monitorados`,
        availableTables: Object.keys(CRITICAL_SCHEMAS)
      });
      return;
    }

    // Para validação individual, executamos a validação completa e filtramos
    const result = await schemaValidator.validateCriticalSchemas();
    
    const tableIssues = {
      missingTable: result.missingTables.includes(table),
      missingColumns: result.missingColumns.filter(col => col.startsWith(`${table}.`)),
      warnings: result.warnings.filter(warning => warning.includes(table)),
      errors: result.errors.filter(error => error.includes(table))
    };

    const isTableValid = !tableIssues.missingTable && 
                        tableIssues.missingColumns.length === 0 && 
                        tableIssues.errors.length === 0;

    res.status(200).json({
      success: isTableValid,
      message: isTableValid 
        ? `✅ Tabela '${table}' está válida`
        : `⚠️ Problemas encontrados na tabela '${table}'`,
      data: {
        table,
        isValid: isTableValid,
        issues: tableIssues
      }
    });

  } catch (error) {
    console.error(`❌ [SCHEMA-API] Erro na validação de ${req.params.table}:`, error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na validação da tabela',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/schema/validate/field
 * Valida se um campo específico existe em uma tabela
 */
router.post('/validate/field', async (req, res) => {
  try {
    const { table, field } = req.body;

    if (!table || !field) {
      res.status(400).json({
        success: false,
        message: 'Parâmetros obrigatórios: table e field'
      });
      return;
    }

    console.log(`🔍 [SCHEMA-API] Validando campo: ${table}.${field}`);

    const fieldExists = await schemaValidator.validateFieldExists(table, field);

    res.status(200).json({
      success: fieldExists,
      message: fieldExists 
        ? `✅ Campo '${table}.${field}' existe`
        : `❌ Campo '${table}.${field}' não encontrado`,
      data: {
        table,
        field,
        exists: fieldExists
      }
    });

  } catch (error) {
    console.error('❌ [SCHEMA-API] Erro na validação de campo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na validação do campo',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/schema/cache
 * Limpa cache de schemas para forçar nova validação
 */
router.delete('/cache', async (req, res) => {
  try {
    console.log('🧹 [SCHEMA-API] Limpando cache de schemas...');
    
    schemaValidator.clearCache();

    res.status(200).json({
      success: true,
      message: '✅ Cache de schemas limpo com sucesso'
    });

  } catch (error) {
    console.error('❌ [SCHEMA-API] Erro ao limpar cache:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao limpar cache',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/schema/health
 * Health check simples para schema validation
 */
router.get('/health', async (req, res) => {
  try {
    // Teste rápido validando apenas uma tabela core
    const conversationHistoryValid = await schemaValidator.validateFieldExists('conversation_history', 'id');
    const tenantsValid = await schemaValidator.validateFieldExists('tenants', 'id');
    
    const isHealthy = conversationHistoryValid && tenantsValid;
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      message: isHealthy ? '✅ Schema validation health OK' : '❌ Schema validation health FAIL',
      data: {
        conversationHistoryValid,
        tenantsValid,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [SCHEMA-API] Erro no health check:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno no health check',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;