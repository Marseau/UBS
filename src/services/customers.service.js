const { createClient } = require('@supabase/supabase-js');
const { getServiceSupabase } = require('../config/database');

class CustomersService {
  constructor() {
    // No construtor, podemos inicializar o cliente Supabase se necessário,
    // mas vamos usar o getServiceSupabase para garantir a elevação de privilégios.
  }

  /**
   * Busca clientes de um tenant com filtros, ordenação e paginação.
   * @param {string} tenantId - O ID do tenant.
   * @param {object} options - Opções de filtro e paginação.
   * @param {string} [options.status] - Filtra por status ('active', 'inactive', 'blocked').
   * @param {string} [options.search] - Termo de busca para nome ou telefone.
   * @param {string} [options.sortBy='last_appointment_date'] - Campo para ordenação.
   * @param {boolean} [options.sortAsc=false] - Direção da ordenação.
   * @param {number} [options.page=1] - Página atual.
   * @param {number} [options.pageSize=10] - Itens por página.
   * @returns {Promise<object>} - Um objeto com os clientes e informações de paginação.
   */
  async getCustomers(tenantId, options = {}) {
    const supabase = getServiceSupabase();
    const {
      status,
      search,
      sortBy = 'last_appointment_date',
      sortAsc = false,
      page = 1,
      pageSize = 10,
    } = options;

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    // Aplica filtros
    if (status) {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Aplica ordenação
    query = query.order(sortBy, { ascending: sortAsc, nullsFirst: false });

    // Aplica paginação
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize - 1;
    query = query.range(startIndex, endIndex);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error fetching customers:', error);
      throw new Error('Não foi possível buscar os clientes.');
    }

    return {
      customers: data,
      totalCount: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    };
  }
  
  /**
   * Calcula as métricas principais para o dashboard de clientes.
   * @param {string} tenantId - O ID do tenant.
   * @returns {Promise<object>} - Um objeto com as métricas.
   */
  async getCustomerMetrics(tenantId) {
    const supabase = getServiceSupabase();

    // 1. Total de Clientes
    const { count: totalCustomers, error: totalError } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
    if (totalError) throw new Error('Erro ao buscar total de clientes.');

    // 2. Clientes Ativos
    const { count: activeCustomers, error: activeError } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active');
    if (activeError) throw new Error('Erro ao buscar clientes ativos.');
    
    // 3. Novos Clientes (nos últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: newCustomers, error: newError } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', thirtyDaysAgo.toISOString());
    if (newError) throw new Error('Erro ao buscar novos clientes.');

    // 4. LTV Médio (Lifetime Value)
    const { data: ltvData, error: ltvError } = await supabase
      .from('customers')
      .select('total_spent')
      .eq('tenant_id', tenantId);
    if (ltvError) throw new Error('Erro ao buscar dados de LTV.');
    
    const totalSpent = ltvData.reduce((sum, customer) => sum + (customer.total_spent || 0), 0);
    const averageLTV = ltvData.length > 0 ? totalSpent / ltvData.length : 0;

    return {
      totalCustomers: totalCustomers || 0,
      activeCustomers: activeCustomers || 0,
      newCustomers: newCustomers || 0,
      averageLTV: averageLTV || 0,
    };
  }
}

module.exports = new CustomersService(); 