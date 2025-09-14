/**
 * Appointment flow service
 * Handles all appointment-related flows: list, cancel, reschedule, confirm
 */

import { FlowDecision, OrchestratorContext } from './orchestrator.types';
import { supabaseAdmin } from '../../config/database';

export class AppointmentFlowService {

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

            // Cancel the appointment
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

            return {
                shouldContinue: false,
                response: `📅 Agendamento atual:\n${(appointment as any).service_name || 'Serviço'}\n${dateStr} às ${timeStr}\n\nInfelizmente neste momento não possuo esta informação no sistema para remarcação automática. Entre em contato diretamente para remarcar.`,
                metadata: {
                    reschedule_requested_id: appointmentId,
                    current_appointment_date: appointment.start_time
                }
            };

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
        // For now, return standard response as we don't have pending confirmations system
        return {
            shouldContinue: false,
            response: 'Não encontrei agendamentos pendentes de confirmação. Se você fez um agendamento recente, ele já foi confirmado automaticamente.',
            metadata: { confirm_requested: true }
        };
    }

    /**
     * Detect appointment-related commands in message
     */
    detectAppointmentCommand(message: string): string | null {
        const msg = message.toLowerCase().trim();

        // Direct appointment commands
        if (/cancelar[_\s]+[0-9a-fA-F-]{8,}/i.test(message)) return 'cancel_appointment';
        if (/remarcar[_\s]+[0-9a-fA-F-]{8,}/i.test(message)) return 'reschedule';

        // General appointment intents
        if (/(meus agendamentos|tenho.*agendamento|o que marquei|ver agendamentos)/i.test(msg)) {
            return 'my_appointments';
        }
        if (/(cancelar|desmarcar)/i.test(msg)) return 'cancel_appointment';
        if (/(remarcar|trocar hor[aá]rio|mudar hor[aá]rio)/i.test(msg)) return 'reschedule';
        if (/(confirm(ar|ado)|ok[,\s].*marcar|fechado)/i.test(msg)) return 'confirm';

        return null;
    }
}