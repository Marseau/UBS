/**
 * Business information flow service
 * Handles flows for services, pricing, availability, address, business hours, payments
 */

import { FlowDecision, OrchestratorContext } from '../../types';
import { supabaseAdmin } from '../../config/database';
import { RealAvailabilityService } from '../real-availability.service';

export class BusinessInfoFlowService {

    /**
     * Handle services intent - list business services
     */
    async handleServices(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            const { data: services, error } = await supabaseAdmin
                .from('services')
                .select('*')
                .eq('tenant_id', ctx.tenantId)
                .order('name', { ascending: true })
                .limit(50);

            if (error) {
                console.error('Error fetching services:', error);
                return {
                    shouldContinue: false,
                    response: 'Infelizmente neste momento não possuo esta informação no sistema.'
                };
            }

            if (!services || services.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Infelizmente neste momento não possuo esta informação no sistema.'
                };
            }

            let response = '📋 Nossos serviços:\n\n';

            services.forEach((service, index) => {
                response += `${index + 1}. ${service.name || 'Serviço'}\n`;

                if (service.description) {
                    response += `   ${service.description}\n`;
                }

                if ((service as any).price || service.base_price) {
                    response += `   💰 R$ ${(service as any).price || service.base_price}\n`;
                }

                if ((service as any).duration || service.duration_minutes) {
                    response += `   ⏱️ ${(service as any).duration || service.duration_minutes + ' min'}\n`;
                }

                response += '\n';
            });

            response += 'Para mais informações sobre preços ou disponibilidade, me informe qual serviço te interessa!';

            return {
                shouldContinue: false,
                response,
                metadata: { services_count: services.length }
            };

        } catch (error) {
            console.error('Error in handleServices:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Handle pricing intent - show pricing information
     */
    async handlePricing(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            const { data: services, error } = await supabaseAdmin
                .from('services')
                .select('name, base_price, description')
                .eq('tenant_id', ctx.tenantId)
                .not('base_price', 'is', null)
                .order('base_price', { ascending: true })
                .limit(20);

            if (error) {
                console.error('Error fetching pricing:', error);
                return {
                    shouldContinue: false,
                    response: 'Infelizmente neste momento não possuo esta informação no sistema.'
                };
            }

            if (!services || services.length === 0) {
                return {
                    shouldContinue: false,
                    response: 'Infelizmente neste momento não possuo esta informação no sistema.'
                };
            }

            let response = '💰 Nossos preços:\n\n';

            services.forEach(service => {
                response += `• ${service.name}`;
                if (service.description) {
                    response += ` - ${service.description}`;
                }
                response += `\n  💰 R$ ${service.base_price}\n\n`;
            });

            response += 'Gostaria de agendar algum destes serviços?';

            return {
                shouldContinue: false,
                response,
                metadata: { pricing_services_count: services.length }
            };

        } catch (error) {
            console.error('Error in handlePricing:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Handle availability intent - show available slots
     */
    async handleAvailability(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            const availabilityService = new RealAvailabilityService();

            // Extract time window preference from message
            const message = ctx.message.toLowerCase();
            let window: 'manha' | 'tarde' | 'noite' | undefined;

            if (/(manhã|manha|morning|9|10|11)/i.test(message)) {
                window = 'manha';
            } else if (/(tarde|afternoon|12|13|14|15|16|17)/i.test(message)) {
                window = 'tarde';
            } else if (/(noite|night|18|19|20|21)/i.test(message)) {
                window = 'noite';
            }

            // Get real available slots
            const availability = await availabilityService.getRealAvailableSlots(
                ctx.tenantId,
                undefined, // Use default (next business day)
                window
            );

            if (!availability.success) {
                return {
                    shouldContinue: false,
                    response: availability.message,
                    metadata: {
                        availability_requested: true,
                        availability_error: true,
                        date_analyzed: availability.date_analyzed
                    }
                };
            }

            if (availability.slots.length === 0) {
                return {
                    shouldContinue: false,
                    response: availability.message + '\n\nTente perguntar sobre outros períodos (manhã, tarde, noite) ou outros dias.',
                    metadata: {
                        availability_requested: true,
                        no_slots_available: true,
                        date_analyzed: availability.date_analyzed,
                        window_requested: window
                    }
                };
            }

            // Format response with available slots
            let response = `${availability.message}\n\n`;
            availability.slots.forEach((slot, index) => {
                response += `${index + 1}. ${slot.formatted}\n`;
            });

            response += '\nPara agendar, me informe qual horário funciona melhor para você!';

            return {
                shouldContinue: false,
                response,
                metadata: {
                    availability_requested: true,
                    slots_found: availability.slots.length,
                    date_analyzed: availability.date_analyzed,
                    window_requested: window,
                    available_slots: availability.slots.map(s => s.datetime)
                }
            };

        } catch (error) {
            console.error('Error in handleAvailability:', error);
            return {
                shouldContinue: false,
                response: 'Erro ao consultar disponibilidade. Tente novamente em alguns instantes.',
                metadata: {
                    availability_requested: true,
                    error: true
                }
            };
        }
    }

    /**
     * Handle address intent - show business address
     */
    async handleAddress(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Address field doesn't exist in current schema, return fallback
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };


        } catch (error) {
            console.error('Error in handleAddress:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Handle business_hours intent - show operating hours
     */
    async handleBusinessHours(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Business hours field doesn't exist in current schema, return fallback
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        } catch (error) {
            console.error('Error in handleBusinessHours:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Handle payments intent - show payment methods
     */
    async handlePayments(ctx: OrchestratorContext): Promise<FlowDecision> {
        try {
            // Payment methods field doesn't exist in current schema, return fallback
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        } catch (error) {
            console.error('Error in handlePayments:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
            };
        }
    }

    /**
     * Detect business info intent from message
     */
    detectBusinessInfoIntent(message: string): string | null {
        const msg = message.toLowerCase().trim();

        // Services
        if (/(servi[cç]os?|lista|cat[aá]logo|o que.*faz|que.*servi[cç]os)/i.test(msg)) {
            return 'services';
        }

        // Pricing
        if (/(pre[çc]os?|valor(es)?|quanto.*custa|tabela.*pre[çc]o)/i.test(msg)) {
            return 'pricing';
        }

        // Availability
        if (/(disponibilidade|quando.*posso|hor[aá]rio|datas|agenda|tem.*vaga|amanh[ãa]|hoje|depois de amanh[ãa]|semana que vem)/i.test(msg)) {
            return 'availability';
        }

        // Address
        if (/(endere[cç]o|onde.*fica|localiza[çc][ãa]o|como.*chegar|maps|google.*maps|local\b)/i.test(msg)) {
            return 'address';
        }

        // Business hours
        if (/(hor[áa]rios?.*funcion|hor[áa]rio.*atend|abre.*fecha|funciona)/i.test(msg)) {
            return 'business_hours';
        }

        // Payments
        if (/(pagamento|pix|cart[aã]o|formas.*pagamento|aceita.*cart[aã]o)/i.test(msg)) {
            return 'payments';
        }

        return null;
    }
}