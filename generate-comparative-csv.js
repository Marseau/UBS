/**
 * Gerador de CSV Comparativo Completo
 * Sistema Original vs Sistema Validado - 90 dias
 */

const { getAdminClient } = require('./dist/config/database.js');
const fs = require('fs');

async function generateComprehensiveCSV() {
  const client = getAdminClient();
  
  console.log('📊 Gerando CSV comparativo completo para 90d...');
  
  // Get all 90d records with both systems
  const { data } = await client
    .from('tenant_metrics')
    .select('tenant_id, period, metric_data, metricas_validadas')
    .eq('metric_type', 'comprehensive')
    .eq('period', '90d')
    .order('tenant_id');
  
  if (!data || data.length === 0) {
    console.log('❌ Nenhum dado encontrado para 90d');
    return;
  }
  
  // Get tenant names for better identification
  const { data: tenants } = await client
    .from('tenants')
    .select('id, business_name');
    
  const tenantNames = {};
  tenants?.forEach(t => {
    tenantNames[t.id] = t.business_name;
  });
  
  console.log('📋 Processando', data.length, 'tenants...');
  
  let csvContent = '';
  let headers = [];
  let rows = [];
  
  // Process each tenant
  data.forEach(record => {
    if (!record.metric_data && !record.metricas_validadas) return;
    
    const row = {};
    
    // Basic info
    row['tenant_id'] = record.tenant_id;
    row['business_name'] = tenantNames[record.tenant_id] || 'N/A';
    row['periodo'] = record.period;
    
    // Helper function to format Brazilian numbers
    function formatBrazilianNumber(value) {
      if (typeof value === 'number') {
        return value.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
      return value;
    }
    
    // Extract metric_data (sistema original)
    if (record.metric_data) {
      Object.entries(record.metric_data).forEach(([key, value]) => {
        const columnName = 'original_' + key;
        
        if (typeof value === 'number') {
          row[columnName] = formatBrazilianNumber(value);
        } else if (typeof value === 'object' && value !== null) {
          // Handle nested objects
          Object.entries(value).forEach(([subKey, subValue]) => {
            const nestedColumn = columnName + '_' + subKey;
            row[nestedColumn] = formatBrazilianNumber(subValue) || '';
          });
        } else {
          row[columnName] = value || '';
        }
      });
    }
    
    // Extract metricas_validadas (sistema validado)
    if (record.metricas_validadas) {
      Object.entries(record.metricas_validadas).forEach(([key, value]) => {
        const columnName = 'validado_' + key;
        
        if (typeof value === 'number') {
          row[columnName] = formatBrazilianNumber(value);
        } else if (typeof value === 'object' && value !== null) {
          // Handle nested objects
          Object.entries(value).forEach(([subKey, subValue]) => {
            const nestedColumn = columnName + '_' + subKey;
            row[nestedColumn] = formatBrazilianNumber(subValue) || '';
          });
        } else {
          row[columnName] = value || '';
        }
      });
    }
    
    rows.push(row);
  });
  
  if (rows.length === 0) {
    console.log('❌ Nenhum tenant com dados encontrado');
    return;
  }
  
  // Collect all unique headers
  rows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (!headers.includes(key)) {
        headers.push(key);
      }
    });
  });
  
  // Sort headers logically
  headers.sort((a, b) => {
    if (a === 'tenant_id') return -1;
    if (b === 'tenant_id') return 1;
    if (a === 'business_name') return -1;
    if (b === 'business_name') return 1;
    if (a === 'periodo') return -1;
    if (b === 'periodo') return 1;
    if (a.startsWith('original_') && !b.startsWith('original_')) return -1;
    if (b.startsWith('original_') && !a.startsWith('original_')) return 1;
    return a.localeCompare(b);
  });
  
  // Build CSV content
  csvContent += headers.join(',') + '\n';
  
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
  const filename = `COMPARATIVO-METRICAS-COMPLETO-90D-${timestamp}.csv`;
  fs.writeFileSync(filename, csvContent);
  
  console.log('✅ CSV gerado:', filename);
  console.log('📊 Tenants processados:', rows.length);
  console.log('📋 Colunas totais:', headers.length);
  console.log('🔍 Colunas sistema original:', headers.filter(h => h.startsWith('original_')).length);
  console.log('🔍 Colunas sistema validado:', headers.filter(h => h.startsWith('validado_')).length);
  
  // Show sample of what was included
  if (rows.length > 0) {
    console.log('\n📋 SAMPLE - Primeira linha:');
    console.log('Business:', rows[0].business_name);
    console.log('Tenant ID:', rows[0].tenant_id.slice(0, 8) + '...');
    
    // Show some metric examples
    const sampleMetrics = headers.filter(h => 
      (h.includes('revenue') || h.includes('customers') || h.includes('appointments')) &&
      (h.startsWith('original_') || h.startsWith('validado_'))
    ).slice(0, 4);
    
    sampleMetrics.forEach(metric => {
      if (rows[0][metric]) {
        console.log('  ' + metric + ':', rows[0][metric]);
      }
    });
  }
  
  console.log('\n🎯 Próximos passos:');
  console.log('1. Abrir o CSV no Excel/LibreOffice');  
  console.log('2. Comparar colunas original_ vs validado_');
  console.log('3. Verificar diferenças de precisão entre sistemas');
  console.log('4. Validar formatação numérica brasileira');
}

generateComprehensiveCSV().catch(console.error);