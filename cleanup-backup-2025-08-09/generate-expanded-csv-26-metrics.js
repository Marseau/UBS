#!/usr/bin/env node

/**
 * Generate EXPANDED CSV with all 26 metrics as separate columns
 * Perfect for Excel/Google Sheets analysis with all metrics expanded
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateExpandedCSV26Metrics() {
    console.log('📊 Generating EXPANDED CSV - All 26 Metrics as Columns');
    console.log('🎯 Perfect for Excel/Google Sheets analysis');
    console.log('=' .repeat(70));
    
    try {
        // Get tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name, domain')
            .eq('status', 'active');
        
        if (tenantsError) throw tenantsError;
        
        // Get consolidated_26 metrics
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('*')
            .eq('metric_type', 'consolidated_26')
            .order('tenant_id', { ascending: true })
            .order('period', { ascending: true });
        
        if (error) throw error;
        
        console.log(`🏢 Processing ${tenants.length} tenants`);
        console.log(`📈 Expanding ${metrics.length} consolidated_26 metrics`);
        
        // Create tenant lookup
        const tenantLookup = {};
        tenants.forEach(tenant => {
            tenantLookup[tenant.id] = {
                name: tenant.name,
                domain: tenant.domain
            };
        });
        
        // Prepare CSV with ALL 26 metrics expanded
        const csvRows = [];
        
        // COMPREHENSIVE HEADER - All 26 metrics as columns
        csvRows.push([
            // Basic Info
            'tenant_id',
            'tenant_name', 
            'tenant_domain',
            'period',
            'calculated_at',
            'period_start_date',
            'period_end_date',
            'total_metrics_count',
            
            // Summary KPIs
            'summary_risk_score',
            'summary_total_revenue',
            'summary_new_customers_count',
            'summary_success_rate',
            'summary_unique_customers',
            'summary_ai_efficiency_score',
            
            // 1. RISK ASSESSMENT (Validated #1)
            'risk_assessment_score',
            'risk_assessment_status',
            'risk_assessment_level',
            'risk_assessment_external_dependency_pct',
            'risk_assessment_saas_usage_pct',
            'risk_assessment_total_appointments',
            'risk_assessment_external_appointments',
            'risk_assessment_saas_appointments',
            
            // 2. GROWTH ANALYSIS (Validated #2)
            'growth_analysis_new_customers_count',
            'growth_analysis_growth_trend',
            'growth_analysis_customer_acquisition',
            'growth_analysis_growth_rate_percentage',
            
            // 3. AI EFFICIENCY (Script #1)
            'ai_efficiency_percentage',
            'ai_efficiency_total_conversations',
            'ai_efficiency_success_weighted',
            'ai_efficiency_neutral_weighted',
            'ai_efficiency_failure_weighted',
            'ai_efficiency_avg_confidence_score',
            
            // 4. APPOINTMENT SUCCESS RATE (Script #2)
            'appointment_success_rate_percentage',
            'appointment_success_rate_completed_count',
            'appointment_success_rate_total_appointments',
            
            // 5. CANCELLATION RATE (Script #3)
            'cancellation_rate_percentage',
            'cancellation_rate_cancelled_count',
            'cancellation_rate_total_appointments',
            
            // 6. RESCHEDULE RATE (Script #4)
            'reschedule_rate_percentage',
            'reschedule_rate_rescheduled_count',
            'reschedule_rate_total_appointments',
            
            // 7. NO SHOW IMPACT (Script #5)
            'no_show_impact_percentage',
            'no_show_impact_no_show_count',
            'no_show_impact_revenue_loss',
            'no_show_impact_impact_level',
            
            // 8. INFORMATION RATE (Script #6)
            'information_rate_percentage',
            'information_rate_info_requests',
            'information_rate_total_conversations',
            
            // 9. SPAM RATE (Script #7)
            'spam_rate_percentage',
            'spam_rate_spam_count',
            'spam_rate_total_conversations',
            
            // 10. AI INTERACTION (Script #8)
            'ai_interaction_total_interactions',
            'ai_interaction_avg_interactions_per_session',
            'ai_interaction_sessions_count',
            'ai_interaction_interaction_quality',
            
            // 11. AVG MINUTES PER CONVERSATION (Script #9)
            'avg_minutes_per_conversation_minutes',
            'avg_minutes_per_conversation_total_minutes',
            'avg_minutes_per_conversation_efficiency_score',
            
            // 12. AVG COST USD (Script #10)
            'avg_cost_usd_cost_usd',
            'avg_cost_usd_cost_brl',
            'avg_cost_usd_exchange_rate',
            
            // 13. TOTAL COST USD (Script #11)
            'total_cost_usd_total_usd',
            'total_cost_usd_total_brl',
            'total_cost_usd_appointments_count',
            
            // 14. TOTAL UNIQUE CUSTOMERS (Script #12)
            'total_unique_customers_count',
            'total_unique_customers_with_appointments',
            'total_unique_customers_customer_retention',
            
            // 15. TOTAL PROFESSIONALS (Script #13)
            'total_professionals_count',
            'total_professionals_active_professionals',
            'total_professionals_avg_appointments_per_professional',
            
            // 16. NEW CUSTOMERS (Script #14)
            'new_customers_count',
            'new_customers_growth_rate',
            'new_customers_acquisition_source',
            
            // 17. CUSTOMER RECURRENCE (Script #15)
            'customer_recurrence_recurring_customers',
            'customer_recurrence_recurrence_rate',
            'customer_recurrence_avg_appointments_per_customer',
            
            // 18. AI FAILURE CONFIDENCE (Script #16)
            'ai_failure_confidence_avg_confidence',
            'ai_failure_confidence_failure_count',
            'ai_failure_confidence_confidence_level',
            
            // 19. CONVERSATION OUTCOME ANALYSIS (Script #17)
            'conversation_outcome_analysis_total_conversations',
            'conversation_outcome_analysis_success_outcomes',
            'conversation_outcome_analysis_outcomes_count',
            
            // 20. HISTORICAL REVENUE ANALYSIS (Script #18)
            'historical_revenue_analysis_total_revenue',
            'historical_revenue_analysis_daily_average',
            'historical_revenue_analysis_days_with_revenue',
            
            // 21. SERVICES ANALYSIS (Script #19)
            'services_analysis_services_offered',
            'services_analysis_most_popular_service',
            'services_analysis_service_variety_score',
            
            // 22. CHANNEL SEPARATION (Script #20)
            'channel_separation_total_appointments',
            'channel_separation_primary_channel',
            'channel_separation_channels_count',
            
            // 23. REVENUE BY PROFESSIONAL (Script #21)
            'revenue_by_professional_total_revenue',
            'revenue_by_professional_top_earner',
            'revenue_by_professional_professionals_count',
            
            // 24. REVENUE BY SERVICE (Script #22)
            'revenue_by_service_total_revenue',
            'revenue_by_service_top_service',
            'revenue_by_service_services_count',
            
            // 25. MONTHLY REVENUE TRACKING (Script #23)
            'monthly_revenue_tracking_current_month_revenue',
            'monthly_revenue_tracking_revenue_trend',
            'monthly_revenue_tracking_months_tracked',
            
            // 26. CUSTO PLATAFORMA (Script #24)
            'custo_plataforma_custo_total_brl',
            'custo_plataforma_plano_usado',
            'custo_plataforma_conversas_contabilizadas',
            'custo_plataforma_custo_por_conversa',
            
            // Full JSON backup for complex analysis
            'full_json_backup'
            
        ].join(','));
        
        // Process each metric and expand all 26 metrics
        for (const metric of metrics) {
            const tenant = tenantLookup[metric.tenant_id];
            if (!tenant) continue;
            
            const data = metric.metric_data || {};
            
            // Extract all 26 metrics
            const period = data.period_info || {};
            const summary = data.summary_kpis || {};
            const risk = data.risk_assessment || {};
            const growth = data.growth_analysis || {};
            const aiEff = data.ai_efficiency || {};
            const aptSuccess = data.appointment_success_rate || {};
            const cancel = data.cancellation_rate || {};
            const reschedule = data.reschedule_rate || {};
            const noShow = data.no_show_impact || {};
            const info = data.information_rate || {};
            const spam = data.spam_rate || {};
            const aiInt = data.ai_interaction || {};
            const avgMin = data.avg_minutes_per_conversation || {};
            const avgCost = data.avg_cost_usd || {};
            const totalCost = data.total_cost_usd || {};
            const uniqueCust = data.total_unique_customers || {};
            const totalProf = data.total_professionals || {};
            const newCust = data.new_customers || {};
            const custRec = data.customer_recurrence || {};
            const aiFailure = data.ai_failure_confidence || {};
            const convOutcome = data.conversation_outcome_analysis || {};
            const histRevenue = data.historical_revenue_analysis || {};
            const servicesAnal = data.services_analysis || {};
            const channelSep = data.channel_separation || {};
            const revProf = data.revenue_by_professional || {};
            const revServ = data.revenue_by_service || {};
            const monthlyRev = data.monthly_revenue_tracking || {};
            const custoPlat = data.custo_plataforma || {};
            
            csvRows.push([
                // Basic Info
                metric.tenant_id,
                `"${tenant.name}"`,
                tenant.domain || '',
                metric.period,
                metric.calculated_at || '',
                period.start_date || '',
                period.end_date || '',
                period.total_metrics || 26,
                
                // Summary KPIs
                summary.risk_score || 0,
                summary.total_revenue || 0,
                summary.new_customers_count || 0,
                summary.success_rate || 0,
                summary.unique_customers || 0,
                summary.ai_efficiency_score || 0,
                
                // 1. Risk Assessment
                risk.score || 0,
                `"${risk.status || ''}"`,
                `"${risk.level || ''}"`,
                risk.external_dependency_percentage || 0,
                risk.saas_usage_percentage || 0,
                risk.total_appointments || 0,
                risk.external_appointments || 0,
                risk.saas_appointments || 0,
                
                // 2. Growth Analysis
                growth.new_customers_count || 0,
                `"${growth.growth_trend || ''}"`,
                growth.customer_acquisition || 0,
                growth.growth_rate_percentage || 0,
                
                // 3. AI Efficiency
                aiEff.percentage || 0,
                aiEff.total_conversations || 0,
                aiEff.success_weighted || 0,
                aiEff.neutral_weighted || 0,
                aiEff.failure_weighted || 0,
                aiEff.avg_confidence_score || 0,
                
                // 4. Appointment Success Rate
                aptSuccess.percentage || 0,
                aptSuccess.completed_count || 0,
                aptSuccess.total_appointments || 0,
                
                // 5. Cancellation Rate
                cancel.percentage || 0,
                cancel.cancelled_count || 0,
                cancel.total_appointments || 0,
                
                // 6. Reschedule Rate
                reschedule.percentage || 0,
                reschedule.rescheduled_count || 0,
                reschedule.total_appointments || 0,
                
                // 7. No Show Impact
                noShow.percentage || 0,
                noShow.no_show_count || 0,
                noShow.revenue_loss || 0,
                `"${noShow.impact_level || ''}"`,
                
                // 8. Information Rate
                info.percentage || 0,
                info.info_requests || 0,
                info.total_conversations || 0,
                
                // 9. Spam Rate
                spam.percentage || 0,
                spam.spam_count || 0,
                spam.total_conversations || 0,
                
                // 10. AI Interaction
                aiInt.total_interactions || 0,
                aiInt.avg_interactions_per_session || 0,
                aiInt.sessions_count || 0,
                aiInt.interaction_quality || 0,
                
                // 11. Avg Minutes per Conversation
                avgMin.minutes || 0,
                avgMin.total_minutes || 0,
                `"${avgMin.efficiency_score || ''}"`,
                
                // 12. Avg Cost USD
                avgCost.cost_usd || 0,
                avgCost.cost_brl || 0,
                avgCost.exchange_rate || 5.5,
                
                // 13. Total Cost USD
                totalCost.total_usd || 0,
                totalCost.total_brl || 0,
                totalCost.appointments_count || 0,
                
                // 14. Total Unique Customers
                uniqueCust.count || 0,
                uniqueCust.with_appointments || 0,
                uniqueCust.customer_retention || 0,
                
                // 15. Total Professionals
                totalProf.count || 0,
                totalProf.active_professionals || 0,
                totalProf.avg_appointments_per_professional || 0,
                
                // 16. New Customers
                newCust.count || 0,
                `"${newCust.growth_rate || ''}"`,
                `"${newCust.acquisition_source || ''}"`,
                
                // 17. Customer Recurrence
                custRec.recurring_customers || 0,
                custRec.recurrence_rate || 0,
                custRec.avg_appointments_per_customer || 0,
                
                // 18. AI Failure Confidence
                aiFailure.avg_confidence || 0,
                aiFailure.failure_count || 0,
                `"${aiFailure.confidence_level || ''}"`,
                
                // 19. Conversation Outcome Analysis
                convOutcome.total_conversations || 0,
                convOutcome.success_outcomes || 0,
                Object.keys(convOutcome.outcomes || {}).length,
                
                // 20. Historical Revenue Analysis
                histRevenue.total_revenue || 0,
                histRevenue.daily_average || 0,
                Object.keys(histRevenue.revenue_by_day || {}).length,
                
                // 21. Services Analysis
                servicesAnal.services_offered || 0,
                `"${servicesAnal.most_popular_service || ''}"`,
                servicesAnal.services_offered || 0,
                
                // 22. Channel Separation
                channelSep.total_appointments || 0,
                `"${channelSep.primary_channel || ''}"`,
                Object.keys(channelSep.channels || {}).length,
                
                // 23. Revenue by Professional
                revProf.total_revenue || 0,
                `"${revProf.top_earner ? revProf.top_earner[0] : ''}"`,
                Object.keys(revProf.professionals || {}).length,
                
                // 24. Revenue by Service
                revServ.total_revenue || 0,
                `"${revServ.top_service ? revServ.top_service[0] : ''}"`,
                Object.keys(revServ.services || {}).length,
                
                // 25. Monthly Revenue Tracking
                monthlyRev.current_month_revenue || 0,
                `"${monthlyRev.revenue_trend || ''}"`,
                Object.keys(monthlyRev.monthly_breakdown || {}).length,
                
                // 26. Custo Plataforma
                custoPlat.custo_total_brl || 0,
                `"${custoPlat.plano_usado || ''}"`,
                custoPlat.conversas_contabilizadas || 0,
                custoPlat.custo_por_conversa || 0,
                
                // Full JSON backup
                `"${JSON.stringify(metric.metric_data || {}).replace(/"/g, '""')}"`
                
            ].join(','));
        }
        
        // Generate filename
        const timestamp = new Date().toISOString()
            .replace(/T/, 'T')
            .replace(/:/g, '')
            .replace(/\..+/, '')
            .substring(0, 15);
        
        const filename = `EXPANDED-26-METRICS-${timestamp}.csv`;
        
        // Write CSV
        fs.writeFileSync(filename, csvRows.join('\n'), 'utf8');
        
        console.log(`\n✅ EXPANDED CSV (26 Metrics) Generated: ${filename}`);
        console.log(`📊 Total Records: ${csvRows.length - 1}`);
        console.log(`📋 Total Columns: ${csvRows[0].split(',').length}`);
        console.log(`🎯 Metrics per record: 26 (todas as métricas expandidas!)`);
        
        // Show sample data
        console.log(`\n🎯 SAMPLE EXPANDED DATA:`);
        if (metrics.length > 0) {
            const sample = metrics[0];
            const tenant = tenantLookup[sample.tenant_id];
            const data = sample.metric_data || {};
            
            console.log(`   Tenant: ${tenant?.name || 'Unknown'} (${sample.period})`);
            console.log(`   Risk Score: ${data.summary_kpis?.risk_score || 0}%`);
            console.log(`   AI Efficiency: ${data.ai_efficiency?.percentage || 0}%`);
            console.log(`   Total Revenue: R$${data.historical_revenue_analysis?.total_revenue || 0}`);
            console.log(`   Platform Cost: R$${data.custo_plataforma?.custo_total_brl || 0}`);
            console.log(`   Total Metrics: 26 (todos os scripts incorporados!)`);
        }
        
        console.log(`\n🎊 PERFECT FOR ANALYSIS:`);
        console.log(`   📈 Todas as 26 métricas como colunas separadas`);
        console.log(`   📊 2 métricas validadas + 24 dos scripts individuais`);
        console.log(`   🔍 Nomes originais dos scripts mantidos`);
        console.log(`   📋 Pronto para análise no Excel/Google Sheets!`);
        
        return filename;
        
    } catch (error) {
        console.error('❌ Error generating expanded CSV:', error.message);
        throw error;
    }
}

// Run generator
if (require.main === module) {
    generateExpandedCSV26Metrics().then((filename) => {
        console.log(`\n🎉 SUCCESS: ${filename} com todas as 26 métricas expandidas!`);
        console.log('📁 Agora você tem TODAS as métricas dos scripts individuais incorporadas!');
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { generateExpandedCSV26Metrics };