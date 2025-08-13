#!/usr/bin/env node

/**
 * Daily Analytics Cron Job - Executa às 4:00 AM
 * 
 * Este script calcula e atualiza todas as métricas do sistema:
 * - Métricas de sistema (SaaS)
 * - Métricas de tenants individuais
 * - Métricas de participação na plataforma
 * - Rankings e distribuições
 * - Scores de risco e saúde
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuração de logging
const logFile = path.join(__dirname, '../cron-analytics.log');

function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
}

/**
 * Calcula métricas do sistema (SaaS)
 */
async function calculateSystemMetrics(targetDate) {
    log('🔄 Calculando métricas do sistema...');
    
    try {
        const startDate = new Date(targetDate);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);
        
        // Buscar dados de agendamentos
        const { data: appointments, error: apptError } = await supabase
            .from('appointments')
            .select('*')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (apptError) throw apptError;
        
        // Buscar dados de tenants
        const { data: tenants, error: tenantError } = await supabase
            .from('tenants')
            .select('*')
            .eq('status', 'active');
            
        if (tenantError) throw tenantError;
        
        // Buscar dados de usuários
        const { data: userTenants, error: userError } = await supabase
            .from('user_tenants')
            .select('*')
            .gte('first_interaction', startDate.toISOString())
            .lte('first_interaction', endDate.toISOString());
            
        if (userError) throw userError;
        
        // Buscar conversas de IA
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('*')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (convError) throw convError;
        
        // Calcular métricas
        const metrics = {
            metric_date: targetDate,
            period_type: 'daily',
            
            // Métricas de agendamentos
            total_appointments: appointments.length,
            confirmed_appointments: appointments.filter(a => a.status === 'confirmed').length,
            completed_appointments: appointments.filter(a => a.status === 'completed').length,
            cancelled_appointments: appointments.filter(a => a.status === 'cancelled').length,
            pending_appointments: appointments.filter(a => a.status === 'pending').length,
            
            // Métricas de receita
            total_revenue: appointments
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + (parseFloat(a.final_price) || parseFloat(a.quoted_price) || 0), 0),
            
            // Métricas de clientes
            total_customers: userTenants.length,
            new_customers: userTenants.filter(ut => 
                new Date(ut.first_interaction) >= startDate && 
                new Date(ut.first_interaction) <= endDate
            ).length,
            
            // Métricas de IA
            total_ai_interactions: conversations.length,
            ai_responses: conversations.filter(c => !c.is_from_user).length,
            
            // Métricas de tenants
            active_tenants: tenants.length,
            
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Calcular taxas
        metrics.completion_rate = metrics.total_appointments > 0 
            ? (metrics.completed_appointments / metrics.total_appointments * 100).toFixed(2)
            : 0;
            
        metrics.cancellation_rate = metrics.total_appointments > 0
            ? (metrics.cancelled_appointments / metrics.total_appointments * 100).toFixed(2)
            : 0;
            
        metrics.average_ticket = metrics.completed_appointments > 0
            ? (metrics.total_revenue / metrics.completed_appointments).toFixed(2)
            : 0;
        
        // Inserir/atualizar na tabela analytics_system_metrics
        const { error: insertError } = await supabase
            .from('analytics_system_metrics')
            .upsert(metrics, {
                onConflict: 'metric_date,period_type'
            });
            
        if (insertError) throw insertError;
        
        log(`✅ Métricas do sistema calculadas: ${metrics.total_appointments} agendamentos, R$ ${metrics.total_revenue}`);
        return metrics;
        
    } catch (error) {
        log(`❌ Erro ao calcular métricas do sistema: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Calcula métricas por tenant
 */
async function calculateTenantMetrics(targetDate) {
    log('🔄 Calculando métricas por tenant...');
    
    try {
        // Buscar todos os tenants ativos
        const { data: tenants, error: tenantError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active');
            
        if (tenantError) throw tenantError;
        
        const startDate = new Date(targetDate);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);
        
        for (const tenant of tenants) {
            try {
                // Buscar agendamentos do tenant
                const { data: appointments, error: apptError } = await supabase
                    .from('appointments')
                    .select('*')
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', startDate.toISOString())
                    .lte('created_at', endDate.toISOString());
                    
                if (apptError) throw apptError;
                
                // Buscar clientes do tenant
                const { data: userTenants, error: userError } = await supabase
                    .from('user_tenants')
                    .select('*')
                    .eq('tenant_id', tenant.id)
                    .gte('first_interaction', startDate.toISOString())
                    .lte('first_interaction', endDate.toISOString());
                    
                if (userError) throw userError;
                
                // Buscar conversas do tenant
                const { data: conversations, error: convError } = await supabase
                    .from('conversation_history')
                    .select('*')
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', startDate.toISOString())
                    .lte('created_at', endDate.toISOString());
                    
                if (convError) throw convError;
                
                // Calcular métricas do tenant
                const tenantMetrics = {
                    tenant_id: tenant.id,
                    metric_date: targetDate,
                    period_type: 'daily',
                    
                    // Métricas de agendamentos
                    total_appointments: appointments.length,
                    confirmed_appointments: appointments.filter(a => a.status === 'confirmed').length,
                    completed_appointments: appointments.filter(a => a.status === 'completed').length,
                    cancelled_appointments: appointments.filter(a => a.status === 'cancelled').length,
                    pending_appointments: appointments.filter(a => a.status === 'pending').length,
                    no_show_appointments: appointments.filter(a => a.status === 'no_show').length,
                    
                    // Métricas de receita
                    total_revenue: appointments
                        .filter(a => a.status === 'completed')
                        .reduce((sum, a) => sum + (parseFloat(a.final_price) || parseFloat(a.quoted_price) || 0), 0),
                    
                    // Métricas de clientes
                    total_customers: userTenants.length,
                    new_customers: userTenants.length, // Todos são novos no dia
                    
                    // Métricas de IA
                    total_ai_interactions: conversations.length,
                    user_messages: conversations.filter(c => c.is_from_user).length,
                    ai_responses: conversations.filter(c => !c.is_from_user).length,
                    
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                
                // Calcular taxas
                tenantMetrics.completion_rate = tenantMetrics.total_appointments > 0
                    ? (tenantMetrics.completed_appointments / tenantMetrics.total_appointments * 100).toFixed(2)
                    : 0;
                    
                tenantMetrics.cancellation_rate = tenantMetrics.total_appointments > 0
                    ? (tenantMetrics.cancelled_appointments / tenantMetrics.total_appointments * 100).toFixed(2)
                    : 0;
                    
                tenantMetrics.no_show_rate = tenantMetrics.total_appointments > 0
                    ? (tenantMetrics.no_show_appointments / tenantMetrics.total_appointments * 100).toFixed(2)
                    : 0;
                    
                tenantMetrics.average_ticket = tenantMetrics.completed_appointments > 0
                    ? (tenantMetrics.total_revenue / tenantMetrics.completed_appointments).toFixed(2)
                    : 0;
                
                // Inserir/atualizar na tabela analytics_tenant_metrics
                const { error: insertError } = await supabase
                    .from('analytics_tenant_metrics')
                    .upsert(tenantMetrics, {
                        onConflict: 'tenant_id,metric_date,period_type'
                    });
                    
                if (insertError) throw insertError;
                
                log(`  ✅ ${tenant.business_name}: ${tenantMetrics.total_appointments} agendamentos, R$ ${tenantMetrics.total_revenue}`);
                
            } catch (error) {
                log(`  ❌ Erro no tenant ${tenant.business_name}: ${error.message}`, 'ERROR');
            }
        }
        
        log(`✅ Métricas de ${tenants.length} tenants calculadas`);
        
    } catch (error) {
        log(`❌ Erro ao calcular métricas por tenant: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Calcula rankings e distribuições
 */
async function calculateRankingsAndDistributions(targetDate) {
    log('🔄 Calculando rankings e distribuições...');
    
    try {
        // Buscar métricas de tenants do período
        const { data: tenantMetrics, error: metricsError } = await supabase
            .from('analytics_tenant_metrics')
            .select(`
                tenant_id,
                total_revenue,
                total_appointments,
                total_customers,
                tenants!inner(business_name, domain)
            `)
            .eq('metric_date', targetDate)
            .eq('period_type', 'daily')
            .order('total_revenue', { ascending: false });
            
        if (metricsError) throw metricsError;
        
        // Calcular rankings
        const rankings = tenantMetrics.map((metric, index) => ({
            tenant_id: metric.tenant_id,
            ranking_date: targetDate,
            rank_position: index + 1,
            revenue: metric.total_revenue,
            appointment_count: metric.total_appointments,
            customer_count: metric.total_customers,
            business_name: metric.tenants.business_name,
            domain: metric.tenants.domain,
            calculated_at: new Date().toISOString()
        }));
        
        // Inserir rankings na tabela top_tenants
        if (rankings.length > 0) {
            const { error: rankingError } = await supabase
                .from('top_tenants')
                .upsert(rankings, {
                    onConflict: 'ranking_date,tenant_id'
                });
                
            if (rankingError) throw rankingError;
        }
        
        // Calcular distribuição por domínio
        const domainDistribution = {};
        tenantMetrics.forEach(metric => {
            const domain = metric.tenants.domain || 'outros';
            if (!domainDistribution[domain]) {
                domainDistribution[domain] = {
                    count: 0,
                    revenue: 0,
                    appointments: 0
                };
            }
            domainDistribution[domain].count += 1;
            domainDistribution[domain].revenue += parseFloat(metric.total_revenue) || 0;
            domainDistribution[domain].appointments += metric.total_appointments || 0;
        });
        
        // Salvar distribuição na tabela tenant_distribution
        const distributionRecord = {
            distribution_date: targetDate,
            domain_data: domainDistribution,
            calculated_at: new Date().toISOString()
        };
        
        const { error: distError } = await supabase
            .from('tenant_distribution')
            .upsert(distributionRecord, {
                onConflict: 'distribution_date'
            });
            
        if (distError) throw distError;
        
        log(`✅ Rankings calculados para ${rankings.length} tenants`);
        log(`✅ Distribuição por domínio: ${Object.keys(domainDistribution).length} domínios`);
        
    } catch (error) {
        log(`❌ Erro ao calcular rankings: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Calcula scores de saúde e risco
 */
async function calculateHealthAndRiskScores(targetDate) {
    log('🔄 Calculando scores de saúde e risco...');
    
    try {
        // Buscar métricas dos últimos 30 dias para cada tenant
        const endDate = new Date(targetDate);
        const startDate = new Date(targetDate);
        startDate.setDate(startDate.getDate() - 30);
        
        const { data: tenants, error: tenantError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active');
            
        if (tenantError) throw tenantError;
        
        for (const tenant of tenants) {
            try {
                // Buscar métricas históricas do tenant
                const { data: historicalMetrics, error: histError } = await supabase
                    .from('analytics_tenant_metrics')
                    .select('*')
                    .eq('tenant_id', tenant.id)
                    .eq('period_type', 'daily')
                    .gte('metric_date', startDate.toISOString().split('T')[0])
                    .lte('metric_date', endDate.toISOString().split('T')[0])
                    .order('metric_date', { ascending: false });
                    
                if (histError) throw histError;
                
                if (historicalMetrics.length === 0) continue;
                
                // Calcular health score (0-100)
                let healthScore = 100;
                
                // Reduzir score baseado em cancelamentos
                const avgCancellationRate = historicalMetrics.reduce((sum, m) => 
                    sum + parseFloat(m.cancellation_rate || 0), 0) / historicalMetrics.length;
                healthScore -= Math.min(avgCancellationRate * 2, 30); // Max -30 pontos
                
                // Reduzir score baseado em no-shows
                const avgNoShowRate = historicalMetrics.reduce((sum, m) => 
                    sum + parseFloat(m.no_show_rate || 0), 0) / historicalMetrics.length;
                healthScore -= Math.min(avgNoShowRate * 3, 20); // Max -20 pontos
                
                // Reduzir score se receita está caindo
                const recentRevenue = historicalMetrics.slice(0, 7).reduce((sum, m) => 
                    sum + parseFloat(m.total_revenue || 0), 0);
                const previousRevenue = historicalMetrics.slice(7, 14).reduce((sum, m) => 
                    sum + parseFloat(m.total_revenue || 0), 0);
                    
                if (previousRevenue > 0 && recentRevenue < previousRevenue * 0.8) {
                    healthScore -= 25; // Queda significativa de receita
                }
                
                healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
                
                // Calcular risk score (0-100, onde 100 é alto risco)
                let riskScore = 0;
                
                // Aumentar risco baseado em cancelamentos
                riskScore += Math.min(avgCancellationRate * 2, 40);
                
                // Aumentar risco baseado em queda de receita
                if (previousRevenue > 0 && recentRevenue < previousRevenue * 0.8) {
                    riskScore += 30;
                }
                
                // Aumentar risco se não há agendamentos recentes
                const recentAppointments = historicalMetrics.slice(0, 7).reduce((sum, m) => 
                    sum + (m.total_appointments || 0), 0);
                if (recentAppointments === 0) {
                    riskScore += 30;
                }
                
                riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));
                
                // Determinar nível de risco
                let riskLevel = 'Baixo Risco';
                if (riskScore >= 70) riskLevel = 'Alto Risco';
                else if (riskScore >= 40) riskLevel = 'Médio Risco';
                
                // Salvar scores
                const riskRecord = {
                    tenant_id: tenant.id,
                    assessment_date: targetDate,
                    overall_risk_score: riskScore,
                    risk_level: riskLevel,
                    revenue_decline_risk: previousRevenue > 0 && recentRevenue < previousRevenue * 0.8 ? 1 : 0,
                    appointment_cancellation_risk: avgCancellationRate > 20 ? 1 : 0,
                    customer_churn_risk: recentAppointments === 0 ? 1 : 0,
                    risk_factors: {
                        cancellation_rate: avgCancellationRate,
                        no_show_rate: avgNoShowRate,
                        revenue_decline: previousRevenue > 0 ? ((previousRevenue - recentRevenue) / previousRevenue * 100) : 0,
                        recent_appointments: recentAppointments
                    },
                    calculated_at: new Date().toISOString()
                };
                
                const { error: riskError } = await supabase
                    .from('tenant_risk_history')
                    .upsert(riskRecord, {
                        onConflict: 'tenant_id,assessment_date'
                    });
                    
                if (riskError) throw riskError;
                
                log(`  ✅ ${tenant.business_name}: Health ${healthScore}, Risk ${riskScore} (${riskLevel})`);
                
            } catch (error) {
                log(`  ❌ Erro no tenant ${tenant.business_name}: ${error.message}`, 'ERROR');
            }
        }
        
        log(`✅ Scores calculados para ${tenants.length} tenants`);
        
    } catch (error) {
        log(`❌ Erro ao calcular scores: ${error.message}`, 'ERROR');
        throw error;
    }
}

/**
 * Função principal do cron job
 */
async function runDailyCron() {
    const startTime = Date.now();
    const targetDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    log('🚀 Iniciando cron job diário de analytics');
    log(`📅 Data alvo: ${targetDate}`);
    
    try {
        // Executar todas as funções de cálculo
        await calculateSystemMetrics(targetDate);
        await calculateTenantMetrics(targetDate);
        await calculateRankingsAndDistributions(targetDate);
        await calculateHealthAndRiskScores(targetDate);
        
        // Limpar cache se existir
        try {
            await supabase
                .from('analytics_cache')
                .delete()
                .lt('expires_at', new Date().toISOString());
            log('🧹 Cache expirado limpo');
        } catch (cacheError) {
            log(`⚠️ Erro ao limpar cache: ${cacheError.message}`, 'WARN');
        }
        
        const duration = Date.now() - startTime;
        log(`✅ Cron job concluído com sucesso em ${duration}ms`);
        
        // Registrar execução
        await supabase
            .from('analytics_job_executions')
            .insert({
                job_name: 'daily_analytics_cron',
                status: 'success',
                duration_ms: duration,
                target_date: targetDate,
                metadata: {
                    completed_tasks: [
                        'system_metrics',
                        'tenant_metrics', 
                        'rankings_distributions',
                        'health_risk_scores'
                    ]
                }
            });
            
        process.exit(0);
        
    } catch (error) {
        const duration = Date.now() - startTime;
        log(`❌ Cron job falhou: ${error.message}`, 'ERROR');
        
        // Registrar falha
        await supabase
            .from('analytics_job_executions')
            .insert({
                job_name: 'daily_analytics_cron',
                status: 'error',
                duration_ms: duration,
                target_date: targetDate,
                error_message: error.message,
                metadata: { error_stack: error.stack }
            });
            
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    runDailyCron();
}

module.exports = { runDailyCron }; 