export declare class EmailService {
  private transporter;
  private isConfigured;
  constructor();
  private initializeTransporter;
  sendAppointmentConfirmation(appointmentId: string): Promise<EmailResult>;
  sendAppointmentReminder(
    appointmentId: string,
    reminderType: "day_before" | "hour_before",
  ): Promise<EmailResult>;
  sendAppointmentCancellation(
    appointmentId: string,
    reason?: string,
  ): Promise<EmailResult>;
  sendWelcomeEmail(userId: string, tenantId: string): Promise<EmailResult>;
  sendDailySummary(tenantId: string, date: string): Promise<EmailResult>;
  scheduleReminders(): Promise<void>;
  private buildConfirmationTemplate;
  private buildReminderTemplate;
  private buildCancellationTemplate;
  private buildWelcomeTemplate;
  private buildDailySummaryTemplate;
  private getAppointmentData;
  private formatBusinessAddress;
  private getStatusColor;
  private getAlertEmoji;
  private buildSubscriptionAlertTemplate;
  private generateICalEvent;
  private logEmailSent;
  sendSubscriptionAlert(tenant: any, alert: any): Promise<EmailResult>;
  isReady(): boolean;
  testConfiguration(): Promise<EmailResult>;
}
export interface EmailResult {
  success: boolean;
  messageId?: string;
  message: string;
}
export default EmailService;
//# sourceMappingURL=email.service.d.ts.map
