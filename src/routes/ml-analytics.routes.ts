/**
 * ML ANALYTICS ROUTES
 * 
 * Endpoints para análises avançadas com Machine Learning
 * - Predições e forecasting
 * - Detecção de anomalias
 * - Business insights com IA
 * - Relatórios de ML
 */

import { Router, Request, Response } from 'express';
import MLAnalyticsService from '../services/ml-analytics.service';

const router = Router();

/**
 * GET /api/ml/predictions
 * Obter predições para métricas principais
 */
router.get('/predictions', async (req: Request, res: Response) => {
  try {
    const timeHorizon = (req.query.horizon as '7d' | '30d' | '90d') || '30d';
    
    console.log(`🔮 Generating predictions for ${timeHorizon}...`);
    
    const mlService = new MLAnalyticsService();
    const predictions = await mlService.generatePredictions(timeHorizon);

    // Separar predições por categoria
    const categorizedPredictions = {
      revenue: predictions.filter(p => p.metric.includes('revenue')),
      customers: predictions.filter(p => p.metric.includes('customer')),
      operations: predictions.filter(p => p.metric.includes('conversation') || p.metric.includes('appointment')),
      performance: predictions.filter(p => p.metric.includes('efficiency'))
    };

    return res.json({
      success: true,
      data: {
        all_predictions: predictions,
        categorized: categorizedPredictions,
        time_horizon: timeHorizon,
        generated_at: new Date().toISOString(),
        summary: {
          total_predictions: predictions.length,
          avg_confidence: predictions.length > 0 ? 
            Math.round((predictions.reduce((sum, p) => sum + p.prediction_confidence, 0) / predictions.length) * 100) / 100 : 0,
          high_confidence_count: predictions.filter(p => p.prediction_confidence > 0.8).length
        }
      },
      message: `Generated ${predictions.length} predictions for ${timeHorizon} horizon`
    });

  } catch (error) {
    console.error('❌ Failed to generate predictions:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate predictions',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/ml/anomalies
 * Detectar anomalias nas métricas atuais
 */
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    console.log('🚨 Detecting anomalies in current metrics...');
    
    const mlService = new MLAnalyticsService();
    const anomalies = await mlService.detectAnomalies();

    // Organizar anomalias por severidade
    const anomaliesBySeverity = {
      high: anomalies.filter(a => a.severity === 'high'),
      medium: anomalies.filter(a => a.severity === 'medium'),
      low: anomalies.filter(a => a.severity === 'low')
    };

    return res.json({
      success: true,
      data: {
        anomalies,
        by_severity: anomaliesBySeverity,
        summary: {
          total_anomalies: anomalies.length,
          high_priority: anomaliesBySeverity.high.length,
          medium_priority: anomaliesBySeverity.medium.length,
          low_priority: anomaliesBySeverity.low.length,
          requires_immediate_attention: anomaliesBySeverity.high.length > 0
        },
        detected_at: new Date().toISOString()
      },
      message: `Detected ${anomalies.length} anomalies (${anomaliesBySeverity.high.length} high priority)`
    });

  } catch (error) {
    console.error('❌ Failed to detect anomalies:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to detect anomalies',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/ml/insights
 * Gerar insights de business intelligence
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    console.log('💡 Generating business insights...');
    
    const mlService = new MLAnalyticsService();
    const insights = await mlService.generateBusinessInsights();

    // Organizar insights por categoria e impacto
    const insightsByCategory = {
      revenue: insights.filter(i => i.category === 'revenue'),
      performance: insights.filter(i => i.category === 'performance'),
      customer: insights.filter(i => i.category === 'customer'),
      operational: insights.filter(i => i.category === 'operational')
    };

    const insightsByImpact = {
      high: insights.filter(i => i.impact === 'high'),
      medium: insights.filter(i => i.impact === 'medium'),
      low: insights.filter(i => i.impact === 'low')
    };

    return res.json({
      success: true,
      data: {
        all_insights: insights,
        by_category: insightsByCategory,
        by_impact: insightsByImpact,
        priority_insights: insights
          .filter(i => i.impact === 'high' || (i.impact === 'medium' && i.confidence > 0.8))
          .slice(0, 5), // Top 5 insights prioritários
        summary: {
          total_insights: insights.length,
          high_impact: insightsByImpact.high.length,
          actionable_items: insights.reduce((sum, i) => sum + i.actionable_steps.length, 0),
          avg_confidence: insights.length > 0 ? 
            Math.round((insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length) * 100) / 100 : 0
        },
        generated_at: new Date().toISOString()
      },
      message: `Generated ${insights.length} business insights`
    });

  } catch (error) {
    console.error('❌ Failed to generate insights:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate insights',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/ml/forecast/:metric
 * Forecasting específico para uma métrica
 */
router.get('/forecast/:metric', async (req: Request, res: Response) => {
  try {
    const metric = req.params.metric;
    const horizon = (req.query.horizon as '7d' | '30d' | '90d') || '30d';
    
    console.log(`📈 Generating forecast for ${metric} (${horizon})...`);
    
    const mlService = new MLAnalyticsService();
    const predictions = await mlService.generatePredictions(horizon);
    
    const specificPrediction = predictions.find(p => p.metric === metric);
    
    if (!specificPrediction) {
      return res.status(404).json({
        success: false,
        error: `Forecast not available for metric: ${metric}`,
        available_metrics: predictions.map(p => p.metric)
      });
    }

    // Gerar pontos de dados para gráfico
    const forecastPoints = generateForecastDataPoints(specificPrediction, horizon);

    return res.json({
      success: true,
      data: {
        metric,
        forecast: specificPrediction,
        chart_data: forecastPoints,
        insights: {
          trend_direction: specificPrediction?.trend || 'stable',
          expected_change: `${(specificPrediction?.change_percentage || 0) > 0 ? '+' : ''}${(specificPrediction?.change_percentage || 0).toFixed(1)}%`,
          confidence_level: `${((specificPrediction?.prediction_confidence || 0) * 100).toFixed(1)}%`,
          key_factors: specificPrediction?.factors || []
        },
        recommendations: generateForecastRecommendations(specificPrediction),
        time_horizon: horizon
      },
      message: `Forecast generated for ${metric} with ${((specificPrediction?.prediction_confidence || 0) * 100).toFixed(1)}% confidence`
    });

  } catch (error) {
    console.error('❌ Failed to generate forecast:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate forecast',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/ml/report
 * Gerar relatório completo de ML Analytics
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    console.log('📊 Generating comprehensive ML Analytics report...');
    
    const mlService = new MLAnalyticsService();
    const report = await mlService.generateMLReport();

    // Adicionar análise contextual
    const analysis = {
      performance_score: calculatePerformanceScore(report),
      key_findings: extractKeyFindings(report),
      priority_actions: extractPriorityActions(report),
      risk_assessment: assessRisks(report)
    };

    return res.json({
      success: true,
      data: {
        ...report,
        analysis,
        metadata: {
          generated_at: new Date().toISOString(),
          data_sources: ['tenant_metrics', 'conversation_history', 'appointments'],
          ml_models_used: ['Time Series ARIMA', 'Statistical Outlier Detection', 'Linear Regression'],
          confidence_threshold: 0.7,
          anomaly_threshold: 2.0
        }
      },
      message: `ML Report generated with ${report.summary.confidence_score * 100}% avg confidence`
    });

  } catch (error) {
    console.error('❌ Failed to generate ML report:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate ML report',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/ml/analyze
 * Análise customizada com parâmetros específicos
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { 
      metrics = [], 
      time_horizon = '30d', 
      include_predictions = true, 
      include_anomalies = true, 
      include_insights = true 
    } = req.body;

    console.log(`🔬 Running custom ML analysis...`);
    
    const mlService = new MLAnalyticsService();
    const results: any = {
      analysis_type: 'custom',
      parameters: { metrics, time_horizon, include_predictions, include_anomalies, include_insights }
    };

    if (include_predictions) {
      results.predictions = await mlService.generatePredictions(time_horizon);
      if (metrics.length > 0) {
        results.predictions = results.predictions.filter((p: any) => metrics.includes(p.metric));
      }
    }

    if (include_anomalies) {
      results.anomalies = await mlService.detectAnomalies();
    }

    if (include_insights) {
      results.insights = await mlService.generateBusinessInsights();
    }

    return res.json({
      success: true,
      data: results,
      summary: {
        predictions_count: results.predictions?.length || 0,
        anomalies_count: results.anomalies?.length || 0,
        insights_count: results.insights?.length || 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Custom ML analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Custom ML analysis failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Métodos auxiliares da classe router (simulados como funções)
function generateForecastDataPoints(prediction: any, horizon: string): any[] {
  const points: any[] = [];
  const steps = horizon === '7d' ? 7 : horizon === '30d' ? 30 : 90;
  const stepSize = (prediction.predicted_value - prediction.current_value) / steps;
  
  for (let i = 0; i <= steps; i++) {
    points.push({
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      value: prediction.current_value + (stepSize * i),
      is_prediction: i > 0
    });
  }
  
  return points;
}

function generateForecastRecommendations(prediction: any): string[] {
  const recommendations: string[] = [];
  
  if (prediction.trend === 'increasing') {
    recommendations.push('Monitor growth sustainability');
    recommendations.push('Prepare resources for increased demand');
    recommendations.push('Identify growth drivers for replication');
  } else if (prediction.trend === 'decreasing') {
    recommendations.push('Investigate decline causes immediately');
    recommendations.push('Implement corrective measures');
    recommendations.push('Monitor closely for further changes');
  }
  
  if (prediction.prediction_confidence < 0.7) {
    recommendations.push('Collect more data to improve forecast accuracy');
    recommendations.push('Consider external factors affecting predictions');
  }
  
  return recommendations;
}

function calculatePerformanceScore(report: any): number {
  let score = 80; // Base score
  
  // Adjust based on anomalies
  score -= report.summary.anomalies_detected * 5;
  
  // Adjust based on confidence
  score += (report.summary.confidence_score - 0.5) * 20;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function extractKeyFindings(report: any): string[] {
  const findings: string[] = [];
  
  if (report.summary && report.summary.anomalies_detected > 0) {
    findings.push(`${report.summary.anomalies_detected} anomalies detected requiring attention`);
  }
  
  if (report.predictions) {
    const highConfPredictions = report.predictions.filter((p: any) => p.prediction_confidence > 0.8);
    if (highConfPredictions.length > 0) {
      findings.push(`${highConfPredictions.length} high-confidence predictions available`);
    }
  }
  
  if (report.insights) {
    const highImpactInsights = report.insights.filter((i: any) => i.impact === 'high');
    if (highImpactInsights.length > 0) {
      findings.push(`${highImpactInsights.length} high-impact insights identified`);
    }
  }
  
  return findings;
}

function extractPriorityActions(report: any): string[] {
  const actions: string[] = [];
  
  // Actions from high-severity anomalies
  report.anomalies
    .filter((a: any) => a.severity === 'high')
    .forEach((a: any) => actions.push(...a.recommendations));
  
  // Actions from high-impact insights
  report.insights
    .filter((i: any) => i.impact === 'high')
    .forEach((i: any) => actions.push(...i.actionable_steps.slice(0, 2))); // Top 2 actions
  
  return actions.slice(0, 10); // Limit to top 10
}

function assessRisks(report: any): { level: string; factors: string[] } {
  const riskFactors: string[] = [];
  let riskLevel = 'low';
  
  if (report.summary && report.summary.anomalies_detected > 2) {
    riskFactors.push('Multiple anomalies detected');
    riskLevel = 'medium';
  }
  
  if (report.predictions) {
    const decliningPredictions = report.predictions.filter((p: any) => 
      p.trend === 'decreasing' && p.prediction_confidence > 0.7
    );
    
    if (decliningPredictions.length > 1) {
      riskFactors.push('Multiple metrics showing declining trends');
      riskLevel = 'high';
    }
  }
  
  return { level: riskLevel, factors: riskFactors };
}

export default router;