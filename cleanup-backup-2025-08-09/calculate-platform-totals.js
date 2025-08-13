/**
 * Totalização da Plataforma por Períodos e Canais
 * Context Engineering COLEAM00 - Agregação total de todos os tenants
 */

require('dotenv').config();
const { MetricsAnalysisService, MetricsPeriod } = require('./dist/services/services/metrics-analysis.service.js');
const { getAdminClient } = require('./dist/config/database.js');

async function calculatePlatformTotals() {
    console.log('🌐 TOTALIZAÇÃO DA PLATAFORMA POR PERÍODOS E CANAIS');
    console.log('Context Engineering COLEAM00 - Agregação Total de Todos os Tenants');  
    console.log('=' .repeat(80));

    try {
        const supabase = getAdminClient();
        const analysisService = MetricsAnalysisService.getInstance();
        
        // Buscar todos os tenants ativos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, business_name, domain, status')
            .eq('status', 'active');

        if (error) {
            throw new Error(`Erro ao buscar tenants: ${error.message}`);
        }

        console.log(`📊 Analisando ${tenants.length} tenants ativos`);
        console.log('-'.repeat(80));

        const periods = [
            { period: MetricsPeriod.SEVEN_DAYS, name: '7 DIAS', days: 7 },
            { period: MetricsPeriod.THIRTY_DAYS, name: '30 DIAS', days: 30 },
            { period: MetricsPeriod.NINETY_DAYS, name: '90 DIAS', days: 90 }
        ];

        // Estrutura para armazenar totais
        const platformTotals = {};

        for (const periodInfo of periods) {
            console.log(`\n📅 PROCESSANDO PERÍODO: ${periodInfo.name}`);
            console.log('-'.repeat(50));

            let totalAppointments = 0;
            let totalInternos = 0;
            let totalExternos = 0;
            let totalWhatsAppIA = 0;
            let totalCompleted = 0;
            let totalRevenue = 0;
            let totalCustomers = new Set();
            let activeTenants = 0;

            // Detalhes por tenant
            const tenantResults = [];

            for (const tenant of tenants) {
                try {
                    const metrics = await analysisService.analyzeAppointments(tenant.id, periodInfo.period);
                    
                    if (metrics.total_appointments > 0) {
                        activeTenants++;
                        
                        totalAppointments += metrics.total_appointments;
                        totalInternos += metrics.internal_appointments.total;
                        totalExternos += metrics.external_appointments.total;
                        totalWhatsAppIA += metrics.whatsapp_ai_appointments.total;
                        totalCompleted += metrics.completed_appointments;
                        totalRevenue += metrics.total_revenue;
                        
                        tenantResults.push({
                            name: tenant.business_name,
                            domain: tenant.domain,
                            total: metrics.total_appointments,
                            internos: metrics.internal_appointments.total,
                            externos: metrics.external_appointments.total,
                            whatsapp_ia: metrics.whatsapp_ai_appointments.total,
                            completed: metrics.completed_appointments,
                            revenue: metrics.total_revenue,
                            success_rate: metrics.appointment_success_rate
                        });

                        console.log(`   ${tenant.business_name}: ${metrics.total_appointments} total (${metrics.internal_appointments.total} internos + ${metrics.external_appointments.total} externos)`);
                    }
                } catch (error) {
                    console.error(`❌ Erro ao processar tenant ${tenant.business_name}:`, error.message);
                }
            }

            // Calcular métricas derivadas
            const platformSuccessRate = totalAppointments > 0 ? (totalCompleted / totalAppointments) * 100 : 0;
            const internosPercentage = totalAppointments > 0 ? (totalInternos / totalAppointments) * 100 : 0;
            const externosPercentage = totalAppointments > 0 ? (totalExternos / totalAppointments) * 100 : 0;

            platformTotals[periodInfo.name] = {
                period: periodInfo.name,
                days: periodInfo.days,
                totalAppointments,
                totalInternos,
                totalExternos,
                totalWhatsAppIA,
                totalCompleted,
                totalRevenue,
                activeTenants,
                platformSuccessRate,
                internosPercentage,
                externosPercentage,
                tenantResults
            };

            console.log(`\n📈 RESUMO ${periodInfo.name}:`);
            console.log(`   📅 Total Appointments: ${totalAppointments}`);
            console.log(`   🏠 Internos: ${totalInternos} (${internosPercentage.toFixed(1)}%)`);
            console.log(`   🌐 Externos: ${totalExternos} (${externosPercentage.toFixed(1)}%)`);
            console.log(`   🤖 WhatsApp/IA: ${totalWhatsAppIA}`);
            console.log(`   ✅ Completed: ${totalCompleted} (${platformSuccessRate.toFixed(1)}%)`);
            console.log(`   💰 Revenue: R$ ${totalRevenue.toFixed(2)}`);
            console.log(`   🏢 Tenants Ativos: ${activeTenants}/${tenants.length}`);
        }

        // Tabela comparativa final
        console.log('\n\n📊 TABELA COMPARATIVA DA PLATAFORMA');
        console.log('=' .repeat(80));
        console.log('| PERÍODO | TOTAL | INTERNOS | EXTERNOS | WHATSAPP/IA | SUCCESS % | REVENUE |');
        console.log('|---------|-------|----------|----------|-------------|-----------|---------|');

        for (const periodName of ['7 DIAS', '30 DIAS', '90 DIAS']) {
            const data = platformTotals[periodName];
            console.log(`| ${periodName.padEnd(7)} | ${String(data.totalAppointments).padEnd(5)} | ${String(data.totalInternos).padEnd(8)} | ${String(data.totalExternos).padEnd(8)} | ${String(data.totalWhatsAppIA).padEnd(11)} | ${data.platformSuccessRate.toFixed(1).padEnd(9)} | ${data.totalRevenue.toFixed(0).padEnd(7)} |`);
        }

        // Análise de crescimento
        console.log('\n\n📈 ANÁLISE DE CRESCIMENTO');
        console.log('=' .repeat(50));

        const crescimento30vs7 = platformTotals['30 DIAS'].totalAppointments - platformTotals['7 DIAS'].totalAppointments;
        const crescimento90vs30 = platformTotals['90 DIAS'].totalAppointments - platformTotals['30 DIAS'].totalAppointments;

        console.log(`📊 Crescimento 30d vs 7d: ${crescimento30vs7 >= 0 ? '+' : ''}${crescimento30vs7} appointments`);
        console.log(`📊 Crescimento 90d vs 30d: ${crescimento90vs30 >= 0 ? '+' : ''}${crescimento90vs30} appointments`);

        // Top tenants por período
        console.log('\n\n🏆 TOP 5 TENANTS POR PERÍODO');
        console.log('=' .repeat(50));

        for (const periodName of ['7 DIAS', '30 DIAS', '90 DIAS']) {
            const data = platformTotals[periodName];
            const topTenants = data.tenantResults
                .sort((a, b) => b.total - a.total)
                .slice(0, 5);

            console.log(`\n🏅 TOP 5 - ${periodName}:`);
            topTenants.forEach((tenant, index) => {
                console.log(`   ${index + 1}. ${tenant.name}: ${tenant.total} appointments (${tenant.internos}I + ${tenant.externos}E) - R$ ${tenant.revenue.toFixed(0)}`);
            });
        }

        console.log('\n\n✅ TOTALIZAÇÃO DA PLATAFORMA CONCLUÍDA');
        console.log(`📊 Sistema processou ${tenants.length} tenants com sucesso`);
        console.log('🔍 Separação correta entre Internos (WhatsApp/IA) e Externos (Google Calendar)');

        // Salvar resultados em arquivo JSON
        const fs = require('fs');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `platform-totals-${timestamp}.json`;
        
        fs.writeFileSync(filename, JSON.stringify(platformTotals, null, 2));
        console.log(`💾 Resultados salvos em: ${filename}`);

    } catch (error) {
        console.error('❌ Erro durante totalização da plataforma:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Executar totalização
calculatePlatformTotals();