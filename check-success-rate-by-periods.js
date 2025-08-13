const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSuccessRateByPeriods() {
  console.log('📊 SUCCESS RATE POR PERÍODO (baseado na data de agendamento)');
  console.log('='.repeat(70));
  
  const periods = [
    { name: '7d', days: 7 },
    { name: '30d', days: 30 },
    { name: '90d', days: 90 }
  ];
  
  for (const period of periods) {
    console.log(`📅 PERÍODO: ${period.name} (últimos ${period.days} dias)`);
    console.log('-'.repeat(50));
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period.days);
    
    console.log(`Data range: ${startDate.toLocaleDateString('pt-BR')} - ${endDate.toLocaleDateString('pt-BR')}`);
    
    // Buscar TODOS os appointments do período (baseado em created_at = data agendamento)
    const { data: allAppointments, error } = await supabase
      .from('appointments')
      .select('id, status, created_at, tenant_id, tenants!inner(name)')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error(`❌ Erro ${period.name}:`, error);
      continue;
    }
    
    if (!allAppointments || allAppointments.length === 0) {
      console.log('⚠️ Nenhum appointment encontrado neste período');
      console.log('');
      continue;
    }
    
    // Calcular success rate
    const total = allAppointments.length;
    const successful = allAppointments.filter(apt => 
      apt.status === 'completed' || apt.status === 'confirmed'
    ).length;
    const successRate = (successful / total * 100).toFixed(1);
    
    console.log(`📊 Total appointments: ${total}`);
    console.log(`✅ Successful (completed + confirmed): ${successful}`);
    console.log(`📈 Success Rate: ${successRate}%`);
    
    // Breakdown por status
    const statusBreakdown = {};
    allAppointments.forEach(apt => {
      statusBreakdown[apt.status] = (statusBreakdown[apt.status] || 0) + 1;
    });
    
    console.log('📋 Breakdown por status:');
    Object.entries(statusBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const percentage = (count / total * 100).toFixed(1);
        const isSuccess = status === 'completed' || status === 'confirmed' ? '✅' : '❌';
        console.log(`   ${isSuccess} ${status}: ${count} (${percentage}%)`);
      });
    
    // Top 5 tenants por volume
    const tenantBreakdown = {};
    allAppointments.forEach(apt => {
      const tenantName = apt.tenants.name;
      if (!tenantBreakdown[tenantName]) {
        tenantBreakdown[tenantName] = { total: 0, successful: 0 };
      }
      tenantBreakdown[tenantName].total++;
      if (apt.status === 'completed' || apt.status === 'confirmed') {
        tenantBreakdown[tenantName].successful++;
      }
    });
    
    console.log('🏢 Top 5 tenants por volume:');
    Object.entries(tenantBreakdown)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5)
      .forEach(([tenant, data]) => {
        const rate = (data.successful / data.total * 100).toFixed(1);
        console.log(`   ${tenant}: ${data.total} total, ${data.successful} success (${rate}%)`);
      });
    
    // Distribuição por data de agendamento
    const dateBreakdown = {};
    allAppointments.forEach(apt => {
      const date = new Date(apt.created_at).toLocaleDateString('pt-BR');
      dateBreakdown[date] = (dateBreakdown[date] || 0) + 1;
    });
    
    console.log('📅 Distribuição por data de agendamento (top 5):');
    Object.entries(dateBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([date, count]) => {
        console.log(`   ${date}: ${count} appointments`);
      });
    
    console.log('');
    console.log('='.repeat(70));
    console.log('');
  }
}

checkSuccessRateByPeriods().catch(console.error);