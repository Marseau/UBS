#!/usr/bin/env node

/**
 * SCRIPT PARA VERIFICAR A LÓGICA DE FILTRO
 * Confirmar se está filtrando por created_at vs appointment_date
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyFilterLogic() {
  console.log('�� VERIFICANDO LÓGICA DE FILTRO');
  console.log('='.repeat(50));
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  console.log(`�� Período de análise: ${startDate.toISOString().split('T')[0]} até ${endDate.toISOString().split('T')[0]}`);
  
  try {
    // 1. Verificar appointments CRIADOS no período (correto)
    console.log('\n🔍 1. Appointments CRIADOS no período (created_at)...');
    
    const { data: createdInPeriod, error: createdError } = await supabase
      .from('appointments')
      .select('id, tenant_id, final_price, created_at, appointment_date, status')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });
    
    if (createdError) {
      console.error('❌ Erro ao buscar appointments criados:', createdError);
      return;
    }
    
    console.log(`✅ Appointments CRIADOS no período: ${createdInPeriod?.length || 0}`);
    
    // 2. Verificar appointments COM DATA FUTURA no período
    console.log('\n🔍 2. Appointments COM DATA FUTURA no período...');
    
    const { data: futureAppointments, error: futureError } = await supabase
      .from('appointments')
      .select('id, tenant_id, final_price, created_at, appointment_date, status')
      .gte('appointment_date', endDate.toISOString())
      .order('appointment_date', { ascending: false });
    
    if (futureError) {
      console.error('❌ Erro ao buscar appointments futuros:', futureError);
      return;
    }
    
    console.log(`⚠️ Appointments COM DATA FUTURA: ${futureAppointments?.length || 0}`);
    
    // 3. Verificar interseção (problema!)
    console.log('\n�� 3. Verificando interseção (PROBLEMA!)...');
    
    const createdIds = new Set(createdInPeriod?.map(app => app.id) || []);
    const futureIds = new Set(futureAppointments?.map(app => app.id) || []);
    
    const intersection = [...createdIds].filter(id => futureIds.has(id));
    
    console.log(`❌ Appointments CRIADOS no período E COM DATA FUTURA: ${intersection.length}`);
    
    if (intersection.length > 0) {
      console.log('📊 Exemplos de appointments problemáticos:');
      const problematicApps = createdInPeriod?.filter(app => intersection.includes(app.id)).slice(0, 5) || [];
      
      problematicApps.forEach(app => {
        console.log(`   ID: ${app.id}`);
        console.log(`   Criado em: ${app.created_at}`);
        console.log(`   Data do agendamento: ${app.appointment_date}`);
        console.log(`   Status: ${app.status}`);
        console.log(`   Price: R$ ${app.final_price || 0}`);
        console.log('   ---');
      });
    }
    
    // 4. Calcular métricas corretas
    console.log('\n�� 4. Métricas corretas (apenas criados no período):');
    
    const correctRevenue = createdInPeriod?.reduce((sum, app) => sum + (app.final_price || 0), 0) || 0;
    const correctAppointments = createdInPeriod?.length || 0;
    const correctCustomers = new Set(createdInPeriod?.map(app => app.user_id).filter(id => id) || []).size;
    
    console.log(`   Revenue: R$ ${correctRevenue.toFixed(2)}`);
    console.log(`   Appointments: ${correctAppointments}`);
    console.log(`   Customers: ${correctCustomers}`);
    
    console.log('\n🎯 CONCLUSÃO:');
    console.log('   A função deve filtrar por created_at (quando foi criado)');
    console.log('   NÃO por appointment_date (data do agendamento)');
    console.log('   Appointments futuros são normais, mas devem ser filtrados corretamente');
    
  } catch (error) {
    console.error('❌ Erro durante verificação:', error);
  }
}

verifyFilterLogic().catch(console.error); 