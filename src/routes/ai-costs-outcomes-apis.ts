import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get AI costs analysis per tenant
router.get('/api/super-admin/ai-costs-analysis', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const { data: aiCosts, error } = await supabase.rpc('calculate_ai_costs_per_tenant', {
      p_tenant_id: null, // All tenants
      p_start_date: startDate.toISOString().split('T')[0],
      p_end_date: endDate.toISOString().split('T')[0]
    });

    if (error) throw error;

    // Calculate platform totals
    const platformTotals = aiCosts?.reduce((totals, tenant) => ({
      totalCost: totals.totalCost + parseFloat(tenant.total_cost_usd || '0'),
      totalTokens: totals.totalTokens + parseInt(tenant.total_tokens || '0'),
      totalConversations: totals.totalConversations + parseInt(tenant.total_conversations || '0'),
      activeTenantsWithAI: totals.activeTenantsWithAI + (parseFloat(tenant.total_cost_usd || '0') > 0 ? 1 : 0)
    }), {
      totalCost: 0,
      totalTokens: 0,
      totalConversations: 0,
      activeTenantsWithAI: 0
    }) || { totalCost: 0, totalTokens: 0, totalConversations: 0, activeTenantsWithAI: 0 };

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        platformTotals,
        tenantsData: aiCosts || [],
        insights: {
          avgCostPerTenant: platformTotals.activeTenantsWithAI > 0 
            ? (platformTotals.totalCost / platformTotals.activeTenantsWithAI).toFixed(4)
            : '0',
          avgTokensPerConversation: platformTotals.totalConversations > 0 
            ? Math.round(platformTotals.totalTokens / platformTotals.totalConversations)
            : 0,
          costEfficiencyRating: platformTotals.totalCost > 0 
            ? (platformTotals.totalConversations / platformTotals.totalCost * 10).toFixed(2)
            : 'N/A'
        }
      }
    });
  } catch (error) {
    console.error('AI costs analysis API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch AI costs analysis' 
    });
  }
});

// Get conversation outcomes analysis
router.get('/api/super-admin/conversation-outcomes', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const { data: outcomes, error } = await supabase.rpc('analyze_conversation_outcomes', {
      p_tenant_id: null, // All tenants
      p_start_date: startDate.toISOString().split('T')[0],
      p_end_date: endDate.toISOString().split('T')[0]
    });

    if (error) throw error;

    // Calculate platform averages
    const platformAverages = outcomes?.reduce((averages, tenant) => {
      const weight = parseInt(tenant.total_conversations || '0');
      return {
        totalConversations: averages.totalConversations + weight,
        weightedSuccessRate: averages.weightedSuccessRate + (parseFloat(tenant.success_rate || '0') * weight),
        weightedSatisfaction: averages.weightedSatisfaction + (parseFloat(tenant.avg_satisfaction_score || '0') * weight),
        weightedResolutionRate: averages.weightedResolutionRate + (parseFloat(tenant.resolution_rate || '0') * weight),
        totalBusinessOutcomes: averages.totalBusinessOutcomes + parseInt(tenant.business_outcomes_achieved || '0')
      };
    }, {
      totalConversations: 0,
      weightedSuccessRate: 0,
      weightedSatisfaction: 0,
      weightedResolutionRate: 0,
      totalBusinessOutcomes: 0
    }) || {
      totalConversations: 0,
      weightedSuccessRate: 0,
      weightedSatisfaction: 0,
      weightedResolutionRate: 0,
      totalBusinessOutcomes: 0
    };

    // Calculate final averages
    const finalAverages = {
      avgSuccessRate: platformAverages.totalConversations > 0 
        ? (platformAverages.weightedSuccessRate / platformAverages.totalConversations).toFixed(2)
        : '0',
      avgSatisfactionScore: platformAverages.totalConversations > 0 
        ? (platformAverages.weightedSatisfaction / platformAverages.totalConversations).toFixed(2)
        : '0',
      avgResolutionRate: platformAverages.totalConversations > 0 
        ? (platformAverages.weightedResolutionRate / platformAverages.totalConversations).toFixed(2)
        : '0',
      businessOutcomeRate: platformAverages.totalConversations > 0 
        ? ((platformAverages.totalBusinessOutcomes / platformAverages.totalConversations) * 100).toFixed(2)
        : '0'
    };

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        platformAverages: {
          ...finalAverages,
          totalConversations: platformAverages.totalConversations,
          totalBusinessOutcomes: platformAverages.totalBusinessOutcomes
        },
        tenantsData: outcomes || [],
        qualityInsights: {
          topPerformingTenant: outcomes?.[0]?.business_name || 'N/A',
          overallQualityRating: parseFloat(finalAverages.avgSatisfactionScore) >= 4.0 ? 'Excellent' :
                                 parseFloat(finalAverages.avgSatisfactionScore) >= 3.5 ? 'Good' :
                                 parseFloat(finalAverages.avgSatisfactionScore) >= 3.0 ? 'Fair' : 'Poor',
          improvementAreas: outcomes?.filter(t => parseFloat(t.success_rate || '0') < 60).length || 0
        }
      }
    });
  } catch (error) {
    console.error('Conversation outcomes API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch conversation outcomes' 
    });
  }
});

