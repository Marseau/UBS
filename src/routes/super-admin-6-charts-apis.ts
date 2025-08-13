import * as express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get scatter plot data (platform cost vs tenant revenue) - USING NEW SCHEMA
router.get('/scatter-plot', async (req, res): Promise<any> => {
  try {
    // Get latest tenant metrics with NEW JSONB schema
    const { data: tenantMetrics, error } = await supabase
      .from('tenant_metrics')
      .select('tenant_id, metric_data, period')
      .eq('metric_type', 'comprehensive')
      .eq('period', '30d')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get tenant info
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, business_name, domain')
      .eq('status', 'active');

    // Create tenant lookup
    const tenantLookup: { [key: string]: any } = {};
    tenants?.forEach(tenant => {
      tenantLookup[tenant.id] = tenant;
    });

    // Get latest metrics per tenant using NEW schema
    const latestMetrics: { [key: string]: any } = {};
    tenantMetrics?.forEach(metric => {
      if (!latestMetrics[metric.tenant_id] && metric.metric_data) {
        latestMetrics[metric.tenant_id] = metric;
      }
    });

    // Build scatter data using NEW schema structure
    const scatterData = Object.keys(latestMetrics).map(tenantId => {
      const metric = latestMetrics[tenantId];
      const tenant = tenantLookup[tenantId];
      const data = metric.metric_data;
      
      // Extract from NEW JSONB structure
      const platformCost = parseFloat(data?.financial_metrics?.total_platform_cost || '0');
      const revenue = parseFloat(data?.financial_metrics?.tenant_revenue || '0');
      const efficiency = revenue > 0 && platformCost > 0 ? (revenue / platformCost) : 0;

      return {
        x: platformCost, // Platform cost (horizontal axis)
        y: revenue, // Tenant revenue (vertical axis) 
        label: tenant?.business_name || `Tenant ${tenantId.substring(0, 8)}`,
        domain: tenant?.domain || 'unknown',
        efficiency: parseFloat(efficiency.toFixed(1)),
        appointments: parseInt(data?.appointment_metrics?.appointments_total || '0'),
        customers: parseInt(data?.customer_metrics?.customers_total || '0')
      };
    }).filter(d => d.y > 0 || d.x > 0); // Include tenants with either revenue or cost

    res.json({
      success: true,
      data: scatterData,
      metadata: {
        totalTenants: scatterData.length,
        avgEfficiency: scatterData.length > 0 ? 
          scatterData.reduce((sum, d) => sum + d.efficiency, 0) / scatterData.length : 0,
        totalRevenue: scatterData.reduce((sum, d) => sum + d.y, 0),
        totalPlatformCost: scatterData.reduce((sum, d) => sum + d.x, 0)
      }
    });
  } catch (error) {
    console.error('Scatter plot API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch scatter plot data' });
  }
});

// Get appointment status distribution (Donut Chart) - USING NEW SCHEMA
router.get('/appointment-status', async (req, res): Promise<any> => {
  try {
    const period = req.query.period as string || '30d';
    
    // Get platform metrics with NEW JSONB schema
    const { data: platformMetrics, error } = await supabase
      .from('platform_metrics')
      .select('metric_data, period')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .eq('period', period)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestData = platformMetrics?.[0];
    if (!latestData) {
      return res.json({
        success: true,
        data: {
          labels: ['Completed', 'Confirmed', 'Cancelled', 'No Show'],
          data: [0, 0, 0, 0],
          colors: ['#38a169', '#3182ce', '#e53e3e', '#d69e2e'],
          total: 0
        }
      });
    }

    const appointmentData = latestData.metric_data?.appointment_metrics || {};
    
    // Extract totals from aggregated platform data
    const completed = parseInt(appointmentData.total_appointments_completed || '0');
    const confirmed = parseInt(appointmentData.total_appointments_confirmed || '0'); 
    const cancelled = parseInt(appointmentData.total_appointments_cancelled || '0');
    const noShow = parseInt(appointmentData.total_appointments_no_show || '0');
    const total = parseInt(appointmentData.total_appointments || '0');

    // Calculate percentages for better visualization
    const completionRate = parseFloat(appointmentData.avg_completion_rate || '0');
    const cancellationRate = parseFloat(appointmentData.avg_cancellation_rate || '0');
    const noShowRate = parseFloat(appointmentData.avg_no_show_rate || '0');

    res.json({
      success: true,
      data: {
        labels: ['Completed', 'Confirmed', 'Cancelled', 'No Show'],
        data: [completed, confirmed, cancelled, noShow],
        colors: ['#38a169', '#3182ce', '#e53e3e', '#d69e2e'],
        total,
        percentages: {
          completed: completionRate,
          cancelled: cancellationRate, 
          noShow: noShowRate,
          confirmed: Math.max(0, 100 - completionRate - cancellationRate - noShowRate)
        },
        metadata: {
          period,
          avgCompletionRate: completionRate,
          avgCancellationRate: cancellationRate,
          avgNoShowRate: noShowRate,
          effectiveAppointments: parseInt(appointmentData.total_effective_appointments || '0'),
          avgAppointmentEfficiency: parseFloat(appointmentData.avg_appointment_efficiency || '0')
        }
      }
    });
  } catch (error) {
    console.error('Appointment status API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch appointment status data' });
  }
});

