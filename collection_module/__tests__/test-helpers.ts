/**
 * Test Helpers
 *
 * Centralized mock factories for use across tests.
 *
 * After scaffolding your provider, extend createMockProviderClient() with
 * the methods your generated client exposes via `client.sdk`.
 *
 * See: docs/10-TESTING.md for testing patterns
 */

// ── Core service mocks ────────────────────────────────────────────────────────

/**
 * Create a mock LogService
 */
export function createMockLogService() {
  return {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    generateCorrelationId: jest.fn().mockReturnValue('test-correlation-id'),
  };
}

/**
 * Create a mock ConfigService.
 * Uses provider-agnostic keys matching ConfigurationService.get() calls.
 *
 * After scaffolding, extend the config map with any provider-specific keys
 * your service reads (e.g. config.get('providerProductId')).
 */
export function createMockConfigService() {
  return {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        environment: 'test',
        providerSecretKey: 'PROVIDER_SECRET_KEY_TEST',
        providerPublishableKey: 'PROVIDER_PUBLISHABLE_KEY_TEST',
        providerWebhookSigningSecret: 'PROVIDER_WEBHOOK_SECRET_TEST',
        providerProductId: 'PROVIDER_PRODUCT_ID_TEST',
        providerMerchantAccount: 'TestMerchantAccount',
        rootApiKey: 'test_root_key',
        rootBaseUrl: 'https://sandbox.rootplatform.com/v1/insurance',
        rootCollectionModuleKey: 'cm_test',
      };
      return config[key] ?? null;
    }),
  };
}

/**
 * Setup mock for config-instance module
 */
export function setupConfigMock() {
  const { getConfigService } = require('../code/services/config-instance');
  getConfigService.mockReturnValue(createMockConfigService());
}

// ── Root client / service mocks ───────────────────────────────────────────────

/**
 * Create a mock Root API client
 */
export function createMockRootClient() {
  return {
    getPolicyById: jest.fn(),
    updatePaymentsAsync: jest.fn(),
    getPolicyPaymentMethod: jest.fn(),
    updatePolicy: jest.fn(),
  };
}

/**
 * Create a mock RootService
 */
export function createMockRootService() {
  return {
    getPolicy: jest.fn(),
    updatePaymentStatus: jest.fn(),
  };
}

// ── Provider client mock ──────────────────────────────────────────────────────

/**
 * Create a mock provider client.
 *
 * The shape of `sdk` depends on your provider type:
 *
 * For HTTP-based providers (BaseHttpClient), mock the HTTP verbs:
 *   sdk: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() }
 *
 * For SDK-based providers, mock the SDK namespace your service calls:
 *   sdk: {
 *     customers: { create: jest.fn(), retrieve: jest.fn() },
 *     payments:  { create: jest.fn(), retrieve: jest.fn() },
 *   }
 *
 * Example (GoCardless SDK):
 *   export function createMockGoCardlessClient() {
 *     return {
 *       sdk: {
 *         customers: { create: jest.fn(), find: jest.fn() },
 *         payments:  { create: jest.fn(), find: jest.fn() },
 *         mandates:  { create: jest.fn(), cancel: jest.fn() },
 *       },
 *       verifyWebhookSignature: jest.fn().mockReturnValue(true),
 *     };
 *   }
 */
export function createMockProviderClient() {
  return {
    sdk: {
      // HTTP verbs (for BaseHttpClient providers)
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };
}

// ── Webhook helpers ───────────────────────────────────────────────────────────

/**
 * Build a raw webhook request object as the Root Platform delivers it.
 *
 * @param eventType - The provider event type string (e.g. 'payment.paid_out')
 * @param payload   - The event body data
 * @param headers   - Additional/override headers (e.g. your provider's signature header)
 */
export function createMockWebhookRequest(
  eventType: string,
  payload: Record<string, any> = {},
  headers: Record<string, string> = {}
) {
  const body = JSON.stringify({ type: eventType, ...payload });
  return {
    request: {
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: Buffer.from(body),
    },
  };
}
