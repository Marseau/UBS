/**
 * SISTEMA DE VALIDAÇÃO DE CONSISTÊNCIA
 * Valida se os cálculos estão consistentes com os dados reais
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function validateSystemConsistency() {
    console.log('🔍 SISTEMA DE VALIDAÇÃO DE CONSISTÊNCIA');
    console.log('='.repeat(60));
    
    const results = {
        tests: [],
        passed: 0,
        failed: 0,
        warnings: 0
    };
    
    function addTest(name, status, details, expected = null, actual = null) {
        const test = { name, status, details, expected, actual };
        results.tests.push(test);
        
        if (status === '✅') results.passed++;
        else if (status === '❌') results.failed++;
        else if (status === '⚠️') results.warnings++;
        
        console.log(`${status} ${name}: ${details}`);
        if (expected !== null && actual !== null) {
            console.log(`   Esperado: ${expected} | Real: ${actual}`);
        }
    }
    
    try {
        // =====================================================
        // TESTE 1: VALIDAR MRR vs TENANTS ATIVOS
        // =====================================================
        
        console.log('\n📊 TESTE 1: MRR vs TENANTS ATIVOS');
        console.log('-'.repeat(40));
        
        // Buscar dados da API
        const apiResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
        const apiData = await apiResponse.json();
        
        if (!apiData.success) {
            addTest('API Response', '❌', 'API não respondeu corretamente');
            return results;
        }
        
        const apiMrr = apiData.data.kpis.mrrPlatform.value;
        const apiTenants = apiData.data.kpis.activeTenants.value;
        
        // Calcular MRR manualmente
        const { data: tenants } = await supabase
            .from('tenants')
            .select('subscription_plan, status')
            .eq('status', 'active');
        
        const PLAN_PRICES = {
            'profissional': 179.90,
            'enterprise': 349.90,
            'basico': 89.90,
            'free': 0
        };
        
        let manualMrr = 0;
        tenants?.forEach(t => {
            const plan = t.subscription_plan?.toLowerCase();
            manualMrr += PLAN_PRICES[plan] || 89.90;
        });
        
        const mrrDiff = Math.abs(apiMrr - manualMrr);
        const mrrDiffPct = manualMrr > 0 ? (mrrDiff / manualMrr) * 100 : 0;
        
        if (mrrDiffPct < 1) {
            addTest('MRR Consistency', '✅', `Diferença: ${mrrDiffPct.toFixed(2)}%`, manualMrr, apiMrr);
        } else {
            addTest('MRR Consistency', '❌', `Diferença: ${mrrDiffPct.toFixed(2)}%`, manualMrr, apiMrr);
        }
        
        if (apiTenants === tenants?.length) {
            addTest('Active Tenants', '✅', `${apiTenants} tenants consistentes`);
        } else {
            addTest('Active Tenants', '❌', `API: ${apiTenants} vs DB: ${tenants?.length}`);
        }
        
        // =====================================================
        // TESTE 2: APPOINTMENTS vs CONVERSATION_HISTORY
        // =====================================================
        
        console.log('\n📅 TESTE 2: APPOINTMENTS vs CONVERSATIONS');
        console.log('-'.repeat(40));
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const startIso = startDate.toISOString();
        
        const { count: realAppointments } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso);
            
        const { count: realMessages } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso);
        
        const apiAppointments = apiData.data.kpis.totalAppointments.value;
        const apiMessages = apiData.data.kpis.aiInteractions.value;
        
        const appointmentsDiff = Math.abs(apiAppointments - realAppointments);
        const messagesDiff = Math.abs(apiMessages - realMessages);
        
        if (appointmentsDiff <= 5) {
            addTest('Appointments Count', '✅', `Diferença: ${appointmentsDiff}`, realAppointments, apiAppointments);
        } else {
            addTest('Appointments Count', '❌', `Diferença: ${appointmentsDiff}`, realAppointments, apiAppointments);
        }
        
        if (messagesDiff <= 10) {
            addTest('Messages Count', '✅', `Diferença: ${messagesDiff}`, realMessages, apiMessages);
        } else {
            addTest('Messages Count', '❌', `Diferença: ${messagesDiff}`, realMessages, apiMessages);
        }
        
        // =====================================================
        // TESTE 3: VALIDAR CÁLCULOS DE MARGEM
        // =====================================================
        
        console.log('\n💰 TESTE 3: CÁLCULOS DE MARGEM');
        console.log('-'.repeat(40));
        
        const revenue = apiData.data.metadata.platform_totals.revenue_brl;
        const usageCost = apiData.data.metadata.platform_totals.usage_cost_brl;
        const margin = apiData.data.metadata.platform_totals.margin_brl;
        const marginPct = apiData.data.metadata.platform_totals.margin_percentage;
        
        const calculatedMargin = revenue - usageCost;
        const calculatedMarginPct = revenue > 0 ? (calculatedMargin / revenue) * 100 : 0;
        
        const marginDiff = Math.abs(margin - calculatedMargin);
        const marginPctDiff = Math.abs(marginPct - calculatedMarginPct);
        
        if (marginDiff < 1) {
            addTest('Margin Calculation', '✅', `Diferença: R$ ${marginDiff.toFixed(2)}`);
        } else {
            addTest('Margin Calculation', '❌', `Diferença: R$ ${marginDiff.toFixed(2)}`);
        }
        
        if (marginPctDiff < 1) {
            addTest('Margin Percentage', '✅', `Diferença: ${marginPctDiff.toFixed(2)}%`);
        } else {
            addTest('Margin Percentage', '❌', `Diferença: ${marginPctDiff.toFixed(2)}%`);
        }
        
        // =====================================================
        // TESTE 4: VALIDAR PERIOD COMPARISON
        // =====================================================
        
        console.log('\n📈 TESTE 4: COMPARAÇÃO DE PERÍODO');
        console.log('-'.repeat(40));
        
        const currentAppointments = apiData.data.kpis.totalAppointments.value;
        const previousAppointments = apiData.data.kpis.totalAppointmentsPrevious.value;
        
        if (previousAppointments && previousAppointments > 0) {
            addTest('Previous Period Data', '✅', `${previousAppointments} appointments no período anterior`);
            
            const growth = ((currentAppointments - previousAppointments) / previousAppointments) * 100;
            addTest('Growth Calculation', '✅', `Crescimento: ${growth.toFixed(1)}%`);
        } else {
            addTest('Previous Period Data', '⚠️', 'Dados do período anterior não encontrados');
        }
        
        // =====================================================
        // TESTE 5: VALIDAR ESTRUTURA DE RESPOSTA
        // =====================================================
        
        console.log('\n🔧 TESTE 5: ESTRUTURA DE RESPOSTA');
        console.log('-'.repeat(40));
        
        const requiredKpis = [
            'mrrPlatform', 'activeTenants', 'totalAppointments', 
            'aiInteractions', 'operationalEfficiency', 'spamRate',
            'cancellationRate', 'receitaUsoRatio'
        ];
        
        let missingKpis = [];
        requiredKpis.forEach(kpi => {
            if (!apiData.data.kpis[kpi]) {
                missingKpis.push(kpi);
            }
        });
        
        if (missingKpis.length === 0) {
            addTest('KPI Structure', '✅', 'Todos os KPIs presentes');
        } else {
            addTest('KPI Structure', '❌', `KPIs faltando: ${missingKpis.join(', ')}`);
        }
        
        // Verificar metadados
        if (apiData.data.metadata && apiData.data.metadata.platform_totals) {
            addTest('Metadata Structure', '✅', 'Metadados completos');
        } else {
            addTest('Metadata Structure', '❌', 'Metadados incompletos');
        }
        
        // =====================================================
        // TESTE 6: PERFORMANCE E TEMPO DE RESPOSTA
        // =====================================================
        
        console.log('\n⚡ TESTE 6: PERFORMANCE');
        console.log('-'.repeat(40));
        
        const startTime = Date.now();
        const perfResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
        const responseTime = Date.now() - startTime;
        
        if (responseTime < 2000) {
            addTest('Response Time', '✅', `${responseTime}ms (< 2s)`);
        } else if (responseTime < 5000) {
            addTest('Response Time', '⚠️', `${responseTime}ms (lento)`);
        } else {
            addTest('Response Time', '❌', `${responseTime}ms (muito lento)`);
        }
        
        // =====================================================
        // RELATÓRIO FINAL
        // =====================================================
        
        console.log('\n📋 RELATÓRIO DE VALIDAÇÃO');
        console.log('='.repeat(60));
        console.log(`✅ Testes Aprovados: ${results.passed}`);
        console.log(`❌ Testes Reprovados: ${results.failed}`);
        console.log(`⚠️ Avisos: ${results.warnings}`);
        console.log(`📊 Total de Testes: ${results.tests.length}`);
        
        const successRate = (results.passed / results.tests.length) * 100;
        console.log(`📈 Taxa de Sucesso: ${successRate.toFixed(1)}%`);
        
        if (results.failed === 0) {
            console.log('\n🎉 SISTEMA VALIDADO - TODOS OS TESTES APROVADOS');
        } else if (results.failed <= 2) {
            console.log('\n⚠️ SISTEMA FUNCIONAL - ALGUNS PROBLEMAS MENORES');
        } else {
            console.log('\n❌ SISTEMA COM PROBLEMAS - CORREÇÕES NECESSÁRIAS');
        }
        
        return results;
        
    } catch (error) {
        addTest('System Error', '❌', `Erro na validação: ${error.message}`);
        console.error('💥 Erro na validação:', error);
        return results;
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    validateSystemConsistency()
        .then(results => {
            const exitCode = results.failed > 0 ? 1 : 0;
            process.exit(exitCode);
        })
        .catch(console.error);
}

module.exports = { validateSystemConsistency };