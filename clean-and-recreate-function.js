#!/usr/bin/env node

/**
 * SCRIPT PARA LIMPAR E RECRIAR FUNÇÃO COMPLETAMENTE
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qsdfyffuonywmtnlycri.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZGZ5ZmZ1b255d210bmx5Y3JpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEyNjQ3OCwiZXhwIjoyMDY2NzAyNDc4fQ.x_V9gwALfFJsgDq47uAjCBBfT5vHfBN3_ht-lm6C9iU'
);

async function cleanAndRecreateFunction() {
  console.log('🧹 LIMPANDO E RECRIANDO FUNÇÃO COMPLETAMENTE');
  console.log('='.repeat(60));
  
  try {
    // SQL para LIMPAR e RECRIAR completamente
    const cleanAndRecreateSQL = `
      -- ================================================================================
      -- LIMPAR E RECRIAR FUNÇÃO COMPLETAMENTE
      -- ================================================================================
      
      -- 1. REMOVER TODAS AS VERSÕES DA FUNÇÃO
      DROP FUNCTION IF EXISTS calculate_ubs_metrics_system(DATE, INTEGER, UUID);
      DROP FUNCTION IF EXISTS calculate_ubs_metrics_system(DATE, INTEGER);
      DROP FUNCTION IF EXISTS calculate_ubs_metrics_system(DATE);
      DROP FUNCTION IF EXISTS calculate_ubs_metrics_system();
      
      -- 2. LIMPAR DADOS DA TABELA (opcional)
      DELETE FROM ubs_metric_system WHERE data_source LIKE 'cron_job_calculation%';
      
      -- 3. CRIAR FUNÇÃO NOVA E LIMPA
      CREATE FUNCTION calculate_ubs_metrics_system(
          p_calculation_date DATE DEFAULT CURRENT_DATE,
          p_period_days INTEGER DEFAULT 30,
          p_tenant_id UUID DEFAULT NULL
      )
      RETURNS JSON
      LANGUAGE plpgsql
      AS $$
      DECLARE
          v_start_date DATE;
          v_end_date DATE;
          v_tenant_record RECORD;
          v_total_revenue DECIMAL;
          v_total_appointments INTEGER;
          v_total_customers INTEGER;
          v_total_ai_interactions INTEGER;
          v_platform_mrr DECIMAL;
          v_active_tenants_count INTEGER;
          v_processed_count INTEGER := 0;
          v_execution_start TIMESTAMP := clock_timestamp();
          v_result JSON;
      BEGIN
          -- Calcular datas do período
          v_end_date := p_calculation_date;
          v_start_date := p_calculation_date - INTERVAL '1 day' * p_period_days;
          
          RAISE NOTICE 'FUNÇÃO NOVA E LIMPA - Calculando para período % a % (% dias)', v_start_date, v_end_date, p_period_days;
          
          -- LIMPAR DADOS EXISTENTES
          DELETE FROM ubs_metric_system 
          WHERE calculation_date = p_calculation_date 
            AND period_days = p_period_days
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
          
          -- 1. CALCULAR TOTAIS DA PLATAFORMA - LÓGICA CORRETA
          -- Revenue: CORRETO - usa COALESCE para cada appointment
          SELECT COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0)
          INTO v_total_revenue
          FROM appointments 
          WHERE DATE(created_at) >= v_start_date 
            AND DATE(created_at) <= v_end_date
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
          
          -- Appointments: todos
          SELECT COUNT(*)
          INTO v_total_appointments
          FROM appointments 
          WHERE DATE(created_at) >= v_start_date 
            AND DATE(created_at) <= v_end_date
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
          
          -- Customers: únicos
          SELECT COUNT(DISTINCT user_id)
          INTO v_total_customers
          FROM appointments 
          WHERE DATE(created_at) >= v_start_date 
            AND DATE(created_at) <= v_end_date
            AND user_id IS NOT NULL
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
          
          -- Calcular total de IA interações
          SELECT COUNT(*)
          INTO v_total_ai_interactions
          FROM conversation_history 
          WHERE DATE(created_at) >= v_start_date 
            AND DATE(created_at) <= v_end_date
            AND is_from_user = false
            AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
          
          -- Calcular tenants ativos e MRR
          SELECT COUNT(DISTINCT tenant_id)
          INTO v_active_tenants_count
          FROM appointments 
          WHERE DATE(created_at) >= v_start_date 
            AND DATE(created_at) <= v_end_date;
            
          v_platform_mrr := v_active_tenants_count * 79.90;
          
          RAISE NOTICE 'FUNÇÃO NOVA - Totais: Revenue=%, Appointments=%, Customers=%, AI=%, MRR=%', 
              v_total_revenue, v_total_appointments, v_total_customers, v_total_ai_interactions, v_platform_mrr;
          
          -- 2. PROCESSAR CADA TENANT
          FOR v_tenant_record IN 
              SELECT t.id, t.business_name 
              FROM tenants t
              WHERE (p_tenant_id IS NULL OR t.id = p_tenant_id)
              ORDER BY t.business_name
          LOOP
              DECLARE
                  v_tenant_revenue DECIMAL;
                  v_tenant_appointments INTEGER;
                  v_tenant_customers INTEGER;
                  v_tenant_confirmed INTEGER;
                  v_tenant_cancelled INTEGER;
                  v_tenant_completed INTEGER;
                  v_tenant_rescheduled INTEGER;
                  v_tenant_ai_interactions INTEGER;
                  v_revenue_participation DECIMAL;
                  v_appointments_participation DECIMAL;
                  v_customers_participation DECIMAL;
                  v_ai_participation DECIMAL;
                  v_health_score INTEGER;
                  v_risk_level TEXT;
              BEGIN
                  -- Revenue do tenant: CORRETO - usa COALESCE
                  SELECT COALESCE(SUM(COALESCE(final_price, quoted_price, 0)), 0)
                  INTO v_tenant_revenue
                  FROM appointments 
                  WHERE tenant_id = v_tenant_record.id
                    AND DATE(created_at) >= v_start_date 
                    AND DATE(created_at) <= v_end_date;
                  
                  -- Appointments do tenant: todos
                  SELECT COUNT(*)
                  INTO v_tenant_appointments
                  FROM appointments 
                  WHERE tenant_id = v_tenant_record.id
                    AND DATE(created_at) >= v_start_date 
                    AND DATE(created_at) <= v_end_date;
                  
                  -- Customers do tenant: únicos
                  SELECT COUNT(DISTINCT user_id)
                  INTO v_tenant_customers
                  FROM appointments 
                  WHERE tenant_id = v_tenant_record.id
                    AND DATE(created_at) >= v_start_date 
                    AND DATE(created_at) <= v_end_date
                    AND user_id IS NOT NULL;
                  
                  -- Status breakdown do tenant
                  SELECT 
                      COUNT(CASE WHEN status = 'confirmed' THEN 1 END),
                      COUNT(CASE WHEN status = 'cancelled' THEN 1 END),
                      COUNT(CASE WHEN status = 'completed' THEN 1 END),
                      COUNT(CASE WHEN status = 'rescheduled' THEN 1 END)
                  INTO v_tenant_confirmed, v_tenant_cancelled, v_tenant_completed, v_tenant_rescheduled
                  FROM appointments 
                  WHERE tenant_id = v_tenant_record.id
                    AND DATE(created_at) >= v_start_date 
                    AND DATE(created_at) <= v_end_date;
                  
                  -- Calcular IA interações do tenant
                  SELECT COUNT(*)
                  INTO v_tenant_ai_interactions
                  FROM conversation_history 
                  WHERE tenant_id = v_tenant_record.id
                    AND DATE(created_at) >= v_start_date 
                    AND DATE(created_at) <= v_end_date
                    AND is_from_user = false;
                  
                  -- Calcular participações percentuais
                  v_revenue_participation := 
                      CASE WHEN v_total_revenue > 0 
                           THEN (v_tenant_revenue / v_total_revenue) * 100 
                           ELSE 0 END;
                           
                  v_appointments_participation := 
                      CASE WHEN v_total_appointments > 0 
                           THEN (v_tenant_appointments::DECIMAL / v_total_appointments) * 100 
                           ELSE 0 END;
                           
                  v_customers_participation := 
                      CASE WHEN v_total_customers > 0 
                           THEN (v_tenant_customers::DECIMAL / v_total_customers) * 100 
                           ELSE 0 END;
                           
                  v_ai_participation := 
                      CASE WHEN v_total_ai_interactions > 0 
                           THEN (v_tenant_ai_interactions::DECIMAL / v_total_ai_interactions) * 100 
                           ELSE 0 END;
                  
                  -- Calcular health score
                  v_health_score := ROUND(
                      (v_revenue_participation * 0.4) + 
                      (v_appointments_participation * 0.3) + 
                      (v_customers_participation * 0.2) + 
                      (v_ai_participation * 0.1)
                  );
                  
                  -- Determinar risk level
                  v_risk_level := 
                      CASE WHEN v_health_score >= 70 THEN 'Low'
                           WHEN v_health_score >= 40 THEN 'Medium'
                           ELSE 'High' END;
                  
                  -- Inserir na tabela ubs_metric_system
                  INSERT INTO ubs_metric_system (
                      tenant_id, calculation_date, period_days, period_start_date, period_end_date,
                      tenant_revenue_value, tenant_revenue_participation_pct, tenant_revenue_trend, platform_total_revenue,
                      tenant_appointments_count, tenant_appointments_participation_pct, 
                      tenant_appointments_confirmed, tenant_appointments_cancelled, 
                      tenant_appointments_completed, tenant_appointments_rescheduled, platform_total_appointments,
                      tenant_customers_count, tenant_customers_participation_pct, platform_total_customers,
                      tenant_ai_interactions, tenant_ai_participation_pct, platform_total_ai_interactions,
                      platform_mrr, platform_active_tenants,
                      tenant_health_score, tenant_risk_level, tenant_ranking_position,
                      data_source, notes
                  ) VALUES (
                      v_tenant_record.id, p_calculation_date, p_period_days, v_start_date, v_end_date,
                      v_tenant_revenue, v_revenue_participation, 
                      CASE WHEN v_revenue_participation > 5 THEN 'growing'
                           WHEN v_revenue_participation < 2 THEN 'declining'
                           ELSE 'stable' END, 
                      v_total_revenue,
                      v_tenant_appointments, v_appointments_participation,
                      v_tenant_confirmed, v_tenant_cancelled, v_tenant_completed, v_tenant_rescheduled, v_total_appointments,
                      v_tenant_customers, v_customers_participation, v_total_customers,
                      v_tenant_ai_interactions, v_ai_participation, v_total_ai_interactions,
                      v_platform_mrr, v_active_tenants_count,
                      v_health_score, v_risk_level, 0,
                      'cron_job_calculation_clean_recreate',
                      format('CLEAN RECREATE calculation on %s - Function completely rebuilt', clock_timestamp())
                  );
                  
                  v_processed_count := v_processed_count + 1;
                  
                  RAISE NOTICE 'FUNÇÃO NOVA - Processado %: Revenue=%, Appointments=%', 
                      v_tenant_record.business_name, v_tenant_revenue, v_tenant_appointments;
              END;
          END LOOP;
          
          -- Retornar resultado
          v_result := json_build_object(
              'success', true,
              'processed_tenants', v_processed_count,
              'calculation_date', p_calculation_date,
              'period_days', p_period_days,
              'platform_totals', json_build_object(
                  'total_revenue', v_total_revenue,
                  'total_appointments', v_total_appointments,
                  'total_customers', v_total_customers,
                  'total_ai_interactions', v_total_ai_interactions,
                  'platform_mrr', v_platform_mrr
              ),
              'execution_time_ms', EXTRACT(MILLISECONDS FROM clock_timestamp() - v_execution_start)
          );
          
          RAISE NOTICE 'FUNÇÃO NOVA - Cálculo concluído: % tenants processados', v_processed_count;
          
          RETURN v_result;
          
      EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'ERRO na FUNÇÃO NOVA: % - %', SQLSTATE, SQLERRM;
          RETURN json_build_object(
              'success', false,
              'error', SQLERRM,
              'processed_tenants', v_processed_count
          );
      END;
      $$;
    `;
    
    console.log('📋 SQL para LIMPAR e RECRIAR completamente:');
    console.log('='.repeat(80));
    console.log(cleanAndRecreateSQL);
    console.log('='.repeat(80));
    
    console.log('\n INSTRUÇÕES:');
    console.log('1. Copie o SQL acima');
    console.log('2. Vá para Supabase Dashboard → SQL Editor');
    console.log('3. Cole o SQL e execute');
    console.log('4. Aguarde alguns segundos');
    console.log('5. Execute: node test-function-after-fix.js');
    
    console.log('\n O QUE ESTE SQL FAZ:');
    console.log('✅ Remove TODAS as versões da função');
    console.log('✅ Limpa dados antigos da tabela');
    console.log('✅ Cria função NOVA e LIMPA');
    console.log('✅ Usa lógica CORRETA (COALESCE)');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

cleanAndRecreateFunction().catch(console.error);