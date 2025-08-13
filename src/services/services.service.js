const { supabaseAdmin: supabase } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ServiceService {

    /**
     * Busca e filtra serviços de um tenant com paginação.
     * @param {string} tenantId - O ID do tenant.
     * @param {object} filters - Filtros de busca (category, query, etc.).
     * @returns {Promise<object>}
     */
    async findServices(tenantId, filters) {
        const {
            category,
            query: searchQuery,
            page = 1,
            limit = 12
        } = filters;

        let query = supabase
            .from('services')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId);

        if (category) {
            query = query.eq('category_id', category);
        }

        if (searchQuery) {
            query = query.ilike('name', `%${searchQuery}%`);
        }

        const startIndex = (page - 1) * limit;
        query = query.order('name', { ascending: true }).range(startIndex, startIndex + limit - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('Erro ao buscar serviços:', error);
            throw new Error('Falha na consulta de serviços ao banco de dados.');
        }

        return {
            services: data,
            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                limit
            }
        };
    }

    /**
     * Lista todos os serviços de um tenant (versão simplificada).
     * @param {string} tenantId - O ID do tenant.
     * @returns {Promise<Array>}
     */
    async listServices(tenantId) {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('tenant_id', tenantId);
        
        if (error) throw error;
        return data;
    }

    /**
     * Cria um novo serviço.
     * @param {string} tenantId - O ID do tenant.
     * @param {object} serviceData - Dados do serviço.
     * @returns {Promise<object>}
     */
    async createService(tenantId, serviceData) {
        const { data, error } = await supabase
            .from('services')
            .insert({ ...serviceData, tenant_id: tenantId, id: uuidv4() })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Atualiza um serviço existente.
     * @param {string} tenantId - O ID do tenant.
     * @param {string} serviceId - O ID do serviço a ser atualizado.
     * @param {object} serviceData - Dados para atualização.
     * @returns {Promise<object>}
     */
    async updateService(tenantId, serviceId, serviceData) {
        const { data, error } = await supabase
            .from('services')
            .update(serviceData)
            .eq('id', serviceId)
            .eq('tenant_id', tenantId) // Garante que o serviço pertence ao tenant
            .select()
            .single();
        
        if (error) {
            console.error(`Erro ao atualizar serviço ${serviceId}:`, error);
            throw new Error('Erro no banco de dados ao atualizar o serviço.');
        }
        return data;
    }

    /**
     * Exclui um serviço.
     * @param {string} tenantId - O ID do tenant.
     * @param {string} serviceId - O ID do serviço a ser excluído.
     * @returns {Promise<void>}
     */
    async deleteService(tenantId, serviceId) {
        // Verificar se o serviço está em uso em professional_services
        const { data: associations } = await supabase
            .from('professional_services')
            .select('id')
            .eq('service_id', serviceId)
            .eq('tenant_id', tenantId);

        if (associations && associations.length > 0) {
            throw new Error('Não é possível excluir este serviço pois ele está associado a profissionais. Remova as associações primeiro.');
        }

        const { error } = await supabase
            .from('services')
            .delete()
            .eq('id', serviceId)
            .eq('tenant_id', tenantId);

        if (error) {
            console.error(`Erro ao excluir serviço ${serviceId}:`, error);
            throw new Error('Erro no banco de dados ao excluir o serviço.');
        }
    }
    /**
     * Busca serviços associados a um profissional específico.
     * @param {string} tenantId - O ID do tenant.
     * @param {string} professionalId - O ID do profissional.
     * @returns {Promise<Array>}
     */
    async getServicesByProfessional(tenantId, professionalId) {
        const { data, error } = await supabase
            .from('professional_services')
            .select(`
                id,
                custom_price,
                custom_duration,
                is_active,
                notes,
                service:services (id, name, base_price, duration_minutes, category_id, description)
            `)
            .eq('tenant_id', tenantId)
            .eq('professional_id', professionalId)
            .eq('is_active', true);
        
        if (error) {
            console.error(`Erro ao buscar serviços do profissional ${professionalId}:`, error);
            throw new Error('Erro ao buscar serviços do profissional.');
        }
        return data;
    }

    /**
     * Busca todos os profissionais que oferecem um serviço específico.
     * @param {string} tenantId - O ID do tenant.
     * @param {string} serviceId - O ID do serviço.
     * @returns {Promise<Array>}
     */
    async getProfessionalsByService(tenantId, serviceId) {
        const { data, error } = await supabase
            .from('professional_services')
            .select(`
                id,
                custom_price,
                custom_duration,
                is_active,
                notes,
                professional:professionals (id, name, email, bio)
            `)
            .eq('tenant_id', tenantId)
            .eq('service_id', serviceId)
            .eq('is_active', true);
        
        if (error) {
            console.error(`Erro ao buscar profissionais do serviço ${serviceId}:`, error);
            throw new Error('Erro ao buscar profissionais do serviço.');
        }
        return data;
    }

    /**
     * Calcula o preço final de um serviço para um profissional específico.
     * @param {string} tenantId - O ID do tenant.
     * @param {string} serviceId - O ID do serviço.
     * @param {string} professionalId - O ID do profissional.
     * @returns {Promise<object>}
     */
    async getServicePricing(tenantId, serviceId, professionalId) {
        const { data, error } = await supabase
            .from('professional_services')
            .select(`
                custom_price,
                custom_duration,
                service:services (base_price, duration_minutes)
            `)
            .eq('tenant_id', tenantId)
            .eq('service_id', serviceId)
            .eq('professional_id', professionalId)
            .eq('is_active', true)
            .single();
        
        if (error) {
            console.error(`Erro ao buscar preço do serviço ${serviceId} para profissional ${professionalId}:`, error);
            throw new Error('Erro ao buscar preço do serviço.');
        }

        return {
            finalPrice: data.custom_price || data.service.base_price,
            finalDuration: data.custom_duration || data.service.duration_minutes,
            isCustomPrice: data.custom_price !== null,
            isCustomDuration: data.custom_duration !== null
        };
    }
}

module.exports = ServiceService; 