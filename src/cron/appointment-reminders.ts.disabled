/**
 * Appointment Reminders Cron Job
 * 
 * Processa lembretes automáticos de agendamentos:
 * - Lembretes 24h antes 
 * - Lembretes 1h antes
 * 
 * Executado a cada 30 minutos para garantir cobertura
 */

import cron from 'node-cron';
import { AppointmentNotificationsService } from '../services/appointment-notifications.service';

export class AppointmentRemindersCron {
  private static instance: AppointmentRemindersCron;
  private notificationService: AppointmentNotificationsService;
  private cronJobs: cron.ScheduledTask[] = [];
  private isRunning = false;

  private constructor() {
    this.notificationService = new AppointmentNotificationsService();
  }

  static getInstance(): AppointmentRemindersCron {
    if (!AppointmentRemindersCron.instance) {
      AppointmentRemindersCron.instance = new AppointmentRemindersCron();
    }
    return AppointmentRemindersCron.instance;
  }

  /**
   * Inicializar os cron jobs de lembretes
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Appointment Reminders Cron já está rodando');
      return;
    }

    try {
      // Executar a cada 30 minutos para capturar lembretes 24h e 1h antes
      const reminderJob = cron.schedule('*/30 * * * *', async () => {
        await this.processReminders();
      }, {
        scheduled: false,
        timezone: 'America/Sao_Paulo'
      });

      this.cronJobs.push(reminderJob);
      reminderJob.start();

      this.isRunning = true;
      console.log('✅ Appointment Reminders Cron iniciado com sucesso');
      console.log('⏰ Executando a cada 30 minutos para lembretes de agendamentos');
      console.log('📧📱 Lembretes: 24h antes (email+SMS) | 1h antes (SMS priority)');

    } catch (error) {
      console.error('❌ Erro ao iniciar Appointment Reminders Cron:', error);
    }
  }

  /**
   * Parar todos os cron jobs
   */
  stop(): void {
    this.cronJobs.forEach(job => {
      job.stop();
      // job.destroy(); // Método não existe no tipo ScheduledTask
    });
    this.cronJobs = [];
    this.isRunning = false;
    console.log('🛑 Appointment Reminders Cron parado');
  }

  /**
   * Processar lembretes automáticos
   */
  private async processReminders(): Promise<void> {
    const startTime = Date.now();
    console.log('🔔 Iniciando processamento de lembretes automáticos...');

    try {
      // Usar o método já implementado no AppointmentNotificationsService
      await this.notificationService.processScheduledReminders();

      const duration = Date.now() - startTime;
      console.log(`✅ Processamento de lembretes concluído em ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Erro no processamento de lembretes (${duration}ms):`, error);
    }
  }

  /**
   * Processar lembretes manualmente (para testes)
   */
  async triggerReminders(): Promise<{ success: boolean; message: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      console.log('🧪 Executando lembretes manualmente...');
      await this.processReminders();
      
      const duration = Date.now() - startTime;
      return {
        success: true,
        message: 'Lembretes processados com sucesso',
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        message: `Erro no processamento: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration
      };
    }
  }

  /**
   * Obter status do cron
   */
  getStatus(): {
    isRunning: boolean;
    activeJobs: number;
    nextExecution?: string;
  } {
    const nextExecution = this.cronJobs.length > 0 
      ? new Date(Date.now() + 30 * 60 * 1000).toISOString() // Próxima execução em 30min
      : undefined;

    return {
      isRunning: this.isRunning,
      activeJobs: this.cronJobs.length,
      nextExecution
    };
  }
}

// Export singleton instance
export const appointmentRemindersCron = AppointmentRemindersCron.getInstance();