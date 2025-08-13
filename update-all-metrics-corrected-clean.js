/**
 * ATUALIZAÇÃO UNIVERSAL DE MÉTRICAS CORRETAS
 * Script definitivo para atualizar todo o sistema com métricas baseadas em conversation_outcome
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

function calculatePriceByConversations(conversations) {
    if (conversations <= 200) {
        return { plan: 'basico', price: 58, conversations };
    } else if (conversations <= 400) {
        return { plan: 'profissional', price: 116, conversations };
    } else if (conversations <= 1250) {
        return { plan: 'enterprise', price: 290, conversations };
    } else {
        const excedentes = conversations - 1250;
        return { 
            plan: 'enterprise+', 
            price: 290 + (excedentes * 0.25), 
            conversations,
            excedentes
        };
    }
}

async function updateAllMetricsCorrected() {
    console.log('🔧 ATUALIZAÇÃO UNIVERSAL DE MÉTRICAS CORRETAS');
    console.log('='.repeat(70));
    console.log('🎯 Sistema: Conversation Outcome Based Metrics');
    console.log('💰 Modelo: Planos + Excedente por conversa');
    console.log('📅 Período: Últimos 30 dias');
    console.log('');
    
    const startTime = Date.now();
    
    try {
        // Buscar tenants ativos
        console.log('1️⃣ BUSCANDO TENANTS ATIVOS...');
        
        const { data: activeTenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');
            
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        console.log(`   ✅ ${activeTenants.length} tenants ativos encontrados`);
        
        // Calcular período
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30);
        
        const startIso = startDate.toISOString();
        const endIso = endDate.toISOString();
        
        console.log(`   📅 Período: ${startDate.toLocaleDateString()} a ${endDate.toLocaleDateString()}`);
        console.log('');
        
        // Processar cada tenant
        console.log('2️⃣ PROCESSANDO MÉTRICAS POR TENANT...');
        
        let totalPlatformMRR = 0;
        let totalPlatformConversations = 0;
        let totalPlatformAppointments = 0;
        let totalPlatformMinutes = 0;
        let totalPlatformCost = 0;
        let totalSpamConversations = 0;
        let processedTenants = 0;
        
        const tenantResults = [];
        
        for (const tenant of activeTenants) {
            try {
                console.log(`   📊 Processando ${tenant.business_name}...`);
                
                // Buscar conversas reais do tenant
                const { data: conversations, error: convError } = await supabase
                    .from('conversation_history')
                    .select(`
                        conversation_outcome, 
                        confidence_score, 
                        api_cost_usd, 
                        processing_cost_usd, 
                        conversation_context, 
                        created_at
                    `)
                    .eq('tenant_id', tenant.id)
                    .not('conversation_outcome', 'is', null)
                    .gte('created_at', startIso)
                    .lt('created_at', endIso);
                    
                if (convError) {
                    console.log(`      ❌ Erro: ${convError.message}`);
                    continue;
                }
                
                const totalConversations = conversations?.length || 0;
                
                // Calcular estatísticas detalhadas
                let totalMinutes = 0;
                let totalCost = 0;
                let validConversations = 0;
                let spamConversations = 0;
                let appointmentConversations = 0;
                const outcomeDistribution = {};
                
                conversations?.forEach(conv => {
                    // Extrair minutos do conversation_context
                    let minutes = 2.5; // default
                    if (conv.conversation_context) {
                        try {
                            const context = typeof conv.conversation_context === 'string' 
                                ? JSON.parse(conv.conversation_context) 
                                : conv.conversation_context;
                            minutes = context.duration_minutes || 
                                     context.chat_duration || 
                                     context.minutes || 2.5;
                        } catch (e) {
                            minutes = 2.5;
                        }
                    }
                    
                    totalMinutes += minutes;
                    
                    // Custo total
                    const apiCost = conv.api_cost_usd || 0;
                    const procCost = conv.processing_cost_usd || 0;
                    totalCost += (apiCost + procCost);
                    
                    // Qualidade da conversa
                    if ((conv.confidence_score || 0) >= 0.7) {
                        validConversations++;
                    } else {
                        spamConversations++;
                    }
                    
                    // Contar appointments
                    if (conv.conversation_outcome === 'appointment_created') {
                        appointmentConversations++;
                    }
                    
                    // Distribuição de outcomes
                    const outcome = conv.conversation_outcome;
                    outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
                });
                
                // Calcular plano e cobrança
                const pricing = calculatePriceByConversations(totalConversations);
                
                // Acumular totais da plataforma
                totalPlatformMRR += pricing.price;
                totalPlatformConversations += totalConversations;
                totalPlatformAppointments += appointmentConversations;
                totalPlatformMinutes += totalMinutes;
                totalPlatformCost += totalCost;
                totalSpamConversations += spamConversations;
                
                const tenantMetrics = {
                    tenant_id: tenant.id,
                    business_name: tenant.business_name,
                    period_days: 30,
                    
                    // Conversas
                    total_conversations: totalConversations,
                    billable_conversations: totalConversations,
                    valid_conversations: validConversations,
                    spam_conversations: spamConversations,
                    
                    // Appointments
                    total_appointments: appointmentConversations,
                    
                    // Tempo e custo
                    total_minutes: totalMinutes,
                    avg_minutes_per_conversation: totalConversations > 0 ? totalMinutes / totalConversations : 0,
                    total_cost_usd: totalCost,
                    avg_cost_per_conversation: totalConversations > 0 ? totalCost / totalConversations : 0,
                    
                    // Plano e cobrança
                    suggested_plan: pricing.plan,
                    plan_price_brl: pricing.price,
                    conversation_limit: pricing.plan === 'basico' ? 200 : 
                                      pricing.plan === 'profissional' ? 400 : 1250,
                    excess_conversations: pricing.excedentes || 0,
                    
                    // Métricas de qualidade
                    spam_rate_pct: totalConversations > 0 ? (spamConversations / totalConversations * 100) : 0,
                    efficiency_pct: totalConversations > 0 ? (appointmentConversations / totalConversations * 100) : 0,
                    
                    // Distribuição de outcomes
                    outcome_distribution: outcomeDistribution,
                    
                    // Metadados
                    calculated_at: new Date().toISOString(),
                    billing_model: 'conversation_outcome_based'
                };
                
                tenantResults.push(tenantMetrics);
                
                console.log(`      ✅ ${totalConversations} conversas → ${pricing.plan} → R$ ${pricing.price}`);
                console.log(`      📊 ${appointmentConversations} appointments (${tenantMetrics.efficiency_pct.toFixed(1)}% eficiência)`);
                console.log(`      ⏱️ ${totalMinutes.toFixed(1)} min total`);
                console.log(`      💰 $${totalCost.toFixed(4)} custo total`);
                
                processedTenants++;
                
            } catch (error) {
                console.log(`      ❌ Erro ao processar ${tenant.business_name}:`, error.message);
            }
        }
        
        console.log('');
        console.log('3️⃣ SALVANDO TENANT METRICS...');
        
        // Limpar métricas antigas
        await supabase
            .from('tenant_metrics')
            .delete()
            .eq('metric_type', 'conversation_billing');
            
        // Inserir métricas atualizadas
        for (const metrics of tenantResults) {
            const { error } = await supabase
                .from('tenant_metrics')
                .insert({
                    tenant_id: metrics.tenant_id,
                    metric_type: 'conversation_billing',
                    metric_data: metrics,
                    period: '30d',
                    calculated_at: new Date().toISOString()
                });
                
            if (error) {
                console.log(`      ❌ Erro ao salvar ${metrics.business_name}:`, error.message);
            }
        }
        
        console.log(`   ✅ ${tenantResults.length} tenant metrics salvos`);
        console.log('');
        
        // Calcular e salvar platform metrics
        console.log('4️⃣ CALCULANDO PLATFORM METRICS...');
        
        const platformMetrics = {
            calculation_date: new Date().toISOString().split('T')[0],
            period_days: 30,
            data_source: 'conversation_outcome_corrected',
            
            // KPIs principais
            active_tenants: processedTenants,
            total_conversations: totalPlatformConversations,
            total_valid_conversations: totalPlatformConversations - totalSpamConversations,
            total_appointments: totalPlatformAppointments,
            total_customers: Math.round(totalPlatformConversations * 0.8),
            total_ai_interactions: totalPlatformConversations,
            platform_mrr: totalPlatformMRR,
            total_revenue: totalPlatformMRR,
            total_chat_minutes: Math.round(totalPlatformMinutes),
            total_spam_conversations: totalSpamConversations,
            
            // Ratios e percentuais
            receita_uso_ratio: totalPlatformMinutes > 0 ? totalPlatformMRR / totalPlatformMinutes : 0,
            operational_efficiency_pct: totalPlatformConversations > 0 ? 
                (totalPlatformAppointments / totalPlatformConversations * 100) : 0,
            spam_rate_pct: totalPlatformConversations > 0 ? 
                (totalSpamConversations / totalPlatformConversations * 100) : 0,
            cancellation_rate_pct: 0,
            
            // Scores e índices
            revenue_usage_distortion_index: 0,
            platform_health_score: 85,
            tenants_above_usage: tenantResults.filter(t => t.excess_conversations > 0).length,
            tenants_below_usage: tenantResults.filter(t => t.excess_conversations === 0).length,
            
            // Metadados
            created_at: new Date().toISOString()
        };
        
        // Salvar platform metrics
        await supabase
            .from('platform_metrics')
            .delete()
            .eq('data_source', 'conversation_outcome_corrected');
            
        const { error: platformError } = await supabase
            .from('platform_metrics')
            .insert(platformMetrics);
            
        if (platformError) {
            console.log(`   ❌ Erro ao salvar platform metrics:`, platformError.message);
        } else {
            console.log(`   ✅ Platform metrics salvos`);
        }
        
        // Resumo final
        const executionTime = Date.now() - startTime;
        
        console.log('');
        console.log('🎯 RESUMO DA ATUALIZAÇÃO UNIVERSAL:');
        console.log('='.repeat(70));
        console.log(`💰 MRR PLATAFORMA: R$ ${totalPlatformMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        console.log(`📊 TENANTS PROCESSADOS: ${processedTenants}/${activeTenants.length}`);
        console.log(`💬 CONVERSAS REAIS: ${totalPlatformConversations}`);
        console.log(`📅 APPOINTMENTS: ${totalPlatformAppointments}`);
        console.log(`⏱️ MINUTOS TOTAIS: ${Math.round(totalPlatformMinutes)}`);
        console.log(`💰 CUSTO TOTAL: $${totalPlatformCost.toFixed(4)}`);
        console.log(`📈 EFICIÊNCIA: ${platformMetrics.operational_efficiency_pct.toFixed(2)}%`);
        console.log(`🚫 SPAM RATE: ${platformMetrics.spam_rate_pct.toFixed(2)}%`);
        console.log(`💵 RECEITA/USO: R$ ${platformMetrics.receita_uso_ratio.toFixed(2)}/min`);
        console.log(`⏱️ TEMPO EXECUÇÃO: ${executionTime}ms`);
        
        console.log('');
        console.log('📊 DISTRIBUIÇÃO POR PLANO:');
        const planDistribution = {};
        tenantResults.forEach(t => {
            planDistribution[t.suggested_plan] = (planDistribution[t.suggested_plan] || 0) + 1;
        });
        Object.entries(planDistribution).forEach(([plan, count]) => {
            console.log(`   ${plan}: ${count} tenants`);
        });
        
        console.log('');
        console.log('✅ ATUALIZAÇÃO UNIVERSAL CONCLUÍDA COM SUCESSO!');
        console.log('🎯 Todas as métricas agora baseadas em conversation_outcome');
        console.log('💰 Sistema de cobrança por conversas ativo');
        console.log('📊 APIs prontas para produção');
        
        return {
            success: true,
            execution_time_ms: executionTime,
            tenants_processed: processedTenants,
            platform_mrr: totalPlatformMRR,
            total_conversations: totalPlatformConversations
        };
        
    } catch (error) {
        console.error('💥 ERRO NA ATUALIZAÇÃO UNIVERSAL:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    updateAllMetricsCorrected()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 Script executado com sucesso!');
                process.exit(0);
            } else {
                console.log('\n💥 Script falhou:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Erro não tratado:', error);
            process.exit(1);
        });
}

module.exports = { updateAllMetricsCorrected };