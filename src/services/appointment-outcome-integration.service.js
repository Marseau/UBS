/**
 * APPOINTMENT OUTCOME INTEGRATION SERVICE
 * 
 * Ponte entre criação de appointments e conversation outcomes.
 * Garante que quando um appointment é criado, a conversa correspondente
 * seja marcada como 'appointment_created'.
 */

const { ConversationOutcomeService } = require('./conversation-outcome.service');
const { supabaseAdmin } = require('../config/database');

class AppointmentOutcomeIntegrationService {
    constructor() {
        this.outcomeService = new ConversationOutcomeService();
    }

    /**
     * Marcar conversa como appointment_created
     * Deve ser chamado sempre que um appointment é criado via IA
     */
    async markConversationAsAppointmentCreated(appointmentId, tenantId, userId, phoneNumber) {
        try {
            console.log(`🎯 Marcando conversa como appointment_created para appointment ${appointmentId}`);
            
            // Buscar conversa mais recente deste usuário/tenant
            const { data: recentConversation } = await supabaseAdmin
                .from('conversation_history')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('user_id', userId)
                .or(`phone_number.eq.${phoneNumber}`)
                .is('conversation_outcome', null) // Só conversas sem outcome ainda
                .eq('is_from_user', true) // Mensagem do usuário
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (recentConversation) {
                const success = await this.outcomeService.markAppointmentCreated(
                    recentConversation.id, 
                    appointmentId
                );
                
                if (success) {
                    console.log(`✅ Conversa ${recentConversation.id} marcada como appointment_created`);
                } else {
                    console.error(`❌ Falha ao marcar conversa ${recentConversation.id}`);
                }
                
                return success;
            } else {
                console.warn(`⚠️ Nenhuma conversa recente encontrada para appointment ${appointmentId}`);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Erro ao marcar conversa como appointment_created:', error);
            return false;
        }
    }

    /**
     * Wrapper para integração com agents - chame após appointment.insert()
     */
    async handleAppointmentCreated(appointmentData, context) {
        return await this.markConversationAsAppointmentCreated(
            appointmentData.id,
            context.tenantId,
            context.userId,
            context.phoneNumber
        );
    }
}

module.exports = { AppointmentOutcomeIntegrationService };