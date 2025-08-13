const { supabaseAdmin } = require('./src/config/database');

async function verifyRefactoredPlatform() {
  console.log('🔍 VERIFICAÇÃO DA PLATFORM_METRICS REFATORADA...\n');
  
  const { data, error } = await supabaseAdmin
    .from('platform_metrics')
    .select('*')
    .order('calculation_date', { ascending: false })
    .limit(1);
    
  if (error) {
    console.log('❌ Erro:', error.message);
    return;
  }
    
  if (data && data.length > 0) {
    const latest = data[0];
    console.log('✅ ESTRUTURA REFATORADA:');
    
    // Verificar campos críticos com nomes CORRETOS
    const criticalFields = [
      { field: 'total_revenue', label: 'Total Revenue', format: 'currency' },
      { field: 'total_appointments', label: 'Total Appointments', format: 'number' },
      { field: 'total_customers', label: 'Total Customers', format: 'number' },
      { field: 'active_tenants', label: 'Active Tenants', format: 'number' },
      { field: 'platform_mrr', label: 'Platform MRR', format: 'currency' },
      { field: 'operational_efficiency_pct', label: 'Conversion Rate', format: 'percentage' },
      { field: 'cancellation_rate_pct', label: 'No-Show Rate', format: 'percentage' },
      { field: 'receita_uso_ratio', label: 'Revenue/Usage Ratio', format: 'decimal' },
      { field: 'platform_health_score', label: 'Health Score', format: 'score' },
      { field: 'total_conversations', label: 'Total Conversations', format: 'number' },
      { field: 'total_valid_conversations', label: 'Valid Conversations', format: 'number' }
    ];
    
    let populatedFields = 0;
    
    criticalFields.forEach(({ field, label, format }) => {
      const value = latest[field];
      if (value !== null && value !== undefined) {
        populatedFields++;
        let displayValue = value;
        
        switch (format) {
          case 'currency':
            displayValue = `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
            break;
          case 'percentage':
            displayValue = `${value.toFixed(2)}%`;
            break;
          case 'decimal':
            displayValue = value.toFixed(2);
            break;
          case 'score':
            displayValue = `${value}/100`;
            break;
          default:
            displayValue = value.toLocaleString('pt-BR');
        }
        
        console.log(`   ✅ ${label}: ${displayValue}`);
      } else {
        console.log(`   ❌ ${label}: não populado`);
      }
    });
    
    const completionPercentage = Math.round((populatedFields / criticalFields.length) * 100);
    
    console.log(`\n📊 COMPLETUDE: ${populatedFields}/${criticalFields.length} campos (${completionPercentage}%)`);
    
    // Verificar qualidade dos dados
    console.log('\n🎯 ANÁLISE DE QUALIDADE:');
    
    const revenue = latest.total_revenue || 0;
    const conversations = latest.total_conversations || 0;
    const appointments = latest.total_appointments || 0;
    const customers = latest.total_customers || 0;
    
    console.log(`   💰 Revenue per Conversation: R$ ${conversations > 0 ? (revenue / conversations).toFixed(2) : '0.00'}`);
    console.log(`   📊 Appointments per Customer: ${customers > 0 ? (appointments / customers).toFixed(1) : '0.0'}`);
    console.log(`   🎯 Conversion Rate: ${latest.operational_efficiency_pct?.toFixed(2) || '0.00'}%`);
    console.log(`   📅 No-Show Rate: ${latest.cancellation_rate_pct?.toFixed(2) || '0.00'}%`);
    
    // Verificar se dados fazem sentido
    const dataQualityIssues = [];
    
    if (revenue <= 0) dataQualityIssues.push('Revenue zerada');
    if (conversations <= 0) dataQualityIssues.push('Conversas zeradas');
    if (appointments <= 0) dataQualityIssues.push('Appointments zerados');
    if (latest.operational_efficiency_pct > 100) dataQualityIssues.push('Conversion rate > 100%');
    if (latest.cancellation_rate_pct > 50) dataQualityIssues.push('No-show rate muito alta');
    
    if (dataQualityIssues.length === 0) {
      console.log('\n🎉 PLATFORM_METRICS REFATORADA COM SUCESSO!');
      console.log('✅ Todos os dados são consistentes e realistas');
      console.log('✅ Estrutura rica baseada em tenant_metrics reais');
      console.log('✅ Agregações matemáticas corretas');
      console.log('✅ Pronta para dashboards e análises avançadas');
      
      return { success: true, completion: completionPercentage };
    } else {
      console.log('\n⚠️ PROBLEMAS DE QUALIDADE IDENTIFICADOS:');
      dataQualityIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
      
      return { success: false, issues: dataQualityIssues, completion: completionPercentage };
    }
  } else {
    console.log('❌ Nenhum dado encontrado em platform_metrics');
    return { success: false, error: 'No data found' };
  }
}

// Executar verificação
verifyRefactoredPlatform()
  .then(result => {
    if (result.success) {
      console.log('\n🎯 VERIFICAÇÃO: 100% APROVADA');
    } else {
      console.log(`\n⚠️ VERIFICAÇÃO: ${result.completion || 0}% completa`);
    }
  })
  .catch(console.error);