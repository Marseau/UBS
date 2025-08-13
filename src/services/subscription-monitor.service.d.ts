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
  private isRunning;
  constructor();
  startMonitoring(): void;
  stopMonitoring(): void;
  private checkTrialSubscriptions;
  private processTrial;
  private handleTrialEnding;
  private handleTrialExpired;
  private checkActiveSubscriptions;
  private processActiveSubscription;
  private checkUsageLimits;
  private processUsageLimit;
  private createAlert;
  getAlertsForTenant(tenantId: string): Promise<SubscriptionAlert[]>;
  getHealthSummary(): Promise<any>;
}
export declare const subscriptionMonitor: SubscriptionMonitorService;
//# sourceMappingURL=subscription-monitor.service.d.ts.map
