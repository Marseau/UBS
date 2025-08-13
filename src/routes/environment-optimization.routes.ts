/**
 * ENVIRONMENT OPTIMIZATION ROUTES
 * 
 * Endpoints para otimização específica do ambiente
 */

import { Router, Request, Response } from 'express';
import EnvironmentOptimizerService from '../services/environment-optimizer.service';

const router = Router();

/**
 * POST /api/optimize/analyze
 * Analisar ambiente atual e gerar recomendações
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Starting environment analysis...');
    
    const optimizer = new EnvironmentOptimizerService();
    const environmentConfig = optimizer.getEnvironmentConfig();
    const recommendations = optimizer.generateRecommendations();

    return res.json({
      success: true,
      data: {
        environment: environmentConfig,
        recommendations,
        analysis_timestamp: new Date().toISOString()
      },
      message: 'Environment analysis completed successfully'
    });

  } catch (error) {
    console.error('❌ Environment analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Environment analysis failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/optimize/execute
 * Executar otimizações do ambiente
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    console.log('🚀 Starting environment optimization...');
    
    const optimizer = new EnvironmentOptimizerService();
    
    // Executar otimizações
    const optimizationResults = await optimizer.optimizeEnvironment();
    
    // Aplicar otimizações aos serviços ativos
    await optimizer.applyOptimizations();
    
    // Validar melhorias
    const validation = await optimizer.validateOptimizations();

    return res.json({
      success: true,
      data: {
        optimizations: optimizationResults,
        validation,
        applied_count: optimizationResults.filter(r => r.applied).length,
        total_count: optimizationResults.length,
        recommendations: optimizer.generateRecommendations()
      },
      message: 'Environment optimization completed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Environment optimization failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Environment optimization failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/optimize/status
 * Verificar status das otimizações aplicadas
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const optimizer = new EnvironmentOptimizerService();
    const environmentConfig = optimizer.getEnvironmentConfig();
    const optimizationResults = optimizer.getOptimizationResults();

    // Calcular estatísticas
    const totalOptimizations = optimizationResults.length;
    const appliedOptimizations = optimizationResults.filter(r => r.applied).length;
    const optimizationRate = totalOptimizations > 0 ? 
      Math.round((appliedOptimizations / totalOptimizations) * 100) : 0;

    return res.json({
      success: true,
      data: {
        environment: environmentConfig,
        optimization_status: {
          total_optimizations: totalOptimizations,
          applied_optimizations: appliedOptimizations,
          optimization_rate: `${optimizationRate}%`,
          last_optimization: optimizationResults.length > 0 ? new Date().toISOString() : null
        },
        current_optimizations: optimizationResults,
        performance_targets: environmentConfig.performance_targets
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get optimization status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get optimization status',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/optimize/recommendations
 * Obter recomendações para o ambiente atual
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const optimizer = new EnvironmentOptimizerService();
    const recommendations = optimizer.generateRecommendations();
    const environmentConfig = optimizer.getEnvironmentConfig();

    // Categorizar recomendações
    const categorizedRecommendations = {
      hardware: recommendations.filter(r => 
        r.includes('RAM') || r.includes('CPU') || r.includes('cores')
      ),
      scaling: recommendations.filter(r => 
        r.includes('scaling') || r.includes('horizontal') || r.includes('Redis')
      ),
      performance: recommendations.filter(r => 
        r.includes('performance') || r.includes('database') || r.includes('CDN')
      ),
      maintenance: recommendations.filter(r => 
        r.includes('backup') || r.includes('log') || r.includes('monitor')
      )
    };

    return res.json({
      success: true,
      data: {
        all_recommendations: recommendations,
        categorized: categorizedRecommendations,
        environment_context: {
          current_load: environmentConfig.workload,
          hardware_capacity: environmentConfig.hardware,
          performance_targets: environmentConfig.performance_targets
        },
        priority_recommendations: recommendations.slice(0, 3) // Top 3
      },
      count: recommendations.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Failed to get recommendations:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/optimize/validate
 * Validar otimizações atuais e medir impacto
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const optimizer = new EnvironmentOptimizerService();
    const validation = await optimizer.validateOptimizations();
    const environmentConfig = optimizer.getEnvironmentConfig();

    // Calcular score de otimização
    const optimizationScore = Math.round(
      (validation.performance_improvement + 
       validation.memory_usage_reduction + 
       validation.response_time_improvement) / 3
    );

    return res.json({
      success: true,
      data: {
        validation_results: validation,
        optimization_score: `${optimizationScore}%`,
        performance_metrics: {
          response_time_improvement: `${validation.response_time_improvement}% faster`,
          memory_usage_reduction: `${validation.memory_usage_reduction}% less memory`,
          performance_boost: `${validation.performance_improvement}% better performance`
        },
        environment: environmentConfig,
        recommendations_applied: validation.recommendations_applied
      },
      message: `Environment optimization score: ${optimizationScore}%`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Optimization validation failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Optimization validation failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;