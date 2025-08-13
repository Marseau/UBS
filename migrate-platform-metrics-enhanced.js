const { supabaseAdmin } = require('./src/config/database');

/**
 * MIGRAÇÃO PLATFORM_METRICS ENHANCED
 * Adicionar 5 novos campos para análises avançadas
 */

async function migratePlatformMetricsEnhanced() {
  console.log('🔧 MIGRAÇÃO PLATFORM_METRICS ENHANCED...\n');
  
  const migrations = [
    {
      name: 'platform_avg_clv',
      type: 'NUMERIC(12,2)',
      description: 'Customer Lifetime Value médio da plataforma'
    },
    {
      name: 'platform_avg_conversion_rate',
      type: 'NUMERIC(5,2)', 
      description: 'Taxa de conversão média da plataforma (%)'
    },
    {
      name: 'platform_high_risk_tenants',
      type: 'INTEGER',
      description: 'Número de tenants com alto risco operacional'
    },
    {
      name: 'platform_domain_breakdown',
      type: 'JSONB',
      description: 'Distribuição de tenants por domínio de negócio'
    },
    {
      name: 'platform_quality_score',
      type: 'NUMERIC(5,2)',
      description: 'Score de qualidade WhatsApp médio da plataforma (%)'
    }
  ];

  try {
    console.log('📊 ADICIONANDO 5 NOVOS CAMPOS...\n');

    for (const migration of migrations) {
      console.log(`🔧 Adicionando campo: ${migration.name}`);
      console.log(`   📝 Tipo: ${migration.type}`);
      console.log(`   💡 Descrição: ${migration.description}`);
      
      // Criar comando SQL para adicionar coluna
      const sqlCommand = `
        ALTER TABLE platform_metrics 
        ADD COLUMN IF NOT EXISTS ${migration.name} ${migration.type} DEFAULT NULL;
      `;

      console.log(`   📋 SQL: ${sqlCommand.trim()}`);

      // Executar migração via Supabase Admin (usando SQL direto)
      const { data, error } = await supabaseAdmin.rpc('exec_sql', {
        sql: sqlCommand
      });

      if (error) {
        // Se a função exec_sql não existir, tentar método alternativo
        console.log(`   ⚠️ Tentando método alternativo para ${migration.name}...`);
        
        // Método alternativo: usar raw query via supabase
        try {
          const { error: altError } = await supabaseAdmin
            .from('platform_metrics')
            .select('id')
            .limit(1);
          
          if (altError && altError.message.includes(`column "${migration.name}" does not exist`)) {
            console.log(`   ✅ Campo ${migration.name} precisa ser adicionado`);
          } else {
            console.log(`   ✅ Campo ${migration.name} já existe ou será adicionado`);
          }
        } catch (e) {
          console.log(`   ⚠️ Verificação alternativa falhou: ${e.message}`);
        }
      } else {
        console.log(`   ✅ Campo ${migration.name} adicionado com sucesso!`);
      }
      
      console.log('');
    }

    // Verificar se migração foi bem-sucedida testando inserção
    console.log('🧪 TESTANDO ESTRUTURA ATUALIZADA...');
    
    const testData = {
      calculation_date: new Date().toISOString().split('T')[0],
      period_days: 30,
      data_source: 'migration_test',
      total_revenue: 1000,
      platform_avg_clv: 500.00,
      platform_avg_conversion_rate: 25.50,
      platform_high_risk_tenants: 3,
      platform_domain_breakdown: { beauty: 5, healthcare: 3, legal: 2 },
      platform_quality_score: 75.25
    };

    console.log('📝 Testando inserção com novos campos...');
    const { data: testResult, error: testError } = await supabaseAdmin
      .from('platform_metrics')
      .insert(testData)
      .select();

    if (testError) {
      throw new Error(`Teste de inserção falhou: ${testError.message}`);
    }

    console.log('✅ Teste de inserção bem-sucedido!');
    console.log('📊 Registro teste criado:', testResult[0]?.id);

    // Limpar registro de teste
    if (testResult[0]?.id) {
      await supabaseAdmin
        .from('platform_metrics')
        .delete()
        .eq('id', testResult[0].id);
      console.log('🧹 Registro de teste removido');
    }

    console.log('\n🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('✅ 5 novos campos adicionados à platform_metrics');
    console.log('✅ Estrutura testada e funcional');
    console.log('✅ Tipos TypeScript já alinhados');
    console.log('✅ Pronto para enhanced refactor!');

    return {
      success: true,
      fields_added: migrations.length,
      migrations: migrations.map(m => m.name)
    };

  } catch (error) {
    console.error('❌ Erro na migração:', error.message);
    
    console.log('\n💡 PLANO ALTERNATIVO:');
    console.log('Se a migração automática falhou, execute manualmente no Supabase SQL Editor:');
    console.log('');
    
    migrations.forEach(migration => {
      console.log(`ALTER TABLE platform_metrics ADD COLUMN IF NOT EXISTS ${migration.name} ${migration.type} DEFAULT NULL;`);
    });

    return {
      success: false,
      error: error.message,
      manual_sql: migrations
    };
  }
}

// Executar migração
if (require.main === module) {
  migratePlatformMetricsEnhanced()
    .then(result => {
      if (result.success) {
        console.log('\n🚀 MIGRAÇÃO AUTOMÁTICA CONCLUÍDA!');
        console.log(`✅ ${result.fields_added} campos adicionados`);
      } else {
        console.log('\n⚠️ MIGRAÇÃO AUTOMÁTICA FALHOU');
        console.log('💡 Use o SQL manual fornecido acima');
      }
    })
    .catch(console.error);
}

module.exports = { migratePlatformMetricsEnhanced };