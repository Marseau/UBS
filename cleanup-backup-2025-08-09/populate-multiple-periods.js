/**
 * POPULAR MÉTRICAS PARA MÚLTIPLOS PERÍODOS
 * Script direto para calcular e popular 7, 30, 90 dias
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

async function populateMultiplePeriods() {
    console.log('📊 POPULANDO MÚLTIPLOS PERÍODOS (7, 30, 90 DIAS)');
    console.log('='.repeat(60));
    
    const startTime = Date.now();
    
    try {
        // =====================================================
        // 1. LIMPAR DADOS ANTIGOS
        // =====================================================
        
        console.log('1️⃣ Limpando métricas antigas...');
        
        await supabase
            .from('tenant_metrics')
            .delete()
            .eq('metric_type', 'billing_analysis');
            
        console.log('   ✅ Métricas antigas removidas');
        
        // =====================================================
        // 2. BUSCAR TENANTS ATIVOS
        // =====================================================
        
        console.log('');
        console.log('2️⃣ Buscando tenants ativos...');
        
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');
            
        if (tenantsError) {
            throw new Error(`Erro ao buscar tenants: ${tenantsError.message}`);
        }
        
        console.log(`   ✅ ${tenants.length} tenants ativos encontrados`);
        
        // =====================================================
        // 3. CALCULAR PARA CADA PERÍODO
        // =====================================================
        
        const periods = [7, 30, 90];
        let totalRecords = 0;
        
        console.log('');
        console.log('3️⃣ Calculando métricas para múltiplos períodos...');
        
        for (const tenant of tenants) {
            console.log(`\n📊 Processando ${tenant.business_name}:`);
            
            for (const periodDays of periods) {
                try {
                    // Calcular período
                    const periodAgo = new Date();
                    periodAgo.setDate(periodAgo.getDate() - periodDays);
                    
                    // Buscar conversas do período
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
                        .gte('created_at', periodAgo.toISOString());
                        
                    if (convError) {
                        console.log(`      ❌ ${periodDays}d: Erro - ${convError.message}`);
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
                        // Extrair minutos
                        let minutes = 2.5;
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
                        
                        // Custo
                        const apiCost = conv.api_cost_usd || 0;
                        const procCost = conv.processing_cost_usd || 0;
                        totalCost += (apiCost + procCost);
                        
                        // Qualidade
                        if ((conv.confidence_score || 0) >= 0.7) {
                            validConversations++;
                        } else {
                            spamConversations++;
                        }
                        
                        // Appointments
                        if (conv.conversation_outcome === 'appointment_created') {
                            appointmentConversations++;
                        }
                        
                        // Outcomes
                        const outcome = conv.conversation_outcome;
                        outcomeDistribution[outcome] = (outcomeDistribution[outcome] || 0) + 1;
                    });
                    
                    // Calcular plano e preço
                    const pricing = calculatePriceByConversations(totalConversations);
                    
                    // Preparar dados das métricas
                    const metricsData = {
                        business_name: tenant.business_name,
                        period_days: periodDays,
                        
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
                    
                    // Salvar no banco
                    const { error: saveError } = await supabase
                        .from('tenant_metrics')
                        .insert({
                            tenant_id: tenant.id,
                            metric_type: 'billing_analysis',
                            metric_data: metricsData,
                            period: `${periodDays}d`,
                            calculated_at: new Date().toISOString()
                        });
                        
                    if (saveError) {
                        console.log(`      ❌ ${periodDays}d: Erro ao salvar - ${saveError.message}`);
                    } else {
                        console.log(`      ✅ ${periodDays}d: ${totalConversations} conversas → ${pricing.plan} → R$ ${pricing.price}`);
                        totalRecords++;
                    }
                    
                } catch (error) {
                    console.log(`      ❌ ${periodDays}d: Erro - ${error.message}`);
                }
            }
        }
        
        // =====================================================
        // 4. VALIDAR RESULTADOS
        // =====================================================
        
        console.log('');
        console.log('4️⃣ Validando resultados...');
        
        const { data: results, error: validationError } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data')
            .eq('metric_type', 'billing_analysis')
            .order('tenant_id, period');
            
        if (validationError) {
            throw new Error(`Erro na validação: ${validationError.message}`);
        }
        
        console.log(`   ✅ ${results.length} registros salvos no banco`);
        
        // Agrupar por período para análise
        const periodAnalysis = {
            '7d': { count: 0, total_conversations: 0, total_mrr: 0 },
            '30d': { count: 0, total_conversations: 0, total_mrr: 0 },
            '90d': { count: 0, total_conversations: 0, total_mrr: 0 }
        };
        
        results.forEach(record => {
            const data = record.metric_data;
            const period = record.period;
            
            if (periodAnalysis[period]) {
                periodAnalysis[period].count++;
                periodAnalysis[period].total_conversations += data.total_conversations || 0;
                periodAnalysis[period].total_mrr += data.plan_price_brl || 0;
            }
        });
        
        // =====================================================
        // 5. RESUMO FINAL
        // =====================================================
        
        const executionTime = Date.now() - startTime;
        
        console.log('');
        console.log('🎯 RESUMO FINAL - MÚLTIPLOS PERÍODOS:');
        console.log('='.repeat(60));
        console.log(`📊 Total de registros: ${results.length}`);
        console.log(`🏢 Tenants processados: ${tenants.length}`);
        console.log(`📅 Períodos: ${periods.join(', ')} dias`);
        console.log(`⏱️ Tempo de execução: ${executionTime}ms`);
        
        console.log('');
        console.log('📈 ANÁLISE POR PERÍODO:');
        ['7d', '30d', '90d'].forEach(period => {
            const analysis = periodAnalysis[period];
            console.log(`${period.toUpperCase()}:`);
            console.log(`   🏢 Tenants: ${analysis.count}`);
            console.log(`   💬 Conversas: ${analysis.total_conversations}`);
            console.log(`   💰 MRR: R$ ${analysis.total_mrr}`);
            console.log('');
        });
        
        // Validação de consistência
        const expected = tenants.length * periods.length;
        console.log('✅ VALIDAÇÕES:');
        console.log(`   📊 Esperado: ${expected} registros (${tenants.length} × ${periods.length})`);
        console.log(`   📊 Encontrado: ${results.length} registros`);
        
        if (results.length === expected) {
            console.log('   ✅ TODOS OS PERÍODOS CALCULADOS CORRETAMENTE!');
        } else {
            console.log('   ❌ ALGUNS PERÍODOS ESTÃO FALTANDO');
        }
        
        console.log('');
        console.log('🎉 MÚLTIPLOS PERÍODOS POPULADOS COM SUCESSO!');
        console.log('📋 Agora você pode consultar métricas para 7, 30 e 90 dias');
        
        return {
            success: true,
            records_created: results.length,
            tenants_processed: tenants.length,
            periods: periods,
            execution_time_ms: executionTime
        };
        
    } catch (error) {
        console.error('💥 ERRO NA POPULAÇÃO:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    populateMultiplePeriods()
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

module.exports = { populateMultiplePeriods };