const { supabaseAdmin: supabase } = require('../config/database');

class AppointmentService {

    /**
     * Busca e filtra agendamentos com paginação.
     * @param {string} tenantId - O ID do tenant.
     * @param {object} filters - Os filtros de busca (status, serviceId, etc.).
     * @returns {Promise<object>} - Um objeto com os agendamentos e informações de paginação.
     */
    async findAppointments(tenantId, filters) {
        const {
            status,
            serviceId,
            professionalId,
            customerQuery,
            page = 1,
            limit = 10
        } = filters;

        let query = supabase
            .from('appointments')
            .select(`
                id,
                start_time,
                end_time,
                status,
                final_price,
                customer:users (id, name, email),
                service:services (id, name),
                professional:professionals (id, name)
            `, { count: 'exact' });

        // CORREÇÃO: só filtra por tenant_id se for válido
        if (tenantId && tenantId !== 'undefined') {
            query = query.eq('tenant_id', tenantId);
        }

        // Aplica filtros dinamicamente
        if (status) {
            query = query.eq('status', status);
        }
        if (serviceId) {
            query = query.eq('service_id', serviceId);
        }
        if (professionalId) {
            query = query.eq('professional_id', professionalId);
        }
        if (customerQuery) {
            // Busca no nome ou email do cliente.
            // Nota: Esta abordagem de filtro de texto em uma tabela relacionada
            // pode ser lenta. Uma view ou uma função RPC seria melhor para produção.
            const { data: users, error: userError } = await supabase
                .from('users')
                .select('id')
                .ilike('name', `%${customerQuery}%`);
            
            if (userError) throw userError;
            
            const userIds = users.map(u => u.id);
            if (userIds.length > 0) {
                query = query.in('user_id', userIds);
            } else {
                // Se nenhum usuário for encontrado, retorna um resultado vazio.
                return { appointments: [], pagination: { totalItems: 0, currentPage: page, totalPages: 0, limit } };
            }
        }

        // Aplica ordenação e paginação
        const startIndex = (page - 1) * limit;
        query = query.order('start_time', { ascending: false }).range(startIndex, startIndex + limit - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('Erro ao buscar agendamentos:', error);
            throw new Error('Falha na consulta ao banco de dados.');
        }

        return {
            appointments: data,
            pagination: {
                totalItems: count,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                limit: limit
            }
        };
    }
}

module.exports = { AppointmentService }; 