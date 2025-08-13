/**
 * ANÁLISE TEMPORAL CORRETA - SEM CHUTES!
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://qsdfyffuonywmtnlycri.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class CorrectTemporalAnalysis {
  
  async getAppointmentsByPeriod(days) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Buscar TODOS os appointments do período específico
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
  
  separateAndAnalyze(appointments, period) {
    const external = [];
    const internal = [];
    
    for (const apt of appointments) {
      const source = apt.appointment_data?.booked_via || apt.appointment_data?.source || 'unknown';
      
      if (source === 'google_calendar') {
        external.push(apt);
      } else if (source === 'whatsapp_ai' || source === 'whatsapp_conversation') {
        internal.push(apt);
      }
    }
    
    // Calcular métricas para externos
    const externalRevenue = external.reduce((sum, apt) => {
      const price = apt.final_price || apt.quoted_price || 0;
      return sum + parseFloat(price.toString());
    }, 0);
    
    const externalStatus = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const apt of external) {
      externalStatus[apt.status] = (externalStatus[apt.status] || 0) + 1;
    }
    
    // Calcular métricas para internos
    const internalRevenue = internal.reduce((sum, apt) => {
      const price = apt.final_price || apt.quoted_price || 0;
      return sum + parseFloat(price.toString());
    }, 0);
    
    const internalStatus = { confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
    for (const apt of internal) {
      internalStatus[apt.status] = (internalStatus[apt.status] || 0) + 1;
    }
    
    return {
      period,
      total: appointments.length,
      external: {
        count: external.length,
        revenue: externalRevenue,
        avg_revenue: external.length > 0 ? externalRevenue / external.length : 0,
        status: externalStatus,
        success_rate: external.length > 0 ? 
          ((externalStatus.confirmed + externalStatus.completed) / external.length) * 100 : 0
      },
      internal: {
        count: internal.length,
        revenue: internalRevenue,
        avg_revenue: internal.length > 0 ? internalRevenue / internal.length : 0,
        status: internalStatus,
        success_rate: internal.length > 0 ? 
          ((internalStatus.confirmed + internalStatus.completed) / internal.length) * 100 : 0
      }
    };
  }
  
  async executeCorrectAnalysis() {
    console.log('🚀 ANÁLISE TEMPORAL CORRETA - SEM CHUTES!');
    console.log('==========================================\n');
    
    const periods = [7, 30, 90];
    const results = [];
    
    for (const days of periods) {
      console.log(`🔍 ANALISANDO PERÍODO REAL: ${days} DIAS`);
      
      const appointments = await this.getAppointmentsByPeriod(days);
      const analysis = this.separateAndAnalyze(appointments, days);
      
      console.log(`\n📊 RESULTADOS PERÍODO ${days} DIAS:`);
      console.log(`   📅 Total appointments: ${analysis.total}`);
      
      console.log(`\n🌐 EXTERNOS (Google Calendar):`);
      console.log(`   📅 Quantidade: ${analysis.external.count}`);
      console.log(`   💰 Receita: R$ ${analysis.external.revenue.toFixed(2)}`);
      console.log(`   💵 Receita média: R$ ${analysis.external.avg_revenue.toFixed(2)}`);
      console.log(`   📈 Taxa sucesso: ${analysis.external.success_rate.toFixed(1)}%`);
      console.log(`   📊 Status:`, analysis.external.status);
      
      console.log(`\n💬 INTERNOS (WhatsApp):`);
      console.log(`   📅 Quantidade: ${analysis.internal.count}`);
      console.log(`   💰 Receita: R$ ${analysis.internal.revenue.toFixed(2)}`);
      console.log(`   💵 Receita média: R$ ${analysis.internal.avg_revenue.toFixed(2)}`);
      console.log(`   📈 Taxa sucesso: ${analysis.internal.success_rate.toFixed(1)}%`);
      console.log(`   📊 Status:`, analysis.internal.status);
      
      console.log(`\n⚖️  COMPARAÇÃO:`);
      console.log(`   📊 Volume: Externos ${analysis.external.count} vs Internos ${analysis.internal.count}`);
      console.log(`   💰 Receita: Externos R$ ${analysis.external.revenue.toFixed(2)} vs Internos R$ ${analysis.internal.revenue.toFixed(2)}`);
      console.log(`   📈 Sucesso: Externos ${analysis.external.success_rate.toFixed(1)}% vs Internos ${analysis.internal.success_rate.toFixed(1)}%`);
      
      results.push(analysis);
      console.log('\n' + '='.repeat(50));
    }
    
    console.log(`\n📊 RESUMO FINAL CORRETO:`);
    console.log('========================');
    
    console.log(`\n🌐 AGENDAMENTOS EXTERNOS (Google Calendar):`);
    for (const result of results) {
      console.log(`   ${result.period}d: ${result.external.count} agendamentos | R$ ${result.external.revenue.toFixed(2)} | ${result.external.success_rate.toFixed(1)}% sucesso`);
    }
    
    console.log(`\n💬 AGENDAMENTOS INTERNOS (WhatsApp):`);
    for (const result of results) {
      console.log(`   ${result.period}d: ${result.internal.count} agendamentos | R$ ${result.internal.revenue.toFixed(2)} | ${result.internal.success_rate.toFixed(1)}% sucesso`);
    }
    
    return results;
  }
}

// Executar análise correta
if (require.main === module) {
  const analysis = new CorrectTemporalAnalysis();
  
  analysis.executeCorrectAnalysis()
    .then(() => {
      console.log('\n🎊 ANÁLISE TEMPORAL CORRETA CONCLUÍDA!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Erro:', error);
      process.exit(1);
    });
}

module.exports = { CorrectTemporalAnalysis };