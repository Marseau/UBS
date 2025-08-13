/**
 * Gerador de CSV COMPLETO para Validação
 * DADOS BRUTOS + SISTEMA ORIGINAL + SISTEMA VALIDADO
 * Para validar se os cálculos estão corretos vs dados reais do banco
 */

const { getAdminClient } = require('./dist/config/database.js');
const fs = require('fs');

async function generateCompleteValidationCSV() {
  const client = getAdminClient();
  
  console.log('🔍 Gerando CSV COMPLETO para validação - 90d...');
  console.log('📊 Incluindo: DADOS BRUTOS + ORIGINAL + VALIDADO');
  
  // Get all 90d records with calculated metrics
  const { data: metricsData } = await client
    .from('tenant_metrics')
    .select('tenant_id, period, metric_data, metricas_validadas')
    .eq('metric_type', 'comprehensive')
    .eq('period', '90d')
    .order('tenant_id');
  
  if (!metricsData || metricsData.length === 0) {
    console.log('❌ Nenhum dado de métricas encontrado para 90d');
    return;
  }
  
  // Get tenant names
  const { data: tenants } = await client
    .from('tenants')
    .select('id, business_name');
    
  const tenantNames = {};
  tenants?.forEach(t => {
    tenantNames[t.id] = t.business_name;
  });
  
  console.log('📋 Processando', metricsData.length, 'tenants...');
  
  let rows = [];
  
  // Calculate date range for 90d
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 90);
  
  // Process each tenant
  for (const record of metricsData) {
    console.log('🔄 Processando tenant:', record.tenant_id.slice(0, 8) + '...');
    
    const row = {};
    
    // Basic info
    row['tenant_id'] = record.tenant_id;
    row['business_name'] = tenantNames[record.tenant_id] || 'N/A';
    row['periodo'] = record.period;
    
    // ===== 1. DADOS BRUTOS DO BANCO =====
    console.log('  📥 Extraindo dados brutos...');
    
    // Raw appointments data - using start_time (real appointment date)
    const { data: appointments, count: appointmentsCount } = await client
      .from('appointments')
      .select('id, status, final_price, quoted_price, user_id, start_time', { count: 'exact' })
      .eq('tenant_id', record.tenant_id)
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString());
    
    row['BRUTO_total_appointments'] = appointmentsCount || 0;
    
    // Appointments by status
    const confirmedAppts = appointments?.filter(a => a.status === 'confirmed') || [];
    const cancelledAppts = appointments?.filter(a => a.status === 'cancelled') || [];
    const completedAppts = appointments?.filter(a => a.status === 'completed') || [];
    const noShowAppts = appointments?.filter(a => a.status === 'no_show') || [];
    
    row['BRUTO_confirmed_appointments'] = confirmedAppts.length;
    row['BRUTO_cancelled_appointments'] = cancelledAppts.length;
    row['BRUTO_completed_appointments'] = completedAppts.length;
    row['BRUTO_no_show_appointments'] = noShowAppts.length;
    
    // Raw revenue calculation
    const totalRevenue = appointments?.reduce((sum, apt) => {
      const price = parseFloat(apt.final_price || apt.quoted_price || 0);
      return sum + price;
    }, 0) || 0;
    
    row['BRUTO_total_revenue'] = totalRevenue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    // Raw customers count
    const uniqueCustomers = new Set(appointments?.map(a => a.user_id) || []);
    row['BRUTO_unique_customers'] = uniqueCustomers.size;
    
    // Raw conversations data
    const { count: conversationsCount } = await client
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', record.tenant_id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    row['BRUTO_total_conversations'] = conversationsCount || 0;
    
    // Calculate raw success rate
    const rawSuccessRate = appointmentsCount > 0 ? 
      (confirmedAppts.length / appointmentsCount) * 100 : 0;
    
    row['BRUTO_success_rate'] = rawSuccessRate.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    
    // ===== 2. SISTEMA ORIGINAL =====
    if (record.metric_data) {
      Object.entries(record.metric_data).forEach(([key, value]) => {
        const columnName = 'ORIGINAL_' + key;
        
        if (typeof value === 'number') {
          row[columnName] = value.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        } else if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([subKey, subValue]) => {
            const nestedColumn = columnName + '_' + subKey;
            if (typeof subValue === 'number') {
              row[nestedColumn] = subValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
            } else {
              row[nestedColumn] = subValue || '';
            }
          });
        } else {
          row[columnName] = value || '';
        }
      });
    }
    
    // ===== 3. SISTEMA VALIDADO =====
    if (record.metricas_validadas) {
      Object.entries(record.metricas_validadas).forEach(([key, value]) => {
        const columnName = 'VALIDADO_' + key;
        
        if (typeof value === 'number') {
          row[columnName] = value.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });
        } else if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([subKey, subValue]) => {
            const nestedColumn = columnName + '_' + subKey;
            if (typeof subValue === 'number') {
              row[nestedColumn] = subValue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
            } else {
              row[nestedColumn] = subValue || '';
            }
          });
        } else {
          row[columnName] = value || '';
        }
      });
    }
    
    rows.push(row);
  }
  
  // Collect all unique headers
  let headers = [];
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!headers.includes(key)) {
        headers.push(key);
      }
    });
  });
  
  // Sort headers logically: BASIC -> BRUTO -> ORIGINAL -> VALIDADO
  headers.sort((a, b) => {
    // Basic info first
    const basicOrder = ['tenant_id', 'business_name', 'periodo'];
    if (basicOrder.includes(a) && !basicOrder.includes(b)) return -1;
    if (!basicOrder.includes(a) && basicOrder.includes(b)) return 1;
    if (basicOrder.includes(a) && basicOrder.includes(b)) {
      return basicOrder.indexOf(a) - basicOrder.indexOf(b);
    }
    
    // Then BRUTO, ORIGINAL, VALIDADO
    if (a.startsWith('BRUTO_') && !b.startsWith('BRUTO_')) return -1;
    if (!a.startsWith('BRUTO_') && b.startsWith('BRUTO_')) return 1;
    if (a.startsWith('ORIGINAL_') && !b.startsWith('ORIGINAL_') && !b.startsWith('BRUTO_')) return -1;
    if (!a.startsWith('ORIGINAL_') && !a.startsWith('BRUTO_') && b.startsWith('ORIGINAL_')) return 1;
    
    return a.localeCompare(b);
  });
  
  // Build CSV content
  let csvContent = headers.join(',') + '\n';
  
  rows.forEach(row => {
    const csvRow = headers.map(header => {
      const value = row[header] || '';
      // Escape commas and quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    });
    csvContent += csvRow.join(',') + '\n';
  });
  
  // Save CSV file
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
  const filename = `VALIDACAO-COMPLETA-BRUTOS-ORIGINAL-VALIDADO-90D-${timestamp}.csv`;
  fs.writeFileSync(filename, csvContent);
  
  console.log('\n✅ CSV COMPLETO gerado:', filename);
  console.log('📊 Tenants processados:', rows.length);
  console.log('📋 Colunas totais:', headers.length);
  console.log('🔍 Colunas BRUTO:', headers.filter(h => h.startsWith('BRUTO_')).length);
  console.log('🔍 Colunas ORIGINAL:', headers.filter(h => h.startsWith('ORIGINAL_')).length);
  console.log('🔍 Colunas VALIDADO:', headers.filter(h => h.startsWith('VALIDADO_')).length);
  
  // Show comparison sample
  if (rows.length > 0) {
    console.log('\n📋 AMOSTRA COMPARATIVA:');
    console.log('Business:', rows[0].business_name);
    console.log('');
    
    // Revenue comparison
    console.log('💰 RECEITA:');
    console.log('  BRUTO_total_revenue:', rows[0]['BRUTO_total_revenue'] || '0');
    console.log('  ORIGINAL_total_revenue:', rows[0]['ORIGINAL_total_revenue'] || 'N/A');
    console.log('  VALIDADO_monthly_revenue:', rows[0]['VALIDADO_monthly_revenue'] || 'N/A');
    console.log('');
    
    // Appointments comparison
    console.log('📅 APPOINTMENTS:');
    console.log('  BRUTO_total_appointments:', rows[0]['BRUTO_total_appointments'] || '0');
    console.log('  ORIGINAL_total_appointments:', rows[0]['ORIGINAL_total_appointments'] || 'N/A');
    console.log('  VALIDADO_total_appointments:', rows[0]['VALIDADO_total_appointments'] || 'N/A');
    console.log('');
    
    // Success rate comparison
    console.log('📈 SUCCESS RATE:');
    console.log('  BRUTO_success_rate:', rows[0]['BRUTO_success_rate'] || '0');
    console.log('  ORIGINAL_appointment_success_rate:', rows[0]['ORIGINAL_appointment_success_rate'] || 'N/A');
    console.log('  VALIDADO_appointment_success_rate:', rows[0]['VALIDADO_appointment_success_rate'] || 'N/A');
  }
  
  console.log('\n🎯 COMO VALIDAR:');
  console.log('1. Compare BRUTO vs ORIGINAL vs VALIDADO');
  console.log('2. Verifique se cálculos estão corretos');
  console.log('3. Identifique discrepâncias nos sistemas');
  console.log('4. Valide se dados brutos batem com métricas calculadas');
}

generateCompleteValidationCSV().catch(console.error);