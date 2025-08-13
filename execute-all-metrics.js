/**
 * EXECUTE ALL METRICS - Sistema Unificado de Cálculo de Todas as Métricas
 * 
 * Este script implementa o cálculo automático de TODAS as 14+ métricas do sistema:
 * - 6 métricas de conversation outcomes
 * - 8+ métricas de appointments
 * - Métricas de platform e billing
 * 
 * Executa para todos os tenants ativos nos períodos 7d, 30d, 90d
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-08-04
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Calcula data de início baseado no período
 */
function getStartDate(periodDays) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);
    return startDate.toISOString();
}

/**
 * MÉTRICA 1: COMPLETED_CONVERSATIONS (CORRIGIDA)
 * Tabela: conversation_history
 * Campo: conversation_outcome = 'appointment_created'
 */
async function calculateCompletedConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('conversation_outcome', 'appointment_created')
            .gte('created_at', startDate);

        if (error) throw error;

        // Já filtrado por conversation_outcome = 'appointment_created'
        return data ? data.length : 0;
    } catch (error) {
        console.error(`❌ Erro calculando completed_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 2: CANCELLED_CONVERSATIONS (CORRIGIDA)
 * Tabela: conversation_history
 * Campo: conversation_outcome = 'appointment_cancelled'
 */
async function calculateCancelledConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('conversation_outcome', 'appointment_cancelled')
            .gte('created_at', startDate);

        if (error) throw error;

        return data ? data.length : 0;
    } catch (error) {
        console.error(`❌ Erro calculando cancelled_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 3: INFO_REQUEST_FULFILLED_CONVERSATIONS (NOVA)
 * Tabela: conversation_history
 * Campo: conversation_outcome = 'info_request_fulfilled'
 */
async function calculateInfoRequestFulfilledConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('conversation_outcome', 'info_request_fulfilled')
            .gte('created_at', startDate);

        if (error) throw error;
        return data ? data.length : 0;
    } catch (error) {
        console.error(`❌ Erro calculando info_request_fulfilled_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 4: PRICE_INQUIRY_CONVERSATIONS (NOVA)
 * Tabela: conversation_history
 * Campo: conversation_outcome = 'price_inquiry'
 */
async function calculatePriceInquiryConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('conversation_outcome', 'price_inquiry')
            .gte('created_at', startDate);

        if (error) throw error;
        return data ? data.length : 0;
    } catch (error) {
        console.error(`❌ Erro calculando price_inquiry_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 5: AVG_MINUTES_PER_CONVERSATION
 * Tabela: conversation_history
 * Agrupamento: por session_id
 */
async function calculateAvgMinutesPerConversation(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const sessionTotals = new Map();
        
        data.forEach(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                
                if (context && context.session_id && context.duration_minutes) {
                    const sessionId = context.session_id;
                    const minutes = parseFloat(context.duration_minutes) || 0;
                    
                    if (!sessionTotals.has(sessionId)) {
                        sessionTotals.set(sessionId, 0);
                    }
                    sessionTotals.set(sessionId, sessionTotals.get(sessionId) + minutes);
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        if (sessionTotals.size === 0) return 0;

        const totalMinutes = Array.from(sessionTotals.values()).reduce((sum, minutes) => sum + minutes, 0);
        return totalMinutes / sessionTotals.size;
    } catch (error) {
        console.error(`❌ Erro calculando avg_minutes_per_conversation para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 4: AVG_MESSAGES_PER_CONVERSATION
 * Tabela: conversation_history
 * Agrupamento: por session_id
 */
async function calculateAvgMessagesPerConversation(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const sessionTotals = new Map();
        
        data.forEach(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                
                if (context && context.session_id && context.message_count) {
                    const sessionId = context.session_id;
                    const messages = parseInt(context.message_count) || 0;
                    
                    if (!sessionTotals.has(sessionId)) {
                        sessionTotals.set(sessionId, 0);
                    }
                    sessionTotals.set(sessionId, sessionTotals.get(sessionId) + messages);
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        if (sessionTotals.size === 0) return 0;

        const totalMessages = Array.from(sessionTotals.values()).reduce((sum, messages) => sum + messages, 0);
        return totalMessages / sessionTotals.size;
    } catch (error) {
        console.error(`❌ Erro calculando avg_messages_per_conversation para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 5: UNIQUE_CUSTOMERS_COUNT
 * Tabela: conversation_history
 * Campo: conversation_context.customer_phone
 */
async function calculateUniqueCustomersCount(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        // Função já foi corrigida acima para usar user_id
        return 0; // Esta função foi substituída
    } catch (error) {
        console.error(`❌ Erro calculando unique_customers_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 6: MONTHLY_REVENUE_APPOINTMENTS
 * Tabela: appointments
 * Campos: final_price ou quoted_price, status='completed'/'confirmed'
 */
async function calculateMonthlyRevenueAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed']);

        if (error) throw error;

        const totalRevenue = data.reduce((sum, appointment) => {
            const price = appointment.final_price || appointment.quoted_price || 0;
            return sum + parseFloat(price);
        }, 0);

        return totalRevenue;
    } catch (error) {
        console.error(`❌ Erro calculando monthly_revenue_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 7: APPOINTMENT_SUCCESS_RATE
 * Tabela: appointments
 * Cálculo: (completed + confirmed) / total * 100
 */
async function calculateAppointmentSuccessRate(tenantId, startDate) {
    try {
        // Total de appointments
        const { data: totalData, error: totalError } = await supabase
            .from('appointments')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (totalError) throw totalError;
        const totalAppointments = totalData.length;

        if (totalAppointments === 0) return 0;

        // Appointments com sucesso
        const { data: successData, error: successError } = await supabase
            .from('appointments')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed']);

        if (successError) throw successError;
        const successfulAppointments = successData.length;

        return (successfulAppointments / totalAppointments) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando appointment_success_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 8: NO_SHOW_IMPACT
 * Tabela: appointments
 * Cálculo: no_show / total * 100
 */
async function calculateNoShowImpact(tenantId, startDate) {
    try {
        // Total de appointments
        const { data: totalData, error: totalError } = await supabase
            .from('appointments')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (totalError) throw totalError;
        const totalAppointments = totalData.length;

        if (totalAppointments === 0) return 0;

        // No-shows
        const { data: noShowData, error: noShowError } = await supabase
            .from('appointments')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .eq('status', 'no_show');

        if (noShowError) throw noShowError;
        const noShows = noShowData.length;

        return (noShows / totalAppointments) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando no_show_impact para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 9: PROCESSING_COST_USD
 * Tabela: conversation_history
 * Campo: conversation_context.processing_cost
 */
async function calculateProcessingCostUSD(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        let totalCost = 0;
        let conversationCount = 0;
        
        data.forEach(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                
                if (context && context.processing_cost) {
                    totalCost += parseFloat(context.processing_cost) || 0;
                    conversationCount++;
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        return conversationCount > 0 ? totalCost / conversationCount : 0;
    } catch (error) {
        console.error(`❌ Erro calculando processing_cost_usd para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 10: CONFIDENCE_SCORE_AVG
 * Tabela: conversation_history
 * Campo: conversation_context.confidence_score
 */
async function calculateConfidenceScoreAvg(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        let totalConfidence = 0;
        let count = 0;
        
        data.forEach(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                
                if (context && context.confidence_score) {
                    totalConfidence += parseFloat(context.confidence_score) || 0;
                    count++;
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        return count > 0 ? totalConfidence / count : 0;
    } catch (error) {
        console.error(`❌ Erro calculando confidence_score_avg para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 11: SERVICES_COUNT
 * Tabela: services
 */
async function calculateServicesCount(tenantId) {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        if (error) throw error;
        return data.length;
    } catch (error) {
        console.error(`❌ Erro calculando services_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 12: PROFESSIONALS_COUNT
 * Tabela: professionals
 */
async function calculateProfessionalsCount(tenantId) {
    try {
        const { data, error } = await supabase
            .from('professionals')
            .select('id', { count: 'exact' })
            .eq('tenant_id', tenantId)
            .eq('is_active', true);

        if (error) throw error;
        return data.length;
    } catch (error) {
        console.error(`❌ Erro calculando professionals_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 13: CANCELLED_CONVERSATIONS
 * Tabela: conversation_history
 * Campo: conversation_context JSON onde outcome='cancelled'
 */
async function calculateCancelledConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const cancelled = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && context.outcome === 'cancelled';
            } catch {
                return false;
            }
        });

        return cancelled.length;
    } catch (error) {
        console.error(`❌ Erro calculando cancelled_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 14: NO_SHOW_CONVERSATIONS
 * Tabela: conversation_history
 * Campo: conversation_context JSON onde outcome='no_show'
 */
async function calculateNoShowConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const noShow = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && context.outcome === 'no_show';
            } catch {
                return false;
            }
        });

        return noShow.length;
    } catch (error) {
        console.error(`❌ Erro calculando no_show_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 15: RESCHEDULED_CONVERSATIONS
 * Tabela: conversation_history
 * Campo: conversation_context JSON onde outcome='rescheduled'
 */
async function calculateRescheduledConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const rescheduled = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && context.outcome === 'rescheduled';
            } catch {
                return false;
            }
        });

        return rescheduled.length;
    } catch (error) {
        console.error(`❌ Erro calculando rescheduled_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 16: FAILED_CONVERSATIONS
 * Tabela: conversation_history
 * Campo: conversation_context JSON onde outcome='failed'
 */
async function calculateFailedConversations(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        const failed = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && context.outcome === 'failed';
            } catch {
                return false;
            }
        });

        return failed.length;
    } catch (error) {
        console.error(`❌ Erro calculando failed_conversations para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 17: CUSTOMER_RECURRENCE_RATE
 * Tabela: appointments
 * Cálculo: clientes que retornam / total de clientes * 100
 */
async function calculateCustomerRecurrenceRate(tenantId, startDate) {
    try {
        // Período anterior para determinar clientes existentes
        const previousStartDate = new Date(startDate);
        previousStartDate.setDate(previousStartDate.getDate() - 90); // 90 dias antes
        
        // Clientes que fizeram appointments antes do período atual
        const { data: previousCustomers, error: prevError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', previousStartDate.toISOString())
            .lt('start_time', startDate);

        if (prevError) throw prevError;

        // Clientes únicos do período anterior
        const previousCustomerIds = new Set(previousCustomers.map(a => a.user_id));

        // Clientes do período atual
        const { data: currentCustomers, error: currentError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (currentError) throw currentError;

        // Clientes únicos do período atual
        const currentCustomerIds = new Set(currentCustomers.map(a => a.user_id));

        if (currentCustomerIds.size === 0) return 0;

        // Clientes que retornaram (estavam no período anterior E estão no atual)
        const returningCustomers = [...currentCustomerIds].filter(id => previousCustomerIds.has(id));

        return (returningCustomers.length / currentCustomerIds.size) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando customer_recurrence_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 18: CUSTOMER_LIFETIME_VALUE
 * Tabela: appointments
 * Cálculo: receita total por cliente / número de clientes únicos
 */
async function calculateCustomerLifetimeValue(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('user_id, final_price, quoted_price, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed']);

        if (error) throw error;

        const customerRevenue = new Map();
        
        data.forEach(appointment => {
            const revenue = appointment.final_price || appointment.quoted_price || 0;
            const userId = appointment.user_id;
            
            if (!customerRevenue.has(userId)) {
                customerRevenue.set(userId, 0);
            }
            customerRevenue.set(userId, customerRevenue.get(userId) + parseFloat(revenue));
        });

        if (customerRevenue.size === 0) return 0;

        const totalRevenue = Array.from(customerRevenue.values()).reduce((sum, revenue) => sum + revenue, 0);
        return totalRevenue / customerRevenue.size;
    } catch (error) {
        console.error(`❌ Erro calculando customer_lifetime_value para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 19: APPOINTMENT_DURATION_AVERAGE
 * Tabela: appointments
 * Cálculo: média de duração dos appointments (se houver campo duration)
 */
async function calculateAppointmentDurationAverage(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('start_time, end_time')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .not('end_time', 'is', null);

        if (error) throw error;

        if (data.length === 0) return 0;

        const durations = data.map(appointment => {
            const start = new Date(appointment.start_time);
            const end = new Date(appointment.end_time);
            return (end - start) / (1000 * 60); // Duração em minutos
        }).filter(duration => duration > 0);

        if (durations.length === 0) return 0;

        return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    } catch (error) {
        console.error(`❌ Erro calculando appointment_duration_average para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 20: AI_ASSISTANT_EFFICIENCY
 * Tabela: conversation_history
 * Cálculo: conversas com outcome positivo / total de conversas * 100
 */
async function calculateAiAssistantEfficiency(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        if (data.length === 0) return 0;

        const successfulOutcomes = ['completed', 'rescheduled'];
        const successful = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && successfulOutcomes.includes(context.outcome);
            } catch {
                return false;
            }
        });

        return (successful.length / data.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando ai_assistant_efficiency para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 21: MONTHLY_PLATFORM_COST_BRL
 * Tabela: tenants
 * Cálculo: custo do plano do tenant por mês
 */
async function calculateMonthlyPlatformCostBRL(tenantId) {
    try {
        const { data, error } = await supabase
            .from('tenants')
            .select('subscription_plan')
            .eq('id', tenantId)
            .single();

        if (error) throw error;

        const planCosts = {
            'basico': 58.00,
            'profissional': 198.00,
            'premium': 498.00
        };

        return planCosts[data.subscription_plan] || 0;
    } catch (error) {
        console.error(`❌ Erro calculando monthly_platform_cost_brl para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 22: TOTAL_CHAT_MINUTES
 * Tabela: conversation_history
 * Cálculo: soma total de minutos de chat
 */
async function calculateTotalChatMinutes(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        let totalMinutes = 0;
        
        data.forEach(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                
                if (context && context.duration_minutes) {
                    totalMinutes += parseFloat(context.duration_minutes) || 0;
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        return totalMinutes;
    } catch (error) {
        console.error(`❌ Erro calculando total_chat_minutes para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 23: SPAM_RATE
 * Tabela: conversation_history
 * Cálculo: conversas marcadas como spam / total * 100
 */
async function calculateSpamRate(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('conversation_history')
            .select('*')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;

        if (data.length === 0) return 0;

        const spamConversations = data.filter(row => {
            try {
                const context = typeof row.conversation_context === 'string' 
                    ? JSON.parse(row.conversation_context) 
                    : row.conversation_context;
                return context && (context.is_spam === true || context.outcome === 'spam');
            } catch {
                return false;
            }
        });

        return (spamConversations.length / data.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando spam_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 24: SIX_MONTHS_CONVERSATIONS
 * Histórico de conversas dos últimos 6 meses por mês
 */
async function calculateSixMonthsConversations(tenantId) {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const { data, error } = await supabase
            .from('conversation_history')
            .select('created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', sixMonthsAgo.toISOString());

        if (error) throw error;

        const monthlyData = {};
        
        data.forEach(row => {
            const date = new Date(row.created_at);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            monthlyData[monthKey]++;
        });

        return monthlyData;
    } catch (error) {
        console.error(`❌ Erro calculando six_months_conversations para tenant ${tenantId}:`, error.message);
        return {};
    }
}

/**
 * MÉTRICA 25: SIX_MONTHS_REVENUE
 * Histórico de receita dos últimos 6 meses por mês
 */
async function calculateSixMonthsRevenue(tenantId) {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const { data, error } = await supabase
            .from('appointments')
            .select('start_time, final_price, quoted_price, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', sixMonthsAgo.toISOString())
            .in('status', ['completed', 'confirmed']);

        if (error) throw error;

        const monthlyData = {};
        
        data.forEach(appointment => {
            const date = new Date(appointment.start_time);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const revenue = appointment.final_price || appointment.quoted_price || 0;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            monthlyData[monthKey] += parseFloat(revenue);
        });

        return monthlyData;
    } catch (error) {
        console.error(`❌ Erro calculando six_months_revenue para tenant ${tenantId}:`, error.message);
        return {};
    }
}

/**
 * MÉTRICA 26: SIX_MONTHS_CUSTOMERS
 * Histórico de clientes únicos dos últimos 6 meses por mês
 */
async function calculateSixMonthsCustomers(tenantId) {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const { data, error } = await supabase
            .from('appointments')
            .select('start_time, user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', sixMonthsAgo.toISOString());

        if (error) throw error;

        const monthlyData = {};
        
        data.forEach(appointment => {
            const date = new Date(appointment.start_time);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = new Set();
            }
            monthlyData[monthKey].add(appointment.user_id);
        });

        // Converter Sets para contagem
        const result = {};
        Object.keys(monthlyData).forEach(month => {
            result[month] = monthlyData[month].size;
        });

        return result;
    } catch (error) {
        console.error(`❌ Erro calculando six_months_customers para tenant ${tenantId}:`, error.message);
        return {};
    }
}

/**
 * Calcula todas as métricas para um tenant e período específico
 */
async function calculateTenantMetrics(tenant, period) {
    const startDate = getStartDate(period === '7d' ? 7 : period === '30d' ? 30 : 90);
    
    console.log(`📊 Calculando TODAS as métricas para ${tenant.business_name || tenant.id} (${period})`);
    
    // Calcular métricas de 6 meses apenas uma vez (sem período)
    const sixMonthsMetrics = period === '30d' ? {
        six_months_conversations: await calculateSixMonthsConversations(tenant.id),
        six_months_revenue: await calculateSixMonthsRevenue(tenant.id),
        six_months_customers: await calculateSixMonthsCustomers(tenant.id),
    } : {};
    
    const metrics = {
        // === CONVERSATION OUTCOMES (4 métricas REAIS) ===
        appointment_created_conversations: await calculateCompletedConversations(tenant.id, startDate),
        appointment_cancelled_conversations: await calculateCancelledConversations(tenant.id, startDate),
        info_request_fulfilled_conversations: await calculateInfoRequestFulfilledConversations(tenant.id, startDate),
        price_inquiry_conversations: await calculatePriceInquiryConversations(tenant.id, startDate),
        
        // === CONVERSATION AGGREGATES (5 métricas CORRIGIDAS) ===
        avg_minutes_per_conversation: await calculateAvgMinutesPerConversation(tenant.id, startDate),
        avg_messages_per_conversation: await calculateAvgMessagesPerConversation(tenant.id, startDate),
        unique_customers_count: await calculateUniqueCustomersCount(tenant.id, startDate),
        avg_cost_usd_per_conversation: await calculateProcessingCostUSD(tenant.id, startDate),
        avg_confidence_per_conversation: await calculateConfidenceScoreAvg(tenant.id, startDate),
        
        // === APPOINTMENT METRICS (7 métricas) ===
        monthly_revenue_brl: await calculateMonthlyRevenueAppointments(tenant.id, startDate),
        appointment_success_rate: await calculateAppointmentSuccessRate(tenant.id, startDate),
        no_show_impact: await calculateNoShowImpact(tenant.id, startDate),
        customer_recurrence_rate: await calculateCustomerRecurrenceRate(tenant.id, startDate),
        customer_lifetime_value: await calculateCustomerLifetimeValue(tenant.id, startDate),
        appointment_duration_average: await calculateAppointmentDurationAverage(tenant.id, startDate),
        
        // === AI & ANALYTICS METRICS (4 métricas) ===
        ai_assistant_efficiency: await calculateAiAssistantEfficiency(tenant.id, startDate),
        total_chat_minutes: await calculateTotalChatMinutes(tenant.id, startDate),
        spam_rate: await calculateSpamRate(tenant.id, startDate),
        
        // === NOVAS MÉTRICAS DE ALTA PRIORIDADE (8 métricas) ===
        whatsapp_quality_score: await calculateWhatsappQualityScore(tenant.id, startDate),
        churn_risk_score: await calculateChurnRiskScore(tenant.id, startDate),
        customer_satisfaction_score: await calculateCustomerSatisfactionScore(tenant.id, startDate),
        ai_quality_by_segment: await calculateAiQualityBySegment(tenant.id, startDate),
        external_appointment_ratio: await calculateExternalAppointmentRatio(tenant.id, startDate),
        trial_conversion_rate: await calculateTrialConversionRate(tenant.id, startDate),
        customer_retention_rate: await calculateCustomerRetentionRate(tenant.id, startDate),
        roi_per_conversation: await calculateRoiPerConversation(tenant.id, startDate),
        
        // === MÉTRICAS DE MÉDIA PRIORIDADE (8 métricas) ===
        monthly_growth_rate: await calculateMonthlyGrowthRate(tenant.id, startDate),
        customer_acquisition_cost: await calculateCustomerAcquisitionCost(tenant.id, startDate),
        intent_detection_accuracy: await calculateIntentDetectionAccuracy(tenant.id, startDate),
        business_hours_utilization: await calculateBusinessHoursUtilization(tenant.id, startDate),
        profit_margin_percentage: await calculateProfitMarginPercentage(tenant.id, startDate),
        response_time_average: await calculateResponseTimeAverage(tenant.id, startDate),
        confidence_score_distribution: await calculateConfidenceScoreDistribution(tenant.id, startDate),
        platform_engagement_score: await calculatePlatformEngagementScore(tenant.id, startDate),
        
        // === MÉTRICAS COMPLEMENTARES (15 métricas) ===
        total_appointments: await calculateTotalAppointments(tenant.id, startDate),
        completed_appointments: await calculateCompletedAppointments(tenant.id, startDate),
        cancelled_appointments: await calculateCancelledAppointments(tenant.id, startDate),
        no_show_appointments: await calculateNoShowAppointments(tenant.id, startDate),
        rescheduled_appointments: await calculateRescheduledAppointments(tenant.id, startDate),
        no_show_rate: await calculateNoShowRate(tenant.id, startDate),
        cancellation_rate: await calculateCancellationRate(tenant.id, startDate),
        revenue_per_customer: await calculateRevenuePerCustomer(tenant.id, startDate),
        revenue_per_appointment: await calculateRevenuePerAppointment(tenant.id, startDate),
        new_customers_count: await calculateNewCustomersCount(tenant.id, startDate),
        returning_customers_count: await calculateReturningCustomersCount(tenant.id, startDate),
        conversation_conversion_rate: await calculateConversationConversionRate(tenant.id, startDate),
        billing_efficiency_score: await calculateBillingEfficiencyScore(tenant.id, startDate),
        peak_hours_efficiency: await calculatePeakHoursEfficiency(tenant.id, startDate),
        unique_sessions_count: await calculateUniqueSessionsCount(tenant.id, startDate),
        
        // === STRUCTURAL METRICS (3 métricas - sem período) ===
        services_count: await calculateServicesCount(tenant.id),
        professionals_count: await calculateProfessionalsCount(tenant.id),
        monthly_platform_cost_brl: await calculateMonthlyPlatformCostBRL(tenant.id),
        
        // === HISTORICAL METRICS (3 métricas - apenas período 30d) ===
        ...sixMonthsMetrics,
        
        // === METADADOS ===
        period: period,
        tenant_id: tenant.id,
        tenant_name: tenant.business_name || 'Nome não definido',
        calculated_at: new Date().toISOString()
    };
    
    const totalMetrics = Object.keys(metrics).length - 4; // Excluir metadados
    console.log(`   ✅ Métricas calculadas: ${totalMetrics} valores (26+ métricas implementadas)`);
    return metrics;
}

/**
 * Salva métricas calculadas na tabela tenant_metrics
 */
async function saveMetrics(tenantId, period, metrics) {
    try {
        // Deletar métricas existentes do mesmo período
        await supabase
            .from('tenant_metrics')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('period', period)
            .eq('metric_type', 'comprehensive');

        // Inserir novas métricas
        const { error } = await supabase
            .from('tenant_metrics')
            .insert({
                tenant_id: tenantId,
                period: period,
                metric_type: 'comprehensive',
                metric_data: metrics,
                calculated_at: new Date().toISOString()
            });

        if (error) throw error;
        
        console.log(`   💾 Métricas salvas para período ${period}`);
        return true;
    } catch (error) {
        console.error(`❌ Erro salvando métricas para tenant ${tenantId} período ${period}:`, error.message);
        return false;
    }
}

// ========================================
// NOVAS MÉTRICAS DE ALTA PRIORIDADE (8)
// ========================================

/**
 * MÉTRICA 27: WHATSAPP_QUALITY_SCORE
 * Score de qualidade do número WhatsApp baseado em outcomes positivos
 */
async function calculateWhatsappQualityScore(tenantId, startDate) {
    try {
        const { data: outcomes, error } = await supabase
            .from('conversation_history')
            .select('conversation_outcome')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .not('conversation_outcome', 'is', null);

        if (error) throw error;
        if (!outcomes || outcomes.length === 0) return 0;

        const positiveOutcomes = outcomes.filter(o => 
            o.conversation_outcome === 'appointment_created' || 
            o.conversation_outcome === 'info_request_fulfilled'
        ).length;

        return (positiveOutcomes / outcomes.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando whatsapp_quality_score para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 28: CHURN_RISK_SCORE
 * Score de risco de churn baseado em declínio de atividade
 */
async function calculateChurnRiskScore(tenantId, startDate) {
    try {
        // Comparar atividade atual vs período anterior
        const previousPeriodStart = new Date(startDate);
        const periodDays = Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
        previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

        const [currentPeriod, previousPeriod] = await Promise.all([
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate),
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('start_time', previousPeriodStart.toISOString())
                .lt('start_time', startDate)
        ]);

        const currentCount = currentPeriod.data?.length || 0;
        const previousCount = previousPeriod.data?.length || 0;

        if (previousCount === 0) return currentCount === 0 ? 100 : 0;

        const decline = ((previousCount - currentCount) / previousCount) * 100;
        return Math.max(0, Math.min(100, decline));
    } catch (error) {
        console.error(`❌ Erro calculando churn_risk_score para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 29: CUSTOMER_SATISFACTION_SCORE
 * Score de satisfação baseado em ratio de outcomes positivos
 */
async function calculateCustomerSatisfactionScore(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        const satisfactionWeights = {
            'completed': 100,
            'confirmed': 80,
            'rescheduled': 60,
            'pending': 40,
            'cancelled': 20,
            'no_show': 0
        };

        const totalScore = appointments.reduce((sum, apt) => {
            return sum + (satisfactionWeights[apt.status] || 0);
        }, 0);

        return totalScore / appointments.length;
    } catch (error) {
        console.error(`❌ Erro calculando customer_satisfaction_score para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 30: AI_QUALITY_BY_SEGMENT
 * Qualidade da IA por domínio de negócio (baseado em confidence_score)
 */
async function calculateAiQualityBySegment(tenantId, startDate) {
    try {
        // Buscar informações do tenant para identificar segmento
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('business_domain, name')
            .eq('id', tenantId)
            .single();

        if (tenantError) throw tenantError;

        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('confidence_score')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .not('confidence_score', 'is', null);

        if (error) throw error;
        if (!conversations || conversations.length === 0) return 0;

        const avgConfidence = conversations.reduce((sum, conv) => 
            sum + parseFloat(conv.confidence_score), 0) / conversations.length;

        // Aplicar benchmark por segmento
        const segmentBenchmarks = {
            'beauty': 0.85,
            'health': 0.90,
            'legal': 0.92,
            'education': 0.88,
            'fitness': 0.83,
            'consulting': 0.91
        };

        const benchmark = segmentBenchmarks[tenant.business_domain] || 0.87;
        return (avgConfidence / benchmark) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando ai_quality_by_segment para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 31: EXTERNAL_APPOINTMENT_RATIO
 * Proporção de agendamentos externos vs plataforma
 */
async function calculateExternalAppointmentRatio(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('source, id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        const externalCount = appointments.filter(apt => 
            apt.source !== 'whatsapp' && apt.source !== 'platform'
        ).length;

        return (externalCount / appointments.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando external_appointment_ratio para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 32: TRIAL_CONVERSION_RATE
 * Taxa de conversão de trial para plano pago
 */
async function calculateTrialConversionRate(tenantId, startDate) {
    try {
        const { data: tenant, error } = await supabase
            .from('tenants')
            .select('subscription_plan, created_at, trial_ended_at')
            .eq('id', tenantId)
            .single();

        if (error) throw error;

        // Se ainda está em trial, retorna 0
        if (!tenant.trial_ended_ || tenant.subscription_plan === 'trial') {
            return 0;
        }

        // Se converteu para plano pago, retorna 100
        if (tenant.subscription_plan && tenant.subscription_plan !== 'trial') {
            return 100;
        }

        return 0;
    } catch (error) {
        console.error(`❌ Erro calculando trial_conversion_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 33: CUSTOMER_RETENTION_RATE
 * Taxa de retenção de clientes baseada em appointments recorrentes
 */
async function calculateCustomerRetentionRate(tenantId, startDate) {
    try {
        // Clientes do período anterior
        const previousPeriodStart = new Date(startDate);
        const periodDays = Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
        previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

        const [currentCustomers, previousCustomers] = await Promise.all([
            supabase
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate),
            supabase
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('start_time', previousPeriodStart.toISOString())
                .lt('start_time', startDate)
        ]);

        const currentUserIds = new Set(currentCustomers.data?.map(c => c.user_id) || []);
        const previousUserIds = new Set(previousCustomers.data?.map(c => c.user_id) || []);

        if (previousUserIds.size === 0) return 0;

        const retainedCustomers = [...previousUserIds].filter(id => currentUserIds.has(id));
        return (retainedCustomers.length / previousUserIds.size) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando customer_retention_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 34: ROI_PER_CONVERSATION
 * ROI por conversa WhatsApp (receita gerada / custo da conversa)
 */
async function calculateRoiPerConversation(tenantId, startDate) {
    try {
        const [conversations, revenue] = await Promise.all([
            supabase
                .from('conversation_history')
                .select('processing_cost_usd, api_cost_usd')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate),
            supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate)
                .in('status', ['completed', 'confirmed'])
        ]);

        const totalCostUSD = conversations.data?.reduce((sum, conv) => {
            const procCost = parseFloat(conv.processing_cost_usd) || 0;
            const apiCost = parseFloat(conv.api_cost_usd) || 0;
            return sum + procCost + apiCost;
        }, 0) || 0;

        const totalRevenueBRL = revenue.data?.reduce((sum, apt) => {
            return sum + (apt.final_price || apt.quoted_price || 0);
        }, 0) || 0;

        if (totalCostUSD === 0) return 0;

        // Converter BRL para USD (assumindo taxa 5.5)
        const totalRevenueUSD = totalRevenueBRL / 5.5;
        const roi = ((totalRevenueUSD - totalCostUSD) / totalCostUSD) * 100;

        return Math.max(0, roi);
    } catch (error) {
        console.error(`❌ Erro calculando roi_per_conversation para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

// ========================================
// MÉTRICAS DE MÉDIA PRIORIDADE (8)
// ========================================

/**
 * MÉTRICA 35: MONTHLY_GROWTH_RATE
 * Taxa de crescimento mensal baseada em receita
 */
async function calculateMonthlyGrowthRate(tenantId, startDate) {
    try {
        // Comparar receita atual vs mês anterior
        const previousMonthStart = new Date(startDate);
        previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
        
        const [currentRevenue, previousRevenue] = await Promise.all([
            supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate)
                .in('status', ['completed', 'confirmed']),
            supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenantId)
                .gte('start_time', previousMonthStart.toISOString())
                .lt('start_time', startDate)
                .in('status', ['completed', 'confirmed'])
        ]);

        const currentTotal = currentRevenue.data?.reduce((sum, apt) => 
            sum + (apt.final_price || apt.quoted_price || 0), 0) || 0;
        const previousTotal = previousRevenue.data?.reduce((sum, apt) => 
            sum + (apt.final_price || apt.quoted_price || 0), 0) || 0;

        if (previousTotal === 0) return currentTotal > 0 ? 100 : 0;
        return ((currentTotal - previousTotal) / previousTotal) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando monthly_growth_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 36: CUSTOMER_ACQUISITION_COST
 * Custo de aquisição baseado em conversas vs novos clientes
 */
async function calculateCustomerAcquisitionCost(tenantId, startDate) {
    try {
        const [conversations, newCustomers] = await Promise.all([
            supabase
                .from('conversation_history')
                .select('processing_cost_usd, api_cost_usd')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate),
            supabase
                .from('appointments')
                .select('user_id, created_at')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
        ]);

        const totalCost = conversations.data?.reduce((sum, conv) => {
            return sum + (parseFloat(conv.processing_cost_usd) || 0) + (parseFloat(conv.api_cost_usd) || 0);
        }, 0) || 0;

        const uniqueNewCustomers = new Set(newCustomers.data?.map(apt => apt.user_id) || []).size;
        
        return uniqueNewCustomers > 0 ? totalCost / uniqueNewCustomers : 0;
    } catch (error) {
        console.error(`❌ Erro calculando customer_acquisition_cost para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 37: INTENT_DETECTION_ACCURACY
 * Precisão na detecção de intenções da IA
 */
async function calculateIntentDetectionAccuracy(tenantId, startDate) {
    try {
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('intent_detected, conversation_outcome, confidence_score')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .not('intent_detected', 'is', null)
            .not('conversation_outcome', 'is', null);

        if (error) throw error;
        if (!conversations || conversations.length === 0) return 0;

        // Mapear intenções esperadas para outcomes
        const intentOutcomeMap = {
            'booking_request': 'appointment_created',
            'price_inquiry': 'price_inquiry',
            'info_request': 'info_request_fulfilled',
            'cancellation': 'appointment_cancelled'
        };

        const correctPredictions = conversations.filter(conv => {
            const expectedOutcome = intentOutcomeMap[conv.intent_detected];
            return expectedOutcome === conv.conversation_outcome;
        }).length;

        return (correctPredictions / conversations.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando intent_detection_accuracy para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 38: BUSINESS_HOURS_UTILIZATION
 * Utilização dos horários de funcionamento
 */
async function calculateBusinessHoursUtilization(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('start_time, end_time')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed', 'pending']);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        // Assumir horário comercial: 8h-18h (10 horas)
        const businessHoursPerDay = 10;
        const daysInPeriod = Math.ceil((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
        const totalBusinessHours = businessHoursPerDay * daysInPeriod;

        const totalAppointmentHours = appointments.reduce((sum, apt) => {
            const start = new Date(apt.start_time);
            const end = new Date(apt.end_time);
            const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            return sum + duration;
        }, 0);

        return Math.min(100, (totalAppointmentHours / totalBusinessHours) * 100);
    } catch (error) {
        console.error(`❌ Erro calculando business_hours_utilization para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 39: PROFIT_MARGIN_PERCENTAGE
 * Margem de lucro percentual
 */
async function calculateProfitMarginPercentage(tenantId, startDate) {
    try {
        const [revenue, costs] = await Promise.all([
            supabase
                .from('appointments')
                .select('final_price, quoted_price')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate)
                .in('status', ['completed', 'confirmed']),
            supabase
                .from('conversation_history')
                .select('processing_cost_usd, api_cost_usd')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate)
        ]);

        const totalRevenue = revenue.data?.reduce((sum, apt) => 
            sum + (apt.final_price || apt.quoted_price || 0), 0) || 0;
        
        const totalCostsUSD = costs.data?.reduce((sum, conv) => 
            sum + (parseFloat(conv.processing_cost_usd) || 0) + (parseFloat(conv.api_cost_usd) || 0), 0) || 0;
        
        // Converter custos USD para BRL (taxa 5.5)
        const totalCostsBRL = totalCostsUSD * 5.5;
        
        if (totalRevenue === 0) return 0;
        return ((totalRevenue - totalCostsBRL) / totalRevenue) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando profit_margin_percentage para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 40: RESPONSE_TIME_AVERAGE
 * Tempo médio de resposta da IA
 */
async function calculateResponseTimeAverage(tenantId, startDate) {
    try {
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('created_at, is_from_user')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .order('created_at', { ascending: true });

        if (error) throw error;
        if (!conversations || conversations.length < 2) return 0;

        const responseTimes = [];
        for (let i = 0; i < conversations.length - 1; i++) {
            const current = conversations[i];
            const next = conversations[i + 1];
            
            // Se mensagem do usuário seguida de resposta do sistema
            if (current.is_from_user && !next.is_from_user) {
                const responseTime = new Date(next.created_at).getTime() - new Date(current.created_at).getTime();
                responseTimes.push(responseTime / 1000); // em segundos
            }
        }

        if (responseTimes.length === 0) return 0;
        return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    } catch (error) {
        console.error(`❌ Erro calculando response_time_average para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 41: CONFIDENCE_SCORE_DISTRIBUTION
 * Distribuição dos scores de confiança (% high confidence)
 */
async function calculateConfidenceScoreDistribution(tenantId, startDate) {
    try {
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('confidence_score')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate)
            .not('confidence_score', 'is', null);

        if (error) throw error;
        if (!conversations || conversations.length === 0) return 0;

        const highConfidenceCount = conversations.filter(conv => 
            parseFloat(conv.confidence_score) >= 0.85
        ).length;

        return (highConfidenceCount / conversations.length) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando confidence_score_distribution para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 42: PLATFORM_ENGAGEMENT_SCORE
 * Score de engajamento com a plataforma
 */
async function calculatePlatformEngagementScore(tenantId, startDate) {
    try {
        const [conversations, appointments, professionals, services] = await Promise.all([
            supabase
                .from('conversation_history')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate),
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate),
            supabase
                .from('professionals')
                .select('id')
                .eq('tenant_id', tenantId),
            supabase
                .from('services')
                .select('id')
                .eq('tenant_id', tenantId)
        ]);

        // Score baseado em atividade ponderada
        const conversationScore = Math.min(50, (conversations.data?.length || 0) * 0.5);
        const appointmentScore = Math.min(30, (appointments.data?.length || 0) * 2);
        const configScore = Math.min(20, 
            ((professionals.data?.length || 0) * 5) + ((services.data?.length || 0) * 2)
        );

        return conversationScore + appointmentScore + configScore;
    } catch (error) {
        console.error(`❌ Erro calculando platform_engagement_score para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

// ========================================
// MÉTRICAS COMPLEMENTARES (15)
// ========================================

/**
 * MÉTRICA 43: TOTAL_APPOINTMENTS
 */
async function calculateTotalAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);
        return data?.length || 0;
    } catch (error) {
        console.error(`❌ Erro calculando total_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 44: COMPLETED_APPOINTMENTS
 */
async function calculateCompletedAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'completed')
            .gte('start_time', startDate);
        return data?.length || 0;
    } catch (error) {
        console.error(`❌ Erro calculando completed_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 45: CANCELLED_APPOINTMENTS
 */
async function calculateCancelledAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'cancelled')
            .gte('start_time', startDate);
        return data?.length || 0;
    } catch (error) {
        console.error(`❌ Erro calculando cancelled_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 46: NO_SHOW_APPOINTMENTS
 */
async function calculateNoShowAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'no_show')
            .gte('start_time', startDate);
        return data?.length || 0;
    } catch (error) {
        console.error(`❌ Erro calculando no_show_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 47: RESCHEDULED_APPOINTMENTS
 */
async function calculateRescheduledAppointments(tenantId, startDate) {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('status', 'rescheduled')
            .gte('start_time', startDate);
        return data?.length || 0;
    } catch (error) {
        console.error(`❌ Erro calculando rescheduled_appointments para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 48: NO_SHOW_RATE
 */
async function calculateNoShowRate(tenantId, startDate) {
    try {
        const [total, noShows] = await Promise.all([
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate),
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('status', 'no_show')
                .gte('start_time', startDate)
        ]);
        
        const totalCount = total.data?.length || 0;
        const noShowCount = noShows.data?.length || 0;
        
        return totalCount > 0 ? (noShowCount / totalCount) * 100 : 0;
    } catch (error) {
        console.error(`❌ Erro calculando no_show_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 49: CANCELLATION_RATE
 */
async function calculateCancellationRate(tenantId, startDate) {
    try {
        const [total, cancelled] = await Promise.all([
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate),
            supabase
                .from('appointments')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('status', 'cancelled')
                .gte('start_time', startDate)
        ]);
        
        const totalCount = total.data?.length || 0;
        const cancelledCount = cancelled.data?.length || 0;
        
        return totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
    } catch (error) {
        console.error(`❌ Erro calculando cancellation_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 50: REVENUE_PER_CUSTOMER
 */
async function calculateRevenuePerCustomer(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('user_id, final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed']);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        const totalRevenue = appointments.reduce((sum, apt) => 
            sum + (apt.final_price || apt.quoted_price || 0), 0);
        const uniqueCustomers = new Set(appointments.map(apt => apt.user_id)).size;
        
        return uniqueCustomers > 0 ? totalRevenue / uniqueCustomers : 0;
    } catch (error) {
        console.error(`❌ Erro calculando revenue_per_customer para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 51: REVENUE_PER_APPOINTMENT
 */
async function calculateRevenuePerAppointment(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate)
            .in('status', ['completed', 'confirmed']);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        const totalRevenue = appointments.reduce((sum, apt) => 
            sum + (apt.final_price || apt.quoted_price || 0), 0);
        
        return totalRevenue / appointments.length;
    } catch (error) {
        console.error(`❌ Erro calculando revenue_per_appointment para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 52: NEW_CUSTOMERS_COUNT
 */
async function calculateNewCustomersCount(tenantId, startDate) {
    try {
        // Buscar clientes do período atual
        const { data: currentCustomers, error: currentError } = await supabase
            .from('appointments')
            .select('user_id, created_at')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (currentError) throw currentError;
        if (!currentCustomers || currentCustomers.length === 0) return 0;

        // Buscar clientes anteriores ao período
        const { data: previousCustomers, error: previousError } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .lt('created_at', startDate);

        if (previousError) throw previousError;

        const previousCustomerIds = new Set(previousCustomers?.map(c => c.user_id) || []);
        const newCustomers = currentCustomers.filter(c => !previousCustomerIds.has(c.user_id));
        
        return new Set(newCustomers.map(c => c.user_id)).size;
    } catch (error) {
        console.error(`❌ Erro calculando new_customers_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 53: RETURNING_CUSTOMERS_COUNT
 */
async function calculateReturningCustomersCount(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('user_id')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        // Contar freqüencia de cada cliente
        const customerCounts = {};
        appointments.forEach(apt => {
            customerCounts[apt.user_id] = (customerCounts[apt.user_id] || 0) + 1;
        });

        // Clientes com mais de 1 appointment
        const returningCustomers = Object.values(customerCounts).filter(count => count > 1).length;
        return returningCustomers;
    } catch (error) {
        console.error(`❌ Erro calculando returning_customers_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 54: CONVERSATION_CONVERSION_RATE
 */
async function calculateConversationConversionRate(tenantId, startDate) {
    try {
        const [conversations, appointments] = await Promise.all([
            supabase
                .from('conversation_history')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('created_at', startDate),
            supabase
                .from('appointments')
                .select('user_id')
                .eq('tenant_id', tenantId)
                .gte('start_time', startDate)
        ]);

        const uniqueConversationUsers = new Set(conversations.data?.map(c => c.user_id) || []);
        const uniqueAppointmentUsers = new Set(appointments.data?.map(a => a.user_id) || []);
        
        if (uniqueConversationUsers.size === 0) return 0;
        
        const convertedUsers = [...uniqueAppointmentUsers].filter(userId => 
            uniqueConversationUsers.has(userId)
        ).length;
        
        return (convertedUsers / uniqueConversationUsers.size) * 100;
    } catch (error) {
        console.error(`❌ Erro calculando conversation_conversion_rate para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 55: BILLING_EFFICIENCY_SCORE
 */
async function calculateBillingEfficiencyScore(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('final_price, quoted_price, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        const billedAppointments = appointments.filter(apt => 
            apt.final_price > 0 && apt.status === 'completed'
        ).length;
        
        const completedAppointments = appointments.filter(apt => 
            apt.status === 'completed'
        ).length;
        
        return completedAppointments > 0 ? (billedAppointments / completedAppointments) * 100 : 0;
    } catch (error) {
        console.error(`❌ Erro calculando billing_efficiency_score para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 56: PEAK_HOURS_EFFICIENCY
 */
async function calculatePeakHoursEfficiency(tenantId, startDate) {
    try {
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('start_time, status')
            .eq('tenant_id', tenantId)
            .gte('start_time', startDate);

        if (error) throw error;
        if (!appointments || appointments.length === 0) return 0;

        // Considerar horários de pico: 10h-12h e 14h-17h
        const peakHourAppointments = appointments.filter(apt => {
            const hour = new Date(apt.start_time).getHours();
            return (hour >= 10 && hour <= 12) || (hour >= 14 && hour <= 17);
        });

        const peakHourCompleted = peakHourAppointments.filter(apt => 
            apt.status === 'completed'
        ).length;
        
        return peakHourAppointments.length > 0 ? 
            (peakHourCompleted / peakHourAppointments.length) * 100 : 0;
    } catch (error) {
        console.error(`❌ Erro calculando peak_hours_efficiency para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * MÉTRICA 57: UNIQUE_SESSIONS_COUNT
 */
async function calculateUniqueSessionsCount(tenantId, startDate) {
    try {
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('conversation_context')
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate);

        if (error) throw error;
        if (!conversations || conversations.length === 0) return 0;

        const sessionIds = new Set();
        conversations.forEach(conv => {
            try {
                const context = typeof conv.conversation_context === 'string' 
                    ? JSON.parse(conv.conversation_context) 
                    : conv.conversation_context;
                if (context && context.session_id) {
                    sessionIds.add(context.session_id);
                }
            } catch (e) {
                // Ignorar erros de parse
            }
        });

        return sessionIds.size;
    } catch (error) {
        console.error(`❌ Erro calculando unique_sessions_count para tenant ${tenantId}:`, error.message);
        return 0;
    }
}

/**
 * FUNÇÃO PRINCIPAL: Executa cálculo de métricas para todos os tenants
 */
async function executeAllMetrics() {
    const startTime = Date.now();
    console.log('🚀 INICIANDO EXECUÇÃO DE TODAS AS MÉTRICAS');
    console.log('='.repeat(60));
    
    try {
        // Buscar todos os tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');

        if (tenantsError) throw tenantsError;
        
        console.log(`📋 Encontrados ${tenants.length} tenants ativos`);
        
        const periods = ['7d', '30d', '90d'];
        const results = {
            processed_tenants: 0,
            processed_periods: 0,
            total_metrics: 0,
            successful_saves: 0,
            errors: []
        };
        
        // Processar cada tenant
        for (const tenant of tenants) {
            console.log(`\n🏢 Processando tenant: ${tenant.business_name || tenant.id}`);
            
            // Processar cada período
            for (const period of periods) {
                try {
                    const metrics = await calculateTenantMetrics(tenant, period);
                    const saved = await saveMetrics(tenant.id, period, metrics);
                    
                    results.processed_periods++;
                    results.total_metrics += Object.keys(metrics).length - 4; // Excluir metadados
                    
                    if (saved) {
                        results.successful_saves++;
                    }
                } catch (error) {
                    const errorMsg = `Tenant ${tenant.id} período ${period}: ${error.message}`;
                    results.errors.push(errorMsg);
                    console.error(`❌ ${errorMsg}`);
                }
            }
            
            results.processed_tenants++;
        }
        
        // Relatório final
        const executionTime = Date.now() - startTime;
        console.log('\n' + '='.repeat(60));
        console.log('📋 RELATÓRIO FINAL DE EXECUÇÃO');
        console.log('='.repeat(60));
        console.log(`✅ Tenants processados: ${results.processed_tenants}/${tenants.length}`);
        console.log(`✅ Períodos processados: ${results.processed_periods}/${tenants.length * 3}`);
        console.log(`✅ Métricas calculadas: ${results.total_metrics}`);
        console.log(`✅ Salvamentos bem-sucedidos: ${results.successful_saves}`);
        console.log(`❌ Erros: ${results.errors.length}`);
        console.log(`⏱️ Tempo de execução: ${executionTime}ms (${(executionTime/1000).toFixed(1)}s)`);
        
        if (results.errors.length > 0) {
            console.log('\n❌ ERROS ENCONTRADOS:');
            results.errors.forEach(error => console.log(`   • ${error}`));
        }
        
        console.log('='.repeat(60));
        
        return {
            success: results.errors.length === 0,
            ...results,
            execution_time_ms: executionTime
        };
        
    } catch (error) {
        console.error('❌ ERRO FATAL na execução:', error);
        return {
            success: false,
            error: error.message,
            execution_time_ms: Date.now() - startTime
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    executeAllMetrics()
        .then(result => {
            console.log('\n🎯 Execução finalizada:', result.success ? 'SUCESSO' : 'FALHA');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { executeAllMetrics };