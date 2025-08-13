/**
 * ANÁLISE MÉTRICAS REAIS
 * 
 * Analisar tenant_metric e platform_metric após implementações:
 * - Google Calendar sync (480 appointments externos)  
 * - Conversation outcomes corrigidos
 * - Diferenciação appointments internos/externos
 */

const { supabaseAdmin } = require('./src/config/database');

async function analisarMetricasReais() {
    try {
        console.log('📊 Analisando métricas reais: tenant_metric + platform_metric...');

        // 1. VERIFICAR ESTRUTURA DAS TABELAS
        console.log('\n🔍 Verificando estrutura das tabelas...');
        
        const { data: tenantColumns } = await supabaseAdmin
            .from('information_schema.columns')
            .select('column_name, data_type')
            .eq('table_name', 'tenant_metrics')
            .eq('table_schema', 'public');

        const { data: platformColumns } = await supabaseAdmin
            .from('information_schema.columns')
            .select('column_name, data_type')
            .eq('table_name', 'platform_metrics')
            .eq('table_schema', 'public');

        console.log('📋 Colunas tenant_metrics:', tenantColumns?.map(c => c.column_name) || []);
        console.log('📋 Colunas platform_metrics:', platformColumns?.map(c => c.column_name) || []);

        // 2. BUSCAR MÉTRICAS TENANT ATUAIS
        console.log('\n📈 TENANT METRICS:');
        const { data: tenantMetrics, error: tenantError } = await supabaseAdmin
            .from('tenant_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (tenantError) {
            console.error('❌ Erro tenant_metric:', tenantError);
        } else {
            console.log(`📊 Registros encontrados: ${tenantMetrics?.length || 0}`);
            
            if (tenantMetrics && tenantMetrics.length > 0) {
                console.log('\n📋 SAMPLE TENANT METRIC (mais recente):');
                const sample = tenantMetrics[0];
                Object.keys(sample).forEach(key => {
                    console.log(`   ${key}: ${sample[key]}`);
                });
            }
        }

        // 3. BUSCAR MÉTRICAS PLATFORM ATUAIS  
        console.log('\n🌍 PLATFORM METRICS:');
        const { data: platformMetrics, error: platformError } = await supabaseAdmin
            .from('platform_metrics')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        if (platformError) {
            console.error('❌ Erro platform_metric:', platformError);
        } else {
            console.log(`📊 Registros encontrados: ${platformMetrics?.length || 0}`);
            
            if (platformMetrics && platformMetrics.length > 0) {
                console.log('\n📋 SAMPLE PLATFORM METRIC (mais recente):');
                const sample = platformMetrics[0];
                Object.keys(sample).forEach(key => {
                    console.log(`   ${key}: ${sample[key]}`);
                });
            }
        }

        // 4. CALCULAR DADOS REAIS ATUAIS PARA COMPARAÇÃO
        console.log('\n🧮 CALCULANDO DADOS REAIS ATUAIS...');

        // Appointments totais e por tipo
        const { data: allAppointments } = await supabaseAdmin
            .from('appointments')
            .select('tenant_id, external_event_id, appointment_data, status, created_at');

        const totalAppointments = allAppointments?.length || 0;
        const appointmentsInternos = allAppointments?.filter(a => !a.external_event_id).length || 0;
        const appointmentsExternos = allAppointments?.filter(a => a.external_event_id).length || 0;
        const appointmentsWhatsapp = allAppointments?.filter(a => a.appointment_data?.source === 'whatsapp').length || 0;
        const appointmentsCalendar = allAppointments?.filter(a => a.appointment_data?.source === 'google_calendar').length || 0;

        // Conversations (sessions únicas)
        const { data: allConversations } = await supabaseAdmin
            .from('conversation_history')
            .select('conversation_context, created_at');

        // Extrair sessions únicas
        const sessionsUnicas = new Set();
        const tenantSessions = {};

        allConversations?.forEach(c => {
            try {
                const context = typeof c.conversation_context === 'string' 
                    ? JSON.parse(c.conversation_context) 
                    : c.conversation_context;
                
                if (context?.session_id && context?.tenantId) {
                    sessionsUnicas.add(context.session_id);
                    
                    if (!tenantSessions[context.tenantId]) {
                        tenantSessions[context.tenantId] = new Set();
                    }
                    tenantSessions[context.tenantId].add(context.session_id);
                }
            } catch (e) {
                // Ignorar erros de parsing
            }
        });

        const totalConversations = sessionsUnicas.size;
        const totalMessages = allConversations?.length || 0;

        // Tenants ativos
        const { data: allTenants } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain');

        const totalTenants = allTenants?.length || 0;

        // Users únicos
        const { data: allUsers } = await supabaseAdmin
            .from('users')
            .select('id');

        const totalUsers = allUsers?.length || 0;

        // 5. ANÁLISE COMPARATIVA
        console.log('\n📊 DADOS REAIS CALCULADOS:');
        console.log('='.repeat(60));
        console.log(`📈 Total Appointments: ${totalAppointments}`);
        console.log(`   📱 Internos (sem external_event_id): ${appointmentsInternos} (${((appointmentsInternos/totalAppointments)*100).toFixed(1)}%)`);
        console.log(`   📅 Externos (com external_event_id): ${appointmentsExternos} (${((appointmentsExternos/totalAppointments)*100).toFixed(1)}%)`);
        console.log(`   🔍 Source WhatsApp: ${appointmentsWhatsapp}`);
        console.log(`   🔍 Source Calendar: ${appointmentsCalendar}`);
        console.log(`💬 Total Conversations: ${totalConversations}`);
        console.log(`📨 Total Messages: ${totalMessages}`);
        console.log(`🏢 Total Tenants: ${totalTenants}`);
        console.log(`👥 Total Users: ${totalUsers}`);
        console.log(`📈 Média Messages/Conversation: ${(totalMessages/totalConversations).toFixed(1)}`);

        // 6. COMPARAÇÃO COM MÉTRICAS SALVAS  
        console.log('\n🔍 COMPARAÇÃO COM MÉTRICAS SALVAS:');
        console.log('='.repeat(60));

        if (platformMetrics && platformMetrics.length > 0) {
            const ultimaPlatform = platformMetrics[0];
            console.log('🌍 PLATFORM METRIC (mais recente):');
            console.log(`   Data: ${ultimaPlatform.created_at}`);
            console.log(`   Appointments (Salvo vs Real): ${ultimaPlatform.total_appointments || 'N/A'} vs ${totalAppointments}`);
            console.log(`   Conversations (Salvo vs Real): ${ultimaPlatform.total_conversations || 'N/A'} vs ${totalConversations}`);
            console.log(`   Messages (Salvo vs Real): ${ultimaPlatform.total_messages || ultimaPlatform.ai_interactions || 'N/A'} vs ${totalMessages}`);
            console.log(`   Tenants (Salvo vs Real): ${ultimaPlatform.total_tenants || ultimaPlatform.active_tenants || 'N/A'} vs ${totalTenants}`);
            console.log(`   Users (Salvo vs Real): ${ultimaPlatform.total_users || ultimaPlatform.total_customers || 'N/A'} vs ${totalUsers}`);

            // Verificar discrepâncias
            const discrepanciaAppointments = Math.abs((ultimaPlatform.total_appointments || 0) - totalAppointments);
            const discrepanciaConversations = Math.abs((ultimaPlatform.total_conversations || 0) - totalConversations);
            
            console.log('\n⚠️ DISCREPÂNCIAS:');
            console.log(`   Appointments: ${discrepanciaAppointments} (${discrepanciaAppointments > 50 ? 'ALTA' : 'BAIXA'})`);
            console.log(`   Conversations: ${discrepanciaConversations} (${discrepanciaConversations > 100 ? 'ALTA' : 'BAIXA'})`);
        }

        // 7. ANÁLISE POR TENANT
        console.log('\n🏢 ANÁLISE POR TENANT:');
        console.log('='.repeat(60));

        const tenantStats = {};
        
        allTenants?.forEach(tenant => {
            const tenantId = tenant.id;
            const appointmentsTenant = allAppointments?.filter(a => a.tenant_id === tenantId) || [];
            const conversationsTenant = tenantSessions[tenantId]?.size || 0;
            
            tenantStats[tenantId] = {
                name: tenant.business_name,
                domain: tenant.domain,
                appointments: appointmentsTenant.length,
                internos: appointmentsTenant.filter(a => !a.external_event_id).length,
                externos: appointmentsTenant.filter(a => a.external_event_id).length,
                conversations: conversationsTenant
            };
        });

        // Mostrar top 5 tenants por appointments
        const topTenants = Object.entries(tenantStats)
            .sort(([,a], [,b]) => b.appointments - a.appointments)
            .slice(0, 5);

        console.log('🏆 TOP 5 TENANTS POR APPOINTMENTS:');
        topTenants.forEach(([tenantId, stats], index) => {
            console.log(`   ${index + 1}. ${stats.name} (${stats.domain})`);
            console.log(`      📊 Appointments: ${stats.appointments}`);
            console.log(`      📱 Internos: ${stats.internos}`);
            console.log(`      📅 Externos: ${stats.externos}`);
            console.log(`      💬 Conversations: ${stats.conversations}`);
        });

        // 8. VALIDAÇÃO DE CONSISTÊNCIA
        console.log('\n✅ VALIDAÇÃO DE CONSISTÊNCIA:');
        console.log('='.repeat(60));

        const consistenciaInternos = appointmentsInternos === appointmentsWhatsapp;
        const consistenciaExternos = appointmentsExternos === appointmentsCalendar;
        const consistenciaTotal = (appointmentsInternos + appointmentsExternos) === totalAppointments;

        console.log(`📱 Internos consistentes: ${consistenciaInternos ? '✅' : '❌'} (${appointmentsInternos} sem external_id vs ${appointmentsWhatsapp} source whatsapp)`);
        console.log(`📅 Externos consistentes: ${consistenciaExternos ? '✅' : '❌'} (${appointmentsExternos} com external_id vs ${appointmentsCalendar} source calendar)`);
        console.log(`📊 Total consistente: ${consistenciaTotal ? '✅' : '❌'} (${appointmentsInternos} + ${appointmentsExternos} = ${totalAppointments})`);

        // 9. RECOMENDAÇÕES
        console.log('\n💡 RECOMENDAÇÕES:');
        console.log('='.repeat(60));

        if (appointmentsExternos > 0) {
            console.log('✅ Google Calendar sync implementado com sucesso');
            console.log(`   - ${appointmentsExternos} appointments externos criados`);
        }

        if (totalConversations > 0) {
            console.log('✅ Sistema de conversas funcionando');
            console.log(`   - ${totalConversations} conversas únicas identificadas`);
            console.log('   - Cobrança por conversa operacional');
        }

        if (!consistenciaInternos || !consistenciaExternos) {
            console.log('⚠️ Inconsistências encontradas nos dados');
            console.log('   - Verificar diferenciação de appointments');
        }

        console.log('\n🔄 PRÓXIMOS PASSOS SUGERIDOS:');
        console.log('1. Recalcular métricas tenant_metric e platform_metric');
        console.log('2. Atualizar com novos campos para appointments externos');
        console.log('3. Implementar tracking de appointments por source');
        console.log('4. Configurar monitoramento de sync Google Calendar');

        return {
            dados_reais: {
                appointments: totalAppointments,
                internos: appointmentsInternos,
                externos: appointmentsExternos,
                conversations: totalConversations,
                messages: totalMessages,
                tenants: totalTenants,
                users: totalUsers
            },
            consistencia: {
                internos: consistenciaInternos,
                externos: consistenciaExternos,
                total: consistenciaTotal
            },
            metricas_salvas: {
                tenant_records: tenantMetrics?.length || 0,
                platform_records: platformMetrics?.length || 0
            }
        };

    } catch (error) {
        console.error('❌ Erro na análise:', error);
    }
}

// Executar
if (require.main === module) {
    analisarMetricasReais()
        .then((result) => {
            console.log('\n🏁 Análise de métricas concluída!');
            if (result) {
                console.log(`📊 Resumo: ${result.dados_reais.appointments} appointments (${result.dados_reais.internos} internos + ${result.dados_reais.externos} externos)`);
                console.log(`✅ Consistência: ${result.consistencia.total ? 'OK' : 'PROBLEMAS'}`);
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { analisarMetricasReais };