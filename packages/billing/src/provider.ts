import type { PlanId } from './plans';
import { plans } from './plans';

export type BillingProviderId = 'stripe' | 'revenuecat' | 'stub';

export type CheckoutInput = {
  organizationId: string;
  planId: PlanId;
  successUrl?: string;
  cancelUrl?: string;
};

export type BillingProvider = {
  readonly id: BillingProviderId;
  /**
   * Provider-agnostic: return central plan catalog.
   * Provider-specific price IDs live in DB (plans.providerPriceId), not client.
   */
  getPlans(): Promise<Record<PlanId, { id: PlanId; price: number; seats: number }>>;
  getSubscription(organizationId: string): Promise<null | { planId: PlanId; status: string }>;
  createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  cancelSubscription(organizationId: string, opts?: { atPeriodEnd?: boolean }): Promise<{ ok: true }>;
  restoreSubscription(organizationId: string): Promise<{ ok: true }>;
  syncSubscription(organizationId: string): Promise<{ ok: true }>;
  /** Verify webhook signature. Return true if valid; throw/return false otherwise. */
  verifyWebhook?(payload: string, signature: string, secret: string): boolean;
};

class StubProvider implements BillingProvider {
  readonly id: BillingProviderId = 'stub';
  async getPlans(): Promise<Record<PlanId, { id: PlanId; price: number; seats: number }>> {
    return plans as unknown as Record<PlanId, { id: PlanId; price: number; seats: number }>;
  }
  async getSubscription(_organizationId: string): Promise<null | { planId: PlanId; status: string }> {
    return null;
  }
  async createCheckout(_input: CheckoutInput): Promise<{ url: string }> {
    throw new Error('Billing not configured — set BILLING_PROVIDER and provider keys.');
  }
  async cancelSubscription(_organizationId: string): Promise<{ ok: true }> {
    throw new Error('Billing not configured');
  }
  async restoreSubscription(_organizationId: string): Promise<{ ok: true }> {
    throw new Error('Billing not configured');
  }
  async syncSubscription(_organizationId: string): Promise<{ ok: true }> {
    return { ok: true as const };
  }
  verifyWebhook(): boolean {
    return false;
  }
}

/**
 * Factory — mobile and server import this, never the concrete provider.
 * Real providers (StripeProvider, RevenueCatProvider) live behind this seam
 * and are only instantiated server-side when env says so.
 */
let _provider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (_provider) return _provider;
  // Server: choose via env; Mobile: always stub (no secrets in bundle)
  const which = (typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)['BILLING_PROVIDER'] : undefined) as BillingProviderId | undefined;
  if (which === 'stripe' || which === 'revenuecat') {
    // Real providers deferred to 3.9 (webhooks + secrets). Return stub until then to avoid insecure fake webhook.
    _provider = new StubProvider();
    return _provider as BillingProvider;
  }
  _provider = new StubProvider();
  return _provider as BillingProvider;
}

// For tests
export function __resetBillingProvider() {
  _provider = null;
}
