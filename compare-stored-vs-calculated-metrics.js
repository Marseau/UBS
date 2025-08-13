#!/usr/bin/env node

/**
 * SCRIPT PARA COMPARAR VALORES ARMAZENADOS vs CALCULADOS
 * Compara os dados da tabela ubs_metric_system com cálculos em tempo real
 * para o mesmo período (30 dias)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU'
);

async function compareStoredVsCalculatedMetrics() {
  console.log('🔍 COMPARAÇÃO: VALORES ARMAZENADOS vs CALCULADOS');
  console.log('='.repeat(80));

  try {
    // 1. BUSCAR TODOS OS TENANTS
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name, domain');

    if (tenantsError) {
      console.error('❌ Erro ao buscar tenants:', tenantsError);
      return;
    }

    // 2. BUSCAR TODOS OS APPOINTMENTS
    const { data: allAppointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*');

    if (appointmentsError) {
      console.error('❌ Erro ao buscar appointments:', appointmentsError);
      return;
    }

    console.log(`📊 Encontrados ${tenants.length} tenants`);
    console.log(`📅 Encontrados ${allAppointments.length} appointments`);

    // 3. DEFINIR PERÍODO ATUAL (30 dias)
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);
    
    const periodStart = thirtyDaysAgo.toISOString().split('T')[0];
    const periodEnd = currentDate.toISOString().split('T')[0];

    console.log(`\n�� PERÍODO DE COMPARAÇÃO:`);
    console.log(`   📅 De: ${periodStart}`);
    console.log(`   📅 Até: ${periodEnd}`);
    console.log(`   ⏱️ Duração: 30 dias`);

    // 4. CALCULAR MÉTRICAS DA PLATAFORMA (30 dias)
    const platformAppointments = allAppointments.filter(app => 
      new Date(app.created_at) >= thirtyDaysAgo
    );

    const platformRevenue = platformAppointments.reduce((sum, app) => sum + (app.final_price || 0), 0);
    const platformCustomers = new Set(platformAppointments.map(a => a.user_id)).size;
    const platformAppointmentsCount = platformAppointments.length;

    console.log(`\n�� MÉTRICAS DA PLATAFORMA (30 dias):`);
    console.log(`   💰 Revenue Total: R$ ${platformRevenue.toFixed(2)}`);
    console.log(`   📅 Appointments: ${platformAppointmentsCount}`);
    console.log(`   👥 Customers: ${platformCustomers}`);

    // 5. COMPARAR CADA TENANT
    for (const tenant of tenants) {
      console.log(`\n�� ${tenant.name} (${tenant.domain}):`);
      console.log(`   🆔 Tenant ID: ${tenant.id}`);

      // 6. CALCULAR MÉTRICAS REAIS DO TENANT (30 dias)
      const tenantAppointments = allAppointments.filter(app => 
        app.tenant_id === tenant.id && 
        new Date(app.created_at) >= thirtyDaysAgo
      );

      const tenantRevenue = tenantAppointments.reduce((sum, app) => sum + (app.final_price || 0), 0);
      const tenantCustomers = new Set(tenantAppointments.map(a => a.user_id)).size;
      const tenantAppointmentsCount = tenantAppointments.length;

      // Calcular métricas de status
      const confirmedAppointments = tenantAppointments.filter(app => app.status === 'confirmed').length;
      const cancelledAppointments = tenantAppointments.filter(app => app.status === 'cancelled').length;
      const completedAppointments = tenantAppointments.filter(app => app.status === 'completed').length;
      const rescheduledAppointments = tenantAppointments.filter(app => app.status === 'rescheduled').length;

      const cancellationRate = tenantAppointmentsCount > 0 ? (cancelledAppointments / tenantAppointmentsCount) * 100 : 0;
      const reschedulingRate = tenantAppointmentsCount > 0 ? (rescheduledAppointments / tenantAppointmentsCount) * 100 : 0;
      const completionRate = tenantAppointmentsCount > 0 ? (completedAppointments / tenantAppointmentsCount) * 100 : 0;

      // Calcular participação percentual
      const revenueParticipationPct = platformRevenue > 0 ? (tenantRevenue / platformRevenue) * 100 : 0;
      const appointmentsParticipationPct = platformAppointmentsCount > 0 ? (tenantAppointmentsCount / platformAppointmentsCount) * 100 : 0;
      const customersParticipationPct = platformCustomers > 0 ? (tenantCustomers / platformCustomers) * 100 : 0;

      // 7. BUSCAR DADOS ARMAZENADOS (30 dias)
      const { data: storedMetrics, error: storedError } = await supabase
        .from('ubs_metric_system')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('period_days', 30)
        .eq('period_start_date', periodStart)
        .eq('period_end_date', periodEnd)
        .order('calculation_date', { ascending: false })
        .limit(1);

      if (storedError) {
        console.error(`   ❌ Erro ao buscar métricas armazenadas:`, storedError);
        continue;
      }

      if (!storedMetrics || storedMetrics.length === 0) {
        console.log(`   ❌ Nenhum dado armazenado encontrado para período ${periodStart} a ${periodEnd}`);
        continue;
      }

      const stored = storedMetrics[0];

      // 8. COMPARAÇÃO DETALHADA
      console.log(`   📋 COMPARAÇÃO DETALHADA:`);
      console.log(`   ┌─────────────────────────────────────────────────────────────┐`);
      console.log(`   │ MÉTRICA                    │ CALCULADO    │ ARMAZENADO     │`);
      console.log(`   ├─────────────────────────────────────────────────────────────┤`);

      // Revenue
      const revenueDiff = Math.abs(tenantRevenue - (stored.tenant_revenue_value || 0));
      const revenueStatus = revenueDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ 💰 Revenue (R$)            │ ${tenantRevenue.toFixed(2).padEnd(11)} │ ${(stored.tenant_revenue_value || 0).toFixed(2).padEnd(13)} │ ${revenueStatus}`);

      // Revenue Participation
      const revenuePctDiff = Math.abs(revenueParticipationPct - (stored.tenant_revenue_participation_pct || 0));
      const revenuePctStatus = revenuePctDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ 💰 Revenue Participation % │ ${revenueParticipationPct.toFixed(2).padEnd(11)} │ ${(stored.tenant_revenue_participation_pct || 0).toFixed(2).padEnd(13)} │ ${revenuePctStatus}`);

      // Appointments
      const appointmentsDiff = Math.abs(tenantAppointmentsCount - (stored.tenant_appointments_count || 0));
      const appointmentsStatus = appointmentsDiff === 0 ? '✅' : '❌';
      console.log(`   │ �� Appointments Count       │ ${tenantAppointmentsCount.toString().padEnd(11)} │ ${(stored.tenant_appointments_count || 0).toString().padEnd(13)} │ ${appointmentsStatus}`);

      // Appointments Participation
      const appointmentsPctDiff = Math.abs(appointmentsParticipationPct - (stored.tenant_appointments_participation_pct || 0));
      const appointmentsPctStatus = appointmentsPctDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ �� Appointments Part. %     │ ${appointmentsParticipationPct.toFixed(2).padEnd(11)} │ ${(stored.tenant_appointments_participation_pct || 0).toFixed(2).padEnd(13)} │ ${appointmentsPctStatus}`);

      // Customers
      const customersDiff = Math.abs(tenantCustomers - (stored.tenant_customers_count || 0));
      const customersStatus = customersDiff === 0 ? '✅' : '❌';
      console.log(`   │ 👥 Customers Count          │ ${tenantCustomers.toString().padEnd(11)} │ ${(stored.tenant_customers_count || 0).toString().padEnd(13)} │ ${customersStatus}`);

      // Customers Participation
      const customersPctDiff = Math.abs(customersParticipationPct - (stored.tenant_customers_participation_pct || 0));
      const customersPctStatus = customersPctDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ 👥 Customers Part. %        │ ${customersParticipationPct.toFixed(2).padEnd(11)} │ ${(stored.tenant_customers_participation_pct || 0).toFixed(2).padEnd(13)} │ ${customersPctStatus}`);

      // Cancellation Rate
      const cancellationDiff = Math.abs(cancellationRate - (stored.tenant_cancellation_rate_pct || 0));
      const cancellationStatus = cancellationDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ ❌ Cancellation Rate %      │ ${cancellationRate.toFixed(2).padEnd(11)} │ ${(stored.tenant_cancellation_rate_pct || 0).toFixed(2).padEnd(13)} │ ${cancellationStatus}`);

      // Completion Rate
      const completionDiff = Math.abs(completionRate - (stored.tenant_completion_rate_pct || 0));
      const completionStatus = completionDiff < 0.01 ? '✅' : '❌';
      console.log(`   │ ✅ Completion Rate %        │ ${completionRate.toFixed(2).padEnd(11)} │ ${(stored.tenant_completion_rate_pct || 0).toFixed(2).padEnd(13)} │ ${completionStatus}`);

      console.log(`   └─────────────────────────────────────────────────────────────┘`);

      // 9. RESUMO DE DIFERENÇAS
      const totalDifferences = [revenueDiff, appointmentsDiff, customersDiff].filter(diff => diff > 0.01).length;
      
      if (totalDifferences > 0) {
        console.log(`   ⚠️ DIFERENÇAS ENCONTRADAS: ${totalDifferences} métricas inconsistentes`);
        
        if (revenueDiff > 0.01) {
          console.log(`      �� Revenue: Diferença de R$ ${revenueDiff.toFixed(2)}`);
        }
        if (appointmentsDiff > 0) {
          console.log(`      📅 Appointments: Diferença de ${appointmentsDiff}`);
        }
        if (customersDiff > 0) {
          console.log(`      �� Customers: Diferença de ${customersDiff}`);
        }
      } else {
        console.log(`   ✅ DADOS CONSISTENTES - Nenhuma diferença significativa encontrada`);
      }

      // 10. INFORMAÇÕES ADICIONAIS
      console.log(`   📝 Data Source: ${stored.data_source || 'N/A'}`);
      console.log(`   📅 Calculation Date: ${stored.calculation_date}`);
      console.log(`   🆔 Record ID: ${stored.id}`);
    }

    console.log(`\n✅ COMPARAÇÃO COMPLETA FINALIZADA`);

  } catch (error) {
    console.error('❌ Erro durante comparação:', error);
  }
}

compareStoredVsCalculatedMetrics(); 