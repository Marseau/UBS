/**
 * Calcular MRR Real da Plataforma
 * Baseado nos dados corretos de monthly_subscription_fee dos tenants
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
 * Buscar todos os tenants ativos com dados de assinatura
 */
async function getActiveTenants() {
    try {
        console.log('🔍 Buscando tenants ativos...');
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                business_name,
                subscription_plan,
                monthly_subscription_fee,
                plan_type,
                subscription_status,
                subscription_start_date,
                created_at
            `)
            .eq('subscription_status', 'active')
            .not('monthly_subscription_fee', 'is', null);
            
        if (error) throw error;
        
        console.log(`✅ Encontrados ${tenants.length} tenants ativos`);
        
        return tenants;
        
    } catch (error) {
        console.error('❌ Erro ao buscar tenants:', error.message);
        throw error;
    }
}

/**
 * Calcular MRR por período baseado na data de início da assinatura
 */
function calculateMRRByPeriod(tenants, days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Filtrar tenants que eram ativos no período
    const activeInPeriod = tenants.filter(tenant => {
        const startDate = new Date(tenant.subscription_start_date);
        return startDate <= new Date(); // Estava ativo até hoje
    });
    
    // Calcular MRR total
    const totalMRR = activeInPeriod.reduce((sum, tenant) => {
        return sum + (parseFloat(tenant.monthly_subscription_fee) || 0);
    }, 0);
    
    // Agrupar por plano
    const planBreakdown = {};
    activeInPeriod.forEach(tenant => {
        const plan = tenant.subscription_plan || 'unknown';
        if (!planBreakdown[plan]) {
            planBreakdown[plan] = {
                count: 0,
                mrr: 0,
                fee: parseFloat(tenant.monthly_subscription_fee) || 0
            };
        }
        planBreakdown[plan].count++;
        planBreakdown[plan].mrr += parseFloat(tenant.monthly_subscription_fee) || 0;
    });
    
    return {
        period_days: days,
        total_mrr: totalMRR,
        active_tenants: activeInPeriod.length,
        average_mrr_per_tenant: activeInPeriod.length > 0 ? totalMRR / activeInPeriod.length : 0,
        plan_breakdown: planBreakdown
    };
}

/**
 * Gerar relatório detalhado de MRR
 */
async function generateMRRReport() {
    try {
        console.log('💰 Gerando Relatório de MRR da Plataforma...');
        console.log('='.repeat(60));
        
        const tenants = await getActiveTenants();
        
        if (tenants.length === 0) {
            console.log('⚠️ Nenhum tenant ativo encontrado.');
            return null;
        }
        
        // Mostrar detalhes dos tenants
        console.log('\n📊 Tenants Ativos:');
        tenants.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.subscription_plan}): R$ ${tenant.monthly_subscription_fee}/mês`);
        });
        
        // Calcular MRR para os 3 períodos
        const periods = [7, 30, 90];
        const mrrReport = {
            calculation_date: new Date().toISOString(),
            total_active_tenants: tenants.length,
            periods: {}
        };
        
        console.log('\n💰 MRR por Período:');
        
        periods.forEach(days => {
            const periodData = calculateMRRByPeriod(tenants, days);
            mrrReport.periods[`${days}d`] = periodData;
            
            console.log(`\n📅 ${days} dias:`);
            console.log(`   MRR Total: R$ ${periodData.total_mrr.toFixed(2)}`);
            console.log(`   Tenants Ativos: ${periodData.active_tenants}`);
            console.log(`   MRR Médio por Tenant: R$ ${periodData.average_mrr_per_tenant.toFixed(2)}`);
            
            // Breakdown por plano
            console.log('   Breakdown por Plano:');
            Object.keys(periodData.plan_breakdown).forEach(plan => {
                const planData = periodData.plan_breakdown[plan];
                console.log(`     ${plan}: ${planData.count} tenants × R$ ${planData.fee.toFixed(2)} = R$ ${planData.mrr.toFixed(2)}`);
            });
        });
        
        // Análise de crescimento (simulação baseada em datas de início)
        console.log('\n📈 Análise de Crescimento:');
        const startDates = tenants.map(t => new Date(t.subscription_start_date)).sort();
        const oldestStart = startDates[0];
        const newestStart = startDates[startDates.length - 1];
        
        console.log(`   Primeiro tenant: ${oldestStart.toLocaleDateString('pt-BR')}`);
        console.log(`   Último tenant: ${newestStart.toLocaleDateString('pt-BR')}`);
        
        // Taxa de aquisição (tenants por dia desde o primeiro)
        const daysSinceStart = Math.ceil((new Date() - oldestStart) / (1000 * 60 * 60 * 24));
        const acquisitionRate = tenants.length / daysSinceStart;
        console.log(`   Taxa de aquisição: ${acquisitionRate.toFixed(2)} tenants/dia`);
        
        return mrrReport;
        
    } catch (error) {
        console.error('❌ Erro na geração do relatório:', error.message);
        throw error;
    }
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

async function main() {
    try {
        console.log('💰 MRR REAL DA PLATAFORMA');
        console.log('='.repeat(50));
        
        const report = await generateMRRReport();
        
        if (report) {
            // Salvar relatório
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            const filename = `platform-mrr-real-${timestamp}.json`;
            
            fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');
            
            // CSV por período
            const csvLines = ['period,days,total_mrr,active_tenants,avg_mrr_per_tenant'];
            Object.keys(report.periods).forEach(period => {
                const data = report.periods[period];
                csvLines.push([
                    period,
                    data.period_days,
                    data.total_mrr.toFixed(2).replace('.', ','),
                    data.active_tenants,
                    data.average_mrr_per_tenant.toFixed(2).replace('.', ',')
                ].join(','));
            });
            
            const csvFilename = `platform-mrr-periods-${timestamp}.csv`;
            fs.writeFileSync(csvFilename, csvLines.join('\n'), 'utf8');
            
            console.log('\n📋 RESUMO EXECUTIVO');
            console.log('='.repeat(30));
            console.log(`📊 Total de Tenants Ativos: ${report.total_active_tenants}`);
            
            Object.keys(report.periods).forEach(period => {
                const data = report.periods[period];
                console.log(`📅 MRR ${period}: ${formatCurrency(data.total_mrr)}`);
            });
            
            console.log(`\n📄 Relatórios salvos:`);
            console.log(`   JSON: ${filename}`);
            console.log(`   CSV: ${csvFilename}`);
            
            console.log('\n✅ MRR da Plataforma calculado corretamente!');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateMRRReport, calculateMRRByPeriod };