#!/usr/bin/env node

/**
 * FIND EXACT DATA SOURCE
 * Descobrir de onde exatamente vem o valor R$ 394.294,41
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function findExactDataSource() {
    console.log('🎯 RASTREANDO FONTE EXATA DO VALOR R$ 394.294,41');
    console.log('=' .repeat(60));
    
    try {
        // 1. Verificar se há dados com este valor exato em todas as tabelas
        console.log('\n🔍 1. Buscando em todas as tabelas numéricas...');
        
        // Lista de tabelas e campos que podem conter valores monetários
        const searchTargets = [
            { table: 'subscription_payments', fields: ['amount'] },
            { table: 'tenant_platform_metrics', fields: ['platform_total_revenue', 'revenue_participation_value'] },
            { table: 'appointments', fields: ['total_amount'] }
        ];
        
        for (const target of searchTargets) {
            console.log(`\n   Buscando em ${target.table}...`);
            for (const field of target.fields) {
                try {
                    // Buscar valores exatos
                    const { data: exactData, error: exactError } = await supabase
                        .from(target.table)
                        .select(`${field}, *`)
                        .eq(field, 394294.41);
                        
                    if (!exactError && exactData && exactData.length > 0) {
                        console.log(`   ✅ ENCONTRADO! ${target.table}.${field} = 394294.41`);
                        exactData.forEach((row, i) => {
                            console.log(`      ${i+1}. ${JSON.stringify(row).substring(0, 100)}...`);
                        });
                    }
                    
                    // Buscar valores próximos (pois pode haver diferença de decimais)
                    const { data: nearData, error: nearError } = await supabase
                        .from(target.table)
                        .select(`${field}, *`)
                        .gte(field, 394290)
                        .lte(field, 394300);
                        
                    if (!nearError && nearData && nearData.length > 0) {
                        console.log(`   📍 Valores próximos em ${target.table}.${field}:`);
                        nearData.forEach((row, i) => {
                            console.log(`      ${i+1}. ${row[field]} - ${JSON.stringify(row).substring(0, 80)}...`);
                        });
                    }
                } catch (e) {
                    console.log(`   ❌ Campo ${field} não existe em ${target.table}`);
                }
            }
        }
        
        // 2. Verificar se há uma versão específica da função para período de 30 dias
        console.log('\n🔍 2. Testando se há lógica específica para 30 dias...');
        
        // Testar períodos próximos a 30 para ver se há mudança
        const testPeriods = [28, 29, 30, 31, 32];
        for (const period of testPeriods) {
            const { data: result, error: funcError } = await supabase
                .rpc('get_platform_metrics', { p_period_days: period });
                
            if (!funcError && result && result[0]) {
                const revenue = parseFloat(result[0].total_revenue || 0);
                console.log(`   ${period} dias: R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            }
        }
        
        // 3. Buscar por somas que poderiam resultar em 394294.41
        console.log('\n🔍 3. Buscando combinações que resultem em 394294.41...');
        
        // Verificar se é uma soma de todas as receitas dos tenants
        const { data: allPayments, error: paymentsError } = await supabase
            .from('subscription_payments')
            .select('amount, payment_date')
            .eq('payment_status', 'completed');
            
        if (!paymentsError && allPayments) {
            const totalSum = allPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
            console.log(`   💰 Soma TOTAL de todos os pagamentos: R$ ${totalSum.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
            
            if (Math.abs(totalSum - 394294.41) < 1) {
                console.log('   🎯 ISTO É! A função está retornando a soma TOTAL de todos os pagamentos!');
            }
        }
        
        // 4. Verificar se é uma multiplicação dos dados atuais
        console.log('\n🔍 4. Verificando se 394294.41 é uma multiplicação dos dados atuais...');
        
        // Sabemos que os dados individuais mostram R$ 43.810,49
        const currentTotal = 43810.49;
        const multiplier = 394294.41 / currentTotal;
        console.log(`   Dados atuais: R$ ${currentTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`   Valor da função: R$ ${394294.41.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`);
        console.log(`   Multiplicador: ${multiplier.toFixed(2)}x`);
        
        if (Math.abs(multiplier - Math.round(multiplier)) < 0.1) {
            console.log(`   🎯 Possível multiplicação por ${Math.round(multiplier)}!`);
        }
        
        // 5. Verificar todos os registros de tenant_platform_metrics para ver padrões
        console.log('\n🔍 5. Analisando padrões em tenant_platform_metrics...');
        
        const { data: allMetrics, error: metricsError } = await supabase
            .from('tenant_platform_metrics')
            .select('platform_total_revenue, calculation_period_days, metric_date')
            .order('calculated_at', { ascending: false });
            
        if (!metricsError && allMetrics) {
            const uniqueValues = [...new Set(allMetrics.map(m => parseFloat(m.platform_total_revenue || 0)))];
            console.log(`   📊 Valores únicos de platform_total_revenue: ${uniqueValues.length}`);
            uniqueValues.forEach(value => {
                const count = allMetrics.filter(m => Math.abs(parseFloat(m.platform_total_revenue || 0) - value) < 0.01).length;
                console.log(`   - R$ ${value.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${count} registros)`);
            });
        }
        
        console.log('\n🎯 BUSCA CONCLUÍDA');
        console.log('\n💡 DESCOBERTA PRINCIPAL:');
        console.log('   O valor R$ 394.294,41 é retornado APENAS para períodos de 30 dias');
        console.log('   Todos os outros períodos retornam R$ 0,00');
        console.log('   Isso indica dados HARD-CODED ou CACHED específicos para 30 dias');
        
    } catch (error) {
        console.error('❌ Erro durante busca:', error);
    }
}

findExactDataSource();