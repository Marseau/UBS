const { createClient } = require('@supabase/supabase-js');

async function debugPlatformData() {
  console.log('🔍 Debugando dados da platform_metrics...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Check what data exists
    console.log('📊 Buscando todos os dados...');
    
    const { data: allData, error: allError } = await supabase
      .from('platform_metrics')
      .select('*');
    
    if (allError) {
      console.error('❌ Erro ao buscar dados:', allError);
      return;
    }

    console.log(`✅ Encontrados ${allData.length} registros`);
    
    allData.forEach((record, index) => {
      console.log(`\n📋 Registro ${index + 1}:`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Platform ID: ${record.platform_id}`);
      console.log(`   Period: ${record.period}`);
      console.log(`   Metric Type: ${record.metric_type}`);
      console.log(`   Metric Data:`, record.metric_data);
      console.log(`   Created: ${record.created_at}`);
    });

    // Test the specific query that the service uses
    console.log('\n🔍 Testando query específica do serviço...');
    
    const { data: specificData, error: specificError } = await supabase
      .from('platform_metrics')
      .select('*')
      .eq('period', '30d')
      .eq('metric_type', 'comprehensive_metrics')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (specificError) {
      console.error('❌ Erro na query específica:', specificError);
    } else {
      console.log('✅ Query específica resultado:', specificData);
      
      if (specificData && specificData.length > 0) {
        const record = specificData[0];
        console.log('\n📊 Dados extraídos:');
        console.log('   Raw Data:', record);
        console.log('   Metric Data:', record.metric_data);
        
        if (record.metric_data) {
          console.log('   Platform MRR:', record.metric_data.platform_mrr);
          console.log('   Active Tenants:', record.metric_data.active_tenants);
          console.log('   Total Revenue:', record.metric_data.total_revenue);
        }
      } else {
        console.log('❌ Nenhum resultado encontrado na query específica');
      }
    }

  } catch (error) {
    console.error('❌ Erro durante debug:', error);
  }
}

// Load environment variables
require('dotenv').config();

debugPlatformData();