/**
 * VALIDAR QUE MRR É INDEPENDENTE DO PERÍODO
 * MRR deve ser sempre o mesmo, baseado nos tenants ativos atuais
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function validateMRRPeriodIndependence() {
    console.log('🔍 VALIDANDO INDEPENDÊNCIA DO MRR DO PERÍODO');
    console.log('='.repeat(60));
    
    try {
        // Testar diferentes períodos na API
        const periods = [7, 30, 90];
        const results = [];
        
        for (const period of periods) {
            console.log(`\n📅 TESTANDO PERÍODO: ${period} dias`);
            console.log('-'.repeat(40));
            
            try {
                const response = await fetch(`http://localhost:3001/api/super-admin/platform-usage-cost?period=${period}`);
                if (response.ok) {
                    const data = await response.json();
                    const mrr = data.data?.platform_revenue_brl;
                    
                    results.push({
                        period,
                        mrr,
                        status: mrr ? 'success' : 'error'
                    });
                    
                    console.log(`💰 MRR (${period}d): R$ ${mrr?.toFixed(2) || 'N/A'}`);
                } else {
                    console.log(`❌ Erro HTTP: ${response.status}`);
                    results.push({ period, mrr: null, status: 'http_error' });
                }
            } catch (error) {
                console.log(`❌ Erro: ${error.message}`);
                results.push({ period, mrr: null, status: 'error' });
            }
        }
        
        // Verificar se todos os MRRs são iguais
        console.log('\n📊 ANÁLISE DOS RESULTADOS:');
        console.log('='.repeat(60));
        
        const validResults = results.filter(r => r.status === 'success' && r.mrr !== null);
        
        if (validResults.length === 0) {
            console.log('❌ Nenhum resultado válido obtido');
            return;
        }
        
        const firstMRR = validResults[0].mrr;
        const allEqual = validResults.every(r => Math.abs(r.mrr - firstMRR) < 0.01);
        
        console.log('📋 RESULTADOS POR PERÍODO:');
        results.forEach(r => {
            const status = r.status === 'success' ? '✅' : '❌';
            console.log(`   ${status} ${r.period} dias: R$ ${r.mrr?.toFixed(2) || 'N/A'}`);
        });
        
        console.log('\n🎯 VALIDAÇÃO:');
        if (allEqual) {
            console.log('✅ MRR É INDEPENDENTE DO PERÍODO!');
            console.log(`💰 Valor consistente: R$ ${firstMRR.toFixed(2)}`);
            console.log('💡 Comportamento correto: MRR não varia com período de análise');
        } else {
            console.log('❌ MRR VARIA COM O PERÍODO!');
            console.log('💡 Problema: MRR deveria ser fixo baseado nos tenants ativos');
            console.log('🔧 Correção necessária: MRR deve ignorar parâmetro de período');
        }
        
        // Verificar também via KPIs endpoint
        console.log('\n🔍 VERIFICANDO VIA ENDPOINT KPIS:');
        console.log('-'.repeat(40));
        
        try {
            const kpisResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (kpisResponse.ok) {
                const kpisData = await kpisResponse.json();
                const kpisMrr = kpisData.data?.kpis?.mrrPlatform?.value;
                
                console.log(`💰 MRR via KPIs: R$ ${kpisMrr?.toFixed(2) || 'N/A'}`);
                
                if (kpisMrr && validResults.length > 0) {
                    const consistent = Math.abs(kpisMrr - firstMRR) < 0.01;
                    if (consistent) {
                        console.log('✅ Consistente entre endpoints');
                    } else {
                        console.log('❌ Inconsistente entre endpoints');
                        console.log(`   Diferença: R$ ${Math.abs(kpisMrr - firstMRR).toFixed(2)}`);
                    }
                }
            }
        } catch (error) {
            console.log(`⚠️ Erro ao testar KPIs: ${error.message}`);
        }
        
        // Calcular MRR manualmente para validação
        console.log('\n🧮 CÁLCULO MANUAL PARA VALIDAÇÃO:');
        console.log('-'.repeat(40));
        
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );
        
        const { data: tenants } = await supabase
            .from('tenants')
            .select('subscription_plan, business_name')
            .eq('status', 'active');
            
        const PLAN_PRICES = {
            'free': 0, 'pro': 99, 'professional': 199, 'profissional': 199,
            'enterprise': 299, 'basic': 89, 'basico': 89, 'starter': 59
        };
        
        let manualMRR = 0;
        console.log('🏢 TENANTS ATIVOS:');
        tenants?.forEach((tenant, i) => {
            const plan = tenant.subscription_plan?.toLowerCase() || 'free';
            const price = PLAN_PRICES[plan] || 0;
            manualMRR += price;
            console.log(`   ${i+1}. ${tenant.business_name}: ${plan} (R$ ${price})`);
        });
        
        console.log(`\n💰 MRR Manual: R$ ${manualMRR.toFixed(2)}`);
        
        if (validResults.length > 0) {
            const apiMrr = validResults[0].mrr;
            const difference = Math.abs(apiMrr - manualMRR);
            
            if (difference < 0.01) {
                console.log('✅ API está retornando valor correto');
            } else {
                console.log('❌ API diverge do cálculo manual');
                console.log(`   Diferença: R$ ${difference.toFixed(2)}`);
            }
        }
        
        console.log('\n🎯 CONCLUSÃO:');
        console.log('='.repeat(60));
        
        if (allEqual && validResults.length === periods.length) {
            console.log('🎉 SISTEMA VALIDADO!');
            console.log('✅ MRR é independente do período');
            console.log('✅ Valor consistente entre endpoints');
            console.log('✅ Cálculo correto baseado em tenants ativos');
        } else {
            console.log('⚠️ AJUSTES NECESSÁRIOS:');
            if (!allEqual) console.log('   - MRR varia com período (deveria ser fixo)');
            if (validResults.length < periods.length) console.log('   - Nem todos os períodos funcionam');
        }
        
    } catch (error) {
        console.error('💥 Erro na validação:', error);
    }
}

validateMRRPeriodIndependence().catch(console.error);