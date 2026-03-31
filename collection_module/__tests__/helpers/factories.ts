/**
 * Test data factories
 *
 * Create mock objects for use in tests.
 * After scaffolding your provider, add provider-specific factories here.
 *
 * See: docs/10-TESTING.md for testing patterns
 */

// ── Generic provider factories ────────────────────────────────────────────────
// TODO: Replace these with your provider's actual data shapes once scaffolded.

export const createMockProviderCustomer = (overrides?: Record<string, any>) => {
  return {
    id: 'cust_test_123',
    email: 'test@example.com',
    name: 'Test Customer',
    metadata: {},
    ...overrides,
  };
};

export const createMockProviderPaymentMethod = (overrides?: Record<string, any>) => {
  return {
    id: 'pm_test_123',
    type: 'card',
    status: 'active',
    metadata: {},
    ...overrides,
  };
};

export const createMockProviderPayment = (overrides?: Record<string, any>) => {
  return {
    id: 'pay_test_123',
    amount: 10000,
    currency: 'ZAR',
    status: 'succeeded',
    metadata: {},
    ...overrides,
  };
};

// ── Root Platform factories ───────────────────────────────────────────────────

export const createMockRootPolicy = (overrides?: any): any => {
  return {
    policy_id: 'policy_test_123',
    policy_number: 'TEST-12345',
    policyholder_id: 'policyholder_test_123',
    start_date: '2024-01-01T00:00:00Z',
    end_date: '2025-01-01T00:00:00Z',
    monthly_premium: 50000,
    currency: 'ZAR',
    billing_frequency: 'monthly',
    billing_day: 1,
    app_data: {},
    ...overrides,
  };
};

export const createMockRootPaymentMethod = (overrides?: any): any => {
  return {
    payment_method_id: 'pm_root_test_123',
    collection_module_key: 'test_collection_module',
    collection_module_definition_id: 'cmd_test_123',
    module: {
      id: 'provider_token_test_123',
      status: 'active',
    },
    ...overrides,
  };
};

export const createMockRootPayment = (overrides?: any): any => {
  return {
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
  };
};
