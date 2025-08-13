export interface SubscriptionAlert {
  id: string;
  tenantId: string;
  type:
    | "trial_ending"
    | "trial_ended"
    | "payment_failed"
    | "subscription_expired"
    | "usage_limit";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  daysRemaining?: number;
  actionRequired: boolean;
}
export declare class SubscriptionMonitorService {
  private emailService;
  private whatsappService;
  private isRunning;
  constructor();
  startMonitoring(): void;
  stopMonitoring(): void;
  private checkTrialSubscriptions;
  private processTrialTenant;
  private handleTrialEnding;
  private handleTrialEnded;
  private checkActiveSubscriptions;
  private processActiveTenant;
  private handleCancellationReminder;
  private handlePastDueSubscription;
  private checkUsageLimits;
  private handleUsageAlert;
  private processFailedPayments;
  private handleFailedPayment;
  private sendDailySummary;
  private sendEmailAlert;
  private sendWhatsAppAlert;
  private formatWhatsAppAlert;
  private createBillingAlert;
  private checkAlertExists;
  getSubscriptionInsights(tenantId: string): Promise<any>;
}
export declare const subscriptionMonitor: SubscriptionMonitorService;
//# sourceMappingURL=subscription-monitor-broken.service.d.ts.map
