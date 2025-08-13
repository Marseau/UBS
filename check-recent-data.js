const { createClient } = require('@supabase/supabase-js');

async function checkRecentData() {
  console.log('🔍 Verificando qual registro está sendo retornado...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get all records to see what's being selected
    console.log('📊 Buscando TODOS os registros para 30d...');
    
    const { data: allData, error: allError } = await supabase
      .from("platform_metrics")
      .select("*")
      .eq("period", "30d")
      .eq("platform_id", "PLATFORM")
      .eq("metric_type", "comprehensive")
      .order("created_at", { ascending: false });

    if (allError) {
      console.error('❌ Erro:', allError);
      return;
    }

    console.log(`✅ Encontrados ${allData.length} registros`);
    
    allData.forEach((record, index) => {
      console.log(`\n📋 Registro ${index + 1}:`);
      console.log(`   ID: ${record.id}`);
      console.log(`   Created: ${record.created_at}`);
      
      const financial = record.metric_data?.financial_metrics;
      if (financial) {
        console.log(`   💰 Platform MRR: R$ ${financial.platform_mrr}`);
        console.log(`   💰 Total Revenue: R$ ${financial.total_tenant_revenue}`);
        
        if (financial.platform_mrr > 0) {
          console.log('   🎯 ESTE REGISTRO TEM MRR > 0!');
        }
      } else {
        console.log('   ❌ Sem financial_metrics');
      }
    });

    // Test the single() query specifically
    console.log('\n🧪 Testando query single() específica...');
    
    const { data: singleData, error: singleError } = await supabase
      .from("platform_metrics")
      .select("*")
      .eq("period", "30d")
      .eq("platform_id", "PLATFORM")
      .eq("metric_type", "comprehensive")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (singleError) {
      console.error('❌ Erro no single():', singleError);
    } else {
      console.log('✅ Single query retornou:');
      console.log(`   ID: ${singleData.id}`);
      console.log(`   Created: ${singleData.created_at}`);
      
      const financial = singleData.metric_data?.financial_metrics;
      if (financial) {
        console.log(`   💰 Platform MRR: R$ ${financial.platform_mrr}`);
        console.log(`   💰 Total Revenue: R$ ${financial.total_tenant_revenue}`);
      }
    }

  } catch (error) {
    console.error('❌ Erro durante verificação:', error);
  }
}

// Load environment variables
require('dotenv').config();

checkRecentData();