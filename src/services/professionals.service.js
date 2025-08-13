const { supabaseAdmin } = require('../config/database');

class ProfessionalService {

    /**
     * Lista todos os profissionais de um tenant.
     * @param {string} tenantId - O ID do tenant.
     */
    async getAll(tenantId) {
        const { data, error } = await supabaseAdmin
            .from('professionals')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('name', { ascending: true });

        if (error) {
            console.error('Erro ao buscar profissionais:', error);
            throw new Error('Não foi possível buscar os profissionais.');
        }
        return data;
    }

    /**
     * Busca um único profissional pelo ID, incluindo seus dados relacionados.
     * @param {string} id - O ID do profissional.
     * @param {string} tenantId - O ID do tenant.
     */
    async getById(id, tenantId) {
        const { data, error } = await supabaseAdmin
            .from('professionals')
            .select(`
                *,
                professional_services (
                    id,
                    custom_price,
                    custom_duration,
                    is_active,
                    notes,
                    service:services (id, name, base_price, duration_minutes)
                ),
                professional_availability_exceptions (
                    id,
                    start_date,
                    end_date,
                    start_time,
                    end_time,
                    is_all_day,
                    reason,
                    description
                ),
                professional_schedules (
                    id,
                    day_of_week,
                    start_time,
                    end_time,
                    break_start_time,
                    break_end_time,
                    slot_duration,
                    is_active
                )
            `)
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .single();
        
        if (error) {
            console.error(`Erro ao buscar profissional ${id}:`, error);
            throw new Error('Profissional não encontrado.');
        }
        return data;
    }

    /**
     * Cria um novo profissional.
     * @param {object} professionalData - Dados do profissional (incluindo tenant_id, name, email, bio, working_hours).
     */
    async create(professionalData) {
        const { data, error } = await supabaseAdmin
            .from('professionals')
            .insert(professionalData)
            .select()
            .single();

        if (error) {
            console.error('Erro ao criar profissional:', error);
            throw new Error('Não foi possível criar o profissional.');
        }
        return data;
    }

    /**
     * Atualiza um profissional existente.
     * @param {string} id - O ID do profissional.
     * @param {object} professionalData - Dados a serem atualizados.
     * @param {string} tenantId - O ID do tenant.
     */
    async update(id, professionalData, tenantId) {
        const { data, error } = await supabaseAdmin
            .from('professionals')
            .update(professionalData)
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (error) {
            console.error(`Erro ao atualizar profissional ${id}:`, error);
            throw new Error('Não foi possível atualizar o profissional.');
        }
        return data;
    }

    /**
     * Exclui um profissional. As associações em 'professional_services' e 'availability_exceptions'
     * são removidas em cascata pelo banco de dados.
     * @param {string} id - O ID do profissional.
     * @param {string} tenantId - O ID do tenant.
     */
    async delete(id, tenantId) {
        const { error } = await supabaseAdmin
            .from('professionals')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tenantId);

