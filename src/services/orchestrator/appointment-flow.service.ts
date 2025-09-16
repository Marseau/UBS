/**
 * Appointment flow service
 * Handles all appointment-related flows: list, cancel, reschedule, confirm
 */

import { FlowDecision, OrchestratorContext } from '../../types';
import { supabaseAdmin } from '../../config/database';
import { CalendarService } from '../calendar.service';

export class AppointmentFlowService {
    private calendarService: CalendarService;

    constructor() {
        this.calendarService = new CalendarService();
    }

    /**
     * Handle my_appointments intent - list user's appointments
     */
    async handleMyAppointments(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            const { data: appointments, error } = await supabaseAdmin
                .from('appointments')
                .select('*')
                .eq('tenant_id', ctx.tenantId)
                .eq('user_id', ctx.userId)
                .neq('status', 'cancelled')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(10);

            if (error) {
                console.error('Error fetching appointments:', error);
                return {
                    shouldContinue: false,
                    response: 'Infelizmente neste momento não possuo esta informação no sistema.'
                };
            }

            if (!appointments || appointments.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Você não tem agendamentos futuros no momento. Gostaria de fazer um novo agendamento?'
                };
            }

            // Format appointments list
            let response = `Seus próximos agendamentos:\n\n`;
            appointments.forEach((apt, index) => {
                const date = new Date(apt.start_time);
                const dateStr = date.toLocaleDateString('pt-BR');
                const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                response += `${index + 1}. ${(apt as any).service_name || 'Serviço'}\n`;
                response += `   📅 ${dateStr} às ${timeStr}\n`;
                if ((apt as any).professional_name) {
                    response += `   👨‍⚕️ ${(apt as any).professional_name}\n`;
                }
                response += `   🆔 ID: ${apt.id}\n\n`;
            });

            response += 'Para cancelar: "cancelar_<ID>"\nPara remarcar: "remarcar_<ID>"';

