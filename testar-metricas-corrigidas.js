/**
 * TESTE DAS MÉTRICAS CORRIGIDAS
 * 
 * Testar Analytics Service e SaaS Metrics Service com correções estratégicas
 * antes de executar os jobs oficiais de recálculo
 */

const { supabaseAdmin } = require('./src/config/database');

async function testarMetricasCorrigidas() {
    try {
        console.log('🧪 TESTANDO MÉTRICAS CORRIGIDAS...');
        console.log('='.repeat(60));

        // 1. IMPLEMENTAR LÓGICA ESTRATÉGICA DIRETAMENTE
        console.log('\n📊 CALCULANDO MÉTRICAS ESTRATÉGICAS...');
        
        // Buscar todos os appointments com os campos necessários
        const { data: allAppointments } = await supabaseAdmin
            .from('appointments')
            .select('external_event_id, appointment_data, final_price, quoted_price, tenant_id, status');

        if (!allAppointments) {
            console.error('❌ Erro ao buscar appointments');
            return;
        }

        // 🎯 MÉTRICAS ESTRATÉGICAS - Appointments por fonte
        const appointmentsBySource = {
            total: allAppointments.length,
            internal: allAppointments.filter(a => !a.external_event_id).length,
            external: allAppointments.filter(a => a.external_event_id).length,
            whatsapp: allAppointments.filter(a => a.appointment_data?.source === 'whatsapp').length,
            calendar: allAppointments.filter(a => a.appointment_data?.source === 'google_calendar').length
        };

        // 🚨 RISCO BYPASS - % appointments externos vs internos
        const bypassRisk = appointmentsBySource.total > 0 ? 
            (appointmentsBySource.external / appointmentsBySource.total * 100) : 0;

        // 💰 REVENUE por fonte (usando correção: final_price > quoted_price)
        const revenueBySource = {
            internal: allAppointments.filter(a => !a.external_event_id)
                .reduce((sum, apt) => sum + (apt.final_price || apt.quoted_price || 0), 0),
            external: allAppointments.filter(a => a.external_event_id)
                .reduce((sum, apt) => sum + (apt.final_price || apt.quoted_price || 0), 0)
        };

        const totalRevenue = revenueBySource.internal + revenueBySource.external;

        console.log('🎯 MÉTRICAS ESTRATÉGICAS:');
        console.log(`   📊 Total Appointments: ${appointmentsBySource.total}`);
        console.log(`   📱 Internos: ${appointmentsBySource.internal} (${((appointmentsBySource.internal/appointmentsBySource.total)*100).toFixed(1)}%)`);
        console.log(`   📅 Externos: ${appointmentsBySource.external} (${((appointmentsBySource.external/appointmentsBySource.total)*100).toFixed(1)}%)`);
        console.log(`   🔍 WhatsApp Source: ${appointmentsBySource.whatsapp}`);
        console.log(`   🔍 Calendar Source: ${appointmentsBySource.calendar}`);
        console.log(`   🚨 Risco Bypass: ${bypassRisk.toFixed(1)}%`);
        console.log(`   💰 Revenue Interno: R$ ${revenueBySource.internal.toLocaleString('pt-BR')}`);
        console.log(`   💰 Revenue Externo: R$ ${revenueBySource.external.toLocaleString('pt-BR')}`);
        console.log(`   📈 Split Receita: ${((revenueBySource.internal/totalRevenue)*100).toFixed(1)}% interno / ${((revenueBySource.external/totalRevenue)*100).toFixed(1)}% externo`);

        // 2. TESTAR CONVERSATION DETECTION
        console.log('\n💬 TESTANDO CONVERSATION DETECTION...');
        
        const { data: allConversations } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_context');

        if (!allConversations) {
            console.error('❌ Erro ao buscar conversations');
            return;
        }

        // 🗣️ DETECTAR conversas únicas via session_id
        const uniqueSessions = new Set();
        const outcomesAnalysis = {};
        let parseErrors = 0;

        allConversations.forEach((c, index) => {
            try {
                const context = typeof c.conversation_context === 'string' 
                    ? JSON.parse(c.conversation_context) 
                    : c.conversation_context;
                
                // Session detection (tentar múltiplas variações)
                const sessionId = context?.session_id || context?.sessionId || 
                                 context?.conversationId || context?.conversation_id;
                if (sessionId) {
                    uniqueSessions.add(sessionId);
                }
                
                // Outcome analysis
                const outcome = context?.conversation_outcome;
                if (outcome) {
                    outcomesAnalysis[outcome] = (outcomesAnalysis[outcome] || 0) + 1;
                }
            } catch (e) {
                parseErrors++;
                if (parseErrors <= 3) { // Log só os primeiros erros
                    console.log(`   Parse Error ${parseErrors}: ${e.message}`);
                }
            }
        });

        const totalConversations = uniqueSessions.size;
        const totalMessages = allConversations.length;
        const conversionRate = totalConversations > 0 ? 
            (appointmentsBySource.internal / totalConversations * 100) : 0;

        console.log(`   🗣️ Total Conversas: ${totalConversations}`);
        console.log(`   📨 Total Messages: ${totalMessages}`);
        console.log(`   📈 Conversion Rate: ${conversionRate.toFixed(1)}%`);
        console.log(`   ❌ Parse Errors: ${parseErrors}`);
        
        if (Object.keys(outcomesAnalysis).length > 0) {
            console.log('\n📋 ANÁLISE DE OUTCOMES:');
            Object.entries(outcomesAnalysis)
                .sort(([,a], [,b]) => b - a)
                .forEach(([outcome, count]) => {
                    console.log(`      ${outcome}: ${count}`);
                });
        } else {
            console.log('   ⚠️ Nenhum outcome detectado');
        }

        // 3. TESTAR TENANT ESPECÍFICO
        console.log('\n🏢 TESTANDO TENANT ESPECÍFICO...');
        
        const { data: tenant } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name')
            .limit(1)
            .single();
        
        if (tenant) {
            console.log(`🏢 Tenant: ${tenant.business_name} (${tenant.id})`);
            
            const tenantAppointments = allAppointments.filter(a => a.tenant_id === tenant.id);
            const tenantInternal = tenantAppointments.filter(a => !a.external_event_id).length;
            const tenantExternal = tenantAppointments.filter(a => a.external_event_id).length;
            const tenantBypassRisk = tenantAppointments.length > 0 ? 
                (tenantExternal / tenantAppointments.length * 100) : 0;
            
            console.log(`   📊 Appointments: ${tenantAppointments.length} (${tenantInternal} internos + ${tenantExternal} externos)`);
            console.log(`   🚨 Risco Bypass: ${tenantBypassRisk.toFixed(1)}%`);
        }

        // 4. SAMPLE CONVERSATION CONTEXT ANALYSIS
        console.log('\n🗣️ SAMPLE CONVERSATION CONTEXT ANALYSIS...');
        
        const { data: sampleConversations } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_context')
            .limit(5);

        console.log(`📨 Sample de ${sampleConversations?.length || 0} conversation_history:`);
        
        sampleConversations?.forEach((c, index) => {
            console.log(`   ${index + 1}. Type: ${typeof c.conversation_context}`);
            
            try {
                const context = typeof c.conversation_context === 'string' 
                    ? JSON.parse(c.conversation_context) 
                    : c.conversation_context;
                
                const sessionId = context?.session_id || context?.sessionId || 
                                 context?.conversationId || context?.conversation_id;
                const outcome = context?.conversation_outcome;
                const tenantId = context?.tenantId || context?.tenant_id;
                
                console.log(`      Session: ${sessionId || 'N/A'}`);
                console.log(`      Outcome: ${outcome || 'N/A'}`);
                console.log(`      Tenant: ${tenantId || 'N/A'}`);
                
            } catch (e) {
                console.log(`      ❌ Parse Error: ${e.message}`);
            }
            
            if (index < 2) { // Mostrar só os primeiros 2
                console.log(`      Raw: ${JSON.stringify(c.conversation_context).substring(0, 100)}...`);
            }
        });

        // 5. ASSESSMENT FINAL
        console.log('\n🎯 ASSESSMENT FINAL:');
        console.log('='.repeat(60));

        const consistencyCheck = {
            source_consistency: appointmentsBySource.internal === appointmentsBySource.whatsapp && 
                               appointmentsBySource.external === appointmentsBySource.calendar,
            data_integrity: appointmentsBySource.internal + appointmentsBySource.external === appointmentsBySource.total
        };

        const appointmentsReady = consistencyCheck.source_consistency && consistencyCheck.data_integrity;
        const conversationsFixed = totalConversations > 0;
        const outcomesFixed = Object.keys(outcomesAnalysis).length > 0;

        console.log(`✅ APPOINTMENTS CONSISTENCY: ${appointmentsReady ? 'PASSED' : 'FAILED'}`);
        console.log(`💬 CONVERSATIONS DETECTED: ${conversationsFixed ? 'YES' : 'NO (AINDA PRECISA FIX)'}`);
        console.log(`🎯 OUTCOMES DETECTED: ${outcomesFixed ? 'YES' : 'NO (AINDA PRECISA FIX)'}`);

        if (appointmentsReady) {
            console.log('\n🎉 APPOINTMENTS METRICS: PRONTAS PARA PRODUÇÃO!');
        } else {
            console.log('\n⚠️ APPOINTMENTS METRICS: AINDA PRECISAM AJUSTES');
        }

        if (!conversationsFixed) {
            console.log('🔧 CONVERSATIONS: Problema de parsing session_id ainda presente');
            console.log('💡 RECOMENDAÇÃO: Debugar conversation_context structure');
        }

        // 6. BYPASS RISK ANALYSIS
        console.log('\n🚨 ANÁLISE DE RISCO BYPASS:');
        
        if (bypassRisk > 60) {
            console.log(`   🔥 RISCO CRÍTICO: ${bypassRisk.toFixed(1)}% - Tenant pode cancelar!`);
        } else if (bypassRisk > 40) {
            console.log(`   ⚠️ RISCO ALTO: ${bypassRisk.toFixed(1)}% - Necessita atenção`);
        } else if (bypassRisk > 20) {
            console.log(`   🟡 RISCO MÉDIO: ${bypassRisk.toFixed(1)}% - Monitorar`);
        } else {
            console.log(`   ✅ RISCO BAIXO: ${bypassRisk.toFixed(1)}% - Uso ideal da plataforma`);
        }

        return {
            appointmentsReady,
            conversationsFixed,
            outcomesFixed,
            bypassRisk,
            appointmentsBySource,
            totalConversations,
            conversionRate
        };

    } catch (error) {
        console.error('❌ Erro no teste:', error);
        return null;
    }
}

// Executar teste
if (require.main === module) {
    testarMetricasCorrigidas()
        .then((result) => {
            if (result) {
                console.log('\n🏁 Teste concluído!');
                console.log(`📊 Appointments Ready: ${result.appointmentsReady ? 'YES' : 'NO'}`);
                console.log(`💬 Conversations Fixed: ${result.conversationsFixed ? 'YES' : 'NO'}`);
                console.log(`🎯 Outcomes Fixed: ${result.outcomesFixed ? 'YES' : 'NO'}`);
                
                if (result.appointmentsReady && result.conversationsFixed) {
                    console.log('\n✅ PRONTO PARA EXECUTAR JOBS DE RECÁLCULO!');
                } else {
                    console.log('\n⚠️ AINDA PRECISA DE CORREÇÕES ANTES DOS JOBS');
                }
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { testarMetricasCorrigidas };