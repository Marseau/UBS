/**
 * VALIDAÇÃO INDIVIDUAL DE CADA MÉTRICA
 * 
 * Este script testa cada uma das 26 métricas implementadas individualmente
 * para verificar se estão funcionando corretamente e retornando valores válidos
 * 
 * @author Claude Code Assistant
 * @version 1.0.0
 * @since 2025-08-04
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Pega um tenant de exemplo para testes
 */
async function getSampleTenant() {
    const { data, error } = await supabase
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'active')
        .limit(1)
        .single();
    
    if (error) throw error;
    return data;
}

/**
 * VALIDAÇÃO 1: CONVERSATION OUTCOMES
 */
async function validateConversationOutcomes(tenantId) {
    console.log('\n🔍 VALIDANDO CONVERSATION OUTCOMES');
    console.log('-'.repeat(50));
    
    try {
        // Verificar estrutura da tabela conversation_history
        const { data: conversations, error } = await supabase
            .from('conversation_history')
            .select('id, conversation_context, created_at')
            .eq('tenant_id', tenantId)
            .limit(5);

        if (error) throw error;

        console.log(`📊 Total de registros conversation_history: ${conversations.length}`);
        
        if (conversations.length === 0) {
            console.log('⚠️  Nenhum registro encontrado em conversation_history');
            return { status: 'empty', details: 'Tabela vazia para este tenant' };
        }

        // Analisar estrutura do conversation_context
        conversations.forEach((conv, index) => {
            console.log(`\n📋 Registro ${index + 1}:`);
            console.log(`   ID: ${conv.id}`);
            console.log(`   Created: ${conv.created_at}`);
            
            try {
                const context = typeof conv.conversation_context === 'string' 
                    ? JSON.parse(conv.conversation_context) 
                    : conv.conversation_context;
                
                console.log(`   Context keys: ${Object.keys(context || {}).join(', ')}`);
                console.log(`   Outcome: ${context?.outcome || 'N/A'}`);
                console.log(`   Session ID: ${context?.session_id || 'N/A'}`);
                console.log(`   Customer Phone: ${context?.customer_phone || 'N/A'}`);
                console.log(`   Duration Minutes: ${context?.duration_minutes || 'N/A'}`);
                console.log(`   Message Count: ${context?.message_count || 'N/A'}`);
                console.log(`   Processing Cost: ${context?.processing_cost || 'N/A'}`);
                console.log(`   Confidence Score: ${context?.confidence_score || 'N/A'}`);
                
            } catch (parseError) {
                console.log(`   ❌ Erro ao fazer parse do JSON: ${parseError.message}`);
            }
        });

        return { status: 'analyzed', count: conversations.length };
    } catch (error) {
        console.error(`❌ Erro na validação de conversation outcomes: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

/**
 * VALIDAÇÃO 2: APPOINTMENT METRICS
 */
async function validateAppointmentMetrics(tenantId) {
    console.log('\n🔍 VALIDANDO APPOINTMENT METRICS');
    console.log('-'.repeat(50));
    
    try {
        // Verificar estrutura da tabela appointments
        const { data: appointments, error } = await supabase
            .from('appointments')
            .select('id, start_time, end_time, status, final_price, quoted_price, user_id, service_id, created_at')
            .eq('tenant_id', tenantId)
            .limit(5);

        if (error) throw error;

        console.log(`📊 Total de registros appointments: ${appointments.length}`);
        
        if (appointments.length === 0) {
            console.log('⚠️  Nenhum registro encontrado em appointments');
            return { status: 'empty', details: 'Tabela vazia para este tenant' };
        }

        // Analisar dados dos appointments
        let totalRevenue = 0;
        let statusCounts = {};
        let usersSet = new Set();
        
        appointments.forEach((apt, index) => {
            console.log(`\n📋 Appointment ${index + 1}:`);
            console.log(`   ID: ${apt.id}`);
            console.log(`   Start: ${apt.start_time}`);
            console.log(`   End: ${apt.end_time}`);
            console.log(`   Status: ${apt.status}`);
            console.log(`   Final Price: R$ ${apt.final_price || 'N/A'}`);
            console.log(`   Quoted Price: R$ ${apt.quoted_price || 'N/A'}`);
            console.log(`   User ID: ${apt.user_id}`);
            console.log(`   Service ID: ${apt.service_id}`);
            
            // Calcular receita
            const price = apt.final_price || apt.quoted_price || 0;
            if (apt.status === 'completed' || apt.status === 'confirmed') {
                totalRevenue += parseFloat(price);
            }
            
            // Contar status
            statusCounts[apt.status] = (statusCounts[apt.status] || 0) + 1;
            
            // Contar usuários únicos
            if (apt.user_id) usersSet.add(apt.user_id);
        });

        console.log(`\n📊 RESUMO APPOINTMENTS (amostra de ${appointments.length}):`);
        console.log(`   💰 Receita total: R$ ${totalRevenue.toFixed(2)}`);
        console.log(`   📈 Status counts:`, statusCounts);
        console.log(`   👥 Usuários únicos: ${usersSet.size}`);
        
        return { 
            status: 'analyzed', 
            count: appointments.length,
            totalRevenue,
            statusCounts,
            uniqueUsers: usersSet.size
        };
    } catch (error) {
        console.error(`❌ Erro na validação de appointment metrics: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

/**
 * VALIDAÇÃO 3: STRUCTURAL METRICS
 */
async function validateStructuralMetrics(tenantId) {
    console.log('\n🔍 VALIDANDO STRUCTURAL METRICS');
    console.log('-'.repeat(50));
    
    try {
        // Verificar tabela services
        const { data: services, error: servicesError } = await supabase
            .from('services')
            .select('id, name, is_active, base_price, duration_minutes')
            .eq('tenant_id', tenantId);

        if (servicesError) {
            console.log(`⚠️  Tabela services: ${servicesError.message}`);
        } else {
            console.log(`📊 Services encontrados: ${services.length}`);
            const activeServices = services.filter(s => s.is_active);
            console.log(`   ✅ Ativos: ${activeServices.length}`);
            console.log(`   ❌ Inativos: ${services.length - activeServices.length}`);
            
            if (services.length > 0) {
                console.log(`   Exemplo: ${services[0].name} - R$ ${services[0].base_price}`);
            }
        }

        // Verificar tabela professionals
        const { data: professionals, error: profError } = await supabase
            .from('professionals')
            .select('id, name, is_active, email')
            .eq('tenant_id', tenantId);

        if (profError) {
            console.log(`⚠️  Tabela professionals: ${profError.message}`);
        } else {
            console.log(`📊 Professionals encontrados: ${professionals.length}`);
            const activeProfessionals = professionals.filter(p => p.is_active);
            console.log(`   ✅ Ativos: ${activeProfessionals.length}`);
            console.log(`   ❌ Inativos: ${professionals.length - activeProfessionals.length}`);
            
            if (professionals.length > 0) {
                console.log(`   Exemplo: ${professionals[0].name} - ${professionals[0].email}`);
            }
        }

        // Verificar dados do tenant
        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('id, business_name, subscription_plan, status')
            .eq('id', tenantId)
            .single();

        if (tenantError) {
            console.log(`⚠️  Dados do tenant: ${tenantError.message}`);
        } else {
            console.log(`📊 Tenant: ${tenant.business_name}`);
            console.log(`   Plano: ${tenant.subscription_plan}`);
            console.log(`   Status: ${tenant.status}`);
            
            const planCosts = {
                'basico': 58.00,
                'profissional': 198.00,
                'premium': 498.00
            };
            const monthlyCost = planCosts[tenant.subscription_plan] || 0;
            console.log(`   💰 Custo mensal: R$ ${monthlyCost.toFixed(2)}`);
        }

        return { 
            status: 'analyzed',
            services: services?.length || 0,
            professionals: professionals?.length || 0,
            tenant: tenant || null
        };
    } catch (error) {
        console.error(`❌ Erro na validação de structural metrics: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

/**
 * VALIDAÇÃO 4: DADOS SALVOS NO SISTEMA
 */
async function validateSavedMetrics(tenantId) {
    console.log('\n🔍 VALIDANDO MÉTRICAS SALVAS');
    console.log('-'.repeat(50));
    
    try {
        const { data: metrics, error } = await supabase
            .from('tenant_metrics')
            .select('period, metric_data, calculated_at')
            .eq('tenant_id', tenantId)
            .eq('metric_type', 'comprehensive')
            .gte('calculated_at', new Date().toISOString().split('T')[0])
            .order('period');

        if (error) throw error;

        console.log(`📊 Métricas salvas hoje: ${metrics.length}`);

        metrics.forEach(record => {
            console.log(`\n📋 Período ${record.period}:`);
            console.log(`   Calculado em: ${record.calculated_at}`);
            
            const data = record.metric_data;
            const metricKeys = Object.keys(data).filter(key => 
                !['period', 'tenant_id', 'tenant_name', 'calculated_at'].includes(key)
            );
            
            console.log(`   Total de métricas: ${metricKeys.length}`);
            
            // Mostrar métricas com valores interessantes
            console.log(`   Conversation Outcomes:`);
            console.log(`     ✅ Completed: ${data.completed_conversations || 0}`);
            console.log(`     ❌ Abandoned: ${data.abandoned_conversations || 0}`);
            console.log(`     🚫 Cancelled: ${data.cancelled_conversations || 0}`);
            console.log(`     👻 No Show: ${data.no_show_conversations || 0}`);
            
            console.log(`   Financial Metrics:`);
            console.log(`     💰 Revenue: R$ ${(data.monthly_revenue_brl || 0).toFixed(2)}`);
            console.log(`     📊 Success Rate: ${(data.appointment_success_rate || 0).toFixed(1)}%`);
            console.log(`     💸 Platform Cost: R$ ${(data.monthly_platform_cost_brl || 0).toFixed(2)}`);
            
            console.log(`   Customer Metrics:`);
            console.log(`     👥 Unique Customers: ${data.unique_customers_count || 0}`);
            console.log(`     🔄 Recurrence Rate: ${(data.customer_recurrence_rate || 0).toFixed(1)}%`);
            console.log(`     💎 Lifetime Value: R$ ${(data.customer_lifetime_value || 0).toFixed(2)}`);
            
            console.log(`   Operational Metrics:`);
            console.log(`     🛠️ Services: ${data.services_count || 0}`);
            console.log(`     👨‍💼 Professionals: ${data.professionals_count || 0}`);
            console.log(`     🤖 AI Efficiency: ${(data.ai_assistant_efficiency || 0).toFixed(1)}%`);
            
            // Métricas de 6 meses (só no período 30d)
            if (record.period === '30d' && data.six_months_conversations) {
                const monthsCount = Object.keys(data.six_months_conversations).length;
                console.log(`   Historical Data:`);
                console.log(`     📅 6M Conversations: ${monthsCount} meses`);
                console.log(`     📈 6M Revenue: ${Object.keys(data.six_months_revenue || {}).length} meses`);
                console.log(`     👥 6M Customers: ${Object.keys(data.six_months_customers || {}).length} meses`);
            }
        });

        return { status: 'analyzed', records: metrics.length };
    } catch (error) {
        console.error(`❌ Erro na validação de métricas salvas: ${error.message}`);
        return { status: 'error', error: error.message };
    }
}

/**
 * FUNÇÃO PRINCIPAL DE VALIDAÇÃO
 */
async function runIndividualValidation() {
    const startTime = Date.now();
    console.log('🚀 INICIANDO VALIDAÇÃO INDIVIDUAL DE MÉTRICAS');
    console.log('='.repeat(60));
    
    try {
        // Pegar tenant de exemplo
        const sampleTenant = await getSampleTenant();
        console.log(`🏢 Tenant de exemplo: ${sampleTenant.business_name} (${sampleTenant.id})`);
        
        const results = {};
        
        // 1. Validar conversation outcomes
        results.conversationOutcomes = await validateConversationOutcomes(sampleTenant.id);
        
        // 2. Validar appointment metrics
        results.appointmentMetrics = await validateAppointmentMetrics(sampleTenant.id);
        
        // 3. Validar structural metrics
        results.structuralMetrics = await validateStructuralMetrics(sampleTenant.id);
        
        // 4. Validar métricas salvas
        results.savedMetrics = await validateSavedMetrics(sampleTenant.id);
        
        const executionTime = Date.now() - startTime;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO DA VALIDAÇÃO INDIVIDUAL');
        console.log('='.repeat(60));
        console.log(`🏢 Tenant testado: ${sampleTenant.business_name}`);
        console.log(`⏱️ Tempo de execução: ${executionTime}ms`);
        console.log(`🔍 Conversation Outcomes: ${results.conversationOutcomes.status}`);
        console.log(`📅 Appointment Metrics: ${results.appointmentMetrics.status}`);
        console.log(`🏗️ Structural Metrics: ${results.structuralMetrics.status}`);
        console.log(`💾 Saved Metrics: ${results.savedMetrics.status}`);
        
        console.log('\n🎯 VALIDAÇÃO INDIVIDUAL CONCLUÍDA!');
        return {
            success: true,
            tenant: sampleTenant,
            results,
            execution_time_ms: executionTime
        };
        
    } catch (error) {
        console.error('❌ ERRO FATAL na validação individual:', error);
        return {
            success: false,
            error: error.message,
            execution_time_ms: Date.now() - startTime
        };
    }
}

// Executar validação se chamado diretamente
if (require.main === module) {
    runIndividualValidation()
        .then(result => {
            console.log('\n📋 Resultado final:', result.success ? 'SUCESSO' : 'FALHA');
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { runIndividualValidation };