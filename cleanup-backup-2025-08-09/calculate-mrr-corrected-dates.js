/**
 * Calcular MRR CORRETO usando created_at como data de início da assinatura
 * Trial de 15 dias a partir da data de criação do tenant
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
 * Buscar todos os tenants com datas corretas
 */
async function getTenantsWithCorrectDates() {
    try {
        console.log('🔍 Buscando tenants com datas corretas...');
        
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                business_name,
                subscription_plan,
                monthly_subscription_fee,
                subscription_status,
                created_at
            `)
            .eq('subscription_status', 'active')
            .not('monthly_subscription_fee', 'is', null)
            .order('created_at', { ascending: true });
            
        if (error) throw error;
        
        console.log(`✅ Encontrados ${tenants.length} tenants ativos`);
        
        // Calcular datas corretas baseadas em created_at
        const tenantsWithCorrectDates = tenants.map(tenant => {
            const createdAt = new Date(tenant.created_at);
            const paymentStartDate = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
            const today = new Date();
            
            return {
                ...tenant,
                subscription_start_date: createdAt, // Data real de início
                payment_start_date: paymentStartDate, // Quando começa a pagar
                trial_end_date: paymentStartDate,
                is_paying: paymentStartDate <= today,
                days_since_creation: Math.ceil((today - createdAt) / (24 * 60 * 60 * 1000)),
                days_in_trial: Math.max(0, Math.ceil((paymentStartDate - today) / (24 * 60 * 60 * 1000)))
            };
        });
        
        return tenantsWithCorrectDates;
        
    } catch (error) {
        console.error('❌ Erro ao buscar tenants:', error.message);
        throw error;
    }
}

/**
 * Calcular MRR por período usando datas corretas
 */
function calculateCorrectMRRByPeriod(tenants, days) {
    const today = new Date();
    const periodStart = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    
    console.log(`\n📅 Período de ${days} dias:`);
    console.log(`   De: ${periodStart.toLocaleDateString('pt-BR')} até ${today.toLocaleDateString('pt-BR')}`);
    
    // Tenants que estavam pagando durante o período
    const payingTenants = [];
    const trialingTenants = [];
    
    tenants.forEach(tenant => {
        const createdAt = new Date(tenant.subscription_start_date);
        const paymentStartDate = tenant.payment_start_date;
        
        // Tenant foi criado antes do fim do período e está ativo
        const wasCreatedInPeriod = createdAt >= periodStart && createdAt <= today;
        const wasActive = tenant.subscription_status === 'active';
        const isPaying = tenant.is_paying;
        
        console.log(`   ${tenant.name}:`);
        console.log(`     Criado: ${createdAt.toLocaleDateString('pt-BR')}`);
        console.log(`     Pagamento inicia: ${paymentStartDate.toLocaleDateString('pt-BR')}`);
        console.log(`     Dias desde criação: ${tenant.days_since_creation}`);
        console.log(`     Status: ${isPaying ? 'PAGANDO' : `TRIAL (${tenant.days_in_trial} dias restantes)`}`);
        
        if (wasActive && isPaying) {
            payingTenants.push(tenant);
        } else if (wasActive && !isPaying) {
            trialingTenants.push(tenant);
        }
    });
    
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
    
    return {
        period_days: days,
        total_mrr: totalMRR,
        paying_tenants: payingTenants.length,
        trialing_tenants: trialingTenants.length,
        total_active_tenants: tenants.filter(t => t.subscription_status === 'active').length,
        average_mrr_per_paying_tenant: payingTenants.length > 0 ? totalMRR / payingTenants.length : 0,
        plan_breakdown: planBreakdown,
        paying_tenant_details: payingTenants.map(t => ({
            name: t.name,
            plan: t.subscription_plan,
            mrr: parseFloat(t.monthly_subscription_fee),
            created_date: t.subscription_start_date.toISOString(),
            payment_start: t.payment_start_date.toISOString(),
            days_paying: Math.max(0, t.days_since_creation - TRIAL_DAYS)
        })),
        trialing_tenant_details: trialingTenants.map(t => ({
            name: t.name,
            plan: t.subscription_plan,
            created_date: t.subscription_start_date.toISOString(),
            trial_ends: t.trial_end_date.toISOString(),
            days_left_in_trial: t.days_in_trial
        }))
    };
}

/**
 * Gerar relatório MRR correto
 */
async function generateCorrectMRRReport() {
    try {
        console.log('💰 Gerando Relatório MRR CORRETO...');
        console.log('='.repeat(60));
        console.log('📅 Usando created_at como data de início da assinatura');
        console.log(`🆓 Trial: ${TRIAL_DAYS} dias gratuitos a partir da criação`);
        
        const tenants = await getTenantsWithCorrectDates();
        
        if (tenants.length === 0) {
            console.log('⚠️ Nenhum tenant encontrado.');
            return null;
        }
        
        console.log('\n📊 Status atual dos tenants:');
        tenants.forEach((tenant, index) => {
            const status = tenant.is_paying ? 
                `PAGANDO (${Math.max(0, tenant.days_since_creation - TRIAL_DAYS)} dias pagando)` : 
                `TRIAL (${tenant.days_in_trial} dias restantes)`;
            console.log(`   ${index + 1}. ${tenant.name}: ${status}`);
        });
        
        // Calcular MRR para os 3 períodos
        const periods = [7, 30, 90];
        const mrrReport = {
            calculation_date: new Date().toISOString(),
            methodology: 'Using created_at as subscription start date',
            trial_policy: `${TRIAL_DAYS} days free trial from creation`,
            total_tenants: tenants.length,
            periods: {}
        };
        
        console.log('\n💰 MRR por Período (datas corretas):');
        
        periods.forEach(days => {
            const periodData = calculateCorrectMRRByPeriod(tenants, days);
            mrrReport.periods[`${days}d`] = periodData;
            
            console.log(`\n📅 ${days} dias:`);
            console.log(`   MRR Total: R$ ${periodData.total_mrr.toFixed(2)}`);
            console.log(`   Tenants Pagando: ${periodData.paying_tenants}`);
            console.log(`   Tenants em Trial: ${periodData.trialing_tenants}`);
            console.log(`   Total Ativos: ${periodData.total_active_tenants}`);
            
            if (periodData.paying_tenants > 0) {
                console.log(`   MRR Médio por Tenant Pagante: R$ ${periodData.average_mrr_per_paying_tenant.toFixed(2)}`);
                
                // Breakdown por plano
                console.log('   Breakdown por Plano (pagando):');
                Object.keys(periodData.plan_breakdown).forEach(plan => {
                    const planData = periodData.plan_breakdown[plan];
                    console.log(`     ${plan}: ${planData.count} tenants × R$ ${planData.fee.toFixed(2)} = R$ ${planData.mrr.toFixed(2)}`);
                });
                
                console.log('   Tenants pagando:');
                periodData.paying_tenant_details.forEach(tenant => {
                    console.log(`     ${tenant.name}: ${tenant.days_paying} dias pagando`);
                });
            }
            
            if (periodData.trialing_tenants > 0) {
                console.log('   Tenants em trial:');
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
        console.log('💰 MRR DA PLATAFORMA - DATAS CORRETAS');
        console.log('='.repeat(50));
        
        const report = await generateCorrectMRRReport();
        
        if (report) {
            // Salvar relatório
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
            const filename = `platform-mrr-corrected-${timestamp}.json`;
            
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
            
            const csvFilename = `platform-mrr-corrected-${timestamp}.csv`;
            fs.writeFileSync(csvFilename, csvLines.join('\n'), 'utf8');
            
            console.log('\n📋 RESUMO EXECUTIVO FINAL');
            console.log('='.repeat(40));
            console.log(`📊 Total de Tenants: ${report.total_tenants}`);
            console.log(`📅 Metodologia: ${report.methodology}`);
            console.log(`🆓 Trial: ${report.trial_policy}`);
            
            Object.keys(report.periods).forEach(period => {
                const data = report.periods[period];
                console.log(`📅 MRR ${period}: ${formatCurrency(data.total_mrr)} (${data.paying_tenants} pagando + ${data.trialing_tenants} trial)`);
            });
            
            console.log(`\n📄 Relatórios salvos:`);
            console.log(`   JSON: ${filename}`);
            console.log(`   CSV: ${csvFilename}`);
            
            console.log('\n✅ MRR da Plataforma calculado com DATAS CORRETAS!');
        }
        
    } catch (error) {
        console.error('\n💥 ERRO:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { generateCorrectMRRReport, calculateCorrectMRRByPeriod };