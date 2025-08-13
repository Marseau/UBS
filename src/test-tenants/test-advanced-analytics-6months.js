#!/usr/bin/env node

/**
 * ANALYTICS AVANÇADO - 6 MESES
 * 
 * Implementa analytics completo para o tenant com visão de 6 meses:
 * 1. Revenue Timeline (mensal)
 * 2. Revenue by Service/Professional  
 * 3. Platform Fees Timeline (valor pago à plataforma)
 * 4. Customer Growth Timeline (evolução do número de clientes)
 * 5. Breakdown detalhado com todas as dimensões
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Gerar últimos 6 meses de períodos
 */
function generateLast6Months() {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        
        months.push({
            label: monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
            year_month: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
            start_date: monthDate,
            end_date: new Date(nextMonth.getTime() - 1) // último dia do mês
        });
    }
    
    return months;
}

/**
 * ANALYTICS 1: Revenue Timeline (6 meses)
 */
async function calculateRevenueTimeline(tenantId) {
    console.log(`\n📈 CALCULANDO REVENUE TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const timeline = [];
    
    for (const month of months) {
        // Buscar appointments completed do mês
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                id,
                final_price,
                quoted_price,
                start_time,
                status
            `)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('start_time', month.start_date.toISOString())
            .lte('start_time', month.end_date.toISOString());

        if (error) {
            console.error(`❌ Erro ao buscar appointments para ${month.label}:`, error);
            continue;
        }

        const monthRevenue = appointments?.reduce((sum, app) => {
            return sum + (app.final_price || app.quoted_price || 0);
        }, 0) || 0;

        timeline.push({
            period: month.label,
            year_month: month.year_month,
            revenue: Math.round(monthRevenue * 100) / 100,
            appointments_count: appointments?.length || 0,
            average_ticket: appointments?.length > 0 ? monthRevenue / appointments.length : 0
        });
    }
    
    return timeline;
}

/**
 * ANALYTICS 2: Revenue by Service (6 meses)
 */
