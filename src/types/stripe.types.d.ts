export interface StripeCustomer {
  id: string;
  email: string;
  name?: string;
  created: number;
  metadata: Record<string, string>;
}
export interface StripeSubscription {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  current_period_start: number;
  current_period_end: number;
  trial_start?: number;
  trial_end?: number;
  cancel_at_period_end: boolean;
  canceled_at?: number;
  metadata: Record<string, string>;
}
export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer?: string;
  subscription?: string;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  metadata: Record<string, string>;
}
export interface StripeBillingPortalSession {
  id: string;
  url: string;
  customer: string;
  return_url?: string;
}
export interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: "draft" | "open" | "paid" | "uncollectible" | "void";
  hosted_invoice_url?: string;
  invoice_pdf?: string;
}
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
}
export interface PlanFeature {
  name: string;
  description?: string;
  included: boolean;
  limit?: number;
}
export interface PlanLimits {
  maxConversations: number;
  autoUpgradeTo: string | null;
  overagePrice: number | null;
  maxUsers?: number;
  maxIntegrations?: number;
  storageGB?: number;
}
export interface Plan {
  id: string;
  name: string;
  description: string;
  stripePriceId: string;
  price: number;
  currency: string;
  interval: "month" | "year";
  trialDays: number;
  features: PlanFeature[];
  limits: PlanLimits;
  popular?: boolean;
  metadata?: Record<string, string>;
}
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "canceled"
  | "unpaid";
export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "canceled"
  | "refunded";
export interface SubscriptionRecord {
  id: string;
  tenant_id: string;
  stripe_subscription_id: string;
  status: string;
  plan_id: string;
  created_at: string;
  updated_at: string;
}
export interface SubscriptionInsert {
  tenant_id: string;
  stripe_subscription_id: string;
  status: string;
  plan_id: string;
}
export interface SubscriptionUpdate {
  status?: string;
  plan_id?: string;
  updated_at?: string;
}
export interface PaymentHistoryRecord {
  id: string;
  tenant_id: string;
  amount: number;
  status: string;
  created_at: string;
}
export interface PaymentHistoryInsert {
  tenant_id: string;
  amount: number;
  status: string;
}
export interface CreateCheckoutRequest {
  planId: string;
  email: string;
  tenantId?: string;
  successUrl?: string;
  cancelUrl?: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}
