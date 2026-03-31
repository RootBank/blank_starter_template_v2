/**
 * Test data factories
 *
 * Create realistic mock objects for use in tests.
 * All factories accept `overrides` so individual tests can customise fields.
 *
 * After scaffolding your provider:
 *   1. Replace createMockProvider* shapes with your actual API response shapes
 *   2. Add a createMockWebhookEvent() variant for each event type you handle
 *
 * See: docs/10-TESTING.md for testing patterns
 */

// ── Root Platform factories ───────────────────────────────────────────────────

export const createMockRootPolicy = (overrides?: Partial<{
  policy_id: string;
  policy_number: string;
  policyholder_id: string;
  start_date: string;
  end_date: string;
  monthly_premium: number;
  currency: string;
  billing_frequency: string;
  billing_day: number;
  status: string;
  app_data: Record<string, any>;
}>): any => ({
  policy_id: 'policy_test_123',
  policy_number: 'TEST-12345',
  policyholder_id: 'policyholder_test_123',
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2025-01-01T00:00:00Z',
  monthly_premium: 50000,
  currency: 'ZAR',
  billing_frequency: 'monthly',
  billing_day: 1,
  status: 'active',
  app_data: {},
  ...overrides,
});

export const createMockRootPaymentMethod = (overrides?: Partial<{
  payment_method_id: string;
  collection_module_key: string;
  collection_module_definition_id: string;
  module: Record<string, any>;
}>): any => ({
  payment_method_id: 'pm_root_test_123',
  collection_module_key: 'test_collection_module',
  collection_module_definition_id: 'cmd_test_123',
  module: {
    id: 'provider_token_test_123',
    status: 'active',
  },
  ...overrides,
});

export const createMockRootPayment = (overrides?: Partial<{
  payment_id: string;
  policy_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  payment_date: string;
  description: string;
  external_reference: string;
}>): any => ({
  payment_id: 'payment_test_123',
  policy_id: 'policy_test_123',
  amount: 50000,
  currency: 'ZAR',
  status: 'pending',
  payment_type: 'premium',
  payment_date: '2024-01-01T00:00:00Z',
  description: 'Test payment',
  external_reference: 'ext_ref_123',
  ...overrides,
});

// ── Generic provider factories ────────────────────────────────────────────────
// TODO: Replace these with your provider's actual API response shapes.
// Field names should match exactly what the provider API returns.

export const createMockProviderCustomer = (overrides?: Record<string, any>) => ({
  id: 'cust_test_123',
  email: 'test@example.com',
  name: 'Test Customer',
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockProviderPaymentMethod = (overrides?: Record<string, any>) => ({
  id: 'pm_test_123',
  type: 'card',
  status: 'active',
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockProviderPayment = (overrides?: Record<string, any>) => ({
  id: 'pay_test_123',
  amount: 10000,
  currency: 'ZAR',
  status: 'pending',
  description: 'Monthly premium',
  metadata: {},
  created_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

// ── Webhook event factories ───────────────────────────────────────────────────
// TODO: Replace event shapes with your provider's actual webhook payload format.
// These are used with createMockWebhookRequest() from test-helpers.ts.

/**
 * Generic webhook event factory.
 * Replace `type` and `data` with your provider's actual event structure.
 *
 * Example (GoCardless):
 *   createMockWebhookEvent('payment.paid_out', { links: { payment: 'pay_123' } })
 *
 * Example (Stripe):
 *   createMockWebhookEvent('invoice.paid', { data: { object: { id: 'in_123' } } })
 */
export const createMockWebhookEvent = (
  type: string,
  data: Record<string, any> = {},
  overrides?: Record<string, any>
) => ({
  id: `evt_test_${Date.now()}`,
  type,
  created: Math.floor(Date.now() / 1000),
  data,
  ...overrides,
});