// Get tenant risk assessment (Gauge Chart) - USING NEW SCHEMA
router.get('/tenant-risk-assessment', async (req, res): Promise<any> => {
  try {
    const period = req.query.period as string || '30d';
    
    // Get platform metrics with NEW JSONB schema
    const { data: platformMetrics, error } = await supabase
      .from('platform_metrics')
      .select('metric_data, period')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .eq('period', period)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestData = platformMetrics?.[0];
    if (!latestData) {
      return res.json({
        success: true,
        data: {
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          totalTenants: 0,
          riskPercentage: 0
        }
      });
    }

    const tenantOutcomes = latestData.metric_data?.tenant_outcomes || {};
    const metadata = latestData.metric_data?.metadata || {};
    
    const highRisk = parseInt(tenantOutcomes.high_risk_tenants || '0');
    const lowRisk = parseInt(tenantOutcomes.low_risk_tenants || '0');
    const totalTenants = parseInt(metadata.total_tenants_included || '0');
    const mediumRisk = Math.max(0, totalTenants - highRisk - lowRisk);
    
    const riskPercentage = totalTenants > 0 ? Math.round((highRisk / totalTenants) * 100) : 0;
    const avgHealthScore = parseFloat(tenantOutcomes.avg_health_score || '0');
    const avgScalabilityIndex = parseFloat(tenantOutcomes.avg_scalability_index || '0');

    res.json({
      success: true,
      data: {
        highRisk,
        mediumRisk,
        lowRisk,
        totalTenants,
        riskPercentage,
        gaugeValue: riskPercentage, // For gauge visualization (0-100)
        riskLevel: riskPercentage < 20 ? 'Low' : riskPercentage < 50 ? 'Medium' : 'High',
        colors: {
          low: '#38a169',    // Green
          medium: '#d69e2e', // Orange  
          high: '#e53e3e'    // Red
        },
        metadata: {
          period,
          avgHealthScore,
          avgScalabilityIndex,
          avgSustainabilityScore: parseFloat(tenantOutcomes.avg_sustainability_score || '0'),
          avgBusinessGrowthScore: parseFloat(tenantOutcomes.avg_business_growth_score || '0'),
          avgOperationalEfficiency: parseFloat(tenantOutcomes.avg_operational_efficiency || '0')
        },
        insights: {
          recommendation: riskPercentage < 20 ? 'Sistema saudável' : 
                        riskPercentage < 50 ? 'Atenção necessária' : 'Intervenção urgente',
          trend: avgHealthScore > 75 ? 'Positive' : avgHealthScore > 50 ? 'Stable' : 'Concerning'
        }
      }
    });
  } catch (error) {
    console.error('Risk assessment API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch risk assessment data' });
  }
});

