/**
 * Appointment Notifications Service (Stub)
 *
 * DISABLED: This service has been disabled as part of system optimization.
 * Appointment notifications are now handled through other channels.
 *
 * This stub exists to maintain backwards compatibility with existing agent code.
 */

export class AppointmentNotificationsService {
  constructor() {
    // Stub constructor - no initialization needed
  }

  async sendConfirmation(appointmentId: string): Promise<{success: boolean; message: string}> {
    console.log(`📧 [STUB] Appointment notification skipped for appointment: ${appointmentId}`);
    return {
      success: true,
      message: 'Notification service disabled - notifications handled elsewhere'
    };
  }

  async sendReminder(appointmentId: string): Promise<{success: boolean; message: string}> {
    console.log(`⏰ [STUB] Appointment reminder skipped for appointment: ${appointmentId}`);
    return {
      success: true,
      message: 'Notification service disabled - reminders handled elsewhere'
    };
  }

  async sendCancellation(appointmentId: string): Promise<{success: boolean; message: string}> {
    console.log(`❌ [STUB] Appointment cancellation notification skipped for appointment: ${appointmentId}`);
    return {
      success: true,
      message: 'Notification service disabled - cancellations handled elsewhere'
    };
  }
}
