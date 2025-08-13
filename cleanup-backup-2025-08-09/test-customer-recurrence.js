#!/usr/bin/env node

/**
 * TESTE: Customer Recurrence Analysis
 * 
 * Valida métrica 6 do dashboard tenant
 * Foco: Análise de clientes recorrentes vs novos
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Calcular datas de início e fim para cada período
 */
function calculatePeriodDates(period) {
    const end = new Date();
    const start = new Date();
    
    switch (period) {
        case '7d':
            start.setDate(end.getDate() - 7);
            break;
        case '30d':
            start.setDate(end.getDate() - 30);
            break;
        case '90d':
            start.setDate(end.getDate() - 90);
            break;
    }
    
    return { start, end };
}

/**
 * MÉTRICA 6: Customer Recurrence Analysis
 * Fórmulas:
 * - new_customers = clientes que aparecem pela primeira vez no período
 * - returning_customers = clientes que já tinham appointments anteriores
 * - recurrence_percentage = (returning / total) * 100
 * - avg_visits_per_customer = total_appointments / unique_customers
 * - revenue_from_returning = receita dos clientes recorrentes
 */
async function calculateCustomerRecurrence(tenantId, period) {
    console.log(`\n🔄 CALCULANDO CUSTOMER RECURRENCE ANALYSIS`);
    console.log(`   Tenant: ${tenantId}`);
    console.log(`   Período: ${period}`);
    console.log('─'.repeat(50));
    
    const { start: currentStart, end: currentEnd } = calculatePeriodDates(period);
    
    // 1. Buscar todos os appointments do período atual (completed/confirmed)
    const { data: currentAppointments, error: currentError } = await supabase
        .from('appointments')
        .select(`
            id,
            user_id,
            status,
            final_price,
            quoted_price,
            start_time,
            created_at,
            users(name, phone)
        `)
        .eq('tenant_id', tenantId)
        .gte('start_time', currentStart.toISOString())
        .lte('start_time', currentEnd.toISOString())
        .in('status', ['completed', 'confirmed']); // Só contar appointments válidos

    if (currentError) {
        console.error('❌ Erro ao buscar appointments atuais:', currentError);
        return null;
    }

    if (!currentAppointments || currentAppointments.length === 0) {
        console.log('⚠️ Nenhum appointment encontrado para este período');
        return {
            total_customers: 0,
            new_customers: 0,
            returning_customers: 0,
            recurrence_percentage: 0,
            avg_visits_per_customer: 0,
            total_revenue: 0,
            revenue_from_new: 0,
            revenue_from_returning: 0,
            new_customer_revenue_percentage: 0,
            breakdown: {
                new_customers_details: [],
                returning_customers_details: []
            }
        };
    }

    console.log(`📊 Appointments no período: ${currentAppointments.length}`);

    // 2. Obter clientes únicos do período atual
    const currentCustomerIds = [...new Set(currentAppointments.map(app => app.user_id))];
    console.log(`👥 Clientes únicos no período: ${currentCustomerIds.length}`);

    // 3. Para cada cliente, verificar se já teve appointments ANTES do período atual
    const customerAnalysis = [];
    
    for (const customerId of currentCustomerIds) {
        // Buscar appointments históricos ANTES do período atual
        const { data: historicalAppointments, error: histError } = await supabase
            .from('appointments')
            .select('id, start_time, status')
            .eq('tenant_id', tenantId)
            .eq('user_id', customerId)
            .lt('start_time', currentStart.toISOString())
            .in('status', ['completed', 'confirmed']);

        if (histError) {
            console.error(`❌ Erro ao buscar histórico para cliente ${customerId}:`, histError);
            continue;
        }

        // Appointments do cliente no período atual
        const customerCurrentAppointments = currentAppointments.filter(app => app.user_id === customerId);
        const customerRevenue = customerCurrentAppointments.reduce((sum, app) => {
            return sum + (app.final_price || app.quoted_price || 0);
        }, 0);

        const isReturning = historicalAppointments && historicalAppointments.length > 0;
        const customerName = customerCurrentAppointments[0]?.users?.name || 'Nome não informado';
        const customerPhone = customerCurrentAppointments[0]?.users?.phone || 'Telefone não informado';

        customerAnalysis.push({
            user_id: customerId,
            name: customerName,
            phone: customerPhone,
            is_returning: isReturning,
            historical_appointments: historicalAppointments ? historicalAppointments.length : 0,
            current_appointments: customerCurrentAppointments.length,
            current_revenue: customerRevenue,
            first_visit_in_period: customerCurrentAppointments.sort((a, b) => 
                new Date(a.start_time) - new Date(b.start_time)
            )[0]?.start_time
        });
    }

    // 4. Separar clientes novos vs recorrentes
    const newCustomers = customerAnalysis.filter(c => !c.is_returning);
    const returningCustomers = customerAnalysis.filter(c => c.is_returning);

    // 5. Calcular métricas
    const totalCustomers = customerAnalysis.length;
    const newCustomersCount = newCustomers.length;
    const returningCustomersCount = returningCustomers.length;
    const recurrencePercentage = totalCustomers > 0 ? (returningCustomersCount / totalCustomers) * 100 : 0;
    
    const totalRevenue = customerAnalysis.reduce((sum, c) => sum + c.current_revenue, 0);
    const revenueFromNew = newCustomers.reduce((sum, c) => sum + c.current_revenue, 0);
    const revenueFromReturning = returningCustomers.reduce((sum, c) => sum + c.current_revenue, 0);
    
    const newCustomerRevenuePercentage = totalRevenue > 0 ? (revenueFromNew / totalRevenue) * 100 : 0;
    const avgVisitsPerCustomer = totalCustomers > 0 ? currentAppointments.length / totalCustomers : 0;

    return {
        total_customers: totalCustomers,
        new_customers: newCustomersCount,
        returning_customers: returningCustomersCount,
        recurrence_percentage: Math.round(recurrencePercentage * 100) / 100,
        avg_visits_per_customer: Math.round(avgVisitsPerCustomer * 100) / 100,
        total_revenue: Math.round(totalRevenue * 100) / 100,
        revenue_from_new: Math.round(revenueFromNew * 100) / 100,
        revenue_from_returning: Math.round(revenueFromReturning * 100) / 100,
        new_customer_revenue_percentage: Math.round(newCustomerRevenuePercentage * 100) / 100,
        breakdown: {
            new_customers_details: newCustomers.map(c => ({
                name: c.name,
                phone: c.phone,
                appointments: c.current_appointments,
                revenue: Math.round(c.current_revenue * 100) / 100,
                first_visit: c.first_visit_in_period
            })),
            returning_customers_details: returningCustomers.map(c => ({
                name: c.name,
                phone: c.phone,
                appointments: c.current_appointments,
                revenue: Math.round(c.current_revenue * 100) / 100,
                historical_visits: c.historical_appointments,
                first_visit_in_period: c.first_visit_in_period
            }))
        }
    };
}