        if (error) {
            console.error(`Erro ao deletar profissional ${id}:`, error);
            throw new Error('Não foi possível deletar o profissional.');
        }
        return true;
    }

    // --- Métodos para Associação de Serviços ---

    /**
     * Associa um serviço a um profissional, com preço e duração opcionais.
     * @param {object} associationData - Dados da associação (professional_id, service_id, tenant_id, custom_price, custom_duration).
     */
    async addServiceToProfessional(associationData) {
        const { data, error } = await supabaseAdmin
            .from('professional_services')
            .insert(associationData)
            .select()
            .single();
        
        if (error) {
            console.error('Erro ao associar serviço:', error);
            throw new Error('Não foi possível associar o serviço ao profissional.');
        }
        return data;
    }

    /**
     * Remove uma associação de serviço de um profissional.
     * @param {string} associationId - O ID da linha na tabela 'professional_services'.
     * @param {string} tenantId - O ID do tenant para verificação de segurança.
     */
    async removeServiceFromProfessional(associationId, tenantId) {
        const { error } = await supabaseAdmin
            .from('professional_services')
            .delete()
            .eq('id', associationId)
            .eq('tenant_id', tenantId); // Garante que a deleção só ocorra no tenant correto

        if (error) {
            console.error(`Erro ao remover associação de serviço ${associationId}:`, error);
            throw new Error('Não foi possível remover a associação.');
        }
        return true;
    }

    // --- Métodos para Exceções de Disponibilidade ---

    /**
     * Adiciona uma exceção de agenda para um profissional.
     * @param {object} exceptionData - Dados da exceção (professional_id, tenant_id, start_date, end_date, start_time, end_time, is_all_day, reason).
     */
    async addAvailabilityException(exceptionData) {
        const { data, error } = await supabaseAdmin
            .from('professional_availability_exceptions')
            .insert(exceptionData)
            .select()
            .single();

        if (error) {
            console.error('Erro ao criar exceção de agenda:', error);
            throw new Error('Não foi possível criar a exceção de agenda.');
        }
        return data;
    }

    /**
     * Remove uma exceção de agenda.
     * @param {string} exceptionId - O ID da exceção.
     * @param {string} tenantId - O ID do tenant para verificação.
     */
    async deleteAvailabilityException(exceptionId, tenantId) {
        const { error } = await supabaseAdmin
            .from('professional_availability_exceptions')
            .delete()
            .eq('id', exceptionId)
            .eq('tenant_id', tenantId);

        if (error) {
            console.error(`Erro ao remover exceção ${exceptionId}:`, error);
            throw new Error('Não foi possível remover a exceção de agenda.');
        }
        return true;
    }

    // --- Métodos para Horários de Trabalho Detalhados ---

    /**
     * Busca horários de trabalho detalhados de um profissional.
     * @param {string} professionalId - O ID do profissional.
     * @param {string} tenantId - O ID do tenant.
     */
    async getProfessionalSchedules(professionalId, tenantId) {
        const { data, error } = await supabaseAdmin
            .from('professional_schedules')
            .select('*')
            .eq('professional_id', professionalId)
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('day_of_week', { ascending: true });

        if (error) {
            console.error(`Erro ao buscar horários do profissional ${professionalId}:`, error);
            throw new Error('Não foi possível buscar os horários do profissional.');
        }
        return data;
    }

    /**
     * Cria ou atualiza um horário de trabalho para um profissional.
     * @param {object} scheduleData - Dados do horário (professional_id, tenant_id, day_of_week, start_time, end_time, etc.).
     */
    async saveProfessionalSchedule(scheduleData) {
        const { data, error } = await supabaseAdmin
            .from('professional_schedules')
            .upsert(scheduleData, { 
                onConflict: 'professional_id,day_of_week,tenant_id',
                ignoreDuplicates: false 
            })
            .select()
            .single();

        if (error) {
            console.error('Erro ao salvar horário:', error);
            throw new Error('Não foi possível salvar o horário do profissional.');
        }
        return data;
    }

    /**
     * Remove um horário de trabalho específico.
     * @param {string} scheduleId - O ID do horário.
     * @param {string} tenantId - O ID do tenant.
     */
    async deleteProfessionalSchedule(scheduleId, tenantId) {
        const { error } = await supabaseAdmin
            .from('professional_schedules')
            .delete()
            .eq('id', scheduleId)
            .eq('tenant_id', tenantId);

        if (error) {
            console.error(`Erro ao deletar horário ${scheduleId}:`, error);
            throw new Error('Não foi possível deletar o horário.');
        }
        return true;
    }

    // --- Métodos para Verificação de Disponibilidade ---

    /**
     * Verifica se um profissional está disponível em um horário específico.
     * @param {string} professionalId - O ID do profissional.
     * @param {string} startTime - Horário de início (formato ISO).
     * @param {string} endTime - Horário de fim (formato ISO).
     */
    async checkProfessionalAvailability(professionalId, startTime, endTime) {
        const { data, error } = await supabaseAdmin
            .rpc('is_professional_available', {
                p_professional_id: professionalId,
                p_start_time: startTime,
                p_end_time: endTime
            });

        if (error) {
            console.error(`Erro ao verificar disponibilidade do profissional ${professionalId}:`, error);
            throw new Error('Não foi possível verificar a disponibilidade.');
        }
        return data;
    }

    /**
     * Busca slots disponíveis de um profissional para uma data específica.
     * @param {string} professionalId - O ID do profissional.
     * @param {string} date - Data no formato YYYY-MM-DD.
     */
    async getAvailableSlots(professionalId, date) {
        const { data, error } = await supabaseAdmin
            .rpc('get_professional_availability', {
                p_professional_id: professionalId,
                p_date: date
            });

        if (error) {
            console.error(`Erro ao buscar slots disponíveis para ${professionalId} em ${date}:`, error);
            throw new Error('Não foi possível buscar os horários disponíveis.');
        }
        return data;
    }

    /**
     * Atualiza uma associação de serviço existente.
     * @param {string} associationId - O ID da associação.
     * @param {object} updateData - Dados para atualização.
     * @param {string} tenantId - O ID do tenant.
     */
    async updateServiceAssociation(associationId, updateData, tenantId) {
        const { data, error } = await supabaseAdmin
            .from('professional_services')
            .update(updateData)
            .eq('id', associationId)
            .eq('tenant_id', tenantId)
            .select()
            .single();

        if (error) {
            console.error(`Erro ao atualizar associação de serviço ${associationId}:`, error);
            throw new Error('Não foi possível atualizar a associação.');
        }
        return data;
    }
}

module.exports = ProfessionalService; 