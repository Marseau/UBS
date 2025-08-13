const { createClient } = require('@supabase/supabase-js');

const client = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyJSONBSchema() {
  console.log('🔧 Aplicando schema JSONB para platform_metrics...');
  
  try {
    // 1. Drop table if exists
    console.log('1. Dropping existing table...');
    const dropResult = await client.rpc('exec_raw_sql', {
      query: 'DROP TABLE IF EXISTS platform_metrics CASCADE;'
    });
    
    if (dropResult.error) {
      console.log('⚠️ Drop table error (pode ser OK):', dropResult.error.message);
    }
    
    // 2. Create new JSONB table
    console.log('2. Creating JSONB table...');
    const createQuery = `
      CREATE TABLE platform_metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        calculation_date DATE NOT NULL,
        period VARCHAR(10) NOT NULL,
        data_source VARCHAR(50) DEFAULT 'tenant_aggregation',
        comprehensive_metrics JSONB DEFAULT '{}'::JSONB,
        participation_metrics JSONB DEFAULT '{}'::JSONB,
        ranking_metrics JSONB DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        CONSTRAINT platform_metrics_period_check CHECK (period IN ('7d', '30d', '90d'))
      );
    `;
    
    const createResult = await client.rpc('exec_raw_sql', { query: createQuery });
    
    if (createResult.error) {
      console.log('❌ Create table error:', createResult.error.message);
      // Try direct table creation
      console.log('3. Trying direct table creation...');
      
      const { error: directError } = await client.schema.createTable('platform_metrics', (table) => {
        table.uuid('id').primary().defaultRaw('gen_random_uuid()');
        table.date('calculation_date').notNullable();
        table.string('period', 10).notNullable();
        table.string('data_source', 50).defaultTo('tenant_aggregation');
        table.jsonb('comprehensive_metrics').defaultTo('{}');
        table.jsonb('participation_metrics').defaultTo('{}');
        table.jsonb('ranking_metrics').defaultTo('{}');
        table.timestamp('created_at').defaultTo(client.raw('now()'));
        table.timestamp('updated_at').defaultTo(client.raw('now()'));
      });
      
      if (directError) {
        console.log('❌ Direct creation also failed');
        throw directError;
      }
    }
    
    console.log('✅ Platform metrics JSONB table created successfully!');
    
    // 3. Verify table creation
    console.log('4. Verifying table...');
    const verifyResult = await client.from('platform_metrics').select('*').limit(0);
    
    if (verifyResult.error) {
      console.log('❌ Verification failed:', verifyResult.error.message);
    } else {
      console.log('✅ Table verified successfully!');
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('💥 Error applying schema:', error.message);
    return { success: false, error: error.message };
  }
}

// Execute
applyJSONBSchema()
  .then(result => {
    if (result.success) {
      console.log('🎉 Schema JSONB aplicado com sucesso!');
      process.exit(0);
    } else {
      console.log('💥 Falha na aplicação do schema:', result.error);
      process.exit(1);
    }
  })
  .catch(console.error);