// Get growth trends (Line Chart) - USING NEW SCHEMA
router.get('/growth-trends', async (req, res): Promise<any> => {
  try {
    // Get platform metrics for all periods with NEW JSONB schema
    const { data: platformMetrics, error } = await supabase
      .from('platform_metrics')
      .select('metric_data, period, created_at')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .in('period', ['7d', '30d', '90d'])
      .order('period', { ascending: true });

    if (error) throw error;

    const trendData = platformMetrics?.map(record => {
      const data = record.metric_data;
      const financial = data?.financial_metrics || {};
      const appointments = data?.appointment_metrics || {};
      const customers = data?.customer_metrics || {};
      const conversations = data?.conversation_outcomes || {};

      return {
        period: record.period,
        periodLabel: record.period === '7d' ? '7 dias' : record.period === '30d' ? '30 dias' : '90 dias',
        revenue: parseFloat(financial.total_tenant_revenue || '0'),
        platformMrr: parseFloat(financial.platform_mrr || '0'),
        appointments: parseInt(appointments.total_appointments || '0'),
        customers: parseInt(customers.total_customers || '0'),
        conversations: parseInt(conversations.total_conversations || '0'),
        conversionRate: parseFloat(conversations.avg_conversion_rate || '0'),
        completionRate: parseFloat(appointments.avg_completion_rate || '0'),
        growthMetrics: {
          newCustomers: parseInt(customers.total_customers_new || '0'),
          returningCustomers: parseInt(customers.total_customers_returning || '0'),
          avgCustomerLifetimeValue: parseFloat(customers.avg_customer_lifetime_value || '0'),
          customerRetentionRate: parseFloat(customers.avg_customer_retention_rate || '0')
        }
      };
    }) || [];

    // Calculate period-over-period growth rates
    const growthRates = trendData.length >= 2 ? {
      revenueGrowth: trendData.length >= 2 && trendData[0] && trendData[1] && trendData[0].revenue > 0 ? 
        ((trendData[1].revenue - trendData[0].revenue) / trendData[0].revenue) * 100 : 0,
      customerGrowth: trendData.length >= 2 && trendData[0] && trendData[1] && trendData[0].customers > 0 ?
        ((trendData[1].customers - trendData[0].customers) / trendData[0].customers) * 100 : 0,
      appointmentGrowth: trendData.length >= 2 && trendData[0] && trendData[1] && trendData[0].appointments > 0 ?
        ((trendData[1].appointments - trendData[0].appointments) / trendData[0].appointments) * 100 : 0
    } : { revenueGrowth: 0, customerGrowth: 0, appointmentGrowth: 0 };

    res.json({
      success: true,
      data: {
        trends: trendData,
        labels: trendData.map(d => d.periodLabel),
        datasets: {
          revenue: trendData.map(d => d.revenue),
          appointments: trendData.map(d => d.appointments),
          customers: trendData.map(d => d.customers),
          conversations: trendData.map(d => d.conversations),
          conversionRate: trendData.map(d => d.conversionRate),
          completionRate: trendData.map(d => d.completionRate)
        },
        growthRates,
        insights: {
          bestPerformingPeriod: trendData.length > 0 ? trendData.reduce((best, current) => 
            current.revenue > (best?.revenue || 0) ? current : best, trendData[0]) : null,
          overallTrend: growthRates.revenueGrowth > 10 ? 'Growing' : 
                       growthRates.revenueGrowth > 0 ? 'Stable' : 'Declining'
        }
      }
    });
  } catch (error) {
    console.error('Growth trends API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch growth trends data' });
  }
});

// Get profitability analysis (Bar Chart) - USING NEW SCHEMA
router.get('/profitability-analysis', async (req, res): Promise<any> => {
  try {
    const period = req.query.period as string || '30d';
    
    // Get platform metrics with NEW JSONB schema
    const { data: platformMetrics, error } = await supabase
      .from('platform_metrics')
      .select('metric_data, period')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .eq('period', period)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestData = platformMetrics?.[0];
    if (!latestData) {
      return res.json({
        success: true,
        data: {
          profitable: 0,
          unprofitable: 0,
          totalTenants: 0,
          profitabilityRate: 0
        }
      });
    }

    const financial = latestData.metric_data?.financial_metrics || {};
    const metadata = latestData.metric_data?.metadata || {};
    
    const profitableTenants = parseInt(financial.profitable_tenants_count || '0');
    const totalTenants = parseInt(metadata.total_tenants_included || '0');
    const unprofitableTenants = totalTenants - profitableTenants;
    const profitabilityRate = parseFloat(financial.profitable_tenants_percentage || '0');
    
    const avgRoi = parseFloat(financial.avg_roi_percentage || '0');
    const avgMargin = parseFloat(financial.avg_margin_percentage || '0');
    const avgRevenuePerTenant = totalTenants > 0 ? 
      parseFloat(financial.total_tenant_revenue || '0') / totalTenants : 0;

    res.json({
      success: true,
      data: {
        categories: ['Profitable', 'Break-even', 'Unprofitable'],
        data: [
          profitableTenants,
          Math.round(unprofitableTenants * 0.3), // Assume 30% break-even
          Math.round(unprofitableTenants * 0.7)  // 70% unprofitable
        ],
        colors: ['#38a169', '#d69e2e', '#e53e3e'],
        totalTenants,
        profitabilityRate,
        metadata: {
          period,
          avgRoi,
          avgMargin,
          avgRevenuePerTenant: Math.round(avgRevenuePerTenant),
          totalRevenue: parseFloat(financial.total_tenant_revenue || '0'),
          totalPlatformCost: parseFloat(financial.platform_mrr || '0')
        },
        insights: {
          healthStatus: profitabilityRate > 70 ? 'Excellent' : 
                       profitabilityRate > 50 ? 'Good' : 'Needs Improvement',
          recommendation: profitabilityRate < 50 ? 
            'Review pricing strategy and tenant support' : 
            'Maintain current profitable trajectory'
        }
      }
    });
  } catch (error) {
    console.error('Profitability analysis API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profitability analysis' });
  }
});