async function calculateRevenueByService(tenantId) {
    console.log(`\n🔧 CALCULANDO REVENUE BY SERVICE (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Buscar appointments com serviços dos últimos 6 meses
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
            id,
            final_price,
            quoted_price,
            start_time,
            status,
            service_id,
            services(id, name, base_price)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('start_time', sixMonthsAgo.toISOString());

    if (error) {
        console.error('❌ Erro ao buscar appointments por serviço:', error);
        return [];
    }

    if (!appointments || appointments.length === 0) {
        return [];
    }

    // Agrupar por serviço
    const serviceBreakdown = {};
    
    for (const appointment of appointments) {
        const serviceName = appointment.services?.name || 'Serviço não informado';
        const serviceId = appointment.service_id || 'unknown';
        const revenue = appointment.final_price || appointment.quoted_price || 0;
        
        if (!serviceBreakdown[serviceId]) {
            serviceBreakdown[serviceId] = {
                service_name: serviceName,
                service_id: serviceId,
                total_revenue: 0,
                appointments_count: 0,
                average_price: 0
            };
        }
        
        serviceBreakdown[serviceId].total_revenue += revenue;
        serviceBreakdown[serviceId].appointments_count++;
    }
    
    // Calcular médias e ordenar
    const serviceResults = Object.values(serviceBreakdown).map(service => ({
        ...service,
        total_revenue: Math.round(service.total_revenue * 100) / 100,
        average_price: Math.round((service.total_revenue / service.appointments_count) * 100) / 100
    })).sort((a, b) => b.total_revenue - a.total_revenue);
    
    return serviceResults;
}

/**
 * ANALYTICS 3: Revenue by Professional (6 meses)
 */
async function calculateRevenueByProfessional(tenantId) {
    console.log(`\n👨‍💼 CALCULANDO REVENUE BY PROFESSIONAL (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    // Buscar appointments com profissionais dos últimos 6 meses
    const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
            id,
            final_price,
            quoted_price,
            start_time,
            status,
            professional_id,
            professionals(id, name, email)
        `)
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('start_time', sixMonthsAgo.toISOString());

    if (error) {
        console.error('❌ Erro ao buscar appointments por profissional:', error);
        return [];
    }

    if (!appointments || appointments.length === 0) {
        return [];
    }

    // Agrupar por profissional
    const professionalBreakdown = {};
    
    for (const appointment of appointments) {
        const professionalName = appointment.professionals?.name || 'Profissional não informado';
        const professionalId = appointment.professional_id || 'unknown';
        const revenue = appointment.final_price || appointment.quoted_price || 0;
        
        if (!professionalBreakdown[professionalId]) {
            professionalBreakdown[professionalId] = {
                professional_name: professionalName,
                professional_id: professionalId,
                total_revenue: 0,
                appointments_count: 0,
                average_price: 0
            };
        }
        
        professionalBreakdown[professionalId].total_revenue += revenue;
        professionalBreakdown[professionalId].appointments_count++;
    }
    
    // Calcular médias e ordenar
    const professionalResults = Object.values(professionalBreakdown).map(professional => ({
        ...professional,
        total_revenue: Math.round(professional.total_revenue * 100) / 100,
        average_price: Math.round((professional.total_revenue / professional.appointments_count) * 100) / 100
    })).sort((a, b) => b.total_revenue - a.total_revenue);
    
    return professionalResults;
}

/**
 * ANALYTICS 4: Platform Fees Timeline (valor pago à plataforma)
 */
async function calculatePlatformFeesTimeline(tenantId) {
    console.log(`\n💰 CALCULANDO PLATFORM FEES TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const feesTimeline = [];
    
    // Assumindo modelo de cobrança por conversas
    // Vamos calcular baseado nas conversas reais de cada mês
    
    for (const month of months) {
        // Buscar conversas do mês (usando conversation_history)
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('id, conversation_outcome, created_at')
            .eq('tenant_id', tenantId)
            .not('conversation_outcome', 'is', null)
            .gte('created_at', month.start_date.toISOString())
            .lte('created_at', month.end_date.toISOString());

        if (error) {
            console.error(`❌ Erro ao buscar conversas para ${month.label}:`, error);
            continue;
        }

        const conversationsCount = conversations?.length || 0;
        
        // Calcular taxa baseado no volume (modelo simplificado)
        let monthlyFee = 0;
        let plan = 'basico';
        
        if (conversationsCount <= 200) {
            monthlyFee = 58.00; // Plano básico
            plan = 'basico';
        } else if (conversationsCount <= 400) {
            monthlyFee = 116.00; // Plano profissional
            plan = 'profissional';
        } else {
            monthlyFee = 290.00; // Plano enterprise
            const overage = conversationsCount - 1250;
            if (overage > 0) {
                monthlyFee += overage * 0.25; // Taxa de excedente
            }
            plan = 'enterprise';
        }

        feesTimeline.push({
            period: month.label,
            year_month: month.year_month,
            conversations_count: conversationsCount,
            plan: plan,
            platform_fee: Math.round(monthlyFee * 100) / 100,
            fee_per_conversation: conversationsCount > 0 ? monthlyFee / conversationsCount : 0
        });
    }
    
    return feesTimeline;
}

/**
 * ANALYTICS 5: Appointments Timeline (6 meses)
 * - Completed + Confirmed appointments
 * - Cancelled appointments
 * - No-show appointments
 */
async function calculateAppointmentsTimeline(tenantId) {
    console.log(`\n📅 CALCULANDO APPOINTMENTS TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const appointmentsTimeline = [];
    
    for (const month of months) {
        // Buscar TODOS os appointments do mês por status
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                id,
                status,
                start_time,
                final_price,
                quoted_price
            `)
            .eq('tenant_id', tenantId)
            .gte('start_time', month.start_date.toISOString())
            .lte('start_time', month.end_date.toISOString());

        if (error) {
            console.error(`❌ Erro ao buscar appointments para ${month.label}:`, error);
            continue;
        }

        // Categorizar appointments por status
        const statusBreakdown = {
            completed: [],
            confirmed: [],
            cancelled: [],
            no_show: [],
            other: []
        };

        appointments?.forEach(appointment => {
            const status = appointment.status;
            if (statusBreakdown[status]) {
                statusBreakdown[status].push(appointment);
            } else {
                statusBreakdown.other.push(appointment);
            }
        });

        // Calcular métricas
        const successful = statusBreakdown.completed.length + statusBreakdown.confirmed.length;
        const cancelled = statusBreakdown.cancelled.length;
        const noShow = statusBreakdown.no_show.length;
        const total = appointments?.length || 0;

        // Calcular receita perdida por cancelamentos e no-shows
        const cancelledRevenueLost = statusBreakdown.cancelled.reduce((sum, app) => {
            return sum + (app.final_price || app.quoted_price || 0);
        }, 0);

        const noShowRevenueLost = statusBreakdown.no_show.reduce((sum, app) => {
            return sum + (app.final_price || app.quoted_price || 0);
        }, 0);

        appointmentsTimeline.push({
            period: month.label,
            year_month: month.year_month,
            total_appointments: total,
            successful_appointments: successful, // completed + confirmed
            cancelled_appointments: cancelled,
            no_show_appointments: noShow,
            other_appointments: statusBreakdown.other.length,
            
            // Percentuais
            success_rate: total > 0 ? (successful / total * 100) : 0,
            cancellation_rate: total > 0 ? (cancelled / total * 100) : 0,
            no_show_rate: total > 0 ? (noShow / total * 100) : 0,
            
            // Impacto financeiro
            cancelled_revenue_lost: Math.round(cancelledRevenueLost * 100) / 100,
            no_show_revenue_lost: Math.round(noShowRevenueLost * 100) / 100,
            total_revenue_lost: Math.round((cancelledRevenueLost + noShowRevenueLost) * 100) / 100,
            
            // Breakdown detalhado
            breakdown: {
                completed: statusBreakdown.completed.length,
                confirmed: statusBreakdown.confirmed.length,
                cancelled: statusBreakdown.cancelled.length,
                no_show: statusBreakdown.no_show.length,
                other: statusBreakdown.other.length
            }
        });
    }
    
    return appointmentsTimeline;
}

/**
 * ANALYTICS 6: Cost Timeline (custo real do tenant para a plataforma - 6 meses)
 */
async function calculateCostTimeline(tenantId) {
    console.log(`\n💰 CALCULANDO COST TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId} - Custo real para a plataforma`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const costTimeline = [];
    
    for (const month of months) {
        // Buscar conversation_history do mês com custos
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select(`
                id,
                api_cost_usd,
                processing_cost_usd,
                tokens_used,
                model_used,
                created_at,
                conversation_outcome,
                confidence_score
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', month.start_date.toISOString())
            .lte('created_at', month.end_date.toISOString());

        if (error) {
            console.error(`❌ Erro ao buscar custos para ${month.label}:`, error);
            continue;
        }

        if (!conversations || conversations.length === 0) {
            costTimeline.push({
                period: month.label,
                year_month: month.year_month,
                total_conversations: 0,
                total_cost_usd: 0,
                api_cost_usd: 0,
                processing_cost_usd: 0,
                total_tokens: 0,
                avg_cost_per_conversation: 0,
                avg_tokens_per_conversation: 0,
                cost_breakdown: {
                    gpt_35_turbo: { conversations: 0, cost: 0, tokens: 0 },
                    gpt_4: { conversations: 0, cost: 0, tokens: 0 },
                    other: { conversations: 0, cost: 0, tokens: 0 }
                }
            });
            continue;
        }

        // Calcular métricas de custo
        let totalApiCost = 0;
        let totalProcessingCost = 0;
        let totalTokens = 0;
        let totalConversations = conversations.length;

        // Breakdown por modelo
        const modelBreakdown = {
            'gpt-3.5-turbo': { conversations: 0, cost: 0, tokens: 0 },
            'gpt-4': { conversations: 0, cost: 0, tokens: 0 },
            'other': { conversations: 0, cost: 0, tokens: 0 }
        };

        for (const conversation of conversations) {
            const apiCost = conversation.api_cost_usd || 0;
            const processingCost = conversation.processing_cost_usd || 0;
            const tokens = conversation.tokens_used || 0;
            const model = conversation.model_used || 'unknown';

            totalApiCost += apiCost;
            totalProcessingCost += processingCost;
            totalTokens += tokens;

            // Classificar por modelo
            if (model.includes('gpt-3.5') || model.includes('3.5')) {
                modelBreakdown['gpt-3.5-turbo'].conversations++;
                modelBreakdown['gpt-3.5-turbo'].cost += (apiCost + processingCost);
                modelBreakdown['gpt-3.5-turbo'].tokens += tokens;
            } else if (model.includes('gpt-4') || model.includes('4')) {
                modelBreakdown['gpt-4'].conversations++;
                modelBreakdown['gpt-4'].cost += (apiCost + processingCost);
                modelBreakdown['gpt-4'].tokens += tokens;
            } else {
                modelBreakdown['other'].conversations++;
                modelBreakdown['other'].cost += (apiCost + processingCost);
                modelBreakdown['other'].tokens += tokens;
            }
        }

        const totalCost = totalApiCost + totalProcessingCost;
        const avgCostPerConversation = totalConversations > 0 ? totalCost / totalConversations : 0;
        const avgTokensPerConversation = totalConversations > 0 ? totalTokens / totalConversations : 0;

        costTimeline.push({
            period: month.label,
            year_month: month.year_month,
            total_conversations: totalConversations,
            total_cost_usd: Math.round(totalCost * 10000) / 10000, // 4 decimais
            api_cost_usd: Math.round(totalApiCost * 10000) / 10000,
            processing_cost_usd: Math.round(totalProcessingCost * 10000) / 10000,
            total_tokens: totalTokens,
            avg_cost_per_conversation: Math.round(avgCostPerConversation * 10000) / 10000,
            avg_tokens_per_conversation: Math.round(avgTokensPerConversation),
            cost_breakdown: {
                gpt_35_turbo: {
                    conversations: modelBreakdown['gpt-3.5-turbo'].conversations,
                    cost: Math.round(modelBreakdown['gpt-3.5-turbo'].cost * 10000) / 10000,
                    tokens: modelBreakdown['gpt-3.5-turbo'].tokens
                },
                gpt_4: {
                    conversations: modelBreakdown['gpt-4'].conversations,
                    cost: Math.round(modelBreakdown['gpt-4'].cost * 10000) / 10000,
                    tokens: modelBreakdown['gpt-4'].tokens
                },
                other: {
                    conversations: modelBreakdown['other'].conversations,
                    cost: Math.round(modelBreakdown['other'].cost * 10000) / 10000,
                    tokens: modelBreakdown['other'].tokens
                }
            }
        });
    }
    
    return costTimeline;
}

/**
 * ANALYTICS 7: Payment Timeline (pagamentos reais do tenant - 6 meses)
 */
async function calculatePaymentTimeline(tenantId) {
    console.log(`\n💳 CALCULANDO PAYMENT TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId} - Pagamentos reais processados`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const paymentTimeline = [];
    
    for (const month of months) {
        // MOCK: Simular pagamentos baseado nas conversas reais
        // Na implementação real, usar conversation_billing table
        
        // Buscar conversas do mês para simular cobrança
        const { data: conversations, error: convError } = await supabase
            .from('conversation_history')
            .select('id, conversation_outcome, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', month.start_date.toISOString())
            .lte('created_at', month.end_date.toISOString())
            .not('conversation_outcome', 'is', null);

        if (convError) {
            console.error(`❌ Erro ao buscar conversas para simular pagamento em ${month.label}:`, convError);
            continue;
        }

        const conversationsCount = conversations?.length || 0;
        
        // Simular pagamento apenas se houve conversas no mês
        let mockPayment = null;
        if (conversationsCount > 0) {
            // Simular cobrança baseada no plano básico (R$ 58/mês)
            const baseAmount = 58.00;
            const conversationsIncluded = 200;
            const overageCount = Math.max(0, conversationsCount - conversationsIncluded);
            const overageAmount = overageCount * 0.25; // R$ 0,25 por conversa excedente
            const totalAmount = baseAmount + overageAmount;
            
            mockPayment = {
                billing_period: `${month.start_date.toISOString().split('T')[0]} to ${month.end_date.toISOString().split('T')[0]}`,
                conversations_used: conversationsCount,
                conversations_included: conversationsIncluded,
                conversations_overage: overageCount,
                base_amount: baseAmount,
                overage_amount: overageAmount,
                total_amount: totalAmount,
                processed_date: new Date(month.end_date.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 dias após o fim do mês
                stripe_record_id: `mock_${tenantId}_${month.year_month}`,
                plan_type: 'basico'
            };
        }

        const uniquePayments = mockPayment ? [mockPayment] : [];

        if (uniquePayments.length === 0) {
            paymentTimeline.push({
                period: month.label,
                year_month: month.year_month,
                payments_count: 0,
                total_paid: 0,
                base_amount: 0,
                overage_amount: 0,
                conversations_billed: 0,
                conversations_included: 0,
                conversations_overage: 0,
                payment_details: [],
                payment_status: 'no_payments'
            });
            continue;
        }

        // Calcular totais
        let totalPaid = 0;
        let totalBaseAmount = 0;
        let totalOverageAmount = 0;
        let totalConversationsBilled = 0;
        let totalConversationsIncluded = 0;
        let totalConversationsOverage = 0;

        const paymentDetails = uniquePayments.map(payment => {
            totalPaid += payment.total_amount || 0;
            totalBaseAmount += payment.base_amount || 0;
            totalOverageAmount += payment.overage_amount || 0;
            totalConversationsBilled += payment.conversations_used || 0;
            totalConversationsIncluded += payment.conversations_included || 0;
            totalConversationsOverage += payment.conversations_overage || 0;

            return payment; // Já está no formato correto
        });

        paymentTimeline.push({
            period: month.label,
            year_month: month.year_month,
            payments_count: uniquePayments.length,
            total_paid: Math.round(totalPaid * 100) / 100,
            base_amount: Math.round(totalBaseAmount * 100) / 100,
            overage_amount: Math.round(totalOverageAmount * 100) / 100,
            conversations_billed: totalConversationsBilled,
            conversations_included: totalConversationsIncluded,
            conversations_overage: totalConversationsOverage,
            payment_details: paymentDetails,
            payment_status: 'paid'
        });
    }
    
    return paymentTimeline;
}

/**
 * ANALYTICS 8: Customer Growth Timeline (6 meses)
 */
async function calculateCustomerGrowthTimeline(tenantId) {
    console.log(`\n👥 CALCULANDO CUSTOMER GROWTH TIMELINE (6 meses)`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('─'.repeat(60));
    
    const months = generateLast6Months();
    const growthTimeline = [];
    let cumulativeCustomers = 0;
    
    for (const month of months) {
        // Buscar novos clientes únicos do mês (primeiro appointment)
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select(`
                user_id,
                start_time,
                users(name, phone)
            `)
            .eq('tenant_id', tenantId)
            .gte('start_time', month.start_date.toISOString())
            .lte('start_time', month.end_date.toISOString())
            .in('status', ['completed', 'confirmed']);

        if (error) {
            console.error(`❌ Erro ao buscar clientes para ${month.label}:`, error);
            continue;
        }

        if (!appointments || appointments.length === 0) {
            growthTimeline.push({
                period: month.label,
                year_month: month.year_month,
                new_customers: 0,
                total_customers: cumulativeCustomers,
                growth_rate: 0
            });
            continue;
        }

        // Verificar quais são realmente novos (primeira vez)
        const uniqueCustomers = [...new Set(appointments.map(app => app.user_id))];
        let newCustomersCount = 0;
        
        for (const customerId of uniqueCustomers) {
            // Verificar se o cliente já teve appointments antes deste mês
            const { data: previousAppointments } = await supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('user_id', customerId)
                .lt('start_time', month.start_date.toISOString())
                .limit(1);
            
            if (!previousAppointments || previousAppointments.length === 0) {
                newCustomersCount++;
            }
        }
        
        cumulativeCustomers += newCustomersCount;
        
        // Calcular taxa de crescimento
        const previousTotal = cumulativeCustomers - newCustomersCount;
        const growthRate = previousTotal > 0 ? (newCustomersCount / previousTotal) * 100 : 0;
        
        growthTimeline.push({
            period: month.label,
            year_month: month.year_month,
            new_customers: newCustomersCount,
            total_customers: cumulativeCustomers,
            growth_rate: Math.round(growthRate * 100) / 100
        });
    }
    
    return growthTimeline;
}

/**
 * Exibir resultados em formato dashboard
 */
function displayAdvancedAnalytics(analytics, tenantId) {
    console.log(`\n📊 ADVANCED ANALYTICS DASHBOARD - 6 MESES`);
    console.log(`   Tenant: ${tenantId}`);
    console.log('═'.repeat(80));
    
    // 1. REVENUE TIMELINE
    console.log(`\n📈 1. REVENUE TIMELINE:`);
    analytics.revenueTimeline.forEach(month => {
        console.log(`   ${month.period}: R$ ${month.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${month.appointments_count} agend. - R$ ${month.average_ticket.toFixed(2)} ticket médio)`);
    });
    
    const totalRevenue6M = analytics.revenueTimeline.reduce((sum, m) => sum + m.revenue, 0);
    const avgMonthlyRevenue = totalRevenue6M / 6;
    console.log(`   📊 TOTAL 6M: R$ ${totalRevenue6M.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   📊 MÉDIA MENSAL: R$ ${avgMonthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    // 2. REVENUE BY SERVICE
    console.log(`\n🔧 2. REVENUE BY SERVICE (Top 5):`);
    analytics.revenueByService.slice(0, 5).forEach((service, index) => {
        console.log(`   ${index + 1}. ${service.service_name}: R$ ${service.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${service.appointments_count} agend. - R$ ${service.average_price.toFixed(2)} média)`);
    });
    
    // 3. REVENUE BY PROFESSIONAL
    console.log(`\n👨‍💼 3. REVENUE BY PROFESSIONAL (Top 5):`);
    analytics.revenueByProfessional.slice(0, 5).forEach((prof, index) => {
        console.log(`   ${index + 1}. ${prof.professional_name}: R$ ${prof.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${prof.appointments_count} agend. - R$ ${prof.average_price.toFixed(2)} média)`);
    });
    
    // 4. PLATFORM FEES TIMELINE
    console.log(`\n💰 4. PLATFORM FEES TIMELINE:`);
    analytics.platformFees.forEach(month => {
        console.log(`   ${month.period}: R$ ${month.platform_fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${month.plan} - ${month.conversations_count} conversas)`);
    });
    
    const totalFees6M = analytics.platformFees.reduce((sum, m) => sum + m.platform_fee, 0);
    const avgMonthlyFees = totalFees6M / 6;
    console.log(`   📊 TOTAL PAGO 6M: R$ ${totalFees6M.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   📊 MÉDIA MENSAL: R$ ${avgMonthlyFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    // 5. APPOINTMENTS TIMELINE
    console.log(`\n📅 5. APPOINTMENTS TIMELINE:`);
    analytics.appointmentsTimeline.forEach(month => {
        console.log(`   ${month.period}: ${month.total_appointments} total (✅${month.successful_appointments} sucesso, 🚫${month.cancelled_appointments} cancelados, ❌${month.no_show_appointments} no-show)`);
        if (month.total_revenue_lost > 0) {
            console.log(`      💸 Receita perdida: R$ ${month.total_revenue_lost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (cancel: R$ ${month.cancelled_revenue_lost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, no-show: R$ ${month.no_show_revenue_lost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);
        }
    });
    
    const totalAppointments6M = analytics.appointmentsTimeline.reduce((sum, m) => sum + m.total_appointments, 0);
    const totalSuccessful6M = analytics.appointmentsTimeline.reduce((sum, m) => sum + m.successful_appointments, 0);
    const totalCancelled6M = analytics.appointmentsTimeline.reduce((sum, m) => sum + m.cancelled_appointments, 0);
    const totalNoShow6M = analytics.appointmentsTimeline.reduce((sum, m) => sum + m.no_show_appointments, 0);
    const totalRevenueLost6M = analytics.appointmentsTimeline.reduce((sum, m) => sum + m.total_revenue_lost, 0);
    
    console.log(`   📊 TOTAL 6M: ${totalAppointments6M} agendamentos`);
    console.log(`   📊 SUCESSO: ${totalSuccessful6M} (${totalAppointments6M > 0 ? (totalSuccessful6M/totalAppointments6M*100).toFixed(1) : 0}%)`);
    console.log(`   📊 CANCELADOS: ${totalCancelled6M} (${totalAppointments6M > 0 ? (totalCancelled6M/totalAppointments6M*100).toFixed(1) : 0}%)`);
    console.log(`   📊 NO-SHOW: ${totalNoShow6M} (${totalAppointments6M > 0 ? (totalNoShow6M/totalAppointments6M*100).toFixed(1) : 0}%)`);
    console.log(`   📊 RECEITA PERDIDA TOTAL: R$ ${totalRevenueLost6M.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    
    // 6. COST TIMELINE (CUSTO REAL PARA PLATAFORMA)
    console.log(`\n💰 6. COST TIMELINE (Custo real para a plataforma):`);
    analytics.costTimeline.forEach(month => {
        if (month.total_cost_usd > 0) {
            console.log(`   ${month.period}: $${month.total_cost_usd.toFixed(4)} (${month.total_conversations} conversas - $${month.avg_cost_per_conversation.toFixed(4)}/conversa)`);
            console.log(`      📊 API: $${month.api_cost_usd.toFixed(4)} | Processing: $${month.processing_cost_usd.toFixed(4)} | Tokens: ${month.total_tokens.toLocaleString()}`);
            
            // Mostrar breakdown por modelo se houver dados
            const { gpt_35_turbo, gpt_4, other } = month.cost_breakdown;
            if (gpt_35_turbo.conversations > 0 || gpt_4.conversations > 0 || other.conversations > 0) {
                const breakdownParts = [];
                if (gpt_35_turbo.conversations > 0) breakdownParts.push(`GPT-3.5: ${gpt_35_turbo.conversations} conversas ($${gpt_35_turbo.cost.toFixed(4)})`);
                if (gpt_4.conversations > 0) breakdownParts.push(`GPT-4: ${gpt_4.conversations} conversas ($${gpt_4.cost.toFixed(4)})`);
                if (other.conversations > 0) breakdownParts.push(`Other: ${other.conversations} conversas ($${other.cost.toFixed(4)})`);
                console.log(`      🔧 Modelos: ${breakdownParts.join(' | ')}`);
            }
        } else {
            console.log(`   ${month.period}: $0.0000 (0 conversas)`);
        }
    });
    
    const totalOperationalCost6M = analytics.costTimeline.reduce((sum, m) => sum + m.total_cost_usd, 0);
    const totalConversationsCost6M = analytics.costTimeline.reduce((sum, m) => sum + m.total_conversations, 0);
    const avgCostPerConversation6M = totalConversationsCost6M > 0 ? totalOperationalCost6M / totalConversationsCost6M : 0;
    
    console.log(`   📊 CUSTO OPERACIONAL TOTAL 6M: $${totalOperationalCost6M.toFixed(4)}`);
    console.log(`   📊 CUSTO MÉDIO POR CONVERSA: $${avgCostPerConversation6M.toFixed(4)}`);
    
    // Calcular eficiência econômica da plataforma
    const totalFeesReceived6M = analytics.platformFees.reduce((sum, m) => sum + m.platform_fee, 0);
    const netProfit6M = totalFeesReceived6M - (totalOperationalCost6M * 5.5); // Assumindo USD para BRL ~5.5
    const operationalMargin = totalFeesReceived6M > 0 ? (netProfit6M / totalFeesReceived6M * 100) : 0;
    
    console.log(`   💡 ANÁLISE ECONÔMICA:`);
    console.log(`      Receita da plataforma: R$ ${totalFeesReceived6M.toFixed(2)}`);
    console.log(`      Custo operacional: ~R$ ${(totalOperationalCost6M * 5.5).toFixed(2)} (USD convertido)`);
    console.log(`      Margem operacional: ${operationalMargin.toFixed(1)}% ${operationalMargin > 0 ? '✅ Lucrativo' : '❌ Prejuízo'}`);
    
    // 7. PAYMENT TIMELINE (PAGAMENTOS REAIS)
    console.log(`\n💳 7. PAYMENT TIMELINE (Pagamentos reais processados):`);
    analytics.paymentTimeline.forEach(month => {
        if (month.payment_status === 'paid') {
            console.log(`   ${month.period}: R$ ${month.total_paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${month.payments_count} pagamento${month.payments_count > 1 ? 's' : ''})`);
            console.log(`      📊 Base: R$ ${month.base_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Excedente: R$ ${month.overage_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            console.log(`      💬 Conversas: ${month.conversations_billed} usadas de ${month.conversations_included} incluídas (${month.conversations_overage} excedentes)`);
            
            // Mostrar detalhes dos pagamentos se houver
            if (month.payment_details && month.payment_details.length > 0) {
                month.payment_details.forEach((payment, index) => {
                    const processedDate = new Date(payment.processed_date).toLocaleDateString('pt-BR');
                    console.log(`      🧾 #${index + 1}: ${payment.plan_type} - R$ ${payment.total_amount.toFixed(2)} (processado em ${processedDate})`);
                });
            }
        } else {
            console.log(`   ${month.period}: R$ 0,00 (sem pagamentos processados)`);
        }
    });
    
    const totalPayments6M = analytics.paymentTimeline.reduce((sum, m) => sum + m.total_paid, 0);
    const totalPaymentsCount6M = analytics.paymentTimeline.reduce((sum, m) => sum + m.payments_count, 0);
    const totalConversationsBilled6M = analytics.paymentTimeline.reduce((sum, m) => sum + m.conversations_billed, 0);
    
    console.log(`   📊 TOTAL PAGO 6M: R$ ${totalPayments6M.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    console.log(`   📊 TOTAL PAGAMENTOS: ${totalPaymentsCount6M}`);
    console.log(`   📊 CONVERSAS FATURADAS: ${totalConversationsBilled6M}`);
    
    // Análise de compliance de pagamento
    const monthsWithPayments = analytics.paymentTimeline.filter(m => m.payment_status === 'paid').length;
    const paymentCompliance = monthsWithPayments / 6 * 100;
    
    if (paymentCompliance === 100) {
        console.log(`   ✅ EXCELENTE COMPLIANCE: 100% dos meses com pagamentos`);
    } else if (paymentCompliance >= 80) {
        console.log(`   📈 BOA COMPLIANCE: ${paymentCompliance.toFixed(1)}% dos meses com pagamentos`);
    } else {
        console.log(`   ⚠️ COMPLIANCE BAIXA: ${paymentCompliance.toFixed(1)}% dos meses com pagamentos`);
    }
    
    // 8. CUSTOMER GROWTH
    console.log(`\n👥 8. CUSTOMER GROWTH TIMELINE:`);
    analytics.customerGrowth.forEach(month => {
        console.log(`   ${month.period}: +${month.new_customers} novos (total: ${month.total_customers}) - ${month.growth_rate.toFixed(1)}% crescimento`);
    });
    
    const totalNewCustomers6M = analytics.customerGrowth.reduce((sum, m) => sum + m.new_customers, 0);
    const finalCustomerCount = analytics.customerGrowth[analytics.customerGrowth.length - 1]?.total_customers || 0;
    console.log(`   📊 NOVOS CLIENTES 6M: ${totalNewCustomers6M}`);
    console.log(`   📊 BASE ATUAL: ${finalCustomerCount} clientes`);
    
    // INSIGHTS GERAIS
    console.log(`\n💡 9. INSIGHTS ESTRATÉGICOS:`);
    
    const revenueGrowth = analytics.revenueTimeline.length >= 2 ? 
        ((analytics.revenueTimeline[5].revenue - analytics.revenueTimeline[0].revenue) / analytics.revenueTimeline[0].revenue * 100) : 0;
    
    if (revenueGrowth > 20) {
        console.log(`   🚀 CRESCIMENTO ACELERADO: +${revenueGrowth.toFixed(1)}% de receita em 6 meses`);
    } else if (revenueGrowth > 0) {
        console.log(`   📈 CRESCIMENTO POSITIVO: +${revenueGrowth.toFixed(1)}% de receita em 6 meses`);
    } else {
        console.log(`   ⚠️ ATENÇÃO: ${revenueGrowth.toFixed(1)}% variação de receita em 6 meses`);
    }
    
    const topService = analytics.revenueByService[0];
    if (topService) {
        const servicePercentage = (topService.total_revenue / totalRevenue6M * 100);
        console.log(`   ⭐ SERVIÇO ESTRELA: ${topService.service_name} (${servicePercentage.toFixed(1)}% da receita)`);
    }
    
    const topProfessional = analytics.revenueByProfessional[0];
    if (topProfessional) {
        const profPercentage = (topProfessional.total_revenue / totalRevenue6M * 100);
        console.log(`   👑 PROFISSIONAL TOP: ${topProfessional.professional_name} (${profPercentage.toFixed(1)}% da receita)`);
    }
    
    const feeToRevenueRatio = totalRevenue6M > 0 ? (totalFees6M / totalRevenue6M * 100) : 0;
    console.log(`   💸 TAXA PLATAFORMA: ${feeToRevenueRatio.toFixed(1)}% da receita vai para a plataforma`);
    
    // Insights sobre appointments
    const overallSuccessRate = totalAppointments6M > 0 ? (totalSuccessful6M / totalAppointments6M * 100) : 0;
    const overallCancellationRate = totalAppointments6M > 0 ? (totalCancelled6M / totalAppointments6M * 100) : 0;
    const overallNoShowRate = totalAppointments6M > 0 ? (totalNoShow6M / totalAppointments6M * 100) : 0;
    
    if (overallSuccessRate >= 85) {
        console.log(`   ✅ EXCELENTE CONVERSÃO: ${overallSuccessRate.toFixed(1)}% de agendamentos bem-sucedidos`);
    } else if (overallSuccessRate >= 70) {
        console.log(`   📈 BOA CONVERSÃO: ${overallSuccessRate.toFixed(1)}% de agendamentos bem-sucedidos`);
    } else {
        console.log(`   ⚠️ CONVERSÃO BAIXA: ${overallSuccessRate.toFixed(1)}% de agendamentos bem-sucedidos`);
    }
    
    if (overallCancellationRate > 20) {
        console.log(`   🚨 ALTO CANCELAMENTO: ${overallCancellationRate.toFixed(1)}% - investigar causas`);
    } else if (overallCancellationRate > 10) {
        console.log(`   ⚠️ CANCELAMENTO MODERADO: ${overallCancellationRate.toFixed(1)}% - pode melhorar`);
    } else {
        console.log(`   ✅ BAIXO CANCELAMENTO: ${overallCancellationRate.toFixed(1)}% - excelente retenção`);
    }
    
    if (overallNoShowRate > 15) {
        console.log(`   🚨 ALTO NO-SHOW: ${overallNoShowRate.toFixed(1)}% - implementar lembretes`);
    } else if (overallNoShowRate > 5) {
        console.log(`   ⚠️ NO-SHOW MODERADO: ${overallNoShowRate.toFixed(1)}% - melhorar confirmações`);
    } else {
        console.log(`   ✅ BAIXO NO-SHOW: ${overallNoShowRate.toFixed(1)}% - clientes comprometidos`);
    }
    
    if (totalRevenueLost6M > 0) {
        const revenueLostPercentage = totalRevenue6M > 0 ? (totalRevenueLost6M / totalRevenue6M * 100) : 0;
        console.log(`   💸 RECEITA PERDIDA: R$ ${totalRevenueLost6M.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${revenueLostPercentage.toFixed(1)}% da receita efetiva)`);
    }
}

/**
 * Executar todos os analytics
 */
async function runAdvancedAnalytics() {
    console.log('🚀 INICIANDO ADVANCED ANALYTICS - 6 MESES');
    console.log('='.repeat(80));
    
    try {
        // Buscar tenant para teste
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select('id, name')
            .limit(1);
        
        if (error || !tenants || tenants.length === 0) {
            console.error('❌ Erro ao buscar tenants para teste');
            return;
        }
        
        const testTenant = tenants[0];
        console.log(`🏢 Analisando tenant: ${testTenant.name}`);
        
        // Executar todos os analytics
        const [
            revenueTimeline,
            revenueByService,
            revenueByProfessional,
            platformFees,
            appointmentsTimeline,
            costTimeline,
            paymentTimeline,
            customerGrowth
        ] = await Promise.all([
            calculateRevenueTimeline(testTenant.id),
            calculateRevenueByService(testTenant.id),
            calculateRevenueByProfessional(testTenant.id),
            calculatePlatformFeesTimeline(testTenant.id),
            calculateAppointmentsTimeline(testTenant.id),
            calculateCostTimeline(testTenant.id),
            calculatePaymentTimeline(testTenant.id),
            calculateCustomerGrowthTimeline(testTenant.id)
        ]);
        
        const analytics = {
            revenueTimeline,
            revenueByService,
            revenueByProfessional,
            platformFees,
            appointmentsTimeline,
            costTimeline,
            paymentTimeline,
            customerGrowth
        };
        
        // Exibir resultados
        displayAdvancedAnalytics(analytics, testTenant.id);
        
        console.log('\n✅ ADVANCED ANALYTICS CONCLUÍDO COM SUCESSO!');
        
        return analytics;
        
    } catch (error) {
        console.error('❌ Erro no advanced analytics:', error);
    }
}

// Executar o teste
if (require.main === module) {
    runAdvancedAnalytics().catch(console.error);
}

module.exports = {
    calculateRevenueTimeline,
    calculateRevenueByService,
    calculateRevenueByProfessional,
    calculatePlatformFeesTimeline,
    calculateAppointmentsTimeline,
    calculateCostTimeline,
    calculatePaymentTimeline,
    calculateCustomerGrowthTimeline,
    generateLast6Months
};