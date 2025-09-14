/**
 * Business information flow service
 * Handles flows for services, pricing, availability, address, business hours, payments
 */

import { FlowDecision, OrchestratorContext } from './orchestrator.types';
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
            // For now, return standard message since RealAvailabilityService interface needs to be checked
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.',
                metadata: { availability_requested: true }
            };

            // TODO: Implement proper availability service integration
            /*
            const availabilityService = new RealAvailabilityService();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);
            const availability = await availabilityService.getAvailabilityRange(
                ctx.tenantId,
                new Date(),
                endDate
            );
            */


        } catch (error) {
            console.error('Error in handleAvailability:', error);
            return {
                shouldContinue: false,
                response: 'Infelizmente neste momento não possuo esta informação no sistema.'
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