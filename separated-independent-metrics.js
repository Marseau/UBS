/**
 * MÉTRICAS SEPARADAS E INDEPENDENTES
 * EXTERNOS = Google Calendar (métricas próprias)
 * INTERNOS = WhatsApp/Manual (métricas próprias)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class SeparatedIndependentMetrics {
  
  async getExternalAppointments(days) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let allExternal = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, tenant_id, status, quoted_price, final_price, 
          start_time, appointment_data, external_event_id
        `)
        .gte('start_time', cutoffDate.toISOString())
        .lte('start_time', now.toISOString())
        .eq('appointment_data->>source', 'google_calendar')
        .order('start_time', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allExternal = allExternal.concat(data);
      
      if (data.length < batchSize) break;
      from += batchSize;
    }
    
    return allExternal;
  }
  
  async getInternalAppointments(days) {
    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    let allInternal = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, tenant_id, status, quoted_price, final_price, 
          start_time, appointment_data
        `)
        .gte('start_time', cutoffDate.toISOString())
        .lte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      // Filtrar apenas NÃO google_calendar
      const internal = data.filter(apt => 
        apt.appointment_data?.source !== 'google_calendar'
      );
      
      allInternal = allInternal.concat(internal);
      
      if (data.length < batchSize) break;
      from += batchSize;
    }
    
    return allInternal;
  }
  
  calculateMetrics(appointments, type) {
    if (appointments.length === 0) {
      return {
        type: type,
        count: 0,
        revenue: 0,
        avg_revenue: 0,
        status: { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 },
        success_rate: 0,
        completion_rate: 0,
        cancellation_rate: 0,
        no_show_rate: 0,
        tenants_count: 0
      };
    }
    
    // Calcular receita
    const revenue = appointments.reduce((sum, apt) => {
      const price = apt.final_price || apt.quoted_price || 0;
      return sum + parseFloat(price.toString());
    }, 0);
    
    // Contar status
    const status = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const apt of appointments) {
      if (status.hasOwnProperty(apt.status)) {
        status[apt.status]++;
      }
    }
    
    // Contar tenants únicos
    const uniqueTenants = new Set(appointments.map(apt => apt.tenant_id));
    
    // Calcular taxas
    const total = appointments.length;
    const successCount = status.confirmed + status.completed;
    
    return {
      type: type,
      count: total,
      revenue: revenue,
      avg_revenue: total > 0 ? revenue / total : 0,
      status: status,
      success_rate: total > 0 ? (successCount / total) * 100 : 0,
      completion_rate: total > 0 ? (status.completed / total) * 100 : 0,
      cancellation_rate: total > 0 ? (status.cancelled / total) * 100 : 0,
      no_show_rate: total > 0 ? (status.no_show / total) * 100 : 0,
      tenants_count: uniqueTenants.size
    };
  }
  
  async analyzeExternalMetrics(days) {
    console.log(`\n🌐 MÉTRICAS INDEPENDENTES - AGENDAMENTOS EXTERNOS (${days} dias)`);
    console.log('='.repeat(70));
    
    const appointments = await this.getExternalAppointments(days);
    const metrics = this.calculateMetrics(appointments, 'EXTERNOS - Google Calendar');
    
    console.log(`📊 SISTEMA EXTERNO (Google Calendar):`);
    console.log(`   📅 Agendamentos: ${metrics.count}`);
    console.log(`   🏢 Tenants ativos: ${metrics.tenants_count}`);
    console.log(`   💰 Receita total: R$ ${metrics.revenue.toFixed(2)}`);
    console.log(`   💵 Receita média: R$ ${metrics.avg_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa sucesso: ${metrics.success_rate.toFixed(1)}%`);
    console.log(`   ✅ Taxa conclusão: ${metrics.completion_rate.toFixed(1)}%`);
    console.log(`   ❌ Taxa cancelamento: ${metrics.cancellation_rate.toFixed(1)}%`);
    console.log(`   👻 Taxa no-show: ${metrics.no_show_rate.toFixed(1)}%`);
    console.log(`   📊 Breakdown status:`);
    console.log(`      ✅ Confirmados: ${metrics.status.confirmed}`);
    console.log(`      ✅ Completados: ${metrics.status.completed}`);
    console.log(`      ❌ Cancelados: ${metrics.status.cancelled}`);
    console.log(`      👻 No-show: ${metrics.status.no_show}`);
    
    return metrics;
  }
  
  async analyzeInternalMetrics(days) {
    console.log(`\n💬 MÉTRICAS INDEPENDENTES - AGENDAMENTOS INTERNOS (${days} dias)`);
    console.log('='.repeat(70));
    
    const appointments = await this.getInternalAppointments(days);
    const metrics = this.calculateMetrics(appointments, 'INTERNOS - WhatsApp/Manual');
    
    console.log(`📊 SISTEMA INTERNO (WhatsApp/Manual):`);
    console.log(`   📅 Agendamentos: ${metrics.count}`);
    console.log(`   🏢 Tenants ativos: ${metrics.tenants_count}`);
    console.log(`   💰 Receita total: R$ ${metrics.revenue.toFixed(2)}`);
    console.log(`   💵 Receita média: R$ ${metrics.avg_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa sucesso: ${metrics.success_rate.toFixed(1)}%`);
    console.log(`   ✅ Taxa conclusão: ${metrics.completion_rate.toFixed(1)}%`);
    console.log(`   ❌ Taxa cancelamento: ${metrics.cancellation_rate.toFixed(1)}%`);
    console.log(`   👻 Taxa no-show: ${metrics.no_show_rate.toFixed(1)}%`);
    console.log(`   📊 Breakdown status:`);
    console.log(`      ✅ Confirmados: ${metrics.status.confirmed}`);
    console.log(`      ✅ Completados: ${metrics.status.completed}`);
    console.log(`      ❌ Cancelados: ${metrics.status.cancelled}`);
    console.log(`      👻 No-show: ${metrics.status.no_show}`);
    
    return metrics;
  }
  
  async executeIndependentAnalysis() {
    console.log('🚀 ANÁLISE DE MÉTRICAS INDEPENDENTES - EXTERNOS vs INTERNOS');
    console.log('===========================================================');
    
    const periods = [7, 30, 90];
    const externalResults = [];
    const internalResults = [];
    
    try {
      for (const days of periods) {
        console.log(`\n📊 PERÍODO: ${days} DIAS`);
        console.log('='.repeat(50));
        
        // Analisar métricas independentemente
        const externalMetrics = await this.analyzeExternalMetrics(days);
        const internalMetrics = await this.analyzeInternalMetrics(days);
        
        externalResults.push({ period: days, ...externalMetrics });
        internalResults.push({ period: days, ...internalMetrics });
      }
      
      // Resumo final separado
      console.log(`\n\n📊 RESUMO EXECUTIVO - MÉTRICAS INDEPENDENTES`);
      console.log('='.repeat(80));
      
      console.log(`\n🌐 SISTEMA EXTERNO (Google Calendar):`);
      console.log('    Período | Agendamentos | Receita     | Taxa Sucesso | Tenants');
      console.log('    --------|--------------|-------------|--------------|--------');
      for (const result of externalResults) {
        console.log(`    ${result.period.toString().padStart(2)}d     | ${result.count.toString().padStart(12)} | R$ ${result.revenue.toFixed(2).padStart(8)} | ${result.success_rate.toFixed(1).padStart(10)}% | ${result.tenants_count.toString().padStart(6)}`);
      }
      
      console.log(`\n💬 SISTEMA INTERNO (WhatsApp/Manual):`);
      console.log('    Período | Agendamentos | Receita     | Taxa Sucesso | Tenants');
      console.log('    --------|--------------|-------------|--------------|--------');
      for (const result of internalResults) {
        console.log(`    ${result.period.toString().padStart(2)}d     | ${result.count.toString().padStart(12)} | R$ ${result.revenue.toFixed(2).padStart(8)} | ${result.success_rate.toFixed(1).padStart(10)}% | ${result.tenants_count.toString().padStart(6)}`);
      }
      
      // Análise de crescimento independente
      console.log(`\n📈 ANÁLISE DE CRESCIMENTO INDEPENDENTE:`);
      
      if (externalResults.length >= 3) {
        const extGrowth = externalResults[2].count - externalResults[1].count;
        console.log(`🌐 Externos (30d→90d): +${extGrowth} agendamentos`);
      }
      
      if (internalResults.length >= 3) {
        const intGrowth = internalResults[2].count - internalResults[1].count;
        console.log(`💬 Internos (30d→90d): +${intGrowth} agendamentos`);
      }
      
      console.log('\n🎉 ANÁLISE INDEPENDENTE CONCLUÍDA!');
      return { external: externalResults, internal: internalResults };
      
    } catch (error) {
      console.error('❌ Erro na análise independente:', error);
      return false;
    }
  }
}

// Executar análise independente
if (require.main === module) {
  const analysis = new SeparatedIndependentMetrics();
  
  analysis.executeIndependentAnalysis()
    .then((results) => {
      if (results) {
        console.log('\n🎊 MÉTRICAS INDEPENDENTES 100% COMPLETAS!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NA ANÁLISE INDEPENDENTE');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Erro crítico:', error);
      process.exit(1);
    });
}

module.exports = { SeparatedIndependentMetrics };