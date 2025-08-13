/**
 * ANÁLISE FINAL CORRETA - AGENDAMENTOS EXTERNOS vs INTERNOS
 * EXTERNOS = appointment_data.source = "google_calendar"
 * INTERNOS = outros (WhatsApp, manual, etc.)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class FinalCorrectAnalysis {
  
  async getAppointmentsByPeriod(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    console.log(`📅 Buscando appointments para ${days} dias (desde ${cutoffDate.toISOString()})`);
    
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
          appointment_data,
          external_event_id,
          customer_notes
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
    
    console.log(`   📊 Total encontrado: ${allAppointments.length} appointments`);
    return allAppointments;
  }
  
  classifyAppointments(appointments) {
    const external = [];
    const internal = [];
    
    for (const apt of appointments) {
      // CRITÉRIO CORRETO: appointment_data.source = "google_calendar"
      const source = apt.appointment_data?.source;
      const hasExternalId = apt.external_event_id !== null;
      const hasGoogleNote = apt.customer_notes?.includes('Google Calendar');
      
      if (source === 'google_calendar' || hasExternalId || hasGoogleNote) {
        external.push(apt);
      } else {
        internal.push(apt);
      }
    }
    
    return { external, internal };
  }
  
  analyzeGroup(appointments, groupName) {
    if (appointments.length === 0) {
      return {
        name: groupName,
        count: 0,
        revenue: 0,
        avg_revenue: 0,
        status: { confirmed: 0, completed: 0, cancelled: 0, no_show: 0, other: 0 },
        success_rate: 0
      };
    }
    
    // Calcular receita
    const revenue = appointments.reduce((sum, apt) => {
      const price = apt.final_price || apt.quoted_price || 0;
      return sum + parseFloat(price.toString());
    }, 0);
    
    // Contar status
    const status = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0, other: 0 };
    for (const apt of appointments) {
      if (status.hasOwnProperty(apt.status)) {
        status[apt.status]++;
      } else {
        status.other++;
      }
    }
    
    // Calcular taxa de sucesso
    const totalWithStatus = status.confirmed + status.completed + status.cancelled + status.no_show + status.other;
    const successRate = totalWithStatus > 0 ? 
      ((status.confirmed + status.completed) / totalWithStatus) * 100 : 0;
    
    return {
      name: groupName,
      count: appointments.length,
      revenue: revenue,
      avg_revenue: appointments.length > 0 ? revenue / appointments.length : 0,
      status: status,
      success_rate: successRate
    };
  }
  
  async analyzePeriod(days) {
    console.log(`\n🔍 ANALISANDO PERÍODO: ${days} DIAS`);
    console.log('='.repeat(50));
    
    // 1. Buscar todos os appointments do período
    const appointments = await this.getAppointmentsByPeriod(days);
    
    // 2. Classificar corretamente
    const { external, internal } = this.classifyAppointments(appointments);
    
    console.log(`📊 CLASSIFICAÇÃO:`);
    console.log(`   🌐 EXTERNOS: ${external.length}`);
    console.log(`   💬 INTERNOS: ${internal.length}`);
    console.log(`   📅 TOTAL: ${appointments.length}`);
    
    // 3. Analisar cada grupo
    const externalAnalysis = this.analyzeGroup(external, 'EXTERNOS (Google Calendar)');
    const internalAnalysis = this.analyzeGroup(internal, 'INTERNOS (WhatsApp/Manual)');
    
    // 4. Mostrar resultados detalhados
    console.log(`\n🌐 AGENDAMENTOS EXTERNOS (Google Calendar):`);
    console.log(`   📅 Quantidade: ${externalAnalysis.count}`);
    console.log(`   💰 Receita: R$ ${externalAnalysis.revenue.toFixed(2)}`);
    console.log(`   💵 Receita média: R$ ${externalAnalysis.avg_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa sucesso: ${externalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   📊 Status:`, externalAnalysis.status);
    
    console.log(`\n💬 AGENDAMENTOS INTERNOS (WhatsApp/Manual):`);
    console.log(`   📅 Quantidade: ${internalAnalysis.count}`);
    console.log(`   💰 Receita: R$ ${internalAnalysis.revenue.toFixed(2)}`);
    console.log(`   💵 Receita média: R$ ${internalAnalysis.avg_revenue.toFixed(2)}`);
    console.log(`   📈 Taxa sucesso: ${internalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   📊 Status:`, internalAnalysis.status);
    
    // 5. Comparação
    const externalPercent = appointments.length > 0 ? (external.length / appointments.length) * 100 : 0;
    const internalPercent = appointments.length > 0 ? (internal.length / appointments.length) * 100 : 0;
    
    console.log(`\n⚖️  COMPARAÇÃO:`);
    console.log(`   📊 Distribuição: ${externalPercent.toFixed(1)}% externos vs ${internalPercent.toFixed(1)}% internos`);
    console.log(`   💰 Receita: R$ ${externalAnalysis.revenue.toFixed(2)} vs R$ ${internalAnalysis.revenue.toFixed(2)}`);
    console.log(`   📈 Taxa Sucesso: ${externalAnalysis.success_rate.toFixed(1)}% vs ${internalAnalysis.success_rate.toFixed(1)}%`);
    console.log(`   💵 Receita Média: R$ ${externalAnalysis.avg_revenue.toFixed(2)} vs R$ ${internalAnalysis.avg_revenue.toFixed(2)}`);
    
    const betterPerformance = externalAnalysis.success_rate > internalAnalysis.success_rate ? 'EXTERNOS' : 'INTERNOS';
    console.log(`   🏆 Melhor performance: ${betterPerformance}`);
    
    return {
      period: days,
      total: appointments.length,
      external: externalAnalysis,
      internal: internalAnalysis
    };
  }
  
  async executeCompleteAnalysis() {
    console.log('🚀 ANÁLISE FINAL CORRETA: EXTERNOS vs INTERNOS');
    console.log('===============================================');
    
    const periods = [7, 30, 90];
    const results = [];
    
    try {
      for (const days of periods) {
        const result = await this.analyzePeriod(days);
        results.push(result);
      }
      
      // Resumo comparativo final
      console.log(`\n\n📊 RESUMO FINAL CORRETO - TODOS OS PERÍODOS:`);
      console.log('='.repeat(60));
      
      console.log(`\n🌐 AGENDAMENTOS EXTERNOS (Google Calendar):`);
      for (const result of results) {
        console.log(`   ${result.period}d: ${result.external.count} agendamentos | R$ ${result.external.revenue.toFixed(2)} | ${result.external.success_rate.toFixed(1)}% sucesso`);
      }
      
      console.log(`\n💬 AGENDAMENTOS INTERNOS (WhatsApp/Manual):`);
      for (const result of results) {
        console.log(`   ${result.period}d: ${result.internal.count} agendamentos | R$ ${result.internal.revenue.toFixed(2)} | ${result.internal.success_rate.toFixed(1)}% sucesso`);
      }
      
      // Insights de crescimento
      console.log(`\n📈 ANÁLISE DE CRESCIMENTO:`);
      if (results.length >= 3) {
        const ext7 = results[0].external.count;
        const ext30 = results[1].external.count;
        const ext90 = results[2].external.count;
        
        const int7 = results[0].internal.count;
        const int30 = results[1].internal.count;
        const int90 = results[2].internal.count;
        
        console.log(`   🌐 Externos: 7d→30d = +${ext30-ext7} | 30d→90d = +${ext90-ext30}`);
        console.log(`   💬 Internos: 7d→30d = +${int30-int7} | 30d→90d = +${int90-int30}`);
      }
      
      console.log('\n🎉 ANÁLISE FINAL CONCLUÍDA COM SUCESSO!');
      return true;
      
    } catch (error) {
      console.error('❌ Erro na análise final:', error);
      return false;
    }
  }
}

// Executar análise final
if (require.main === module) {
  const finalAnalysis = new FinalCorrectAnalysis();
  
  finalAnalysis.executeCompleteAnalysis()
    .then((success) => {
      if (success) {
        console.log('\n🎊 ANÁLISE FINAL 100% CORRETA!');
        process.exit(0);
      } else {
        console.log('\n💥 FALHA NA ANÁLISE FINAL');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Erro crítico:', error);
      process.exit(1);
    });
}

module.exports = { FinalCorrectAnalysis };