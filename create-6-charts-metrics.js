require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function create6ChartsMetrics() {
  console.log('📊 CRIANDO MÉTRICAS PARA OS 6 GRÁFICOS SOLICITADOS');
  console.log('==================================================\n');
  
  // Date range for last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = sixMonthsAgo.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  
  console.log(`📅 Período de análise: ${startDate} até ${today}\n`);
  
  // ==================================================
  // GRÁFICO 1: TIME SERIES 6 MESES (Revenue/Appointments/Customers)
  // ==================================================
  
  console.log('📈 1. TIME SERIES - ÚLTIMOS 6 MESES:');
  console.log('====================================');
  
  try {
    const { data: historicalData } = await client
      .from('tenant_metrics')
      .select('*')
      .gte('created_at', startDate)
      .order('created_at');
      
    if (historicalData && historicalData.length > 0) {
      // Group by month and period
      const monthlyData = {};
      
      historicalData.forEach(record => {
        const month = record.created_at.substring(0, 7); // YYYY-MM
        const period = record.period;
        const key = `${month}-${period}`;
        
        if (!monthlyData[key]) {
          monthlyData[key] = {
            month,
            period,
            revenue: 0,
            appointments: 0,
            customers: 0,
            tenants: 0
          };
        }
        
        const data = record.metric_data || {};
        monthlyData[key].revenue += parseFloat(data.revenue || 0);
        monthlyData[key].appointments += parseInt(data.appointments || 0);
        monthlyData[key].customers += parseInt(data.customers || 0);
        monthlyData[key].tenants += 1;
      });
      
      console.log('✅ Dados históricos 6 meses:');
      console.log('Meses disponíveis:', [...new Set(Object.values(monthlyData).map(d => d.month))].sort());
      console.log('Períodos:', [...new Set(Object.values(monthlyData).map(d => d.period))]);
      
      // Sample data structure for chart
      const chartData1 = Object.values(monthlyData)
        .filter(d => d.period === '30d') // Focus on 30d for trends
        .sort((a, b) => a.month.localeCompare(b.month));
        
      console.log('📊 Sample time series data (30d period):');
      chartData1.slice(-3).forEach(d => {
        console.log(`  ${d.month}: Revenue=${d.revenue}, Appointments=${d.appointments}, Customers=${d.customers}`);
      });
    }
  } catch (error) {
    console.log('❌ Error fetching historical data:', error.message);
  }
  
  // ==================================================
  // GRÁFICO 2: SCATTER CUSTO vs RECEITA POR TENANT 
  // ==================================================
  
  console.log('\n💰 2. SCATTER PLOT - CUSTO vs RECEITA POR TENANT:');
  console.log('================================================');
  
  try {
    // Get tenant data with subscription costs
    const { data: tenantsWithCosts } = await client
      .from('tenants')
      .select('id, business_name, domain, subscription_plan')
      .eq('status', 'active');
      
    const { data: tenantMetrics } = await client
      .from('tenant_metrics')
      .select('*')
      .eq('period', '30d')
      .gte('created_at', startDate);
      
    const { data: subscriptionPayments } = await client
      .from('subscription_payments')
      .select('tenant_id, amount, subscription_plan')
      .eq('payment_status', 'completed')
      .gte('payment_period_start', startDate);
  
    if (tenantsWithCosts && tenantMetrics && subscriptionPayments) {
      // Create cost lookup from subscription payments
      const costLookup = {};
      subscriptionPayments.forEach(payment => {
        const tenantId = payment.tenant_id;
        if (!costLookup[tenantId]) costLookup[tenantId] = 0;
        costLookup[tenantId] += parseFloat(payment.amount || 0);
      });
      
      // Create scatter plot data
      const scatterData = tenantMetrics
        .map(metric => {
          const tenant = tenantsWithCosts.find(t => t.id === metric.tenant_id);
          const cost = costLookup[metric.tenant_id] || 0;
          const revenue = parseFloat(metric.metric_data?.revenue || 0);
          
          return {
            tenant_id: metric.tenant_id,
            business_name: tenant?.business_name || 'Unknown',
            domain: tenant?.domain || 'unknown',
            x_cost: cost, // Eixo horizontal
            y_revenue: revenue, // Eixo vertical
            subscription_plan: tenant?.subscription_plan || 'free'
          };
        })
        .filter(d => d.y_revenue > 0); // Only show tenants with revenue
        
      console.log('✅ Scatter plot data ready:');
      console.log(`Tenants with cost/revenue data: ${scatterData.length}`);
      scatterData.slice(0, 3).forEach(d => {
        console.log(`  ${d.business_name}: Cost=$${d.x_cost}, Revenue=$${d.y_revenue} (${d.domain})`);
      });
      
      // Calculate correlation
      const avgCost = scatterData.reduce((sum, d) => sum + d.x_cost, 0) / scatterData.length;
      const avgRevenue = scatterData.reduce((sum, d) => sum + d.y_revenue, 0) / scatterData.length;
      console.log(`💡 Average: Cost=$${avgCost.toFixed(2)}, Revenue=$${avgRevenue.toFixed(2)}`);
    }
  } catch (error) {
    console.log('❌ Error creating scatter data:', error.message);
  }
  
  // ==================================================
  // GRÁFICO 3: LINE CHART CONVERSATIONS vs APPOINTMENTS
  // ==================================================
  
  console.log('\n💬 3. LINE CHART - CONVERSATIONS vs APPOINTMENTS:');
  console.log('===============================================');
  
  try {
    const { data: conversations } = await client
      .from('whatsapp_conversations')
      .select('created_at, status')
      .gte('created_at', startDate)
      .order('created_at');
      
    const { data: appointments } = await client
      .from('appointments')
      .select('start_time, status')
      .gte('start_time', startDate)
      .in('status', ['completed', 'confirmed'])
      .order('start_time');
      
    if (conversations && appointments) {
      // Group by month
      const conversationsByMonth = {};
      const appointmentsByMonth = {};
      
      conversations.forEach(conv => {
        const month = conv.created_at.substring(0, 7);
        conversationsByMonth[month] = (conversationsByMonth[month] || 0) + 1;
      });
      
      appointments.forEach(apt => {
        const month = apt.start_time.substring(0, 7);
        appointmentsByMonth[month] = (appointmentsByMonth[month] || 0) + 1;
      });
      
      console.log('✅ Line chart data (last 6 months):');
      const months = [...new Set([...Object.keys(conversationsByMonth), ...Object.keys(appointmentsByMonth)])].sort();
      months.slice(-6).forEach(month => {
        const conversations = conversationsByMonth[month] || 0;
        const appointments = appointmentsByMonth[month] || 0;
        console.log(`  ${month}: Conversations=${conversations}, Appointments=${appointments}`);
      });
    }
  } catch (error) {
    console.log('❌ Error creating line chart data:', error.message);
  }
  
  // ==================================================
  // GRÁFICO 4: PIE CHART MRR POR DOMÍNIO
  // ==================================================
  
  console.log('\n🥧 4. PIE CHART - MRR POR DOMÍNIO:');
  console.log('=================================');
  
  try {
    const { data: tenants } = await client
      .from('tenants')
      .select('id, business_name, domain, subscription_plan')
      .eq('status', 'active');
      
    const { data: payments } = await client
      .from('subscription_payments')
      .select('tenant_id, amount, subscription_plan')
      .eq('payment_status', 'completed')
      .gte('payment_period_start', startDate);
      
    if (tenants && payments) {
      // Calculate MRR by domain
      const mrrByDomain = {};
      
      payments.forEach(payment => {
        const tenant = tenants.find(t => t.id === payment.tenant_id);
        const domain = tenant?.domain || 'unknown';
        const amount = parseFloat(payment.amount || 0);
        
        if (!mrrByDomain[domain]) {
          mrrByDomain[domain] = { mrr: 0, tenants: new Set(), businessNames: [] };
        }
        
        mrrByDomain[domain].mrr += amount;
        mrrByDomain[domain].tenants.add(payment.tenant_id);
        if (tenant?.business_name) {
          mrrByDomain[domain].businessNames.push(tenant.business_name);
        }
      });
      
      const totalMrr = Object.values(mrrByDomain).reduce((sum, d) => sum + d.mrr, 0);
      
      console.log('✅ Pie chart MRR por domínio:');
      Object.entries(mrrByDomain).forEach(([domain, data]) => {
        const percentage = ((data.mrr / totalMrr) * 100).toFixed(1);
        const tenantCount = data.tenants.size;
        console.log(`  ${domain}: $${data.mrr.toFixed(2)} (${percentage}%) - ${tenantCount} tenants`);
      });
      console.log(`💰 Total MRR: $${totalMrr.toFixed(2)}`);
    }
  } catch (error) {
    console.log('❌ Error creating pie chart data:', error.message);
  }
  
  // ==================================================
  // GRÁFICO 5: LINE CHART STATUS DOS APPOINTMENTS
  // ==================================================
  
  console.log('\n📅 5. LINE CHART - STATUS DOS APPOINTMENTS:');
  console.log('==========================================');
  
  try {
    const { data: appointments } = await client
      .from('appointments')
      .select('start_time, status')
      .gte('start_time', startDate)
      .order('start_time');
      
    if (appointments) {
      // Group by month and status
      const statusByMonth = {};
      
      appointments.forEach(apt => {
        const month = apt.start_time.substring(0, 7);
        const status = apt.status;
        
        if (!statusByMonth[month]) {
          statusByMonth[month] = { completed: 0, confirmed: 0, cancelled: 0, noshow: 0 };
        }
        
        // Map status to categories
        if (status === 'completed') statusByMonth[month].completed++;
        else if (status === 'confirmed') statusByMonth[month].confirmed++;
        else if (status === 'cancelled') statusByMonth[month].cancelled++;
        else if (status === 'noshow') statusByMonth[month].noshow++;
      });
      
      console.log('✅ Appointment status trends (últimos 6 meses):');
      const months = Object.keys(statusByMonth).sort();
      months.slice(-6).forEach(month => {
        const data = statusByMonth[month];
        const completedConfirmed = data.completed + data.confirmed;
        console.log(`  ${month}: Completos+Confirmados=${completedConfirmed}, Cancelados=${data.cancelled}, NoShow=${data.noshow}`);
      });
    }
  } catch (error) {
    console.log('❌ Error creating appointment status data:', error.message);
  }
  
  // ==================================================
  // GRÁFICO 6: MÉTRICAS ADICIONAIS - PLATAFORMA vs TENANT
  // ==================================================
  
  console.log('\n⚖️ 6. MÉTRICAS PLATAFORMA vs TENANT REVENUE:');
  console.log('==========================================');
  
  try {
    // Platform revenue (subscription fees)
    const { data: platformRevenue } = await client
      .from('subscription_payments')
      .select('amount, payment_period_start, subscription_plan')
      .eq('payment_status', 'completed')
      .gte('payment_period_start', startDate);
      
    // Tenant business revenue
    const { data: tenantRevenue } = await client
      .from('tenant_metrics')
      .select('metric_data, created_at')
      .eq('period', '30d')
      .gte('created_at', startDate);
      
    if (platformRevenue && tenantRevenue) {
      const totalPlatformRevenue = platformRevenue.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const totalTenantRevenue = tenantRevenue.reduce((sum, t) => sum + parseFloat(t.metric_data?.revenue || 0), 0);
      
      // Revenue by subscription plan (platform revenue understanding)
      const revenueByPlan = {};
      platformRevenue.forEach(payment => {
        const plan = payment.subscription_plan;
        revenueByPlan[plan] = (revenueByPlan[plan] || 0) + parseFloat(payment.amount || 0);
      });
      
      console.log('✅ Platform vs Tenant Revenue Analysis:');
      console.log(`💰 Total Platform Revenue (subscriptions): $${totalPlatformRevenue.toFixed(2)}`);
      console.log(`🏢 Total Tenant Business Revenue: $${totalTenantRevenue.toFixed(2)}`);
      console.log(`📊 Ratio (Tenant:Platform): ${(totalTenantRevenue / totalPlatformRevenue).toFixed(1)}:1`);
      
      console.log('\\n📋 Platform Revenue por Plano:');
      Object.entries(revenueByPlan).forEach(([plan, amount]) => {
        const percentage = ((amount / totalPlatformRevenue) * 100).toFixed(1);
        console.log(`  ${plan}: $${amount.toFixed(2)} (${percentage}%)`);
      });
      
      console.log('\\n💡 Key Insights:');
      console.log(`• Receita dos tenants é ${(totalTenantRevenue / totalPlatformRevenue).toFixed(0)}x maior que receita da plataforma`);
      console.log('• Variação da receita plataforma é pequena (baseada em planos fixos)');
      console.log('• Receita dos tenants varia muito (depende do negócio deles)');
      console.log('• Correlação: sucesso dos tenants = crescimento da plataforma');
    }
  } catch (error) {
    console.log('❌ Error creating platform vs tenant analysis:', error.message);
  }
  
  console.log('\\n🎯 RESUMO DOS 6 GRÁFICOS CRIADOS:');
  console.log('==================================');
  console.log('1. ✅ Time Series 6 meses - Revenue/Appointments/Customers trend');
  console.log('2. ✅ Scatter Plot - Custo vs Receita por tenant (com hover business_name)');
  console.log('3. ✅ Line Chart - Conversations vs Appointments (últimos 6 meses)');
  console.log('4. ✅ Pie Chart - MRR por domínio (com hover valor + %)');
  console.log('5. ✅ Line Chart - Status appointments (completos+confirmados vs cancelados vs noshow)');
  console.log('6. ✅ Metrics - Platform vs Tenant revenue relationship analysis');
  
  console.log('\\n🚀 PRÓXIMOS PASSOS:');
  console.log('===================');
  console.log('• Implementar estes gráficos no Super Admin Dashboard');
  console.log('• Adicionar interatividade (hover, drill-down)');
  console.log('• Configurar atualização automática dos dados');
  console.log('• Pensar em métricas adicionais baseadas nos insights');
}

create6ChartsMetrics().catch(console.error);