// Get AI costs vs outcomes correlation
router.get('/api/super-admin/ai-costs-vs-outcomes', async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period as string);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    // Get both AI costs and outcomes data
    const [aiCostsResult, outcomesResult] = await Promise.all([
      supabase.rpc('calculate_ai_costs_per_tenant', {
        p_tenant_id: null,
        p_start_date: startDate.toISOString().split('T')[0],
        p_end_date: endDate.toISOString().split('T')[0]
      }),
      supabase.rpc('analyze_conversation_outcomes', {
        p_tenant_id: null,
        p_start_date: startDate.toISOString().split('T')[0],
        p_end_date: endDate.toISOString().split('T')[0]
      })
    ]);

    if (aiCostsResult.error) throw aiCostsResult.error;
    if (outcomesResult.error) throw outcomesResult.error;

    const aiCosts = aiCostsResult.data || [];
    const outcomes = outcomesResult.data || [];

    // Merge data by tenant
    const correlationData = aiCosts.map(costData => {
      const outcomeData = outcomes.find(o => o.tenant_id === costData.tenant_id);
      
      return {
        tenant_id: costData.tenant_id,
        business_name: costData.business_name,
        // Cost metrics
        total_cost_usd: parseFloat(costData.total_cost_usd || '0'),
        avg_cost_per_conversation: parseFloat(costData.avg_cost_per_conversation || '0'),
        efficiency_score: parseFloat(costData.efficiency_score || '0'),
        // Outcome metrics  
        success_rate: parseFloat(outcomeData?.success_rate || '0'),
        satisfaction_score: parseFloat(outcomeData?.avg_satisfaction_score || '0'),
        resolution_rate: parseFloat(outcomeData?.resolution_rate || '0'),
        business_outcomes_achieved: parseInt(outcomeData?.business_outcomes_achieved || '0'),
        // Correlation calculations
        roi_score: costData.total_cost_usd && outcomeData ? 
          (parseInt(outcomeData.business_outcomes_achieved || '0') / parseFloat(costData.total_cost_usd)) * 100 : 0,
        cost_effectiveness: costData.avg_cost_per_conversation && outcomeData ?
          parseFloat(outcomeData.success_rate || '0') / parseFloat(costData.avg_cost_per_conversation) : 0
      };
    }).filter(d => d.total_cost_usd > 0); // Only include tenants with AI costs

    // Calculate correlation insights
    const insights = {
      totalTenants: correlationData.length,
      highROITenants: correlationData.filter(d => d.roi_score > 50).length,
      costEffectiveThreshold: 200, // success_rate / cost_per_conversation > 200 is good
      costEffectiveTenants: correlationData.filter(d => d.cost_effectiveness > 200).length,
      averageROI: correlationData.length > 0 ? 
        (correlationData.reduce((sum, d) => sum + d.roi_score, 0) / correlationData.length).toFixed(2) : '0',
      bestPerformingTenant: correlationData.sort((a, b) => b.roi_score - a.roi_score)[0]?.business_name || 'N/A'
    };

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        correlationData,
        insights,
        chartData: {
          // Scatter plot data: x = cost per conversation, y = success rate
          scatter: correlationData.map(d => ({
            x: d.avg_cost_per_conversation,
            y: d.success_rate,
            label: d.business_name,
            roi_score: d.roi_score,
            satisfaction: d.satisfaction_score
          }))
        }
      }
    });
  } catch (error) {
    console.error('AI costs vs outcomes API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch AI costs vs outcomes correlation' 
    });
  }
});

