/**
 * Cálculo de Revenue Analytics
 * Calcula Total Revenue para:
 * - Cada tenant (7, 30, 90 dias)
 * - Cada serviço do tenant
 * - Cada profissional do tenant
 * Apenas para appointments completados
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Buscar todos os appointments completados
 */
async function getCompletedAppointments() {
    try {
        console.log('🔍 Buscando appointments completados...');
        
        let allAppointments = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
            const { data: appointments, error } = await supabase
                .from('appointments')
                .select(`
                    id,
                    tenant_id,
                    user_id,
                    service_id,
                    professional_id,
                    quoted_price,
                    final_price,
                    status,
                    start_time,
                    created_at,
                    appointment_data,
                    tenants!inner(name, business_name),
                    users!inner(name, email)
                `)
                .eq('status', 'completed')
                .not('quoted_price', 'is', null)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;

            if (!appointments || appointments.length === 0) {
                hasMore = false;
            } else {
                allAppointments = allAppointments.concat(appointments);
                console.log(`📄 Página ${page + 1}: ${appointments.length} appointments (Total: ${allAppointments.length})`);
                
                if (appointments.length < pageSize) {
                    hasMore = false;
                }
                page++;
            }
        }
        
        console.log(`📊 Total de appointments completados: ${allAppointments.length}`);
        return allAppointments;
        
    } catch (error) {
        console.error('❌ Erro ao buscar appointments:', error.message);
        throw error;
    }
}

/**
 * Filtrar appointments por período
 */
function filterAppointmentsByPeriod(appointments, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return appointments.filter(apt => {
        const appointmentDate = new Date(apt.start_time || apt.created_at);
        return appointmentDate >= cutoffDate;
    });
}

/**
 * Calcular receita por tenant
 */
function calculateRevenueByTenant(appointments, period) {
    console.log(`💰 Calculando receita por tenant (${period} dias)...`);
    
    const revenueByTenant = {};
    
    appointments.forEach(apt => {
        const tenantId = apt.tenant_id;
        const tenantName = apt.tenants?.name || 'Unknown';
        const businessName = apt.tenants?.business_name || tenantName;
        const price = parseFloat(apt.final_price || apt.quoted_price) || 0;
        
        if (!revenueByTenant[tenantId]) {
            revenueByTenant[tenantId] = {
                tenant_id: tenantId,
                tenant_name: tenantName,
                business_name: businessName,
                total_revenue: 0,
                appointment_count: 0
            };
        }
        
        revenueByTenant[tenantId].total_revenue += price;
        revenueByTenant[tenantId].appointment_count++;
    });
    
    return Object.values(revenueByTenant)
        .sort((a, b) => b.total_revenue - a.total_revenue);
}

/**
 * Calcular receita por serviço de cada tenant
 */
function calculateRevenueByService(appointments) {
    console.log('🛍️ Calculando receita por serviço...');
    
    const revenueByService = {};
    
    appointments.forEach(apt => {
        const tenantId = apt.tenant_id;
        const tenantName = apt.tenants?.name || 'Unknown';
        const serviceName = apt.appointment_data?.service_name || `Service ID: ${apt.service_id}` || 'Serviço não especificado';
        const price = parseFloat(apt.final_price || apt.quoted_price) || 0;
        
        const key = `${tenantId}_${serviceName}`;
        
        if (!revenueByService[key]) {
            revenueByService[key] = {
                tenant_id: tenantId,
                tenant_name: tenantName,
                service_name: serviceName,
                total_revenue: 0,
                appointment_count: 0
            };
        }
        
        revenueByService[key].total_revenue += price;
        revenueByService[key].appointment_count++;
    });
    
    return Object.values(revenueByService)
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || b.total_revenue - a.total_revenue);
}

/**
 * Calcular receita por profissional de cada tenant
 */
function calculateRevenueByProfessional(appointments) {
    console.log('👥 Calculando receita por profissional...');
    
    const revenueByProfessional = {};
    
    appointments.forEach(apt => {
        const tenantId = apt.tenant_id;
        const tenantName = apt.tenants?.name || 'Unknown';
        const professionalName = apt.appointment_data?.professional_name || `Professional ID: ${apt.professional_id}` || 'Profissional não especificado';
        const price = parseFloat(apt.final_price || apt.quoted_price) || 0;
        
        const key = `${tenantId}_${professionalName}`;
        
        if (!revenueByProfessional[key]) {
            revenueByProfessional[key] = {
                tenant_id: tenantId,
                tenant_name: tenantName,
                professional_name: professionalName,
                total_revenue: 0,
                appointment_count: 0
            };
        }
        
        revenueByProfessional[key].total_revenue += price;
        revenueByProfessional[key].appointment_count++;
    });
    
    return Object.values(revenueByProfessional)
        .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name) || b.total_revenue - a.total_revenue);
}

/**
 * Formatar valor em Real brasileiro
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

/**
 * Gerar relatório de receitas
 */
