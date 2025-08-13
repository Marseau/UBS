/**
 * CORREÇÃO DO SISTEMA DE MÉTRICAS
 * Implementa as regras de negócio corretas conforme documentação
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fixMetricsSystem() {
    console.log('🔧 CORRIGINDO SISTEMA DE MÉTRICAS');
    console.log('='.repeat(60));
    
    try {
        // =====================================================
        // 1. RECALCULAR PLATFORM_METRICS COM REGRAS CORRETAS
        // =====================================================
        
        console.log('\n💰 RECALCULANDO MRR BASEADO EM APPOINTMENTS COMPLETADOS');
        console.log('-'.repeat(50));
        
        const periodDays = 30;
        const calculationDate = new Date();
        const startDate = new Date(calculationDate);
        startDate.setDate(startDate.getDate() - periodDays);
        
        const startIso = startDate.toISOString();
        const endIso = calculationDate.toISOString();
        
        console.log(`📅 Período: ${startDate.toLocaleDateString()} a ${calculationDate.toLocaleDateString()}`);
        
        // =====================================================
        // MRR CORRETO: Baseado em appointments completed
        // =====================================================
        
        const { data: completedAppointments, error: mrrError } = await supabase
            .from('appointments')
            .select(`
                final_price, 
                quoted_price, 
                appointment_data,
                tenant_id,
                created_at
            `)
            .eq('status', 'completed')
            .gte('created_at', startIso)
            .lt('created_at', endIso);
            
        if (mrrError) {
            console.error('❌ Erro ao buscar appointments:', mrrError);
            return;
        }
        
        let totalMrrBrl = 0;
        let appointmentCount = 0;
        const tenantRevenues = {};
        
        completedAppointments?.forEach(apt => {
            // Regra: final_price > quoted_price > appointment_data.price
            let price = apt.final_price;
            if (!price && apt.quoted_price) price = apt.quoted_price;
            if (!price && apt.appointment_data?.price) {
                price = parseFloat(apt.appointment_data.price);
            }
            if (!price) price = 0;
            
            totalMrrBrl += price;
            appointmentCount++;
            
            if (!tenantRevenues[apt.tenant_id]) {
                tenantRevenues[apt.tenant_id] = 0;
            }
            tenantRevenues[apt.tenant_id] += price;
        });
        
        console.log(`💰 MRR Real (appointments completed): R$ ${totalMrrBrl.toFixed(2)}`);
        console.log(`📅 Appointments completed: ${appointmentCount}`);
        
        // =====================================================
        // AI INTERACTIONS VÁLIDAS: confidence_score >= 0.7
        // =====================================================
        
        console.log('\n🤖 RECALCULANDO AI INTERACTIONS VÁLIDAS');
        console.log('-'.repeat(50));
        
        const { data: conversations, error: aiError } = await supabase
            .from('conversation_history')
            .select('confidence_score, message_type, is_from_user')
            .gte('created_at', startIso)
            .lt('created_at', endIso);
            
        if (aiError) {
            console.error('❌ Erro ao buscar conversations:', aiError);
            return;
        }
        
        let validAiInteractions = 0;
        let spamInteractions = 0;
        let totalConversations = 0;
        
        conversations?.forEach(msg => {
            // Contar apenas mensagens de usuário
            if (msg.is_from_user && msg.message_type === 'user') {
                totalConversations++;
                
                // Regra: confidence_score >= 0.7 = válido
                if (msg.confidence_score >= 0.7) {
                    validAiInteractions++;
                } else {
                    spamInteractions++;
                }
            }
        });
        
        const spamRate = totalConversations > 0 ? 
            (spamInteractions / totalConversations) * 100 : 0;
            
        console.log(`💬 Total conversas (usuário): ${totalConversations}`);
        console.log(`✅ AI Interactions válidas: ${validAiInteractions}`);
        console.log(`🚫 Spam interactions: ${spamInteractions}`);
        console.log(`📊 Spam rate: ${spamRate.toFixed(1)}%`);
        
        // =====================================================
        // TENANTS ATIVOS
        // =====================================================
        
        console.log('\n🏢 VERIFICANDO TENANTS ATIVOS');
        console.log('-'.repeat(50));
        
        const { count: activeTenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
            
        console.log(`🏢 Tenants ativos: ${activeTenants || 0}`);
        
        // =====================================================
        // TOTAL DE APPOINTMENTS (TODOS OS STATUS)
        // =====================================================
        
        const { count: totalAppointments, error: appointmentsError } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso);
            
        const { count: cancelledAppointments } = await supabase
            .from('appointments')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startIso)
            .lt('created_at', endIso)
            .eq('status', 'cancelled');
        
        const cancellationRate = totalAppointments > 0 ? 
            ((cancelledAppointments || 0) / totalAppointments) * 100 : 0;
            
        console.log(`📅 Total appointments: ${totalAppointments || 0}`);
        console.log(`❌ Appointments cancelados: ${cancelledAppointments || 0}`);
        console.log(`📊 Cancellation rate: ${cancellationRate.toFixed(1)}%`);
        
        // =====================================================
        // OPERATIONAL EFFICIENCY
        // =====================================================
        
        const operationalEfficiency = totalConversations > 0 ? 
            ((totalAppointments || 0) / totalConversations) * 100 : 0;
            
        console.log(`⚡ Operational efficiency: ${operationalEfficiency.toFixed(1)}%`);
        
        // =====================================================
        // ATUALIZAR PLATFORM_METRICS COM DADOS CORRETOS
        // =====================================================
        
        console.log('\n📊 ATUALIZANDO PLATFORM_METRICS');
        console.log('-'.repeat(50));
        
        // Deletar dados incorretos
        const { error: deleteError } = await supabase
            .from('platform_metrics')
            .delete()
            .eq('period_days', periodDays);
            
        if (deleteError) {
            console.warn('⚠️ Aviso ao deletar dados antigos:', deleteError.message);
        }
        
        // Inserir dados corretos
        const correctPlatformMetrics = {
            calculation_date: calculationDate.toISOString().split('T')[0],
            period_days: periodDays,
            platform_mrr: totalMrrBrl,
            total_appointments: totalAppointments || 0,
            completed_appointments: appointmentCount,
            cancelled_appointments: cancelledAppointments || 0,
            total_ai_interactions: validAiInteractions,
            total_conversations: totalConversations,
            spam_interactions: spamInteractions,
            spam_rate_pct: spamRate,
            cancellation_rate_pct: cancellationRate,
            operational_efficiency_pct: operationalEfficiency,
            active_tenants: activeTenants || 0,
            total_customers: 0, // Calcular depois se necessário
            total_chat_minutes: totalConversations * 5, // Estimativa: 5 min/conversa
            data_source: 'corrected_calculation',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const { data: insertedData, error: insertError } = await supabase
            .from('platform_metrics')
            .insert([correctPlatformMetrics])
            .select();
            
        if (insertError) {
            console.error('❌ Erro ao inserir platform_metrics corrigidos:', insertError);
            return;
        }
        
        console.log('✅ Platform_metrics atualizado com dados corretos!');
        
        // =====================================================
        // COMPARAÇÃO: ANTES vs DEPOIS
        // =====================================================
        
        console.log('\n📊 COMPARAÇÃO: DADOS INCORRETOS vs CORRETOS');
        console.log('='.repeat(60));
        console.log('| Métrica | Valor Anterior | Valor Correto | Diferença |');
        console.log('|---------|----------------|---------------|-----------|');
        console.log(`| MRR | R$ 190.646 | R$ ${totalMrrBrl.toFixed(2)} | ${((totalMrrBrl - 190646) / 190646 * 100).toFixed(1)}% |`);
        console.log(`| Appointments | 1.513 | ${totalAppointments} | ${totalAppointments - 1513} |`);
        console.log(`| AI Interactions | 1.495 | ${validAiInteractions} | ${validAiInteractions - 1495} |`);
        console.log(`| Spam Rate | 0% | ${spamRate.toFixed(1)}% | +${spamRate.toFixed(1)}% |`);
        console.log(`| Cancel Rate | 0% | ${cancellationRate.toFixed(1)}% | +${cancellationRate.toFixed(1)}% |`);
        
        // =====================================================
        // VERIFICAR SE API AGORA RETORNA DADOS CORRETOS
        // =====================================================
        
        console.log('\n🔍 TESTANDO API COM DADOS CORRIGIDOS');
        console.log('-'.repeat(50));
        
        try {
            const apiResponse = await fetch('http://localhost:3001/api/super-admin/kpis');
            if (apiResponse.ok) {
                const apiData = await apiResponse.json();
                const apiMrr = apiData.data?.kpis?.mrrPlatform?.value;
                const apiAppointments = apiData.data?.kpis?.totalAppointments?.value;
                
                console.log(`🔌 API MRR: R$ ${apiMrr?.toFixed(2) || 'N/A'}`);
                console.log(`🔌 API Appointments: ${apiAppointments || 'N/A'}`);
                
                if (Math.abs(apiMrr - totalMrrBrl) < 1) {
                    console.log('✅ API agora retorna dados corretos!');
                } else {
                    console.log('⚠️ API ainda pode estar usando cache/dados antigos');
                }
            } else {
                console.log('⚠️ API não disponível para teste');
            }
        } catch (apiError) {
            console.log('⚠️ Erro ao testar API:', apiError.message);
        }
        
        console.log('\n🎉 CORREÇÃO DO SISTEMA DE MÉTRICAS CONCLUÍDA!');
        console.log('✅ Platform_metrics agora usa regras de negócio corretas');
        console.log('✅ MRR baseado em appointments completed');
        console.log('✅ AI interactions baseado em confidence_score >= 0.7');
        console.log('✅ Spam detection implementado');
        console.log('✅ Cancellation rate calculado corretamente');
        
    } catch (error) {
        console.error('💥 Erro na correção:', error);
    }
}

fixMetricsSystem().catch(console.error);