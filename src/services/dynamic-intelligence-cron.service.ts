import cron from 'node-cron';
import { dynamicClustering } from './dynamic-clustering.service';
import { behavioralAnalyzer } from './behavioral-analyzer.service';
import { trendDetector } from './trend-detector.service';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Serviço de Cron para Dynamic Intelligence System
 *
 * Executa semanalmente (domingos às 2h):
 * 1. Re-clustering dinâmico
 * 2. Análise comportamental atualizada
 * 3. Detecção de novas tendências
 * 4. Atualização de scores de oportunidade
 *
 * Sistema 100% auto-evolutivo
 */
export class DynamicIntelligenceCronService {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private executionCount = 0;

  /**
   * Inicializa o cron job semanal
   */
  initialize(): void {
    console.log('\n🔄 Inicializando Dynamic Intelligence Cron Service...\n');

    // Executar toda semana domingo às 2h da manhã (horário de Brasília)
    // Cron expression: minuto hora dia mês dia-da-semana
    // 0 2 * * 0 = às 2h de todos os domingos
    const schedule = '0 2 * * 0';

    cron.schedule(schedule, async () => {
      await this.executeWeeklyPipeline();
    }, {
      scheduled: true,
      timezone: 'America/Sao_Paulo'
    });

    console.log('✅ Dynamic Intelligence Cron initialized');
    console.log('📅 Schedule: Domingos às 2h (horário de Brasília)');
    console.log('🔄 Auto-evolução: ATIVA\n');

    // Para desenvolvimento: permitir execução manual
    if (process.env.NODE_ENV === 'development') {
      console.log('💡 [DEV] Para executar manualmente: POST /api/dynamic-intelligence/execute-full-pipeline\n');
    }
  }

  /**
   * Executa o pipeline completo semanal
   */
  async executeWeeklyPipeline(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Pipeline já está em execução. Aguarde...');
      return;
    }

    this.isRunning = true;
    this.executionCount++;
    const startTime = Date.now();

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('🚀 DYNAMIC INTELLIGENCE - WEEKLY AUTO-EVOLUTION');
    console.log(`📅 Execution #${this.executionCount} - ${new Date().toISOString()}`);
    console.log('════════════════════════════════════════════════════════════\n');

