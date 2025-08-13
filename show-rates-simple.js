require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function showRates() {
  console.log('📊 TAXAS DE CONVERSÃO E CANCELAMENTO - SISTEMA REAL');
  console.log('='.repeat(80));
  
  const { data, error } = await supabase
    .from('tenant_metrics')
    .select('tenant_id, period, metric_data')
    .eq('metric_type', 'business_dashboard');
  
  if (error) {
    console.error('❌ Erro:', error.message);
    return;
  }
  
  // Buscar nomes dos tenants
  const tenantIds = [...new Set(data.map(m => m.tenant_id))];
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name')
    .in('id', tenantIds);
  
  const tenantMap = {};
  tenants.forEach(t => {
    tenantMap[t.id] = t.name;
  });
  
  console.log(`📋 ${data.length} registros encontrados\n`);
  
  let currentTenant = null;
  
  data.sort((a, b) => {
    const nameA = tenantMap[a.tenant_id] || '';
    const nameB = tenantMap[b.tenant_id] || '';
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return a.period.localeCompare(b.period);
  }).forEach(metric => {
    const tenantName = tenantMap[metric.tenant_id] || 'Unknown';
    
    if (currentTenant !== tenantName) {
      console.log(`🏢 ${tenantName}`);
      console.log('─'.repeat(50));
      currentTenant = tenantName;
    }
    
    const conv = metric.metric_data?.conversion_rate;
    const canc = metric.metric_data?.cancellation_rate;
    
    console.log(`${metric.period.toUpperCase()}: Conv ${conv?.percentage || 0}% (${conv?.converted_conversations || 0}/${conv?.total_conversations || 0}) | Canc ${canc?.percentage || 0}% (${canc?.cancelled_conversations || 0}/${canc?.total_conversations || 0})`);
  });
  
  console.log('\n✅ Dados do sistema real');
}

showRates();