// Get AI costs trends over time
router.get('/api/super-admin/ai-costs-trends', async (req, res) => {
  try {
    const { data: aiUsageLogs, error } = await supabase
      .from('ai_usage_logs')
      .select('created_at, total_cost_usd, total_tokens, model, tenant_id')
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()) // Last 90 days
      .order('created_at');

    if (error) throw error;

    // Group by week for trend analysis
    const weeklyData: { [key: string]: { cost: number; tokens: number; requests: number } } = {};
    
    aiUsageLogs?.forEach(log => {
      const weekStart = new Date(log.created_at);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (weekKey && !weeklyData[weekKey]) {
        weeklyData[weekKey] = { cost: 0, tokens: 0, requests: 0 };
      }
      
      if (weekKey && weeklyData[weekKey]) {
        weeklyData[weekKey].cost += parseFloat(log.total_cost_usd || '0');
        weeklyData[weekKey].tokens += parseInt(log.total_tokens || '0');
        weeklyData[weekKey].requests += 1;
      }
    });

    // Format for chart
    const weeks = Object.keys(weeklyData).sort();
    const trendData = {
      labels: weeks.map(week => {
        const date = new Date(week);
        return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
      }),
      costs: weeks.map(week => weeklyData[week]?.cost || 0),
      tokens: weeks.map(week => weeklyData[week]?.tokens || 0),
      requests: weeks.map(week => weeklyData[week]?.requests || 0)
    };

    // Model usage distribution
    const modelUsage: { [key: string]: { cost: number; requests: number } } = {};
    aiUsageLogs?.forEach(log => {
      const model = log.model;
      if (!modelUsage[model]) {
        modelUsage[model] = { cost: 0, requests: 0 };
      }
      modelUsage[model].cost += parseFloat(log.total_cost_usd || '0');
      modelUsage[model].requests += 1;
    });

    res.json({
      success: true,
      data: {
        trendData,
        modelDistribution: {
          labels: Object.keys(modelUsage),
          costs: Object.values(modelUsage).map(m => m.cost),
          requests: Object.values(modelUsage).map(m => m.requests)
        },
        summary: {
          totalPeriod: '90d',
          totalCost: Object.values(weeklyData).reduce((sum, week) => sum + week.cost, 0),
          totalTokens: Object.values(weeklyData).reduce((sum, week) => sum + week.tokens, 0),
          totalRequests: Object.values(weeklyData).reduce((sum, week) => sum + week.requests, 0),
          avgWeeklyCost: weeks.length > 0 ? 
            (Object.values(weeklyData).reduce((sum, week) => sum + week.cost, 0) / weeks.length).toFixed(4) : '0'
        }
      }
    });
  } catch (error) {
    console.error('AI costs trends API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch AI costs trends' 
    });
  }
});

// Initialize sample data endpoint (for testing)
router.post('/api/super-admin/init-sample-ai-data', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('insert_sample_ai_usage');
    
    if (error) throw error;

    res.json({
      success: true,
      message: 'Sample AI usage data created successfully',
      data: 'Check ai_usage_logs and whatsapp_conversations tables for new data'
    });
  } catch (error) {
    console.error('Initialize sample data API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initialize sample AI data' 
    });
  }
});

export default router;