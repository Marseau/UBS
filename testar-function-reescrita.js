#!/usr/bin/env node

/**
 * SCRIPT PARA VERIFICAR SE FUNÇÃO FOI REALMENTE CRIADA
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU'
);

async function checkFunctionCreation() {
  console.log('�� VERIFICANDO SE FUNÇÃO FOI CRIADA');
  console.log('='.repeat(50));
  
  try {
    // 1. Verificar se a função existe
    console.log('🔍 Verificando se função existe...');
    
    const { data: functions, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_definition')
      .eq('routine_name', 'calculate_ubs_metrics_system');
    
    if (error) {
      console.log('❌ Erro ao verificar função:', error.message);
      return;
    }
    
    console.log('📋 Funções encontradas:', functions.length);
    
    if (functions.length > 0) {
      console.log('✅ Função existe!');
      console.log('📄 Definição da função:');
      console.log(functions[0].routine_definition.substring(0, 500) + '...');
    } else {
      console.log('❌ Função não encontrada!');
    }
    
    // 2. Verificar se há múltiplas versões
    console.log('\n🔍 Verificando todas as funções com nome similar...');
    
    const { data: allFunctions, error: allError } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .ilike('routine_name', '%calculate_ubs_metrics%');
    
    if (allError) {
      console.log('❌ Erro ao verificar todas as funções:', allError.message);
      return;
    }
    
    console.log('📋 Todas as funções encontradas:');
    allFunctions.forEach(f => console.log(`- ${f.routine_name} (${f.routine_type})`));
    
  } catch (error) {
    console.log('❌ Erro geral:', error.message);
  }
}

checkFunctionCreation();