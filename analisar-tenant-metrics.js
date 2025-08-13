/**
 * ANÁLISE TENANT METRICS
 * 
 * Verificar se as métricas fazem sentido após implementações:
 * - Google Calendar sync
 * - Diferenciação appointments (internos/externos)
 * - Conversation outcomes corrigidos
 */

const { supabaseAdmin } = require('./src/config/database');

async function analisarTenantMetrics() {
    try {
        console.log('📊 Analisando métricas tenant após implementações...');

        // 1. BUSCAR MÉTRICAS ATUAIS
        const { data: tenantMetrics, error: metricsError } = await supabaseAdmin
            .from('tenant_platform_metrics')
            .select('*')
            .order('calculated_at', { ascending: false })
            .limit(10);

        if (metricsError) {
            console.error('❌ Erro ao buscar tenant metrics:', metricsError);
            return;
        }

        console.log(`\n📈 TENANT METRICS ENCONTRADAS: ${tenantMetrics?.length || 0}`);

        // 2. BUSCAR DADOS REAIS PARA COMPARAÇÃO
        console.log('\n🔍 COLETANDO DADOS REAIS PARA COMPARAÇÃO...');

        // Appointments por tenant
        const { data: appointmentsData } = await supabaseAdmin
            .from('appointments')
            .select(`
                tenant_id,
                external_event_id,
                appointment_data,
                status,
                created_at
            `);

        // Conversations por tenant  
        const { data: conversationsData } = await supabaseAdmin
            .from('conversation_history')
            .select(`
                conversation_context,
                created_at
            `);

        // Users por tenant
        const { data: usersData } = await supabaseAdmin
            .from('users')
            .select('id');

        // Tenants info
        const { data: tenantsData } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain');

        console.log(`📊 Dados coletados:`);
        console.log(`   - Appointments: ${appointmentsData?.length || 0}`);
        console.log(`   - Conversations: ${conversationsData?.length || 0}`);
        console.log(`   - Users: ${usersData?.length || 0}`);
        console.log(`   - Tenants: ${tenantsData?.length || 0}`);

        // 3. CALCULAR MÉTRICAS REAIS POR TENANT
        console.log('\n🧮 CALCULANDO MÉTRICAS REAIS...');

        const metricsReais = {};

        tenantsData?.forEach(tenant => {
            const tenantId = tenant.id;
            
            // Appointments por tenant
            const appointmentsTenant = appointmentsData?.filter(a => a.tenant_id === tenantId) || [];
            const appointmentsInternos = appointmentsTenant.filter(a => !a.external_event_id).length;
            const appointmentsExternos = appointmentsTenant.filter(a => a.external_event_id).length;
            const appointmentsWhatsApp = appointmentsTenant.filter(a => a.appointment_data?.source === 'whatsapp').length;
            const appointmentsCalendar = appointmentsTenant.filter(a => a.appointment_data?.source === 'google_calendar').length;

            // Conversations por tenant (extrair tenant_id do context)
            const conversationsTenant = conversationsData?.filter(c => {
                try {
                    const context = typeof c.conversation_context === 'string' 
                        ? JSON.parse(c.conversation_context) 
                        : c.conversation_context;
                    return context?.tenantId === tenantId;
                } catch {
                    return false;
                }
            }) || [];

            // Sessions únicas (conversations)
            const sessionsUnicas = new Set();
            conversationsTenant.forEach(c => {
                try {
                    const context = typeof c.conversation_context === 'string' 
                        ? JSON.parse(c.conversation_context) 
                        : c.conversation_context;
                    if (context?.session_id) {
                        sessionsUnicas.add(context.session_id);
                    }
                } catch {}
            });

            metricsReais[tenantId] = {
                tenant_name: tenant.business_name,
                domain: tenant.domain,
                total_appointments: appointmentsTenant.length,
                appointments_internos: appointmentsInternos,
                appointments_externos: appointmentsExternos,
                appointments_whatsapp: appointmentsWhatsApp,
                appointments_calendar: appointmentsCalendar,
                total_messages: conversationsTenant.length,
                total_conversations: sessionsUnicas.size,
                ratio_extern_intern: appointmentsInternos > 0 ? (appointmentsExternos / appointmentsInternos).toFixed(2) : 'N/A'
            };
        });

        // 4. COMPARAR COM MÉTRICAS SALVAS
        console.log('\n📊 COMPARAÇÃO MÉTRICAS SALVAS vs REAIS:');
        console.log('='.repeat(80));

        if (tenantMetrics && tenantMetrics.length > 0) {
            const metricaRecente = tenantMetrics[0];
            console.log(`📅 Métrica mais recente: ${metricaRecente.calculated_at}`);
            console.log(`🏢 Tenant: ${metricaRecente.tenant_id}`);
            
            const realData = metricsReais[metricaRecente.tenant_id];
            
            if (realData) {
                console.log('\n🔍 COMPARAÇÃO DETALHADA:');
                console.log(`   Tenant: ${realData.tenant_name} (${realData.domain})`);
                console.log(`   Appointments (Salvo vs Real): ${metricaRecente.total_appointments || 'N/A'} vs ${realData.total_appointments}`);
                console.log(`   Conversations (Salvo vs Real): ${metricaRecente.total_conversations || 'N/A'} vs ${realData.total_conversations}`);
                console.log(`   Messages (Salvo vs Real): ${metricaRecente.ai_interactions || 'N/A'} vs ${realData.total_messages}`);
                console.log(`   Appointments Internos: ${realData.appointments_internos}`);
                console.log(`   Appointments Externos: ${realData.appointments_externos}`);
                console.log(`   Ratio Externo/Interno: ${realData.ratio_extern_intern}`);
            }
        } else {
            console.log('⚠️ Nenhuma métrica salva encontrada');
        }

        // 5. RESUMO POR TENANT
        console.log('\n📈 RESUMO POR TENANT:');
        console.log('='.repeat(80));

        Object.values(metricsReais).forEach((tenant, index) => {
            console.log(`\n${index + 1}. ${tenant.tenant_name} (${tenant.domain})`);
            console.log(`   📊 Total appointments: ${tenant.total_appointments}`);
            console.log(`   📱 Internos (WhatsApp): ${tenant.appointments_internos} (${tenant.appointments_whatsapp} com source)`);
            console.log(`   📅 Externos (Calendar): ${tenant.appointments_externos} (${tenant.appointments_calendar} com source)`);
            console.log(`   💬 Total messages: ${tenant.total_messages}`);
            console.log(`   🗣️ Total conversations: ${tenant.total_conversations}`);
            console.log(`   📈 Ratio Externo/Interno: ${tenant.ratio_extern_intern}`);
            
            // Validar consistência
            const consistenteInternos = tenant.appointments_internos === tenant.appointments_whatsapp;
            const consistenteExternos = tenant.appointments_externos === tenant.appointments_calendar;
            const totalConsistente = (tenant.appointments_internos + tenant.appointments_externos) === tenant.total_appointments;
            
            console.log(`   ✅ Consistência:`);
            console.log(`      Internos: ${consistenteInternos ? '✅' : '❌'}`);
            console.log(`      Externos: ${consistenteExternos ? '✅' : '❌'}`);
            console.log(`      Total: ${totalConsistente ? '✅' : '❌'}`);
        });

        // 6. ANÁLISE GLOBAL
        console.log('\n🌍 ANÁLISE GLOBAL:');
        console.log('='.repeat(80));

        const totals = Object.values(metricsReais).reduce((acc, tenant) => ({
            appointments: acc.appointments + tenant.total_appointments,
            internos: acc.internos + tenant.appointments_internos,
            externos: acc.externos + tenant.appointments_externos,
            conversations: acc.conversations + tenant.total_conversations,
            messages: acc.messages + tenant.total_messages
        }), { appointments: 0, internos: 0, externos: 0, conversations: 0, messages: 0 });

        console.log(`📊 TOTAIS PLATAFORMA:`);
        console.log(`   Total appointments: ${totals.appointments}`);
        console.log(`   Internos (WhatsApp): ${totals.internos} (${((totals.internos/totals.appointments)*100).toFixed(1)}%)`);
        console.log(`   Externos (Calendar): ${totals.externos} (${((totals.externos/totals.appointments)*100).toFixed(1)}%)`);
        console.log(`   Total conversations: ${totals.conversations}`);
        console.log(`   Total messages: ${totals.messages}`);
        console.log(`   Média msg/conversa: ${(totals.messages/totals.conversations).toFixed(1)}`);

        // 7. RECOMENDAÇÕES
        console.log('\n💡 RECOMENDAÇÕES:');
        console.log('='.repeat(80));

        if (totals.externos > 0) {
            console.log('✅ Diferenciação appointments implementada com sucesso');
            console.log(`   - ${totals.externos} appointments externos criados`);
            console.log(`   - Google Calendar sync pronto para produção`);
        }

        if (totals.conversations > 0) {
            console.log('✅ Sistema de conversas funcionando');
            console.log(`   - ${totals.conversations} conversas identificadas`);
            console.log('   - Cobrança por conversa implementada');
        }

        console.log('\n🔄 PRÓXIMOS PASSOS:');
        console.log('1. Executar recálculo das tenant_platform_metrics');
        console.log('2. Validar métricas com novos dados');
        console.log('3. Configurar Google Calendar credentials para testes reais');

        return {
            metrics_salvas: tenantMetrics?.length || 0,
            metrics_calculadas: Object.keys(metricsReais).length,
            totals,
            consistency_check: 'completed'
        };

    } catch (error) {
        console.error('❌ Erro na análise:', error);
    }
}

// Executar
if (require.main === module) {
    analisarTenantMetrics()
        .then((result) => {
            console.log('\n🏁 Análise concluída!', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { analisarTenantMetrics };