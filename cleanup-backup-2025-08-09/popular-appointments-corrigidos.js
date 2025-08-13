/**
 * POPULAR APPOINTMENTS CORRIGIDOS
 * 
 * 1. Marca 2,295 appointments EXISTENTES como internos (WhatsApp)
 * 2. Cria 240 appointments NOVOS como externos (Google Calendar)
 * 3. Usa apenas usuários existentes
 */

const { supabaseAdmin } = require('./src/config/database');

async function popularAppointmentsCorrigidos() {
    try {
        console.log('🔧 Corrigindo appointments existentes e criando externos...');

        // 1. PRIMEIRO: Marcar todos os 2,295 appointments existentes como INTERNOS
        console.log('\n📝 ETAPA 1: Marcando appointments existentes como internos (WhatsApp)...');
        
        const { data: existingAppointments, error: existingError } = await supabaseAdmin
            .from('appointments')
            .select('id, appointment_data')
            .is('external_event_id', null); // Só os que não têm external_event_id

        if (existingError) {
            console.error('❌ Erro ao buscar appointments existentes:', existingError);
            return;
        }

        console.log(`📊 Encontrados ${existingAppointments?.length || 0} appointments para marcar como internos`);

        // Atualizar em lotes
        let internosAtualizados = 0;
        const BATCH_SIZE = 100;

        for (let i = 0; i < existingAppointments.length; i += BATCH_SIZE) {
            const batch = existingAppointments.slice(i, i + BATCH_SIZE);
            const ids = batch.map(a => a.id);

            const { error: updateError } = await supabaseAdmin
                .from('appointments')
                .update({
                    appointment_data: {
                        source: 'whatsapp',
                        booking_method: 'ai_assistant',
                        created_via: 'whatsapp_bot',
                        conversation_id: `conv_${Date.now()}_${i}`,
                        marked_as_internal: new Date().toISOString()
                    }
                })
                .in('id', ids);

            if (updateError) {
                console.error(`❌ Erro no batch ${i}:`, updateError);
            } else {
                internosAtualizados += batch.length;
                console.log(`✅ ${internosAtualizados}/${existingAppointments.length} appointments marcados como internos`);
            }
        }

        // 2. SEGUNDO: Buscar dados para criar appointments externos
        console.log('\n📊 ETAPA 2: Preparando criação de appointments externos...');

        const { data: tenants } = await supabaseAdmin
            .from('tenants')
            .select('id, business_name, domain');

        const { data: professionals } = await supabaseAdmin
            .from('professionals')
            .select('id, name, tenant_id');

        const { data: services } = await supabaseAdmin
            .from('services')
            .select('id, name, tenant_id, duration_minutes, base_price');

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, name, email, phone');

        console.log(`📋 Base para externos: ${tenants?.length} tenants, ${professionals?.length} profissionais, ${services?.length} serviços, ${users?.length} usuários`);

        // 3. TERCEIRO: Criar 240 appointments EXTERNOS
        console.log('\n📅 ETAPA 3: Criando 240 appointments externos (Google Calendar)...');
        
        const appointmentsExternos = [];
        const totalExternos = 240;

        for (let i = 0; i < totalExternos; i++) {
            const tenant = tenants[Math.floor(Math.random() * tenants.length)];
            const professional = professionals.find(p => p.tenant_id === tenant.id) || professionals[0];
            const service = services.find(s => s.tenant_id === tenant.id) || services[0];
            const user = users[Math.floor(Math.random() * users.length)];

            // Horários futuros realísticos (próximos 45 dias)
            const startDate = new Date();
            startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 45));
            
            // Horários comerciais (8h-18h)
            const hora = 8 + Math.floor(Math.random() * 10);
            const minuto = Math.random() < 0.5 ? 0 : 30;
            startDate.setHours(hora, minuto, 0, 0);

            const endDate = new Date(startDate);
            endDate.setMinutes(endDate.getMinutes() + (service?.duration_minutes || 60));

            // Google Calendar Event ID realístico
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substr(2, 8);
            const googleEventId = `gcal_${timestamp}_${i}_${randomStr}`;

            // Títulos realísticos baseados no domínio
            const titulosPorDominio = {
                beauty: ['Corte + Escova', 'Manicure Especial', 'Design de Sobrancelhas', 'Massagem Relaxante', 'Tratamento Facial'],
                healthcare: ['Consulta Psicológica', 'Sessão de Terapia', 'Avaliação Inicial', 'Consulta de Retorno', 'Atendimento Domiciliar'],
                legal: ['Consultoria Jurídica', 'Reunião Advocacia', 'Análise Contratual', 'Audiência Preparação', 'Consultoria Empresarial'],
                education: ['Aula Particular', 'Reforço Escolar', 'Preparação Vestibular', 'Aula de Inglês', 'Mentoria Acadêmica'],
                sports: ['Personal Training', 'Aula de Yoga', 'Treinamento Funcional', 'Avaliação Física', 'Consultoria Nutricional']
            };

            const titulos = titulosPorDominio[tenant.domain] || ['Atendimento Especial', 'Consulta Externa', 'Evento Particular'];
            const titulo = titulos[Math.floor(Math.random() * titulos.length)];

            appointmentsExternos.push({
                tenant_id: tenant.id,
                user_id: user.id,
                service_id: service.id,
                professional_id: professional.id,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: 'confirmed', // Eventos do calendar são confirmados
                quoted_price: (service?.base_price || 100) + Math.floor(Math.random() * 50), // Variação de preço
                customer_notes: `Evento importado do Google Calendar: ${titulo}`,
                appointment_data: {
                    source: 'google_calendar',
                    booking_method: 'external_sync',
                    calendar_event: {
                        calendar_id: 'primary',
                        event_url: `https://calendar.google.com/event?eid=${googleEventId}`,
                        sync_status: 'imported',
                        imported_at: new Date().toISOString(),
                        webhook_triggered: true,
                        original_event: {
                            summary: titulo,
                            description: `${titulo} - Agendado externamente via Google Calendar`,
                            location: tenant.business_name,
                            creator: user.email || `${user.name.toLowerCase().replace(' ', '.')}@gmail.com`
                        }
                    },
                    professional_name: professional.name,
                    tenant_domain: tenant.domain,
                    import_source: 'webhook_simulation'
                },
                external_event_id: googleEventId // CHAVE: Com external_event_id
            });
        }

        // 4. Inserir appointments externos
        let externosInseridos = 0;

        for (let i = 0; i < appointmentsExternos.length; i += BATCH_SIZE) {
            const batch = appointmentsExternos.slice(i, i + BATCH_SIZE);
            
            const { data, error } = await supabaseAdmin
                .from('appointments')
                .insert(batch)
                .select('id, external_event_id');

            if (error) {
                console.error(`❌ Erro no batch externo ${i}:`, error);
                console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
                console.error('Batch data sample:', JSON.stringify(batch[0], null, 2));
            } else {
                externosInseridos += data?.length || 0;
                console.log(`✅ Externos ${i + 1}-${Math.min(i + BATCH_SIZE, appointmentsExternos.length)} inseridos (${data?.length} registros)`);
                console.log(`   Exemplo external_event_id: ${data?.[0]?.external_event_id}`);
            }
        }

        // 5. VERIFICAÇÃO FINAL
        console.log('\n📊 VERIFICAÇÃO FINAL...');

        const { data: estatisticasFinais } = await supabaseAdmin
            .from('appointments')
            .select('external_event_id, appointment_data, created_at');

        if (estatisticasFinais) {
            const total = estatisticasFinais.length;
            const internos = estatisticasFinais.filter(a => !a.external_event_id).length;
            const externos = estatisticasFinais.filter(a => a.external_event_id).length;
            const whatsappSource = estatisticasFinais.filter(a => a.appointment_data?.source === 'whatsapp').length;
            const calendarSource = estatisticasFinais.filter(a => a.appointment_data?.source === 'google_calendar').length;

            console.log('\n🎉 POPULAÇÃO CORRIGIDA CONCLUÍDA!');
            console.log('📊 ESTATÍSTICAS FINAIS:');
            console.log(`   📝 Total appointments: ${total}`);
            console.log(`   📱 Internos (WhatsApp): ${internos} - ${((internos/total)*100).toFixed(1)}%`);
            console.log(`   📅 Externos (Google Calendar): ${externos} - ${((externos/total)*100).toFixed(1)}%`);
            console.log(`   🔍 Source 'whatsapp': ${whatsappSource}`);
            console.log(`   🔍 Source 'google_calendar': ${calendarSource}`);
            
            console.log('\n✅ RESULTADO ESPERADO:');
            console.log(`   ✅ Appointments internos atualizados: ${internosAtualizados}`);
            console.log(`   ✅ Appointments externos criados: ${externosInseridos}`);
            console.log(`   ✅ Total: ${internosAtualizados + externosInseridos}`);

            // Exemplos
            const exemploInterno = estatisticasFinais.find(a => a.appointment_data?.source === 'whatsapp');
            const exemploExterno = estatisticasFinais.find(a => a.appointment_data?.source === 'google_calendar');

            console.log('\n📋 EXEMPLOS:');
            if (exemploInterno) {
                console.log('   🔸 INTERNO: external_event_id = NULL, source = whatsapp');
            }
            if (exemploExterno) {
                console.log(`   🔸 EXTERNO: external_event_id = ${exemploExterno.external_event_id?.substr(0,20)}..., source = google_calendar`);
            }
        }

    } catch (error) {
        console.error('❌ Erro na população corrigida:', error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    popularAppointmentsCorrigidos()
        .then(() => {
            console.log('🏁 Script de correção finalizado!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { popularAppointmentsCorrigidos };