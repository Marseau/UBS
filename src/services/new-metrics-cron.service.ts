import cron from "node-cron";
import { conversationLogger } from "../utils/logger";
import { MetricsPopulationService } from "./metrics-population.service";
import { MetricsPeriod } from "./metrics-analysis.service";

export class NewMetricsCronService {
  private populationService: MetricsPopulationService;
  private isRunning: boolean = false;
  private logger = conversationLogger('new-metrics-cron');

  constructor() {
    this.populationService = new MetricsPopulationService();
  }

  /**
   * Inicia o agendamento diário às 03:00h
   */
  start(): void {
    // Agendar para 03:00h todos os dias (horário do servidor)
    cron.schedule(
      "0 3 * * *",
      async () => {
        if (this.isRunning) {
          this.logger.warn(
            "Cron job de métricas já está executando, pulando esta execução", {
            service: 'new-metrics-cron',
            method: 'start',
            operationType: 'cron_execution'
          });
          return;
        }

        try {
          this.isRunning = true;
          this.logger.conversation("Iniciando cron job de métricas diário às 03:00h", {
            service: 'new-metrics-cron',
            method: 'start',
            operationType: 'cron_start'
          });

          const startTime = Date.now();

          // Executar população de todas as métricas
          const results = await this.populationService.populateAllTenantMetrics(
            MetricsPeriod.THIRTY_DAYS,
          );

          const duration = Date.now() - startTime;
          this.logger.conversation(`Cron job de métricas concluído em ${duration}ms`, {
            service: 'new-metrics-cron',
            method: 'start',
            operationType: 'cron_complete',
            duration
          });
        } catch (error) {
          this.logger.conversationError(error as Error, {
            service: 'new-metrics-cron',
            method: 'start',
            operationType: 'cron_error'
          });

          // Tentar notificar sobre o erro (implementar notificação se necessário)
          await this.notifyError(error);
        } finally {
          this.isRunning = false;
        }
      },
      {
        timezone: "America/Sao_Paulo", // Horário de Brasília
      },
    );

    this.logger.conversation(
      "Cron job de métricas agendado para 03:00h diário (horário de Brasília)", {
      service: 'new-metrics-cron',
      method: 'start',
      operationType: 'cron_scheduled'
    });
  }

  /**
   * Para o agendamento
   */
  stop(): void {
    cron.getTasks().forEach((task) => {
      task.stop();
    });
    this.logger.conversation("Cron jobs de métricas parados", {
      service: 'new-metrics-cron',
      method: 'stop',
      operationType: 'cron_stopped'
    });
  }

  /**
   * Execução manual do job (para testes)
   */
  async runManually(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Cron job já está executando");
    }

    try {
      this.isRunning = true;
      this.logger.conversation("Executando cron job de métricas manualmente", {
        service: 'new-metrics-cron',
        method: 'runManually',
        operationType: 'manual_execution'
      });

      const startTime = Date.now();

      const results = await this.populationService.populateAllTenantMetrics(
        MetricsPeriod.THIRTY_DAYS,
      );

      const duration = Date.now() - startTime;
      this.logger.conversation(`Execução manual concluída em ${duration}ms`, {
        service: 'new-metrics-cron',
        method: 'runManually',
        operationType: 'manual_complete',
        duration
      });
    } catch (error) {
      this.logger.conversationError(error as Error, {
        service: 'new-metrics-cron',
        method: 'runManually',
        operationType: 'manual_error'
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Verifica status do cron job
   */
  getStatus(): {
    isRunning: boolean;
    scheduledTasks: number;
    nextExecution: string | null;
  } {
    const tasks = cron.getTasks();
    const taskArray = Array.from(tasks.values());

    let nextExecution: string | null = null;
    if (taskArray.length > 0) {
      // Próxima execução às 03:00h do dia seguinte
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(3, 0, 0, 0);
      nextExecution = tomorrow.toISOString();
    }

    return {
      isRunning: this.isRunning,
      scheduledTasks: taskArray.length,
      nextExecution,
    };
  }

  /**
   * Notifica sobre erros críticos (implementar conforme necessário)
   */
  private async notifyError(error: any): Promise<void> {
    // TODO: Implementar notificação por email, Slack, webhook, etc.
    this.logger.conversationError(error, {
      service: 'new-metrics-cron',
      method: 'notifyError',
      operationType: 'critical_error_notification'
    });

    // Exemplo de implementação futura:
    // await emailService.sendCriticalAlert('Erro no cron job de métricas', error);
    // await slackService.sendAlert('🚨 Erro crítico no sistema de métricas');
  }

  /**
   * Validação de saúde do sistema de métricas
   */
  async healthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    lastExecution: string | null;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Verificar se as tabelas existem e têm dados recentes
      const { supabase } = require("../config/database");
      const { data: recentMetrics, error } = await supabase
        .from("platform_metrics")
        .select("calculation_date")
        .order("calculation_date", { ascending: false })
        .limit(1);

      if (error) {
        const errorMsg = `Erro ao verificar platform_metrics: ${error.message}`;
        errors.push(errorMsg);
        this.logger.conversationError(new Error(errorMsg), {
          service: 'new-metrics-cron',
          method: 'healthCheck',
          operationType: 'health_check_error'
        });
      }

      let lastExecution: string | null = null;
      if (recentMetrics && recentMetrics.length > 0) {
        lastExecution = recentMetrics[0].calculation_date;

        // Verificar se a última execução foi há mais de 2 dias
        const lastDate = new Date(lastExecution!);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        if (lastDate < twoDaysAgo) {
          errors.push("Última execução de métricas foi há mais de 2 dias");
        }
      } else {
        errors.push("Nenhuma métrica encontrada na tabela platform_metrics");
      }

      return {
        status: errors.length === 0 ? "healthy" : "unhealthy",
        lastExecution,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";
      return {
        status: "unhealthy",
        lastExecution: null,
        errors: [`Erro no health check: ${errorMessage}`],
      };
    }
  }
}
