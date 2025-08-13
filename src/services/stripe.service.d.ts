import Stripe from "stripe";
export interface PlanConfig {
  id: string;
  name: string;
  priceId: string;
  price: number;
  currency: string;
  interval: "month" | "year";
  features: string[];
  maxConversations: number;
  autoUpgradeTo: string | null;
  overagePrice: number | null;
  trialDays: number;
}
export declare class StripeService {
  private stripe;
  private plans;
  constructor();
  getPlans(): PlanConfig[];
  getPlan(planId: string): PlanConfig | null;
  createCustomer(
    email: string,
    name?: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Customer>;
  createCheckoutSession(
    planId: string,
    customerEmail: string,
    tenantId?: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<Stripe.Checkout.Session>;
  createBillingPortalSession(
    customerId: string,
    returnUrl?: string,
  ): Promise<Stripe.BillingPortal.Session>;
  cancelSubscription(
    subscriptionId: string,
    reason?: string,
  ): Promise<Stripe.Subscription>;
  cancelSubscriptionImmediately(
    subscriptionId: string,
    reason?: string,
  ): Promise<Stripe.Subscription>;
  reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  changeSubscriptionPlan(
    subscriptionId: string,
    newPlanId: string,
  ): Promise<Stripe.Subscription>;
  getSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]>;
  handleWebhook(body: string | Buffer, signature: string): Promise<void>;
  private handleCheckoutCompleted;
  private handleSubscriptionUpdated;
  private handleSubscriptionDeleted;
  private handlePaymentSucceeded;
  private handlePaymentFailed;
}
export declare const stripeService: StripeService;
//# sourceMappingURL=stripe.service.d.ts.map
