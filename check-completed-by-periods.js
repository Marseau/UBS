const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCompletedByPeriods() {
  console.log('📊 APPOINTMENTS COMPLETED POR PERÍODO');
  console.log('='.repeat(50));
  
  const periods = [
    { name: '7d', days: 7 },
    { name: '30d', days: 30 },
    { name: '90d', days: 90 }
  ];
  
  for (const period of periods) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period.days);
    
    const { data, error } = await supabase
      .from('appointments')
      .select('id, status, created_at')
      .eq('status', 'completed')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error(`Erro ${period.name}:`, error);
      continue;
    }
    
    console.log(`${period.name}: ${data?.length || 0} appointments completed`);
    
    if (data && data.length > 0) {
      // Agrupar por data
      const byDate = {};
      data.forEach(apt => {
        const date = new Date(apt.created_at).toLocaleDateString('pt-BR');
        byDate[date] = (byDate[date] || 0) + 1;
      });
      
      console.log('   Distribuição por data:');
      Object.entries(byDate)
        .sort((a,b) => new Date(b[0].split('/').reverse().join('-')) - new Date(a[0].split('/').reverse().join('-')))
        .slice(0, 5)
        .forEach(([date, count]) => {
          console.log(`     ${date}: ${count} completed`);
        });
      
      if (Object.keys(byDate).length > 5) {
        console.log(`     ... e mais ${Object.keys(byDate).length - 5} datas`);
      }
    }
    console.log('');
  }
  
  // Verificar também total geral (sem filtro de data)
  const { data: allCompleted, error: allError } = await supabase
    .from('appointments')
    .select('id, created_at')
    .eq('status', 'completed');
  
  if (!allError) {
    console.log(`📈 TOTAL GERAL: ${allCompleted?.length || 0} appointments completed (todos os tempos)`);
    
    if (allCompleted && allCompleted.length > 0) {
      const oldest = new Date(Math.min(...allCompleted.map(apt => new Date(apt.created_at))));
      const newest = new Date(Math.max(...allCompleted.map(apt => new Date(apt.created_at))));
      console.log(`   Período dos dados: ${oldest.toLocaleDateString('pt-BR')} até ${newest.toLocaleDateString('pt-BR')}`);
    }
  }
}

checkCompletedByPeriods().catch(console.error);