async function generateRevenueReport() {
    try {
        console.log('📊 Gerando Relatório de Revenue Analytics...');
        console.log('='.repeat(60));
        
        // Buscar appointments completados
        const allAppointments = await getCompletedAppointments();
        
        if (allAppointments.length === 0) {
            console.log('⚠️ Nenhum appointment completado encontrado.');
            return;
        }
        
        const report = {
            total_appointments: allAppointments.length,
            periods: {},
            services_revenue: null,
            professionals_revenue: null
        };
        
        // Calcular para cada período
        const periods = [7, 30, 90];
        
        for (const period of periods) {
            const filteredAppointments = filterAppointmentsByPeriod(allAppointments, period);
            
            console.log(`\n📅 Período: ${period} dias`);
            console.log(`📊 Appointments no período: ${filteredAppointments.length}`);
            
            if (filteredAppointments.length > 0) {
                const tenantRevenue = calculateRevenueByTenant(filteredAppointments, period);
                
                report.periods[`${period}d`] = {
                    period_days: period,
                    appointments_count: filteredAppointments.length,
                    tenant_revenue: tenantRevenue,
                    total_revenue: tenantRevenue.reduce((sum, t) => sum + t.total_revenue, 0)
                };
                
                // Mostrar top 5 tenants por período
                console.log(`\n🏆 Top 5 Tenants - ${period} dias:`);
                tenantRevenue.slice(0, 5).forEach((tenant, index) => {
                    console.log(`   ${index + 1}. ${tenant.tenant_name}: ${formatCurrency(tenant.total_revenue)} (${tenant.appointment_count} appointments)`);
                });
            }
        }
        
        // Calcular receita por serviço (todos os períodos)
        console.log('\n🛍️ Calculando receita por serviço (todos os appointments)...');
        report.services_revenue = calculateRevenueByService(allAppointments);
        
        // Calcular receita por profissional (todos os períodos)
        console.log('👥 Calculando receita por profissional (todos os appointments)...');
        report.professionals_revenue = calculateRevenueByProfessional(allAppointments);
        
        return report;
        
    } catch (error) {
        console.error('❌ Erro na geração do relatório:', error.message);
        throw error;
    }
}

/**
 * Salvar relatório em arquivos
 */
function saveRevenueReport(report) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    
    // Relatório completo JSON
    const jsonFilename = `revenue-analytics-${timestamp}.json`;
    fs.writeFileSync(jsonFilename, JSON.stringify(report, null, 2), 'utf8');
    
    // CSV por tenant por período
    const periods = ['7d', '30d', '90d'];
    
    periods.forEach(period => {
        if (report.periods[period]) {
            const csvLines = ['tenant_id,tenant_name,business_name,total_revenue,appointment_count'];
            
            report.periods[period].tenant_revenue.forEach(tenant => {
                csvLines.push([
                    tenant.tenant_id,
                    `"${tenant.tenant_name}"`,
                    `"${tenant.business_name}"`,
                    tenant.total_revenue.toFixed(2).replace('.', ','),
                    tenant.appointment_count
                ].join(','));
            });
            
            const csvFilename = `revenue-by-tenant-${period}-${timestamp}.csv`;
            fs.writeFileSync(csvFilename, csvLines.join('\n'), 'utf8');
            console.log(`📄 CSV tenant ${period}: ${csvFilename}`);
        }
    });
    
    // CSV por serviço
    if (report.services_revenue && report.services_revenue.length > 0) {
        const servicesCsvLines = ['tenant_id,tenant_name,service_name,total_revenue,appointment_count'];
        
        report.services_revenue.forEach(service => {
            servicesCsvLines.push([
                service.tenant_id,
                `"${service.tenant_name}"`,
                `"${service.service_name}"`,
                service.total_revenue.toFixed(2).replace('.', ','),
                service.appointment_count
            ].join(','));
        });
        
        const servicesCsvFilename = `revenue-by-service-${timestamp}.csv`;
        fs.writeFileSync(servicesCsvFilename, servicesCsvLines.join('\n'), 'utf8');
        console.log(`📄 CSV serviços: ${servicesCsvFilename}`);
    }
    
    // CSV por profissional
    if (report.professionals_revenue && report.professionals_revenue.length > 0) {
        const professionalsCsvLines = ['tenant_id,tenant_name,professional_name,total_revenue,appointment_count'];
        
        report.professionals_revenue.forEach(professional => {
            professionalsCsvLines.push([
                professional.tenant_id,
                `"${professional.tenant_name}"`,
                `"${professional.professional_name}"`,
                professional.total_revenue.toFixed(2).replace('.', ','),
                professional.appointment_count
            ].join(','));
        });
        
        const professionalsCsvFilename = `revenue-by-professional-${timestamp}.csv`;
        fs.writeFileSync(professionalsCsvFilename, professionalsCsvLines.join('\n'), 'utf8');
        console.log(`📄 CSV profissionais: ${professionalsCsvFilename}`);
    }
    
    console.log(`📄 Relatório JSON completo: ${jsonFilename}`);
    
    return {
        jsonFile: jsonFilename,
        csvFiles: {
            tenants: periods.map(p => `revenue-by-tenant-${p}-${timestamp}.csv`),
            services: `revenue-by-service-${timestamp}.csv`,
            professionals: `revenue-by-professional-${timestamp}.csv`
        }
    };
}

async function main() {
    try {
        console.log('💰 REVENUE ANALYTICS CALCULATOR');
        console.log('='.repeat(50));
        
        const report = await generateRevenueReport();
        
        if (report) {
            const files = saveRevenueReport(report);
            
            console.log('\n📋 RESUMO EXECUTIVO');
            console.log('='.repeat(30));
            console.log(`📊 Total de appointments completados: ${report.total_appointments}`);
            
            Object.keys(report.periods).forEach(period => {
                const periodData = report.periods[period];
                console.log(`📅 ${period}: ${formatCurrency(periodData.total_revenue)} (${periodData.appointments_count} appointments)`);
            });
            
            console.log(`🛍️ Serviços únicos: ${report.services_revenue?.length || 0}`);
            console.log(`👥 Profissionais únicos: ${report.professionals_revenue?.length || 0}`);
            
            console.log('\n✅ Relatórios gerados com sucesso!');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateRevenueReport, calculateRevenueByTenant, calculateRevenueByService, calculateRevenueByProfessional };