            return {
                shouldContinue: false,
                response,
                metadata: { appointments_count: appointments.length }
            };

        } catch (error) {
            console.error('Error in handleMyAppointments:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Handle cancel_appointment intent - cancel specific appointment
     */
    async handleCancelAppointment(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Check if message contains appointment ID
            const cancelMatch = ctx.message.match(/cancelar[_\s]+([0-9a-fA-F-]{8,})/i);
            if (!cancelMatch || !cancelMatch[1]) {
                return {
                    shouldContinue: false,
                    response: 'Para cancelar um agendamento, use o formato: "cancelar_<ID>". Você pode ver seus agendamentos digitando "meus agendamentos".'
                };
            }

            const appointmentId = cancelMatch[1];

            // Verify appointment belongs to user and tenant
            const { data: appointment, error: fetchError } = await supabaseAdmin
                .from('appointments')
                .select('*')
                .eq('id', appointmentId)
                .eq('tenant_id', ctx.tenantId)
                .eq('user_id', ctx.userId)
                .neq('status', 'cancelled')
                .single();

            if (fetchError || !appointment) {
                return {
                    shouldContinue: false,
                    response: 'Agendamento não encontrado ou já cancelado. Verifique o ID e tente novamente.'
                };
            }

            // Validate cancellation timing
            const timingValidation = this.validateCancellationTiming(appointment.start_time);
            if (!timingValidation.valid) {
                return {
                    shouldContinue: false,
                    response: `⚠️ ${timingValidation.message}\n\nPara cancelamentos de última hora, entre em contato diretamente.`,
                    metadata: {
                        cancellation_blocked: true,
                        reason: 'timing_constraint'
                    }
                };
            }

            // Cancel the appointment in database
            const { error: cancelError } = await supabaseAdmin
                .from('appointments')
                .update({
                    status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('id', appointmentId);

            if (cancelError) {
                console.error('Error cancelling appointment:', cancelError);
                return {
                    shouldContinue: false,
                    response: 'Erro ao cancelar agendamento. Tente novamente ou entre em contato.'
                };
            }

            // Cancel in Google Calendar if appointment has calendar integration
            try {
                await this.calendarService.cancelCalendarEvent(appointment);
            } catch (calendarError) {
                console.error('Error cancelling Google Calendar event:', calendarError);
                // Continue even if calendar cancellation fails
            }

            const date = new Date(appointment.start_time);
            const dateStr = date.toLocaleDateString('pt-BR');
            const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return {
                shouldContinue: false,
                response: `✅ Agendamento cancelado com sucesso!\n\n${(appointment as any).service_name || 'Serviço'}\n📅 ${dateStr} às ${timeStr}\n\nSe precisar reagendar, estou aqui para ajudar!`,
                metadata: {
                    cancelled_appointment_id: appointmentId,
                    appointment_date: appointment.start_time
                }
            };

        } catch (error) {
            console.error('Error in handleCancelAppointment:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar cancelamento. Tente novamente.'
            };
        }
    }

    /**
     * Handle reschedule intent - reschedule specific appointment
     */
    async handleRescheduleAppointment(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Check if message contains appointment ID
            const rescheduleMatch = ctx.message.match(/remarcar[_\s]+([0-9a-fA-F-]{8,})/i);
            if (!rescheduleMatch || !rescheduleMatch[1]) {
                return {
                    shouldContinue: false,
                    response: 'Para remarcar um agendamento, use o formato: "remarcar_<ID>". Você pode ver seus agendamentos digitando "meus agendamentos".'
                };
            }

            const appointmentId = rescheduleMatch[1];

            // Verify appointment belongs to user and tenant
            const { data: appointment, error: fetchError } = await supabaseAdmin
                .from('appointments')
                .select('*')
                .eq('id', appointmentId)
                .eq('tenant_id', ctx.tenantId)
                .eq('user_id', ctx.userId)
                .neq('status', 'cancelled')
                .single();

            if (fetchError || !appointment) {
                return {
                    shouldContinue: false,
                    response: 'Agendamento não encontrado. Verifique o ID e tente novamente.'
                };
            }

            const date = new Date(appointment.start_time);
            const dateStr = date.toLocaleDateString('pt-BR');
            const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            // Try to reschedule via Google Calendar integration
            try {
                await this.calendarService.updateCalendarEvent(appointment);

                return {
                    shouldContinue: false,
                    response: `📅 Agendamento atual:\n${(appointment as any).service_name || 'Serviço'}\n${dateStr} às ${timeStr}\n\n✅ Remarcação processada via Google Calendar. Verifique sua agenda para confirmar o novo horário.`,
                    metadata: {
                        reschedule_requested_id: appointmentId,
                        current_appointment_date: appointment.start_time,
                        calendar_updated: true
                    }
                };
            } catch (calendarError) {
                console.error('Error updating Google Calendar event:', calendarError);

                return {
                    shouldContinue: false,
                    response: `📅 Agendamento atual:\n${(appointment as any).service_name || 'Serviço'}\n${dateStr} às ${timeStr}\n\n⚠️ Para remarcar, entre em contato diretamente. A integração automática não está disponível no momento.`,
                    metadata: {
                        reschedule_requested_id: appointmentId,
                        current_appointment_date: appointment.start_time,
                        calendar_error: true
                    }
                };
            }

        } catch (error) {
            console.error('Error in handleRescheduleAppointment:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar remarcação. Tente novamente.'
            };
        }
    }

    /**
     * Handle confirm intent - confirm appointment
     */
    async handleConfirmAppointment(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Check for pending appointments for this user
            const { data: pendingAppointments, error } = await supabaseAdmin
                .from('appointments')
                .select('*')
                .eq('tenant_id', ctx.tenantId)
                .eq('user_id', ctx.userId)
                .eq('status', 'pending')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(5);

            if (error) {
                console.error('Error fetching pending appointments:', error);
                return {
                    shouldContinue: false,
                    response: 'Erro ao verificar agendamentos pendentes. Tente novamente.'
                };
            }

            if (!pendingAppointments || pendingAppointments.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Não encontrei agendamentos pendentes de confirmação. Se você fez um agendamento recente, ele já foi confirmado automaticamente.',
                    metadata: { confirm_requested: true, no_pending_appointments: true }
                };
            }

            // If there's a confirm command with ID, confirm specific appointment
            const confirmMatch = ctx.message.match(/confirmar[_\s]+([0-9a-fA-F-]{8,})/i);
            if (confirmMatch && confirmMatch[1]) {
                const appointmentId = confirmMatch[1];
                const appointmentToConfirm = pendingAppointments.find(apt => apt.id === appointmentId);

                if (!appointmentToConfirm) {
                    return {
                        shouldContinue: false,
                        response: 'Agendamento não encontrado ou já confirmado. Verifique o ID e tente novamente.'
                    };
                }

                // Confirm the appointment
                const { error: confirmError } = await supabaseAdmin
                    .from('appointments')
                    .update({
                        status: 'confirmed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', appointmentId);

                if (confirmError) {
                    console.error('Error confirming appointment:', confirmError);
                    return {
                        shouldContinue: false,
                        response: 'Erro ao confirmar agendamento. Tente novamente.'
                    };
                }

                // Update Google Calendar event status
                try {
                    await this.calendarService.updateCalendarEvent(appointmentToConfirm);
                } catch (calendarError) {
                    console.error('Error updating Google Calendar event:', calendarError);
                    // Continue even if calendar update fails
                }

                const date = new Date(appointmentToConfirm.start_time);
                const dateStr = date.toLocaleDateString('pt-BR');
                const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                return {
                    shouldContinue: false,
                    response: `✅ Agendamento confirmado com sucesso!\n\n${(appointmentToConfirm as any).service_name || 'Serviço'}\n📅 ${dateStr} às ${timeStr}\n\nO evento foi atualizado no Google Calendar.`,
                    metadata: {
                        appointment_confirmed: true,
                        appointment_id: appointmentId,
                        appointment_date: appointmentToConfirm.start_time
                    }
                };
            }

            // Show pending appointments list for confirmation
            let response = `Você tem ${pendingAppointments.length} agendamento(s) pendente(s) de confirmação:\n\n`;

            pendingAppointments.forEach((apt, index) => {
                const date = new Date(apt.start_time);
                const dateStr = date.toLocaleDateString('pt-BR');
                const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                response += `${index + 1}. ${(apt as any).service_name || 'Serviço'}\n`;
                response += `   📅 ${dateStr} às ${timeStr}\n`;
                response += `   🆔 ID: ${apt.id}\n\n`;
            });

            response += 'Para confirmar: "confirmar_<ID>"\nPara cancelar: "cancelar_<ID>"';

            return {
                shouldContinue: false,
                response,
                metadata: {
                    confirm_requested: true,
                    pending_appointments_count: pendingAppointments.length
                }
            };

        } catch (error) {
            console.error('Error in handleConfirmAppointment:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar confirmação. Tente novamente.'
            };
        }
    }

    /**
     * Handle booking intent - intelligent appointment creation with real availability
     */
    async handleBookingIntent(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // 1. First, get available services
            const { data: services, error: serviceError } = await supabaseAdmin
                .from('services')
                .select('id, name, duration_minutes, base_price')
                .eq('tenant_id', ctx.tenantId)
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (serviceError || !services || services.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Nenhum serviço disponível encontrado para agendamento.'
                };
            }

            // 2. Check for professionals with calendar integration
            const { data: professionals, error: profError } = await supabaseAdmin
                .from('professionals')
                .select('id, name')
                .eq('tenant_id', ctx.tenantId)
                .eq('is_active', true)
                .not('google_calendar_credentials', 'is', null);

            if (profError || !professionals || professionals.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Nenhum profissional disponível encontrado para agendamento.'
                };
            }

            // 3. Get real availability for tomorrow using RealAvailabilityService
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateISO = tomorrow.toISOString().split('T')[0];

            const realAvailabilityService = new (require('../real-availability.service')).RealAvailabilityService();
            const availabilityResult = await realAvailabilityService.getRealAvailableSlots(
                ctx.tenantId,
                dateISO,
                'manha' // morning preference
            );

            if (!availabilityResult.success || availabilityResult.slots.length === 0) {
                return {
                    shouldContinue: false,
                    response: `Infelizmente não temos horários disponíveis para ${tomorrow.toLocaleDateString('pt-BR')}.\n\nGostaria de verificar outros dias? Digite "disponibilidade" para ver mais opções.`
                };
            }

            // 4. Format available slots and present options
            const availableSlots = availabilityResult.slots.filter(slot => slot.available).slice(0, 3);

            if (availableSlots.length === 0) {
                return {
                    shouldContinue: false,
                    response: `Todos os horários estão ocupados para ${tomorrow.toLocaleDateString('pt-BR')}.\n\nGostaria de verificar outros dias? Digite "disponibilidade" para ver mais opções.`
                };
            }

            // 5. Present service and time options to user
            let response = `📋 **Serviços disponíveis:**\n\n`;
            services.forEach((service, index) => {
                response += `${index + 1}. ${service.name}`;
                if (service.base_price) response += ` - R$ ${service.base_price}`;
                if (service.duration_minutes) response += ` (${service.duration_minutes}min)`;
                response += `\n`;
            });

            response += `\n⏰ **Horários disponíveis para ${tomorrow.toLocaleDateString('pt-BR')}:**\n\n`;
            availableSlots.forEach((slot, index) => {
                response += `${index + 1}. ${slot.formatted}\n`;
            });

            response += `\n📝 **Para agendar, responda com:**\n"Quero o serviço [número] no horário [número]"\n\n*Exemplo: "Quero o serviço 1 no horário 2"*`;

            return {
                shouldContinue: false,
                response,
                metadata: {
                    available_services: services,
                    available_slots: availableSlots,
                    professionals: professionals,
                    date_analyzed: dateISO,
                    flow_state: 'awaiting_selection'
                }
            };

        } catch (error) {
            console.error('Error in handleBookingIntent:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar solicitação de agendamento. Tente novamente.'
            };
        }
    }

    /**
     * Handle booking confirmation - parse user selection deterministically
     */
    async handleBookingConfirmation(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Deterministic parsing: "Quero o serviço X no horário Y"
            const message = ctx.message.toLowerCase().trim();

            // Pattern matching for service and time selection
            const serviceMatch = message.match(/servi[cç]o\s+(\d+)/);
            const timeMatch = message.match(/hor[áa]rio\s+(\d+)/);

            if (!serviceMatch || !timeMatch) {
                return {
                    shouldContinue: false,
                    response: 'Por favor, use o formato: "Quero o serviço X no horário Y".\n\nExemplo: "Quero o serviço 1 no horário 2"'
                };
            }

            const serviceIndex = parseInt(serviceMatch[1] || '0') - 1; // Convert to 0-based index
            const timeIndex = parseInt(timeMatch[1] || '0') - 1; // Convert to 0-based index

            // Get available services and slots from previous context
            // For now, simulate with current data - in production this should come from session context
            const { data: services, error: serviceError } = await supabaseAdmin
                .from('services')
                .select('id, name, duration_minutes, base_price')
                .eq('tenant_id', ctx.tenantId)
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (serviceError || !services || serviceIndex >= services.length || serviceIndex < 0) {
                return {
                    shouldContinue: false,
                    response: `Serviço ${serviceIndex + 1} não existe. Temos ${services?.length || 0} serviços disponíveis.`
                };
            }

            // Get availability for tomorrow (simplified - should match previous query)
            const realAvailabilityService = new (await import('../real-availability.service')).RealAvailabilityService();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const dateISO = tomorrow.toISOString().split('T')[0];

            const availabilityResult = await realAvailabilityService.getRealAvailableSlots(
                ctx.tenantId,
                dateISO
            );

            if (!availabilityResult.success || timeIndex >= availabilityResult.slots.length || timeIndex < 0) {
                return {
                    shouldContinue: false,
                    response: `Horário ${timeIndex + 1} não existe. Temos ${availabilityResult.slots.length} horários disponíveis.`
                };
            }

            const selectedService = services[serviceIndex];
            const selectedSlot = availabilityResult.slots[timeIndex];

            if (!selectedService || !selectedSlot) {
                return {
                    shouldContinue: false,
                    response: 'Erro ao validar seleção. Verifique os números escolhidos.'
                };
            }

            // Get professionals (simplified)
            const { data: professionals, error: profError } = await supabaseAdmin
                .from('professionals')
                .select('id, name')
                .eq('tenant_id', ctx.tenantId)
                .eq('is_active', true)
                .not('google_calendar_credentials', 'is', null)
                .limit(1);

            if (profError || !professionals || professionals.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Nenhum profissional disponível no momento.'
                };
            }

            const selectedProfessional = professionals[0];

            if (!selectedProfessional) {
                return {
                    shouldContinue: false,
                    response: 'Erro ao selecionar profissional. Tente novamente.'
                };
            }

            // Calculate end time based on service duration
            const startTime = new Date(selectedSlot.datetime);
            const endTime = new Date(startTime.getTime() + (selectedService.duration_minutes || 60) * 60 * 1000);

            // Create appointment data
            const appointmentData = {
                professional_id: selectedProfessional.id,
                service_id: selectedService.id,
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                service: selectedService,
                professional: selectedProfessional
            };

            // Call existing create appointment method
            return await this.handleCreateAppointment(ctx, appointmentData);

        } catch (error) {
            console.error('Error in handleBookingConfirmation:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar confirmação de agendamento. Tente novamente.'
            };
        }
    }

    /**
     * Handle create appointment - create new appointment with Google Calendar integration
     */
    async handleCreateAppointment(ctx: OrchestratorContext, appointmentData: any): Promise<FlowDecision> {
        try {
            // Create appointment in database first
            const { data: appointment, error: dbError } = await supabaseAdmin
                .from('appointments')
                .insert({
                    tenant_id: ctx.tenantId,
                    user_id: ctx.userId,
                    professional_id: appointmentData.professional_id,
                    service_id: appointmentData.service_id,
                    start_time: appointmentData.start_time,
                    end_time: appointmentData.end_time,
                    status: 'confirmed',
                    appointment_data: appointmentData
                })
                .select()
                .single();

            if (dbError || !appointment) {
                console.error('Error creating appointment:', dbError);
                return {
                    shouldContinue: false,
                    response: 'Erro ao criar agendamento. Tente novamente.'
                };
            }

            // Create event in Google Calendar
            try {
                // Fetch the complete appointment with all relations for calendar integration
                const { data: fullAppointment, error: fetchError } = await supabaseAdmin
                    .from('appointments')
                    .select(`
                        *,
                        tenant:tenants!inner(business_name, business_address, domain),
                        service:services!inner(name, duration_minutes, base_price),
                        user:users!inner(name, phone),
                        professional:professionals!inner(name)
                    `)
                    .eq('id', appointment.id)
                    .single();

                if (fetchError || !fullAppointment) {
                    console.error('Error fetching appointment for calendar:', fetchError);
                    throw new Error('Failed to fetch appointment data for calendar');
                }

                const calendarResult = await this.calendarService.createCalendarEvent(fullAppointment);

                const date = new Date(appointment.start_time);
                const dateStr = date.toLocaleDateString('pt-BR');
                const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                let responseMessage = `✅ Agendamento criado com sucesso!\n\n${appointmentData.service_name || 'Serviço'}\n📅 ${dateStr} às ${timeStr}`;
                let calendarIntegrated = false;

                if (calendarResult && calendarResult.success) {
                    responseMessage += '\n\n✅ O evento foi adicionado ao Google Calendar.';
                    calendarIntegrated = true;
                } else {
                    responseMessage += '\n\n⚠️ Agendamento criado, mas houve um problema ao sincronizar com o Google Calendar.';
                    if (calendarResult && calendarResult.errorType === 'auth_expired') {
                        responseMessage += '\n(Autorização do Google Calendar expirada - entre em contato com o administrador)';
                    }
                }

                return {
                    shouldContinue: false,
                    response: responseMessage,
                    metadata: {
                        appointment_created: true,
                        appointment_id: appointment.id,
                        calendar_integrated: calendarIntegrated,
                        calendar_error: calendarResult && !calendarResult.success ? calendarResult.errorType : null
                    }
                };
            } catch (calendarError) {
                console.error('Error creating Google Calendar event:', calendarError);

                // Appointment created in DB but not in calendar
                return {
                    shouldContinue: false,
                    response: `✅ Agendamento criado!\n\n${appointmentData.service_name || 'Serviço'}\n📅 ${appointment.start_time}\n\n⚠️ Não foi possível sincronizar com Google Calendar.`,
                    metadata: {
                        appointment_created: true,
                        appointment_id: appointment.id,
                        calendar_error: true
                    }
                };
            }

        } catch (error) {
            console.error('Error in handleCreateAppointment:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao processar agendamento. Tente novamente.'
            };
        }
    }

    /**
     * Detect appointment-related commands in message
     */
    detectAppointmentCommand(message: string): string | null {
        const msg = message.toLowerCase().trim();

        // Direct appointment commands with IDs
        if (/cancelar[_\s]+[0-9a-fA-F-]{8,}/i.test(message)) return 'cancel_appointment';
        if (/remarcar[_\s]+[0-9a-fA-F-]{8,}/i.test(message)) return 'reschedule';
        if (/confirmar[_\s]+[0-9a-fA-F-]{8,}/i.test(message)) return 'confirm';

        // General appointment intents
        if (/(meus agendamentos|tenho.*agendamento|o que marquei|ver agendamentos)/i.test(msg)) {
            return 'my_appointments';
        }
        if (/(cancelar|desmarcar)/i.test(msg)) return 'cancel_appointment';
        if (/(remarcar|trocar hor[aá]rio|mudar hor[aá]rio)/i.test(msg)) return 'reschedule';
        if (/(confirm(ar|ado)|ok[,\s].*marcar|fechado|pendente)/i.test(msg)) return 'confirm';

        // Booking intents
        if (/(quero marcar|agendar|marcar.*consulta|marcar.*aula|marque.*para|booking|book)/i.test(msg)) {
            return 'booking';
        }

        return null;
    }

    /**
     * Validate appointment timing constraints
     */
    validateAppointmentTiming(appointmentTime: string): { valid: boolean; message?: string } {
        const appointmentDate = new Date(appointmentTime);
        const now = new Date();
        const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Must be in the future
        if (appointmentDate <= now) {
            return {
                valid: false,
                message: 'O agendamento deve ser para uma data futura.'
            };
        }

        // Must be at least 2 hours in advance
        if (hoursUntilAppointment < 2) {
            return {
                valid: false,
                message: 'Agendamentos devem ser feitos com pelo menos 2 horas de antecedência.'
            };
        }

        // Must be within 30 days
        if (hoursUntilAppointment > (30 * 24)) {
            return {
                valid: false,
                message: 'Agendamentos não podem ser feitos com mais de 30 dias de antecedência.'
            };
        }

        return { valid: true };
    }

    /**
     * Validate cancellation timing constraints
     */
    validateCancellationTiming(appointmentTime: string): { valid: boolean; message?: string } {
        const appointmentDate = new Date(appointmentTime);
        const now = new Date();
        const hoursUntilAppointment = (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Must be at least 24 hours in advance for free cancellation
        if (hoursUntilAppointment < 24) {
            return {
                valid: false,
                message: 'Cancelamentos devem ser feitos com pelo menos 24 horas de antecedência.'
            };
        }

        return { valid: true };
    }
}