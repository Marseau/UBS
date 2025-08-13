/**
 * Calcular MRR Real considerando período de trial de 15 dias gratuitos
 * Tenants só geram MRR após 15 dias da subscription_start_date
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

const TRIAL_DAYS = 15; // Período gratuito de 15 dias

/**
 * Buscar todos os tenants com dados de assinatura
 */
async function getAllTenants() {
    try {
        console.log('🔍 Buscando todos os tenants...');
        
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
            .not('monthly_subscription_fee', 'is', null);
            
        if (error) throw error;
        
        console.log(`✅ Encontrados ${tenants.length} tenants`);
        
        // Calcular data de início do pagamento para cada tenant
        const tenantsWithPaymentStart = tenants.map(tenant => ({
            ...tenant,
            payment_start_date: new Date(new Date(tenant.subscription_start_date).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
            trial_end_date: new Date(new Date(tenant.subscription_start_date).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
        }));
        
        return tenantsWithPaymentStart;
        
    } catch (error) {
        console.error('❌ Erro ao buscar tenants:', error.message);
        throw error;
    }
}

/**
 * Calcular MRR por período considerando trial de 15 dias
 */
function calculateMRRWithTrial(tenants, days) {
    const today = new Date();
    const periodStart = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    
    console.log(`\n📅 Analisando período de ${days} dias:`);
    console.log(`   Período: ${periodStart.toLocaleDateString('pt-BR')} até ${today.toLocaleDateString('pt-BR')}`);
    
    // Identificar tenants que estavam pagando durante o período
    const payingTenants = tenants.filter(tenant => {
        const paymentStartDate = tenant.payment_start_date;
        const subscriptionStartDate = new Date(tenant.subscription_start_date);
        
        // Tenant estava ativo E já havia passado do trial
        const wasActive = tenant.subscription_status === 'active';
        const hadStartedPaying = paymentStartDate <= today;
        const wasPayingInPeriod = paymentStartDate <= today; // Se já passou do trial até hoje
        
        console.log(`   ${tenant.name}:`);
        console.log(`     Início assinatura: ${subscriptionStartDate.toLocaleDateString('pt-BR')}`);
        console.log(`     Início pagamento: ${paymentStartDate.toLocaleDateString('pt-BR')}`);
        console.log(`     Status: ${tenant.subscription_status}`);
        console.log(`     Pagando hoje: ${hadStartedPaying ? 'SIM' : 'NÃO (ainda em trial)'}`);
        
        return wasActive && hadStartedPaying;
    });
    
    console.log(`   Tenants pagando: ${payingTenants.length} de ${tenants.length}`);
    
    // Calcular MRR total
    const totalMRR = payingTenants.reduce((sum, tenant) => {
        return sum + (parseFloat(tenant.monthly_subscription_fee) || 0);
    }, 0);
    
    // Breakdown por plano
    const planBreakdown = {};
    payingTenants.forEach(tenant => {
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
    
    // Tenants ainda em trial
    const trialing = tenants.filter(tenant => {
        const paymentStartDate = tenant.payment_start_date;
        return tenant.subscription_status === 'active' && paymentStartDate > today;
    });
    
    return {
        period_days: days,
        total_mrr: totalMRR,
        paying_tenants: payingTenants.length,
        trialing_tenants: trialing.length,
        total_active_tenants: tenants.filter(t => t.subscription_status === 'active').length,
        average_mrr_per_paying_tenant: payingTenants.length > 0 ? totalMRR / payingTenants.length : 0,
        plan_breakdown: planBreakdown,
        paying_tenant_details: payingTenants.map(t => ({
            name: t.name,
            plan: t.subscription_plan,
            mrr: parseFloat(t.monthly_subscription_fee),
            payment_start: t.payment_start_date.toISOString()
        })),
        trialing_tenant_details: trialing.map(t => ({
            name: t.name,
            trial_ends: t.trial_end_date.toISOString(),
            days_left_in_trial: Math.ceil((t.trial_end_date - today) / (24 * 60 * 60 * 1000))
        }))
    };
}

/**
 * Gerar relatório completo de MRR com trial
 */
async function generateMRRReportWithTrial() {
    try {
        console.log('💰 Gerando Relatório de MRR com Trial de 15 dias...');
        console.log('='.repeat(60));
        
        const tenants = await getAllTenants();
        
        if (tenants.length === 0) {
            console.log('⚠️ Nenhum tenant encontrado.');
            return null;
        }
        
        console.log(`\n📋 Política de Trial: ${TRIAL_DAYS} dias gratuitos`);
        console.log(`📊 Total de tenants: ${tenants.length}`);
        
        // Mostrar detalhes dos tenants
        console.log('\n📊 Status dos Tenants:');
        tenants.forEach((tenant, index) => {
            const daysInTrial = Math.ceil((tenant.payment_start_date - new Date()) / (24 * 60 * 60 * 1000));
            const status = daysInTrial > 0 ? `TRIAL (${daysInTrial} dias restantes)` : 'PAGANDO';
            console.log(`   ${index + 1}. ${tenant.name} (${tenant.subscription_plan}): ${status}`);
        });
        
        // Calcular MRR para os 3 períodos
        const periods = [7, 30, 90];
        const mrrReport = {
            calculation_date: new Date().toISOString(),
            trial_policy: `${TRIAL_DAYS} days free trial`,
            total_tenants: tenants.length,
            periods: {}
        };
        
        console.log('\n💰 MRR por Período (considerando trial):');
        
        periods.forEach(days => {
            const periodData = calculateMRRWithTrial(tenants, days);
            mrrReport.periods[`${days}d`] = periodData;
            
            console.log(`\n📅 ${days} dias:`);
            console.log(`   MRR Total: R$ ${periodData.total_mrr.toFixed(2)}`);
            console.log(`   Tenants Pagando: ${periodData.paying_tenants}`);
            console.log(`   Tenants em Trial: ${periodData.trialing_tenants}`);
            console.log(`   Total Ativos: ${periodData.total_active_tenants}`);
            
            if (periodData.paying_tenants > 0) {
                console.log(`   MRR Médio por Tenant Pagante: R$ ${periodData.average_mrr_per_paying_tenant.toFixed(2)}`);
                
                // Breakdown por plano
                console.log('   Breakdown por Plano (tenants pagando):');
                Object.keys(periodData.plan_breakdown).forEach(plan => {
                    const planData = periodData.plan_breakdown[plan];
                    console.log(`     ${plan}: ${planData.count} tenants × R$ ${planData.fee.toFixed(2)} = R$ ${planData.mrr.toFixed(2)}`);
                });
            }
            
            if (periodData.trialing_tenants > 0) {
                console.log('   Tenants ainda em trial:');
                periodData.trialing_tenant_details.forEach(trial => {
                    console.log(`     ${trial.name}: ${trial.days_left_in_trial} dias restantes`);
                });
            }
        });
        
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
        console.log('💰 MRR DA PLATAFORMA COM TRIAL DE 15 DIAS');
        console.log('='.repeat(50));
        
        const report = await generateMRRReportWithTrial();
        
        if (report) {
            // Salvar relatório
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            const filename = `platform-mrr-with-trial-${timestamp}.json`;
            
            fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');
            
            // CSV por período
            const csvLines = ['period,days,total_mrr,paying_tenants,trialing_tenants,total_active'];
            Object.keys(report.periods).forEach(period => {
                const data = report.periods[period];
                csvLines.push([
                    period,
                    data.period_days,
                    data.total_mrr.toFixed(2).replace('.', ','),
                    data.paying_tenants,
                    data.trialing_tenants,
                    data.total_active_tenants
                ].join(','));
            });
            
            const csvFilename = `platform-mrr-with-trial-${timestamp}.csv`;
            fs.writeFileSync(csvFilename, csvLines.join('\n'), 'utf8');
            
            console.log('\n📋 RESUMO EXECUTIVO CORRETO');
            console.log('='.repeat(40));
            console.log(`📊 Total de Tenants: ${report.total_tenants}`);
            console.log(`🆓 Política de Trial: ${report.trial_policy}`);
            
            Object.keys(report.periods).forEach(period => {
                const data = report.periods[period];
                console.log(`📅 MRR ${period}: ${formatCurrency(data.total_mrr)} (${data.paying_tenants} pagando + ${data.trialing_tenants} em trial)`);
            });
            
            console.log(`\n📄 Relatórios salvos:`);
            console.log(`   JSON: ${filename}`);
            console.log(`   CSV: ${csvFilename}`);
            
            console.log('\n✅ MRR da Plataforma calculado CORRETAMENTE considerando trial!');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateMRRReportWithTrial, calculateMRRWithTrial };