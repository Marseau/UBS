/**
 * Test Risk Assessment - Correct Implementation
 * Calculates risk based on external dependency (google_calendar vs SaaS sources)
 * Following the pattern of the other 23 validated metrics
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        db: { schema: 'public' }
    }
);

/**
 * Calculate Risk Assessment for a tenant by period
 */
async function calculateRiskAssessment(tenantId, periodDays) {
    try {
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);
        
        console.log(`📅 Period: ${periodDays}d (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);
        
        // Query appointments with appointment_data - filter by start_time (when appointment will happen)
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('appointment_data, start_time, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate.toISOString())
            .lte('start_time', endDate.toISOString());
        
        if (error) {
            throw error;
        }
        
        if (!appointments || appointments.length === 0) {
            return {
                period: `${periodDays}d`,
                total_appointments: 0,
                saas_appointments: 0,
                external_appointments: 0,
                saas_percentage: 0,
                external_percentage: 0,
                risk_score: 0,
                risk_level: 'No Data',
                risk_category: 'no_data'
            };
        }
        
        // Count appointments by source
        let saasCount = 0;      // whatsapp, whatsapp_ai, whatsapp_conversation (internal SaaS)
        let externalCount = 0;  // google_calendar (external)
        let unknownCount = 0;   // other sources
        
        const sourceCounts = {};
        
        appointments.forEach(appointment => {
            const appointmentData = appointment.appointment_data || {};
            const source = appointmentData.source;
            
            // Count sources for analysis
            sourceCounts[source || 'no_source'] = (sourceCounts[source || 'no_source'] || 0) + 1;
            
            // Classify sources
            if (source === 'google_calendar') {
                externalCount++;
            } else if (source === 'whatsapp' || source === 'whatsapp_ai' || source === 'whatsapp_conversation') {
                saasCount++;
            } else {
                unknownCount++;
                // Treat unknown as SaaS (conservative approach - if we don't know, assume it's our system)
                saasCount++;
            }
        });
        
        const totalAppointments = appointments.length;
        const saasPercentage = totalAppointments > 0 ? (saasCount / totalAppointments) * 100 : 0;
        const externalPercentage = totalAppointments > 0 ? (externalCount / totalAppointments) * 100 : 0;
        
        // Risk Score = External Dependency (higher external % = higher risk)
        const riskScore = externalPercentage;
        
        // Risk Level Classification
        let riskLevel, riskCategory;
        if (riskScore <= 10) {
            riskLevel = 'Minimal Risk';
            riskCategory = 'minimal';
        } else if (riskScore <= 30) {
            riskLevel = 'Low Risk';
            riskCategory = 'low';
        } else if (riskScore <= 60) {
            riskLevel = 'Medium Risk';
            riskCategory = 'medium';
        } else if (riskScore <= 80) {
            riskLevel = 'High Risk';
            riskCategory = 'high';
        } else {
            riskLevel = 'Critical Risk';
            riskCategory = 'critical';
        }
        
        console.log(`   Total: ${totalAppointments} appointments`);
        console.log(`   SaaS: ${saasCount} (${saasPercentage.toFixed(1)}%)`);
        console.log(`   External: ${externalCount} (${externalPercentage.toFixed(1)}%)`);
        console.log(`   Risk Score: ${riskScore.toFixed(1)}% - ${riskLevel}`);
        
        // Show source breakdown for debugging
        console.log(`   Source breakdown:`, sourceCounts);
        
        return {
            period: `${periodDays}d`,
            total_appointments: totalAppointments,
            saas_appointments: saasCount,
            external_appointments: externalCount,
            saas_percentage: Number(saasPercentage.toFixed(1)),
            external_percentage: Number(externalPercentage.toFixed(1)),
            risk_score: Number(riskScore.toFixed(1)),
            risk_level: riskLevel,
            risk_category: riskCategory,
            source_breakdown: sourceCounts
        };
        
    } catch (error) {
        console.error(`❌ Error calculating risk assessment for ${periodDays}d:`, error);
        return null;
    }
}

/**
 * Test Risk Assessment for multiple tenants and periods
 */
async function testRiskAssessment() {
    try {
        console.log('🎯 TESTE RISK ASSESSMENT - DEPENDÊNCIA EXTERNA');
        console.log('═'.repeat(70));
        
        // Get active tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active'); // All active tenants
        
        if (tenantsError) throw tenantsError;
        
        console.log(`📊 Testando ${tenants?.length || 0} tenants:\n`);
        
        const periods = [7, 30, 90]; // periods in days
        const results = [];
        
        for (const tenant of tenants || []) {
            console.log(`🏢 TENANT: ${tenant.business_name}`);
            console.log('─'.repeat(60));
            
            const tenantResults = {
                tenant_id: tenant.id,
                tenant_name: tenant.business_name,
                periods: {}
            };
            
            for (const periodDays of periods) {
                const result = await calculateRiskAssessment(tenant.id, periodDays);
                if (result) {
                    tenantResults.periods[result.period] = result;
                }
            }
            
            results.push(tenantResults);
            console.log('\n' + '═'.repeat(70) + '\n');
        }
        
        // Summary table
        console.log('📊 RESUMO FINAL - RISK ASSESSMENT');
        console.log('═'.repeat(70));
        console.log('Tenant'.padEnd(20) + '| Period | Total | SaaS% | Ext% | Risk Level');
        console.log('─'.repeat(70));
        
        results.forEach(tenant => {
            const shortName = tenant.tenant_name.substring(0, 18);
            periods.forEach(periodDays => {
                const periodKey = `${periodDays}d`;
                const data = tenant.periods[periodKey];
                if (data) {
                    const line = shortName.padEnd(20) + 
                               `| ${periodKey.padEnd(6)} | ${data.total_appointments.toString().padEnd(5)} | ` +
                               `${data.saas_percentage}%`.padEnd(5) + ' | ' +
                               `${data.external_percentage}%`.padEnd(4) + ' | ' +
                               data.risk_level;
                    console.log(line);
                }
            });
            console.log('─'.repeat(70));
        });
        
        // Risk distribution
        console.log('\n🎯 DISTRIBUIÇÃO DE RISCO:');
        console.log('═'.repeat(50));
        
        const riskDistribution = {
            'Minimal Risk': 0,
            'Low Risk': 0,
            'Medium Risk': 0,
            'High Risk': 0,
            'Critical Risk': 0,
            'No Data': 0
        };
        
        let totalMeasurements = 0;
        results.forEach(tenant => {
            Object.values(tenant.periods).forEach(period => {
                riskDistribution[period.risk_level]++;
                totalMeasurements++;
            });
        });
        
        Object.entries(riskDistribution).forEach(([level, count]) => {
            const percentage = totalMeasurements > 0 ? (count / totalMeasurements) * 100 : 0;
            console.log(`   ${level}: ${count} (${percentage.toFixed(1)}%)`);
        });
        
        console.log('\n💡 INTERPRETAÇÃO:');
        console.log('─'.repeat(50));
        console.log('• Risk Score = % de appointments via Google Calendar');
        console.log('• Maior % Google = Maior dependência externa = Maior risco');
        console.log('• Tenants com alta dependência do SaaS têm menor risco de churn');
        console.log('• 0-10% external = Minimal Risk (90-100% dependência SaaS)');
        console.log('• 11-30% external = Low Risk (70-89% dependência SaaS)');
        console.log('• 31-60% external = Medium Risk (40-69% dependência SaaS)');
        console.log('• 61-80% external = High Risk (20-39% dependência SaaS)');
        console.log('• 81-100% external = Critical Risk (0-19% dependência SaaS)');
        
        return results;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

// Execute test if called directly
if (require.main === module) {
    testRiskAssessment()
        .then((results) => {
            console.log('\n✅ Risk Assessment test completed successfully!');
            console.log(`📊 Analyzed ${results.length} tenants across 3 periods`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Risk Assessment test failed:', error);
            process.exit(1);
        });
}

module.exports = { testRiskAssessment, calculateRiskAssessment };