/**
 * Formato transparente para exibição
 */
function displayTransparentResults(results, period, tenantId) {
    console.log(`\n🔄 RESULTADOS TRANSPARENTES - CUSTOMER RECURRENCE ANALYSIS`);
    console.log(`   Tenant: ${tenantId} | Período: ${period}`);
    console.log('═'.repeat(80));
    
    console.log(`\n📊 MÉTRICAS PRINCIPAIS:`);
    console.log(`   Total Customers: ${results.total_customers}`);
    console.log(`   New Customers: ${results.new_customers}`);
    console.log(`   Returning Customers: ${results.returning_customers}`);
    console.log(`   Recurrence Rate: ${results.recurrence_percentage}%`);
    console.log(`   Avg Visits per Customer: ${results.avg_visits_per_customer}`);
    
    console.log(`\n💰 RECEITA POR TIPO:`);
    console.log(`   Total Revenue: R$ ${results.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   Revenue from New: R$ ${results.revenue_from_new.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${results.new_customer_revenue_percentage}%)`);
    console.log(`   Revenue from Returning: R$ ${results.revenue_from_returning.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${(100 - results.new_customer_revenue_percentage).toFixed(2)}%)`);
    
    if (results.breakdown.new_customers_details.length > 0) {
        console.log(`\n🆕 CLIENTES NOVOS (${results.new_customers}):`);
        results.breakdown.new_customers_details
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5) // Top 5
            .forEach((customer, index) => {
                console.log(`   ${index + 1}. ${customer.name} - ${customer.appointments} agend. - R$ ${customer.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            });
        if (results.breakdown.new_customers_details.length > 5) {
            console.log(`   ... e mais ${results.breakdown.new_customers_details.length - 5} clientes novos`);
        }
    }
    
    if (results.breakdown.returning_customers_details.length > 0) {
        console.log(`\n🔄 CLIENTES RECORRENTES (${results.returning_customers}):`);
        results.breakdown.returning_customers_details
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5) // Top 5
            .forEach((customer, index) => {
                console.log(`   ${index + 1}. ${customer.name} - ${customer.appointments} agend. (${customer.historical_visits} hist.) - R$ ${customer.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            });
        if (results.breakdown.returning_customers_details.length > 5) {
            console.log(`   ... e mais ${results.breakdown.returning_customers_details.length - 5} clientes recorrentes`);
        }
    }
    
    console.log(`\n💡 INSIGHTS:`);
    if (results.recurrence_percentage >= 60) {
        console.log(`   ✅ EXCELENTE: ${results.recurrence_percentage}% dos clientes são recorrentes - base fiel!`);
    } else if (results.recurrence_percentage >= 40) {
        console.log(`   📈 BOM: ${results.recurrence_percentage}% de recorrência - oportunidade de melhorar fidelização`);
    } else if (results.recurrence_percentage >= 20) {
        console.log(`   ⚠️ ATENÇÃO: Apenas ${results.recurrence_percentage}% de recorrência - foco em retenção!`);
    } else {
        console.log(`   🚨 CRÍTICO: ${results.recurrence_percentage}% de recorrência - problema na fidelização`);
    }
    
    if (results.avg_visits_per_customer >= 2) {
        console.log(`   ✅ Boa frequência: ${results.avg_visits_per_customer} visitas por cliente em média`);
    } else {
        console.log(`   📈 Oportunidade: ${results.avg_visits_per_customer} visitas por cliente - incentivar retorno`);
    }
}

/**
 * Testar a métrica para alguns tenants
 */
async function testCustomerRecurrence() {
    console.log('🚀 INICIANDO TESTE: CUSTOMER RECURRENCE ANALYSIS');
    console.log('='.repeat(80));
    
    try {
        // Buscar tenants ativos
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(3);
        
        if (error) {
            console.error('❌ Erro ao buscar tenants:', error);
            return;
        }
        
        const periods = ['7d', '30d', '90d'];
        
        for (const tenant of tenants) {
            console.log(`\n🏢 TESTANDO TENANT: ${tenant.name} (${tenant.id})`);
            console.log('─'.repeat(80));
            
            for (const period of periods) {
                const results = await calculateCustomerRecurrence(tenant.id, period);
                
                if (results) {
                    displayTransparentResults(results, period, tenant.id);
                    console.log('\n' + '─'.repeat(80));
                }
            }
        }
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar o teste
if (require.main === module) {
    testCustomerRecurrence().catch(console.error);
}

module.exports = {
    calculateCustomerRecurrence,
    displayTransparentResults
};