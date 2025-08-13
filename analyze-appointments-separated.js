/**
 * ANÁLISE SEPARADA: AGENDAMENTOS EXTERNOS vs INTERNOS
 * EXTERNOS = Google Calendar
 * INTERNOS = WhatsApp (AI + Conversation)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class AppointmentsSeparationAnalysis {
  
  /**
   * BUSCAR TODOS OS APPOINTMENTS COM PAGINAÇÃO
   */
  async getAllAppointments(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    console.log(`📅 Buscando appointments para ${days} dias`);
    
    let allAppointments = [];
    let from = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          tenant_id,
          status,
          quoted_price,
          final_price,
          start_time,
          created_at,
          appointment_data
        `)
        .gte('start_time', cutoffDate.toISOString())
        .order('start_time', { ascending: true })
        .range(from, from + batchSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allAppointments = allAppointments.concat(data);
      
      if (data.length < batchSize) break;
      from += batchSize;
    }
    
    return allAppointments;
  }
  
  /**
   * SEPARAR AGENDAMENTOS EXTERNOS vs INTERNOS
   */
  separateAppointments(appointments) {
    const external = []; // Google Calendar
    const internal = []; // WhatsApp
    
    for (const apt of appointments) {
      const source = apt.appointment_data?.booked_via || apt.appointment_data?.source || 'unknown';
      
      if (source === 'google_calendar') {
        external.push(apt);
      } else if (source === 'whatsapp_ai' || source === 'whatsapp_conversation') {
        internal.push(apt);
      }
      // Ignorar 'unknown' para clareza
    }
    
    return { external, internal };
  }
  
  /**
   * ANALISAR MÉTRICAS POR TIPO
   */
  analyzeByType(appointments, type) {
    const analysis = {
      type: type,
      total: appointments.length,
      by_status: {
        confirmed: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0
      },
      by_tenant: new Map(),
      total_revenue: 0
    };
    
    for (const apt of appointments) {
      // Status
      if (apt.status === 'confirmed') analysis.by_status.confirmed++;
      else if (apt.status === 'completed') analysis.by_status.completed++;
      else if (apt.status === 'cancelled') analysis.by_status.cancelled++;
      else if (apt.status === 'no_show') analysis.by_status.no_show++;
      
      // Receita
      const price = apt.final_price || apt.quoted_price || 0;
      analysis.total_revenue += parseFloat(price.toString());
      
      // Por tenant
      if (!analysis.by_tenant.has(apt.tenant_id)) {
        analysis.by_tenant.set(apt.tenant_id, {
          total: 0,
          confirmed: 0,
          completed: 0,
          cancelled: 0,
          no_show: 0,
          revenue: 0
        });
      }
      
      const tenantData = analysis.by_tenant.get(apt.tenant_id);
      tenantData.total++;
      tenantData[apt.status] = (tenantData[apt.status] || 0) + 1;
      tenantData.revenue += parseFloat(price.toString());
    }
    
    return analysis;
  }
  
  /**
   * CALCULAR TAXAS E MÉTRICAS
   */
  calculateMetrics(analysis) {
    const totalWithStatus = analysis.by_status.confirmed + analysis.by_status.completed + 
                           analysis.by_status.cancelled + analysis.by_status.no_show;
    
    return {
      ...analysis,
      success_rate: totalWithStatus > 0 ? 
        ((analysis.by_status.confirmed + analysis.by_status.completed) / totalWithStatus) * 100 : 0,
      completion_rate: totalWithStatus > 0 ? 
        (analysis.by_status.completed / totalWithStatus) * 100 : 0,
      cancellation_rate: totalWithStatus > 0 ? 
        (analysis.by_status.cancelled / totalWithStatus) * 100 : 0,
      no_show_rate: totalWithStatus > 0 ? 
        (analysis.by_status.no_show / totalWithStatus) * 100 : 0,
      avg_revenue_per_appointment: analysis.total > 0 ? 
        analysis.total_revenue / analysis.total : 0
    };
  }
  
  /**
   * ANÁLISE SEPARADA PARA UM PERÍODO
   */
  async analyzePeriod(days) {
    console.log(`\n🔍 ANALISANDO PERÍODO: ${days} DIAS`);
    console.log('='.repeat(50));
    
    // 1. Buscar todos os appointments
    const allAppointments = await this.getAllAppointments(days);
    
    // 2. Separar externos vs internos
    const { external, internal } = this.separateAppointments(allAppointments);
    
    // 3. Analisar cada tipo
    const externalAnalysis = this.calculateMetrics(
      this.analyzeByType(external, 'EXTERNO (Google Calendar)')
    );
    
    const internalAnalysis = this.calculateMetrics(
      this.analyzeByType(internal, 'INTERNO (WhatsApp)')
    );
    
    // 4. Mostrar resultados
    console.log(`\n📊 RESUMO GERAL (${days} dias):`);
    console.log(`   📅 Total appointments: ${allAppointments.length}`);
    console.log(`   🌐 EXTERNOS (Google): ${external.length} (${(external.length/allAppointments.length*100).toFixed(1)}%)`);
    console.log(`   💬 INTERNOS (WhatsApp): ${internal.length} (${(internal.length/allAppointments.length*100).toFixed(1)}%)`);
    
    console.log(`\n🌐 AGENDAMENTOS EXTERNOS (Google Calendar):`);
    console.log(`   📅 Total: ${externalAnalysis.total}`);
    console.log(`   ✅ Confirmados: ${externalAnalysis.by_status.confirmed}`);
    console.log(`   ✅ Completados: ${externalAnalysis.by_status.completed}`);
    console.log(`   ❌ Cancelados: ${externalAnalysis.by_status.cancelled}`);
    console.log(`   👻 No-show: ${externalAnalysis.by_status.no_show}`);
    console.log(`   💰 Receita: R$ ${externalAnalysis.total_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa Sucesso: ${externalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   📉 Taxa Cancelamento: ${externalAnalysis.cancellation_rate.toFixed(1)}%`);
    console.log(`   👻 Taxa No-show: ${externalAnalysis.no_show_rate.toFixed(1)}%`);
    console.log(`   💵 Receita média: R$ ${externalAnalysis.avg_revenue_per_appointment.toFixed(2)}`);
    
    console.log(`\n💬 AGENDAMENTOS INTERNOS (WhatsApp):`);
    console.log(`   📅 Total: ${internalAnalysis.total}`);
    console.log(`   ✅ Confirmados: ${internalAnalysis.by_status.confirmed}`);
    console.log(`   ✅ Completados: ${internalAnalysis.by_status.completed}`);
    console.log(`   ❌ Cancelados: ${internalAnalysis.by_status.cancelled}`);
    console.log(`   👻 No-show: ${internalAnalysis.by_status.no_show}`);
    console.log(`   💰 Receita: R$ ${internalAnalysis.total_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa Sucesso: ${internalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   📉 Taxa Cancelamento: ${internalAnalysis.cancellation_rate.toFixed(1)}%`);
    console.log(`   👻 Taxa No-show: ${internalAnalysis.no_show_rate.toFixed(1)}%`);
    console.log(`   💵 Receita média: R$ ${internalAnalysis.avg_revenue_per_appointment.toFixed(2)}`);
    
    // 5. Comparação
    console.log(`\n⚖️  COMPARAÇÃO EXTERNOS vs INTERNOS:`);
    console.log(`   📊 Volume: Externos ${external.length} vs Internos ${internal.length}`);
    console.log(`   💰 Receita: Externos R$ ${externalAnalysis.total_revenue.toFixed(2)} vs Internos R$ ${internalAnalysis.total_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa Sucesso: Externos ${externalAnalysis.success_rate.toFixed(1)}% vs Internos ${internalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   💵 Receita Média: Externos R$ ${externalAnalysis.avg_revenue_per_appointment.toFixed(2)} vs Internos R$ ${internalAnalysis.avg_revenue_per_appointment.toFixed(2)}`);
    
    const externalWins = externalAnalysis.success_rate > internalAnalysis.success_rate ? 'EXTERNOS' : 'INTERNOS';
    console.log(`   🏆 Melhor performance: ${externalWins}`);
    
    return {
      period: days,
      total: allAppointments.length,
      external: externalAnalysis,
      internal: internalAnalysis
    };
  }
  
  /**
   * EXECUTAR ANÁLISE COMPLETA PARA TODOS OS PERÍODOS
   */
  async executeCompleteSeparationAnalysis() {
    console.log('🚀 ANÁLISE SEPARADA: AGENDAMENTOS EXTERNOS vs INTERNOS');
    console.log('====================================================');
    
    const periods = [7, 30, 90];
    const results = [];
    
    try {
      for (const days of periods) {
        const result = await this.analyzePeriod(days);
        results.push(result);
      }
      
      // Resumo comparativo
      console.log(`\n\n📊 RESUMO COMPARATIVO TODOS OS PERÍODOS:`);
      console.log('='.repeat(60));
      
      console.log(`\n📅 EXTERNOS (Google Calendar):`);
      for (const result of results) {
        console.log(`   ${result.period}d: ${result.external.total} agendamentos | R$ ${result.external.total_revenue.toFixed(2)} | ${result.external.success_rate.toFixed(1)}% sucesso`);
      }
      
      console.log(`\n💬 INTERNOS (WhatsApp):`);
      for (const result of results) {
        console.log(`   ${result.period}d: ${result.internal.total} agendamentos | R$ ${result.internal.total_revenue.toFixed(2)} | ${result.internal.success_rate.toFixed(1)}% sucesso`);
      }
      
      console.log('\n🎉 ANÁLISE SEPARADA CONCLUÍDA COM SUCESSO!');
      return true;
      
    } catch (error) {
      console.error('❌ Erro na análise separada:', error);
      return false;
    }
  }
}

// Executar análise separada
if (require.main === module) {
  const separationAnalysis = new AppointmentsSeparationAnalysis();
  
  separationAnalysis.executeCompleteSeparationAnalysis()
    .then((success) => {
      if (success) {
        console.log('\n🎊 ANÁLISE SEPARADA 100% CONCLUÍDA!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NA ANÁLISE SEPARADA');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Erro crítico:', error);
      process.exit(1);
    });
}

module.exports = { AppointmentsSeparationAnalysis };