// Get conversation analytics (Area Chart) - USING NEW SCHEMA
router.get('/conversation-analytics', async (req, res): Promise<any> => {
  try {
    const period = req.query.period as string || '30d';
    
    // Get platform metrics with NEW JSONB schema
    const { data: platformMetrics, error } = await supabase
      .from('platform_metrics')
      .select('metric_data, period')
      .eq('platform_id', 'PLATFORM')
      .eq('metric_type', 'comprehensive')
      .eq('period', period)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const latestData = platformMetrics?.[0];
    if (!latestData) {
      return res.json({
        success: true,
        data: {
          totalConversations: 0,
          conversionRate: 0,
          customersAcquired: 0
        }
      });
    }

    const conversations = latestData.metric_data?.conversation_outcomes || {};
    const aiMetrics = latestData.metric_data?.ai_metrics || {};
    const customers = latestData.metric_data?.customer_metrics || {};
    
    const totalConversations = parseInt(conversations.total_conversations || '0');
    const totalAiInteractions = parseInt(conversations.total_ai_interactions || '0');
    const conversionRate = parseFloat(conversations.avg_conversion_rate || '0');
    const customersAcquired = Math.round(totalConversations * (conversionRate / 100));
    
    // Simulate weekly breakdown for area chart
    const weeksInPeriod = period === '7d' ? 1 : period === '30d' ? 4 : 12;
    const weeklyData = Array.from({ length: weeksInPeriod }, (_, i) => {
      const baseConversations = Math.round(totalConversations / weeksInPeriod);
      const variation = Math.random() * 0.3 - 0.15; // ±15% variation
      return {
        week: i + 1,
        conversations: Math.round(baseConversations * (1 + variation)),
        conversions: Math.round((baseConversations * (conversionRate / 100)) * (1 + variation)),
        aiInteractions: Math.round((totalAiInteractions / weeksInPeriod) * (1 + variation))
      };
    });

    res.json({
      success: true,
      data: {
        labels: weeklyData.map(d => `Semana ${d.week}`),
        datasets: {
          conversations: weeklyData.map(d => d.conversations),
          conversions: weeklyData.map(d => d.conversions), 
          aiInteractions: weeklyData.map(d => d.aiInteractions)
        },
        totals: {
          totalConversations,
          totalAiInteractions,
          customersAcquired,
          conversionRate
        },
        metrics: {
          avgConversationDuration: parseFloat(conversations.avg_conversation_duration || '0'),
          avgMessagesPerConversation: parseFloat(conversations.avg_messages_per_conversation || '0'),
          avgCustomerSatisfaction: parseFloat(conversations.avg_customer_satisfaction_score || '0'),
          aiAccuracyRate: parseFloat(aiMetrics.avg_ai_accuracy_rate || '0'),
          aiUptime: parseFloat(aiMetrics.avg_ai_uptime_percentage || '0')
        },
        insights: {
          conversionTrend: conversionRate > 15 ? 'High' : conversionRate > 8 ? 'Average' : 'Low',
          aiPerformance: parseFloat(aiMetrics.avg_ai_accuracy_rate || '0') > 85 ? 'Excellent' : 
                        parseFloat(aiMetrics.avg_ai_accuracy_rate || '0') > 70 ? 'Good' : 'Needs Improvement',
          recommendation: conversionRate < 8 ? 
            'Optimize conversation flows and AI responses' : 
            'Maintain high conversion performance'
        }
      }
    });
  } catch (error) {
    console.error('Conversation analytics API error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch conversation analytics' });
  }
});

export default router;