export interface CreateCheckoutResponse {
  success: boolean;
  sessionId?: string;
  url?: string;
  message?: string;
}
export interface CreateCustomerRequest {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}
export interface CreateCustomerResponse {
  success: boolean;
  customer?: {
    id: string;
    email: string;
    name?: string;
  };
  message?: string;
}
export interface CreatePortalRequest {
  returnUrl?: string;
}
export interface CreatePortalResponse {
  success: boolean;
  url?: string;
  message?: string;
}
export interface CancelSubscriptionRequest {
  reason?: string;
  immediately?: boolean;
}
export interface CancelSubscriptionResponse {
  success: boolean;
  subscription?: {
    id: string;
    status: SubscriptionStatus;
    cancel_at_period_end: boolean;
    current_period_end: number;
  };
  message?: string;
}
export interface ChangePlanRequest {
  newPlanId: string;
  prorationBehavior?: "always_invoice" | "create_prorations" | "none";
}
export interface ChangePlanResponse {
  success: boolean;
  subscription?: {
    id: string;
    status: SubscriptionStatus;
    plan: Plan;
  };
  message?: string;
}
export interface GetSubscriptionResponse {
  success: boolean;
  tenant?: {
    subscription_id?: string;
    stripe_customer_id?: string;
    plan_id?: string;
    subscription_status?: SubscriptionStatus;
    trial_ends_at?: string;
    cancel_at_period_end?: boolean;
    cancellation_reason?: string;
    canceled_at?: string;
  };
  subscription?: {
    id: string;
    status: SubscriptionStatus;
    current_period_start: number;
    current_period_end: number;
    trial_end?: number;
    cancel_at_period_end: boolean;
    canceled_at?: number;
  };
  plan?: Plan;
  message?: string;
}
export interface GetPaymentHistoryResponse {
  success: boolean;
  payments?: PaymentHistoryRecord[];
  message?: string;
}
export interface BillingDashboardData {
  subscription?: {
    id: string;
    status: SubscriptionStatus;
    plan: Plan;
    current_period_start: string;
    current_period_end: string;
    trial_end?: string;
    cancel_at_period_end: boolean;
    canceled_at?: string;
  };
  usage: {
    messages: {
      current: number;
      limit: number;
      percentage: number;
    };
    numbers: {
      current: number;
      limit: number;
      percentage: number;
    };
    period: {
      start: string;
      end: string;
    };
  };
  nextPayment?: {
    amount: number;
    currency: string;
    date: string;
  };
  paymentHistory: PaymentHistoryRecord[];
  upcomingInvoice?: {
    id: string;
    amount: number;
    currency: string;
    due_date: string;
  };
}
export interface WebhookCheckoutCompleted {
  id: string;
  customer: string;
  subscription: string;
  metadata: {
    plan_id: string;
    tenant_id: string;
  };
}
export interface WebhookSubscriptionUpdated {
  id: string;
  customer: string;
  status: SubscriptionStatus;
  current_period_start: number;
  current_period_end: number;
  trial_end?: number;
  cancel_at_period_end: boolean;
  canceled_at?: number;
  metadata: Record<string, string>;
}
export interface WebhookInvoicePaymentSucceeded {
  id: string;
  customer: string;
  subscription: string;
  amount_paid: number;
  currency: string;
  status: "paid";
  paid_at: number;
}
export interface WebhookInvoicePaymentFailed {
  id: string;
  customer: string;
  subscription: string;
  amount_due: number;
  currency: string;
  status: "open";
  attempt_count: number;
}
export interface UsageMetrics {
  messagesUsed: number;
  messagesLimit: number;
  numbersUsed: number;
  numbersLimit: number;
  periodStart: string;
  periodEnd: string;
}
export interface BillingAlert {
  type:
    | "usage_warning"
    | "usage_limit"
    | "payment_failed"
    | "trial_ending"
    | "subscription_canceled";
  title: string;
  message: string;
  severity: "info" | "warning" | "error";
  actionUrl?: string;
  actionText?: string;
}
export declare const CANCELLATION_REASONS: {
  readonly USER_REQUESTED: "user_requested";
  readonly PAYMENT_FAILED: "payment_failed";
  readonly TRIAL_ENDED: "trial_ended";
  readonly BUSINESS_CLOSED: "business_closed";
  readonly SWITCHING_PROVIDER: "switching_provider";
  readonly TOO_EXPENSIVE: "too_expensive";
  readonly NOT_USING: "not_using";
  readonly MISSING_FEATURES: "missing_features";
  readonly TECHNICAL_ISSUES: "technical_issues";
  readonly OTHER: "other";
};
export type CancellationReason =
  (typeof CANCELLATION_REASONS)[keyof typeof CANCELLATION_REASONS];
export interface CancellationFeedback {
  reason: CancellationReason;
  feedback?: string;
  suggestions?: string;
  wouldRecommend?: boolean;
  likelyToReturn?: boolean;
}
export interface PlanComparison {
  starter: Plan;
  professional: Plan;
  enterprise: Plan;
  currentPlan?: string;
  recommendedPlan?: string;
}
export interface BillingUtils {
  formatPrice: (amount: number, currency: string) => string;
  formatDate: (timestamp: number | string) => string;
  calculateUsagePercentage: (used: number, limit: number) => number;
  getDaysUntilPeriodEnd: (periodEnd: number | string) => number;
  getTrialDaysRemaining: (trialEnd: number | string) => number;
  isTrialActive: (trialEnd?: number | string) => boolean;
  isSubscriptionActive: (status: SubscriptionStatus) => boolean;
  canUpgrade: (currentPlan: string, targetPlan: string) => boolean;
  canDowngrade: (currentPlan: string, targetPlan: string) => boolean;
}
//# sourceMappingURL=stripe.types.d.ts.map
