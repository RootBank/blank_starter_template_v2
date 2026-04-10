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

// ── Adyen provider factories ─────────────────────────────────────────────────

export const createMockProviderCustomer = (overrides?: Record<string, any>) => ({
  id: 'root_policy_test_123',
  email: 'test@example.com',
  name: 'Test Customer',
  metadata: { root_policy_id: 'policy_test_123' },
  ...overrides,
});

export const createMockProviderPaymentMethod = (overrides?: Record<string, any>) => ({
  id: 'stored_pm_test_123',
  type: 'scheme',
  ...overrides,
});

export const createMockProviderPayment = (overrides?: Record<string, any>) => ({
  pspReference: 'PSP_test_123',
  resultCode: 'Authorised',
  amount: { currency: 'ZAR', value: 50000 },
  merchantReference: 'payment_test_123',
  ...overrides,
});

// ── Adyen webhook event factories ────────────────────────────────────────────

/**
 * Create a mock Adyen webhook notification payload.
 *
 * @param eventCode - Adyen event code (e.g. 'AUTHORISATION', 'CANCELLATION')
 * @param success   - Whether the event was successful ('true'/'false')
 * @param overrides - Override fields on the NotificationRequestItem
 */
export const createMockAdyenNotification = (
  eventCode: string,
  success: string = 'true',
  overrides?: Record<string, any>,
) => ({
  live: 'false',
  notificationItems: [
    {
      NotificationRequestItem: {
        eventCode,
        success,
        pspReference: `PSP_test_${Date.now()}`,
        originalReference: '',
        merchantAccountCode: 'TestMerchant',
        merchantReference: 'payment_test_123',
        amount: { currency: 'ZAR', value: 50000 },
        eventDate: new Date().toISOString(),
        operations: ['CANCEL', 'CAPTURE', 'REFUND'],
        paymentMethod: 'visa',
        reason: '',
        additionalData: { hmacSignature: 'test_signature' },
        ...overrides,
      },
    },
  ],
});

/**
 * Backwards-compatible generic webhook event factory.
 */
export const createMockWebhookEvent = (
  type: string,
  data: Record<string, any> = {},
  overrides?: Record<string, any>
) => createMockAdyenNotification(type, 'true', { ...data, ...overrides });
