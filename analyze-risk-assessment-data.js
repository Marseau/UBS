/**
 * Analyze Risk Assessment Data - Check appointment sources by tenant and period
 * Shows data BEFORE implementing the risk assessment logic
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
 * Analyze appointment sources for risk assessment calculation
 */
async function analyzeRiskAssessmentData() {
    try {
        console.log('🔍 ANÁLISE DE DADOS PARA RISK ASSESSMENT');
        console.log('═'.repeat(70));
        
        // Get active tenants
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active')
            .limit(5); // Limit for analysis
        
        if (tenantsError) throw tenantsError;
        
        console.log(`📊 Analisando ${tenants?.length || 0} tenants ativos:\n`);
        
        const periods = ['7d', '30d', '90d'];
        const results = [];
        
        for (const tenant of tenants || []) {
            console.log(`🏢 TENANT: ${tenant.business_name} (${tenant.id.substring(0, 8)})`);
            console.log('─'.repeat(60));
            
            const tenantResults = {
                tenant_id: tenant.id,
                tenant_name: tenant.business_name,
                periods: {}
            };
            
            for (const period of periods) {
                const periodDays = parseInt(period.replace('d', ''));
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - periodDays);
                
                console.log(`\n📅 Período: ${period} (últimos ${periodDays} dias)`);
                console.log(`   Data inicial: ${startDate.toISOString().split('T')[0]}`);
                
                // Get appointments with appointment_data
                const { data: appointments, error: appointmentsError } = await supabase
                    .from('appointments')
                    .select('id, appointment_data, created_at, status')
                    .eq('tenant_id', tenant.id)
                    .gte('created_at', startDate.toISOString())
                    .lte('created_at', new Date().toISOString())
                    .order('created_at', { ascending: false });
                
                if (appointmentsError) {
                    console.log(`   ❌ Erro ao buscar appointments: ${appointmentsError.message}`);
                    continue;
                }
                
                if (!appointments || appointments.length === 0) {
                    console.log(`   📊 Nenhum appointment encontrado no período ${period}`);
                    tenantResults.periods[period] = {
                        total: 0,
                        whatsapp: 0,
                        google_calendar: 0,
                        unknown: 0,
                        whatsapp_percentage: 0,
                        google_calendar_percentage: 0,
                        risk_score: 0,
                        risk_level: 'No Data'
                    };
                    continue;
                }
                
                console.log(`   📊 Total appointments: ${appointments.length}`);
                
                // Analyze sources
                let whatsappCount = 0;
                let googleCalendarCount = 0;
                let unknownCount = 0;
                let samplesShown = 0;
                
                appointments.forEach(appointment => {
                    const appointmentData = appointment.appointment_data || {};
                    const source = appointmentData.source;
                    
                    if (source === 'whatsapp') {
                        whatsappCount++;
                    } else if (source === 'google_calendar') {
                        googleCalendarCount++;
                    } else {
                        unknownCount++;
                        // Show sample of unknown sources
                        if (samplesShown < 3) {
                            console.log(`   🔍 Sample unknown source: ${JSON.stringify(appointmentData)}`);
                            samplesShown++;
                        }
                    }
                });
                
                const total = appointments.length;
                const whatsappPercentage = total > 0 ? (whatsappCount / total) * 100 : 0;
                const googleCalendarPercentage = total > 0 ? (googleCalendarCount / total) * 100 : 0;
                const unknownPercentage = total > 0 ? (unknownCount / total) * 100 : 0;
                
                // Calculate risk score (based on external dependency)
                const riskScore = googleCalendarPercentage;
                let riskLevel = 'Unknown';
                
                if (riskScore <= 10) riskLevel = 'Minimal Risk';
                else if (riskScore <= 30) riskLevel = 'Low Risk';
                else if (riskScore <= 60) riskLevel = 'Medium Risk';
                else if (riskScore <= 80) riskLevel = 'High Risk';
                else riskLevel = 'Critical Risk';
                
                console.log(`   📈 WhatsApp (SaaS): ${whatsappCount} (${whatsappPercentage.toFixed(1)}%)`);
                console.log(`   📅 Google Calendar: ${googleCalendarCount} (${googleCalendarPercentage.toFixed(1)}%)`);
                console.log(`   ❓ Unknown/Other: ${unknownCount} (${unknownPercentage.toFixed(1)}%)`);
                console.log(`   🎯 Risk Score: ${riskScore.toFixed(1)}% - ${riskLevel}`);
                
                tenantResults.periods[period] = {
                    total: total,
                    whatsapp: whatsappCount,
                    google_calendar: googleCalendarCount,
                    unknown: unknownCount,
                    whatsapp_percentage: Number(whatsappPercentage.toFixed(1)),
                    google_calendar_percentage: Number(googleCalendarPercentage.toFixed(1)),
                    unknown_percentage: Number(unknownPercentage.toFixed(1)),
                    risk_score: Number(riskScore.toFixed(1)),
                    risk_level: riskLevel
                };
            }
            
            results.push(tenantResults);
            console.log('\n' + '═'.repeat(70) + '\n');
        }
        
        // Summary table
        console.log('📊 RESUMO GERAL POR TENANT E PERÍODO');
        console.log('═'.repeat(70));
        console.log('Tenant'.padEnd(20) + '| Period | Total | WhatsApp% | Google% | Risk Level');
        console.log('─'.repeat(70));
        
        results.forEach(tenant => {
            const shortName = tenant.tenant_name.substring(0, 18);
            periods.forEach(period => {
                const data = tenant.periods[period];
                const line = shortName.padEnd(20) + 
                           `| ${period.padEnd(6)} | ${data.total.toString().padEnd(5)} | ` +
                           `${data.whatsapp_percentage}%`.padEnd(9) + ' | ' +
                           `${data.google_calendar_percentage}%`.padEnd(7) + ' | ' +
                           data.risk_level;
                console.log(line);
            });
            console.log('─'.repeat(70));
        });
        
        // Risk distribution analysis
        console.log('\n🎯 ANÁLISE DE DISTRIBUIÇÃO DE RISCO');
        console.log('═'.repeat(70));
        
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
            periods.forEach(period => {
                const riskLevel = tenant.periods[period].risk_level;
                riskDistribution[riskLevel]++;
                totalMeasurements++;
            });
        });
        
        console.log('Distribuição de Risco:');
        Object.entries(riskDistribution).forEach(([level, count]) => {
            const percentage = totalMeasurements > 0 ? (count / totalMeasurements) * 100 : 0;
            console.log(`   ${level}: ${count} (${percentage.toFixed(1)}%)`);
        });
        
        console.log('\n💡 OBSERVAÇÕES PARA VALIDAÇÃO:');
        console.log('─'.repeat(50));
        console.log('1. Risk Score = % de appointments via Google Calendar');
        console.log('2. Quanto maior o %, maior a dependência externa');
        console.log('3. Maior dependência externa = Maior risco de churn');
        console.log('4. Tenants com 90%+ WhatsApp são mais "presos" ao SaaS');
        console.log('5. Tenants com 80%+ Google Calendar podem sair facilmente');
        
        return results;
        
    } catch (error) {
        console.error('❌ Erro na análise:', error);
        throw error;
    }
}

// Execute analysis
if (require.main === module) {
    analyzeRiskAssessmentData()
        .then((results) => {
            console.log('\n✅ Análise concluída!');
            console.log(`📋 Dados analisados para ${results.length} tenants`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Análise falhou:', error);
            process.exit(1);
        });
}

module.exports = { analyzeRiskAssessmentData };