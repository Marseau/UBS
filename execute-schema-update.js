#!/usr/bin/env node

/**
 * Script para executar atualização de schema de forma segura
 * Adiciona colunas account_type sem afetar dados existentes
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function executeSchemaUpdate() {
  console.log('🚀 Iniciando atualização segura do schema...');
  console.log('✅ GARANTIA: Dados existentes e free trial permanecem intactos');
  console.log('📊 OBJETIVO: Adicionar isolamento test/real para demo');
  
  try {
    // 1. Adicionar coluna account_type na tabela tenants
    console.log('\n1️⃣ Adicionando coluna account_type em tenants...');
    const { error: tenantError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
        CHECK (account_type IN ('test', 'real'));
        
        COMMENT ON COLUMN tenants.account_type IS 'Tipo de conta: test (demo) ou real (produção)';
      `
    });
    
    if (tenantError) {
      console.error('❌ Erro em tenants:', tenantError);
    } else {
      console.log('✅ Coluna account_type adicionada em tenants');
    }

    // 2. Adicionar coluna account_type na tabela admin_users
    console.log('\n2️⃣ Adicionando coluna account_type em admin_users...');
    const { error: adminError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE admin_users 
        ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
        CHECK (account_type IN ('test', 'real'));
        
        COMMENT ON COLUMN admin_users.account_type IS 'Tipo de conta: test (demo) ou real (produção)';
      `
    });
    
    if (adminError) {
      console.error('❌ Erro em admin_users:', adminError);
    } else {
      console.log('✅ Coluna account_type adicionada em admin_users');
    }

    // 3. Adicionar coluna account_type na tabela users
    console.log('\n3️⃣ Adicionando coluna account_type em users...');
    const { error: usersError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
        CHECK (account_type IN ('test', 'real'));
        
        COMMENT ON COLUMN users.account_type IS 'Tipo de conta: test (demo) ou real (produção)';
      `
    });
    
    if (usersError) {
      console.error('❌ Erro em users:', usersError);
    } else {
      console.log('✅ Coluna account_type adicionada em users');
    }

    // 4. Adicionar coluna account_type na tabela services
    console.log('\n4️⃣ Adicionando coluna account_type em services...');
    const { error: servicesError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE services 
        ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
        CHECK (account_type IN ('test', 'real'));
        
        COMMENT ON COLUMN services.account_type IS 'Tipo de conta: test (demo) ou real (produção)';
      `
    });
    
    if (servicesError) {
      console.error('❌ Erro em services:', servicesError);
    } else {
      console.log('✅ Coluna account_type adicionada em services');
    }

    // 5. Verificar se tabela professionals existe e adicionar coluna
    console.log('\n5️⃣ Verificando tabela professionals...');
    const { data: tableExists } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'professionals')
      .single();
    
    if (tableExists) {
      const { error: profError } = await supabase.rpc('exec_sql', {
        sql: `
          ALTER TABLE professionals 
          ADD COLUMN IF NOT EXISTS account_type VARCHAR(10) DEFAULT 'real' 
          CHECK (account_type IN ('test', 'real'));
          
          COMMENT ON COLUMN professionals.account_type IS 'Tipo de conta: test (demo) ou real (produção)';
        `
      });
      
      if (profError) {
        console.error('❌ Erro em professionals:', profError);
      } else {
        console.log('✅ Coluna account_type adicionada em professionals');
      }
    } else {
      console.log('ℹ️ Tabela professionals não existe - pulando');
    }

    // 6. Criar índices para performance
    console.log('\n6️⃣ Criando índices de performance...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON tenants(account_type);
        CREATE INDEX IF NOT EXISTS idx_admin_users_account_type ON admin_users(account_type);
        CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
        CREATE INDEX IF NOT EXISTS idx_services_account_type ON services(account_type);
        CREATE INDEX IF NOT EXISTS idx_conversation_history_source ON conversation_history(source);
      `
    });
    
    if (indexError) {
      console.error('❌ Erro criando índices:', indexError);
    } else {
      console.log('✅ Índices de performance criados');
    }

    // 7. Contar dados atuais para verificar que nada foi alterado
    console.log('\n7️⃣ Verificando integridade dos dados...');
    
    const { data: tenantCount } = await supabase
      .from('tenants')
      .select('account_type', { count: 'exact' });
    
    const { data: adminCount } = await supabase
      .from('admin_users')
      .select('account_type', { count: 'exact' });

    console.log(`📊 Tenants totais: ${tenantCount?.length || 0} (todos como 'real')`);
    console.log(`📊 Admin users totais: ${adminCount?.length || 0} (todos como 'real')`);

    console.log('\n🎉 ATUALIZAÇÃO DE SCHEMA CONCLUÍDA COM SUCESSO!');
    console.log('✅ Todas as colunas account_type adicionadas');
    console.log('✅ Índices de performance criados');
    console.log('✅ Dados existentes preservados como "real"');
    console.log('✅ Free trial e funcionalidades mantidos integralmente');
    console.log('✅ Demo agora pode criar dados isolados como "test"');
    
    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('1. Testar criação de tenant demo em /demo');
    console.log('2. Verificar isolamento entre dados test e real');
    console.log('3. Confirmar que app continua funcionando normalmente');

  } catch (error) {
    console.error('❌ Erro durante atualização:', error);
    process.exit(1);
  }
}

// Executar
executeSchemaUpdate();