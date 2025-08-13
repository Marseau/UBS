#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function discoverSchema() {
  try {
    console.log('🔍 Descobrindo schema da tabela tenants...\n');
    
    // Buscar um tenant existente para ver as colunas
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .limit(1)
      .single();
    
    if (error) {
      console.error('Erro ao buscar tenant:', error);
      return;
    }
    
    console.log('✅ Colunas encontradas na tabela tenants:');
    Object.keys(tenant).forEach((column, index) => {
      console.log(`   ${index + 1}. ${column}: ${typeof tenant[column]} (${tenant[column]})`);
    });
    
    console.log('\n🔍 Procurando colunas relacionadas a domínio/tipo/categoria...');
    const domainColumns = Object.keys(tenant).filter(col => 
      col.includes('domain') || 
      col.includes('type') || 
      col.includes('category') || 
      col.includes('business') ||
      col.includes('industry') ||
      col.includes('sector')
    );
    
    if (domainColumns.length > 0) {
      console.log('✅ Colunas de domínio encontradas:');
      domainColumns.forEach(col => {
        console.log(`   - ${col}: ${tenant[col]}`);
      });
    } else {
      console.log('❌ Nenhuma coluna de domínio encontrada');
    }
    
    // Tentar descobrir outras tabelas relacionadas
    console.log('\n🔍 Testando tabela services especificamente...');
    
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .limit(1)
      .single();
    
    if (!serviceError && service) {
      console.log('✅ Colunas da tabela services:');
      Object.keys(service).forEach((column, index) => {
        console.log(`   ${index + 1}. ${column}: ${typeof service[column]} (${service[column]})`);
      });
    } else {
      console.log('❌ Erro na tabela services:', serviceError);
    }
    
    console.log('\n🔍 Testando outras tabelas relacionadas...');
    
    const tables = [
      'professionals', 
      'appointments', 
      'conversation_history',
      'stripe_customers',
      'service_categories'
    ];
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1)
          .single();
        
        if (!error && data) {
          console.log(`✅ Tabela ${table}: ${Object.keys(data).length} colunas`);
          console.log(`   Colunas: ${Object.keys(data).join(', ')}`);
        }
      } catch (e) {
        console.log(`❌ Tabela ${table}: não encontrada`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

discoverSchema();