    try {
      // 1. Re-clustering dinâmico
      console.log('📊 ETAPA 1/5: Dynamic Re-clustering\n');
      await dynamicClustering.executeClustering();
      console.log('\n✅ Re-clustering concluído\n');

      // Delay entre etapas para não sobrecarregar APIs
      await this.sleep(5000);

      // 2. Análise comportamental atualizada
      console.log('\n🧠 ETAPA 2/5: Behavioral Analysis Update\n');
      await behavioralAnalyzer.analyzeAllClusters();
      console.log('\n✅ Análise comportamental concluída\n');

      await this.sleep(5000);

      // 3. Detecção de tendências
      console.log('\n📈 ETAPA 3/5: Trend Detection\n');
      await trendDetector.executeTrendDetection();
      console.log('\n✅ Detecção de tendências concluída\n');

      await this.sleep(3000);

      // 4. Atualizar scores de oportunidade
      console.log('\n🎯 ETAPA 4/5: Update Opportunity Scores\n');
      const { data: updatedCount, error: scoreError } = await supabase
        .rpc('update_all_cluster_opportunity_scores');

      if (scoreError) {
        console.error('❌ Erro ao atualizar scores:', scoreError);
      } else {
        console.log(`✅ Scores atualizados para ${updatedCount} clusters\n`);
      }

      // 5. Calcular métricas de performance
      console.log('\n📊 ETAPA 5/5: Calculate Performance Metrics\n');
      await this.calculatePerformanceMetrics();
      console.log('\n✅ Métricas de performance calculadas\n');

      // Registro de execução bem-sucedida
      await this.logExecution('success', Date.now() - startTime);

      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

      console.log('════════════════════════════════════════════════════════════');
      console.log('🎉 WEEKLY AUTO-EVOLUTION COMPLETED SUCCESSFULLY!');
      console.log(`⏱️  Duration: ${duration} minutes`);
      console.log(`📊 Execution #${this.executionCount}`);
      console.log('🔄 Next execution: Próximo domingo às 2h');
      console.log('════════════════════════════════════════════════════════════\n');

      this.lastExecution = new Date();

    } catch (error) {
      console.error('\n❌ ERRO NO PIPELINE SEMANAL:', error);
      await this.logExecution('error', Date.now() - startTime, error);

      console.log('════════════════════════════════════════════════════════════');
      console.log('⚠️ WEEKLY AUTO-EVOLUTION FAILED');
      console.log(`📊 Execution #${this.executionCount}`);
      console.log('🔄 Tentará novamente no próximo domingo');
      console.log('════════════════════════════════════════════════════════════\n');

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Calcula métricas de performance para todos os clusters
   */
  private async calculatePerformanceMetrics(): Promise<void> {
    try {
      const { data: clusters, error } = await supabase
        .from('hashtag_clusters_dynamic')
        .select('id, cluster_key')
        .eq('is_active', true);

      if (error || !clusters) {
        console.error('Erro ao buscar clusters:', error);
        return;
      }

      console.log(`   Calculando métricas para ${clusters.length} clusters...\n`);

      for (const cluster of clusters) {
        // Calcular métricas dos últimos 30 dias
        const periodStart = new Date();
        periodStart.setDate(periodStart.getDate() - 30);

        const { data: leads, error: leadsError } = await supabase
          .rpc('execute_sql', {
            query_text: `
              SELECT COUNT(*) as total_leads,
                     SUM(CASE WHEN
                       email IS NOT NULL OR
                       phone IS NOT NULL OR
                       (additional_emails IS NOT NULL AND jsonb_array_length(additional_emails) > 0) OR
                       (additional_phones IS NOT NULL AND jsonb_array_length(additional_phones) > 0)
                     THEN 1 ELSE 0 END) as contactable_leads
              FROM instagram_leads
              WHERE created_at >= '${periodStart.toISOString()}'
            `
          });

        if (leadsError) continue;

        const totalLeads = leads[0]?.total_leads || 0;
        const contactableLeads = leads[0]?.contactable_leads || 0;
        const conversionRate = totalLeads > 0 ? (contactableLeads / totalLeads) * 100 : 0;

        // Inserir ou atualizar métricas
        const metricsData = {
          cluster_id: cluster.id,
          measurement_period: '30d',
          period_start: periodStart.toISOString(),
          period_end: new Date().toISOString(),
          leads_generated: totalLeads,
          qualified_leads: contactableLeads,
          conversion_count: contactableLeads,
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
          trend_vs_previous_period: 'stable'
        };

        await supabase
          .from('cluster_performance_metrics')
          .insert(metricsData);
      }

      console.log(`   ✅ Métricas calculadas para ${clusters.length} clusters\n`);

    } catch (error) {
      console.error('   ❌ Erro ao calcular métricas:', error);
    }
  }

  /**
   * Registra execução no banco para auditoria
   */
  private async logExecution(status: 'success' | 'error', durationMs: number, error?: any): Promise<void> {
    try {
      // Criar tabela de logs se não existir
      await supabase.rpc('execute_sql', {
        query_text: `
          CREATE TABLE IF NOT EXISTS dynamic_intelligence_execution_log (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            execution_number INTEGER NOT NULL,
            status TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            error_message TEXT,
            executed_at TIMESTAMP DEFAULT NOW()
          )
        `
      });

      // Inserir log
      await supabase.rpc('execute_sql', {
        query_text: `
          INSERT INTO dynamic_intelligence_execution_log
          (execution_number, status, duration_ms, error_message)
          VALUES (${this.executionCount}, '${status}', ${durationMs}, ${error ? `'${error.message}'` : 'NULL'})
        `
      });

    } catch (logError) {
      console.error('Erro ao registrar log:', logError);
    }
  }

  /**
   * Utilitário para delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retorna status do serviço
   */
  getStatus(): {
    isRunning: boolean;
    lastExecution: Date | null;
    executionCount: number;
    nextExecution: string;
  } {
    return {
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      executionCount: this.executionCount,
      nextExecution: 'Domingos às 2h (America/Sao_Paulo)'
    };
  }
}

// Exportar instância singleton
export const dynamicIntelligenceCron = new DynamicIntelligenceCronService();
