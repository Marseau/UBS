/**
 * CRIAR APPOINTMENTS EXTERNOS
 * 
 * Criar apenas os 240 appointments externos com external_event_id
 */

const { supabaseAdmin } = require('./src/config/database');

async function criarAppointmentsExternos() {
    try {
        console.log('📅 Criando 240 appointments externos (Google Calendar)...');

        // 1. Buscar dados básicos
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

        console.log(`📋 Base: ${tenants?.length} tenants, ${professionals?.length} profissionais, ${services?.length} serviços, ${users?.length} usuários`);

        // 2. Criar um appointment externo de cada vez para debug
        const totalExternos = 240;
        let externosInseridos = 0;

        for (let i = 0; i < totalExternos; i++) {
            try {
                const tenant = tenants[Math.floor(Math.random() * tenants.length)];
                const professional = professionals.find(p => p.tenant_id === tenant.id) || professionals[0];
                const service = services.find(s => s.tenant_id === tenant.id) || services[0];
                const user = users[Math.floor(Math.random() * users.length)];

                // Horário futuro realístico
                const startDate = new Date();
                startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 45));
                const hora = 8 + Math.floor(Math.random() * 10);
                const minuto = Math.random() < 0.5 ? 0 : 30;
                startDate.setHours(hora, minuto, 0, 0);

                const endDate = new Date(startDate);
                endDate.setMinutes(endDate.getMinutes() + (service?.duration_minutes || 60));

                // Google Calendar Event ID único
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substr(2, 8);
                const googleEventId = `gcal_${timestamp}_${i}_${randomStr}`;

                // Título baseado no domínio
                const titulosPorDominio = {
                    beauty: ['Corte + Escova', 'Manicure Especial', 'Design de Sobrancelhas', 'Massagem Relaxante', 'Tratamento Facial'],
                    healthcare: ['Consulta Psicológica', 'Sessão de Terapia', 'Avaliação Inicial', 'Consulta de Retorno', 'Atendimento Domiciliar'],
                    legal: ['Consultoria Jurídica', 'Reunião Advocacia', 'Análise Contratual', 'Audiência Preparação', 'Consultoria Empresarial'],
                    education: ['Aula Particular', 'Reforço Escolar', 'Preparação Vestibular', 'Aula de Inglês', 'Mentoria Acadêmica'],
                    sports: ['Personal Training', 'Aula de Yoga', 'Treinamento Funcional', 'Avaliação Física', 'Consultoria Nutricional']
                };

                const titulos = titulosPorDominio[tenant.domain] || ['Atendimento Especial', 'Consulta Externa', 'Evento Particular'];
                const titulo = titulos[Math.floor(Math.random() * titulos.length)];

                const appointmentData = {
                    tenant_id: tenant.id,
                    user_id: user.id,
                    service_id: service.id,
                    professional_id: professional.id,
                    start_time: startDate.toISOString(),
                    end_time: endDate.toISOString(),
                    status: 'confirmed',
                    quoted_price: (service?.base_price || 100) + Math.floor(Math.random() * 50),
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
                    external_event_id: googleEventId
                };

                // Inserir um por vez
                const { data, error } = await supabaseAdmin
                    .from('appointments')
                    .insert([appointmentData])
                    .select('id, external_event_id');

                if (error) {
                    console.error(`❌ Erro no appointment ${i + 1}:`, error);
                    console.error('Dados:', JSON.stringify(appointmentData, null, 2));
                    break; // Para no primeiro erro para debug
                } else {
                    externosInseridos++;
                    if (i % 10 === 0 || i < 5) {
                        console.log(`✅ Externo ${i + 1}/240 criado: ${data[0]?.external_event_id}`);
                    }
                }

                // Pausa pequena
                await new Promise(resolve => setTimeout(resolve, 10));

            } catch (itemError) {
                console.error(`❌ Erro no item ${i + 1}:`, itemError);
                break; // Para no primeiro erro
            }
        }

        console.log(`\n🎉 Externos criados: ${externosInseridos}/${totalExternos}`);

        // Verificação final
        const { data: verificacao } = await supabaseAdmin
            .from('appointments')
            .select('id, external_event_id')
            .not('external_event_id', 'is', null);

        console.log(`📊 Verificação: ${verificacao?.length || 0} appointments com external_event_id`);

        return { success: true, created: externosInseridos };

    } catch (error) {
        console.error('❌ Erro na criação de appointments externos:', error);
        return { success: false, error: error.message };
    }
}

// Executar
if (require.main === module) {
    criarAppointmentsExternos()
        .then((result) => {
            console.log('🏁 Script finalizado!', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Erro fatal:', error);
            process.exit(1);
        });
}

module.exports = { criarAppointmentsExternos };