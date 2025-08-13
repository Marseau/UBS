const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Usar service role key para máximos privilégios
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function addPlatformColumnsAdmin() {
  console.log('🔧 ADICIONANDO COLUNAS PLATFORM_METRICS VIA ADMIN...\n');
  
  const columns = [
    {
      name: 'platform_avg_clv',
      type: 'NUMERIC(12,2)',
      description: 'CLV médio da plataforma'
    },
    {
      name: 'platform_avg_conversion_rate',
      type: 'NUMERIC(5,2)',
      description: 'Taxa conversão média (%)'
    },
    {
      name: 'platform_high_risk_tenants',
      type: 'INTEGER',
      description: 'Tenants alto risco'
    },
    {
      name: 'platform_domain_breakdown',
      type: 'JSONB',
      description: 'Breakdown por domínio'
    },
    {
      name: 'platform_quality_score',
      type: 'NUMERIC(5,2)',
      description: 'Score qualidade WhatsApp (%)'
    }
  ];

  try {
    console.log('📊 Verificando estrutura atual da tabela...');
    
    // Verificar se colunas já existem tentando selecionar
    for (const column of columns) {
      console.log(`\n🔧 Processando: ${column.name}`);
      console.log(`   📝 Tipo: ${column.type}`);
      console.log(`   💡 ${column.description}`);
      
      try {
        // Tentar selecionar a coluna para ver se existe
        const { data, error } = await supabase
          .from('platform_metrics')
          .select(column.name)
          .limit(1);
          
        if (error && error.message.includes(`column "${column.name}" does not exist`)) {
          console.log(`   ❌ Coluna ${column.name} não existe - precisa ser adicionada`);
        } else if (error) {
          console.log(`   ⚠️ Erro ao verificar ${column.name}: ${error.message}`);
        } else {
          console.log(`   ✅ Coluna ${column.name} já existe`);
        }
      } catch (e) {
        console.log(`   ❌ Coluna ${column.name} não existe - erro: ${e.message}`);
      }
    }

    // Tentar usar supabase SQL via RPC
    console.log('\n🔧 Tentando adicionar colunas via SQL...');
    
    const sqlCommands = columns.map(col => 
      `ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT NULL;`
    );
    
    const fullSQL = sqlCommands.join('\n');
    console.log('📋 SQL a executar:');
    console.log(fullSQL);
    
    // Tentar executar via função customizada se existir
    const { data: sqlResult, error: sqlError } = await supabase.rpc('execute_sql', {
      query: fullSQL
    });
    
    if (sqlError) {
      console.log('⚠️ Função execute_sql não disponível:', sqlError.message);
      
      // Método alternativo: testar inserindo dados com os novos campos
      console.log('\n🧪 TESTE ALTERNATIVO: Tentando inserir dados com novos campos...');
      
      const testData = {
        calculation_date: new Date().toISOString().split('T')[0],
        period_days: 30,
        data_source: 'column_test',
        total_revenue: 100,
        // Tentar incluir novos campos
        platform_avg_clv: 500.00,
        platform_avg_conversion_rate: 25.50,
        platform_high_risk_tenants: 3,
        platform_domain_breakdown: { beauty: 5, healthcare: 3 },
        platform_quality_score: 75.25
      };
      
      const { data: insertData, error: insertError } = await supabase
        .from('platform_metrics')
        .insert(testData)
        .select('id');
        
      if (insertError) {
        throw new Error(`Colunas ainda não existem: ${insertError.message}`);
      } else {
        console.log('✅ SUCESSO! Novos campos funcionando!');
        console.log('📊 Registro teste:', insertData[0]?.id);
        
        // Limpar teste
        if (insertData[0]?.id) {
          await supabase
            .from('platform_metrics')
            .delete()
            .eq('id', insertData[0].id);
          console.log('🧹 Teste removido');
        }
        
        return { success: true, method: 'insert_test' };
      }
    } else {
      console.log('✅ SQL executado via RPC!');
      return { success: true, method: 'sql_rpc' };
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    
    console.log('\n💡 INSTRUÇÕES MANUAIS:');
    console.log('Execute este SQL no Supabase Dashboard > SQL Editor:');
    console.log('');
    columns.forEach(col => {
      console.log(`ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} DEFAULT NULL;`);
    });
    console.log('');
    console.log('Depois execute: node enhanced-platform-refactor.js');
    
    return { success: false, error: error.message };
  }
}

// Executar
addPlatformColumnsAdmin()
  .then(result => {
    if (result.success) {
      console.log('\n🎉 COLUNAS ADICIONADAS COM SUCESSO!');
      console.log('✅ Tabela platform_metrics atualizada');
      console.log('✅ Pronto para enhanced refactor');
    } else {
      console.log('\n⚠️ ADIÇÃO AUTOMÁTICA FALHOU');
      console.log('💡 Use as instruções manuais acima');
    }
  })
  .catch(console.error);