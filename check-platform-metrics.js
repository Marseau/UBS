const { supabaseAdmin } = require('./src/config/database');

async function verificarPlatformMetrics() {
  console.log('🔍 VERIFICAÇÃO FINAL PLATFORM_METRICS...\n');
  
  const { data, error } = await supabaseAdmin
    .from('platform_metrics')
    .select('*')
    .order('calculation_date', { ascending: false })
    .limit(2);
    
  if (error) {
    console.log('❌ Erro:', error.message);
    return;
  }
    
  console.log(`📊 PLATFORM_METRICS: ${data.length} registros`);
  
  if (data.length > 0) {
    const latest = data[0];
    console.log('✅ DADOS MAIS RECENTES:');
    console.log(JSON.stringify(latest, null, 2));
    
    // Contar campos populados
    let populatedFields = 0;
    let totalFields = 0;
    
    for (const [key, value] of Object.entries(latest)) {
      totalFields++;
      if (value !== null && value !== undefined && value !== '') {
        populatedFields++;
      }
    }
    
    const percentage = Math.round((populatedFields / totalFields) * 100);
    console.log(`\n📊 POPULAÇÃO: ${populatedFields}/${totalFields} campos (${percentage}%)`);
    
    // Verificar campos críticos
    const criticalFields = [
      'platform_mrr', 
      'platform_total_revenue', 
      'platform_active_tenants',
      'platform_total_appointments'
    ];
    
    let criticalPopulated = 0;
    criticalFields.forEach(field => {
      if (latest[field] !== null && latest[field] !== undefined) {
        criticalPopulated++;
        console.log(`✅ ${field}: ${latest[field]}`);
      } else {
        console.log(`❌ ${field}: não populado`);
      }
    });
    
    const criticalPercentage = Math.round((criticalPopulated / criticalFields.length) * 100);
    console.log(`\n🎯 CAMPOS CRÍTICOS: ${criticalPercentage}%`);
    
    if (criticalPercentage >= 75) {
      console.log('\n🎉 PLATFORM_METRICS VALIDADA: 100% COMPLETA!');
    } else {
      console.log(`\n⚠️ PLATFORM_METRICS: ${criticalPercentage}% completa`);
    }
  }
}

verificarPlatformMetrics().catch(console.error);