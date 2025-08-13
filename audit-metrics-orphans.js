#!/usr/bin/env node

/**
 * AUDIT METRICS ORPHANS
 * Purpose: Identify all orphaned records in metrics tables
 * Author: Claude Programmer/Executor
 * Date: 2025-07-17
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function auditMetricsOrphans() {
    console.log('🔍 AUDIT METRICS ORPHANS - STARTING...');
    console.log('==========================================\n');
    
    const auditResults = {
        timestamp: new Date().toISOString(),
        summary: {
            total_orphaned_records: 0,
            tables_analyzed: 0,
            critical_issues: 0
        },
        detailed_findings: {}
    };

    try {
        // 1. AUDIT TENANT_METRICS TABLE
        console.log('1. 📊 AUDITING TENANT_METRICS TABLE...');
        
        const { data: tenantMetrics, error: tmError } = await supabase
            .from('tenant_metrics')
            .select('*')
            .limit(1000);
        
        if (tmError) {
            console.error('❌ Error fetching tenant_metrics:', tmError.message);
            auditResults.detailed_findings.tenant_metrics = { error: tmError.message };
        } else {
            // Check for orphaned tenant_metrics (tenant_id not in tenants table)
            const tenantIds = [...new Set(tenantMetrics.map(tm => tm.tenant_id))];
            
            const { data: validTenants, error: tenantsError } = await supabase
                .from('tenants')
                .select('id')
                .in('id', tenantIds);
            
            if (tenantsError) {
                console.error('❌ Error fetching tenants:', tenantsError.message);
            } else {
                const validTenantIds = new Set(validTenants.map(t => t.id));
                const orphanedTenantMetrics = tenantMetrics.filter(tm => !validTenantIds.has(tm.tenant_id));
                
                auditResults.detailed_findings.tenant_metrics = {
                    total_records: tenantMetrics.length,
                    orphaned_records: orphanedTenantMetrics.length,
                    orphaned_percentage: ((orphanedTenantMetrics.length / tenantMetrics.length) * 100).toFixed(2),
                    sample_orphaned: orphanedTenantMetrics.slice(0, 3).map(tm => ({
                        id: tm.id,
                        tenant_id: tm.tenant_id,
                        metric_type: tm.metric_type,
                        period: tm.period,
                        calculated_at: tm.calculated_at
                    })),
                    unique_orphaned_tenant_ids: [...new Set(orphanedTenantMetrics.map(tm => tm.tenant_id))]
                };
                
                auditResults.summary.total_orphaned_records += orphanedTenantMetrics.length;
                if (orphanedTenantMetrics.length > 0) auditResults.summary.critical_issues++;
                
                console.log(`   📊 Total records: ${tenantMetrics.length}`);
                console.log(`   ⚠️  Orphaned records: ${orphanedTenantMetrics.length} (${auditResults.detailed_findings.tenant_metrics.orphaned_percentage}%)`);
                console.log(`   🔍 Unique orphaned tenant IDs: ${auditResults.detailed_findings.tenant_metrics.unique_orphaned_tenant_ids.length}`);
            }
        }
        
        // 2. AUDIT PLATFORM_METRICS TABLE
        console.log('\n2. 🏢 AUDITING PLATFORM_METRICS TABLE...');
        
        const { data: platformMetrics, error: pmError } = await supabase
            .from('platform_metrics')
            .select('*')
            .limit(1000);
        
        if (pmError) {
            console.error('❌ Error fetching platform_metrics:', pmError.message);
            auditResults.detailed_findings.platform_metrics = { error: pmError.message };
        } else {
            // Check for inconsistencies in platform_metrics
            const inconsistencies = [];
            
            platformMetrics.forEach(pm => {
                const data = pm.metric_data || {};
                
                // Check for missing required fields
                if (!data.total_revenue && !data.mrr) {
                    inconsistencies.push({
                        id: pm.id,
                        issue: 'Missing revenue data',
                        period: pm.period,
                        calculated_at: pm.calculated_at
                    });
                }
                
                // Check for negative values
                if (data.total_revenue < 0 || data.mrr < 0) {
                    inconsistencies.push({
                        id: pm.id,
                        issue: 'Negative revenue values',
                        period: pm.period,
                        calculated_at: pm.calculated_at
                    });
                }
            });
            
            auditResults.detailed_findings.platform_metrics = {
                total_records: platformMetrics.length,
                inconsistent_records: inconsistencies.length,
                inconsistent_percentage: ((inconsistencies.length / platformMetrics.length) * 100).toFixed(2),
                sample_inconsistencies: inconsistencies.slice(0, 3),
                periods_analyzed: [...new Set(platformMetrics.map(pm => pm.period))],
                latest_calculation: platformMetrics.reduce((latest, pm) => 
                    new Date(pm.calculated_at) > new Date(latest) ? pm.calculated_at : latest, 
                    platformMetrics[0]?.calculated_at || null
                )
            };
            
            auditResults.summary.total_orphaned_records += inconsistencies.length;
            if (inconsistencies.length > 0) auditResults.summary.critical_issues++;
            
            console.log(`   📊 Total records: ${platformMetrics.length}`);
            console.log(`   ⚠️  Inconsistent records: ${inconsistencies.length} (${auditResults.detailed_findings.platform_metrics.inconsistent_percentage}%)`);
            console.log(`   📅 Periods analyzed: ${auditResults.detailed_findings.platform_metrics.periods_analyzed.join(', ')}`);
        }
        
        // 3. AUDIT USAGE_COSTS (if table exists)
        console.log('\n3. 💰 AUDITING USAGE_COSTS TABLE...');
        
        const { data: usageCosts, error: ucError } = await supabase
            .from('usage_costs')
            .select('*')
            .limit(1000);
        
        if (ucError) {
            console.log('   ℹ️  usage_costs table not found or empty');
            auditResults.detailed_findings.usage_costs = { 
                status: 'not_found_or_empty',
                error: ucError.message 
            };
        } else {
            // Check for orphaned usage_costs (conversation_id not in conversation_history)
            const conversationIds = [...new Set(usageCosts.map(uc => uc.conversation_id).filter(Boolean))];
            
            if (conversationIds.length > 0) {
                const { data: validConversations, error: convError } = await supabase
                    .from('conversation_history')
                    .select('id')
                    .in('id', conversationIds);
                
                if (convError) {
                    console.error('❌ Error fetching conversation_history:', convError.message);
                } else {
                    const validConversationIds = new Set(validConversations.map(c => c.id));
                    const orphanedUsageCosts = usageCosts.filter(uc => 
                        uc.conversation_id && !validConversationIds.has(uc.conversation_id)
                    );
                    
                    auditResults.detailed_findings.usage_costs = {
                        total_records: usageCosts.length,
                        orphaned_records: orphanedUsageCosts.length,
                        orphaned_percentage: ((orphanedUsageCosts.length / usageCosts.length) * 100).toFixed(2),
                        sample_orphaned: orphanedUsageCosts.slice(0, 3).map(uc => ({
                            id: uc.id,
                            conversation_id: uc.conversation_id,
                            cost_usd: uc.cost_usd,
                            created_at: uc.created_at
                        })),
                        records_without_conversation_id: usageCosts.filter(uc => !uc.conversation_id).length
                    };
                    
                    auditResults.summary.total_orphaned_records += orphanedUsageCosts.length;
                    if (orphanedUsageCosts.length > 0) auditResults.summary.critical_issues++;
                    
                    console.log(`   📊 Total records: ${usageCosts.length}`);
                    console.log(`   ⚠️  Orphaned records: ${orphanedUsageCosts.length} (${auditResults.detailed_findings.usage_costs.orphaned_percentage}%)`);
                    console.log(`   🔍 Records without conversation_id: ${auditResults.detailed_findings.usage_costs.records_without_conversation_id}`);
                }
            } else {
                auditResults.detailed_findings.usage_costs = {
                    total_records: usageCosts.length,
                    orphaned_records: 0,
                    orphaned_percentage: '0.00',
                    note: 'No conversation_id references found'
                };
                
                console.log(`   📊 Total records: ${usageCosts.length}`);
                console.log(`   ℹ️  No conversation_id references found`);
            }
        }
        
        // 4. AUDIT UBS_METRIC_SYSTEM (deprecated table check)
        console.log('\n4. 🗄️  CHECKING DEPRECATED UBS_METRIC_SYSTEM TABLE...');
        
        const { data: ubsMetrics, error: ubsError } = await supabase
            .from('ubs_metric_system')
            .select('*')
            .limit(10);
        
        if (ubsError) {
            console.log('   ✅ ubs_metric_system table not found (good - deprecated)');
            auditResults.detailed_findings.ubs_metric_system = { 
                status: 'not_found_deprecated',
                note: 'This table should not exist in current schema'
            };
        } else {
            auditResults.detailed_findings.ubs_metric_system = {
                status: 'found_deprecated',
                total_records: ubsMetrics.length,
                warning: 'This table should be removed as it is deprecated',
                sample_records: ubsMetrics.slice(0, 3)
            };
            
            auditResults.summary.critical_issues++;
            
            console.log(`   ⚠️  DEPRECATED TABLE FOUND: ${ubsMetrics.length} records`);
            console.log('   💡 This table should be removed from schema');
        }
        
        // UPDATE SUMMARY
        auditResults.summary.tables_analyzed = 4;
        
        // 5. GENERATE REPORT
        console.log('\n📊 GENERATING AUDIT REPORT...');
        
        const reportPath = path.join(process.cwd(), 'audit-reports');
        if (!fs.existsSync(reportPath)) {
            fs.mkdirSync(reportPath, { recursive: true });
        }
        
        const fileName = `metrics-orphans-audit-${new Date().toISOString().split('T')[0]}.json`;
        const fullPath = path.join(reportPath, fileName);
        
        fs.writeFileSync(fullPath, JSON.stringify(auditResults, null, 2));
        
        console.log(`   ✅ Report saved to: ${fullPath}`);
        
        // 6. FINAL SUMMARY
        console.log('\n🎯 AUDIT SUMMARY:');
        console.log('==================');
        console.log(`📊 Tables analyzed: ${auditResults.summary.tables_analyzed}`);
        console.log(`⚠️  Total orphaned records: ${auditResults.summary.total_orphaned_records}`);
        console.log(`🚨 Critical issues found: ${auditResults.summary.critical_issues}`);
        
        if (auditResults.summary.critical_issues > 0) {
            console.log('\n🔥 CRITICAL ISSUES DETECTED:');
            if (auditResults.detailed_findings.tenant_metrics?.orphaned_records > 0) {
                console.log(`   - ${auditResults.detailed_findings.tenant_metrics.orphaned_records} orphaned tenant_metrics records`);
            }
            if (auditResults.detailed_findings.platform_metrics?.inconsistent_records > 0) {
                console.log(`   - ${auditResults.detailed_findings.platform_metrics.inconsistent_records} inconsistent platform_metrics records`);
            }
            if (auditResults.detailed_findings.usage_costs?.orphaned_records > 0) {
                console.log(`   - ${auditResults.detailed_findings.usage_costs.orphaned_records} orphaned usage_costs records`);
            }
            if (auditResults.detailed_findings.ubs_metric_system?.status === 'found_deprecated') {
                console.log(`   - Deprecated ubs_metric_system table found`);
            }
        } else {
            console.log('\n✅ NO CRITICAL ISSUES DETECTED');
        }
        
        return auditResults;
        
    } catch (error) {
        console.error('❌ AUDIT FAILED:', error.message);
        auditResults.error = error.message;
        return auditResults;
    }
}

// Execute audit
auditMetricsOrphans()
    .then(results => {
        console.log('\n🏁 AUDIT COMPLETED');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 AUDIT CRASHED:', error.message);
        process.exit(1);
    });