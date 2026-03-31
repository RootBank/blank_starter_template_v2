/**
 * Test Helpers
 *
 * Centralized mock factories for use across tests.
 * After scaffolding your provider, add a createMockProviderClient() helper here.
 *
 * See: docs/10-TESTING.md for testing patterns
 */

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
 * Create a mock ConfigService
 * Uses provider-agnostic keys matching ConfigurationService.get() calls.
 *
 * TODO: After scaffolding, extend this with any provider-specific config keys
 * your service reads via config.get('providerXxx').
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
        rootApiKey: 'test_root_key',
        rootBaseUrl: 'https://sandbox.rootplatform.com/v1/insurance',
        rootCollectionModuleKey: 'cm_test',
      };
      return config[key] || null;
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

/**
 * Create a mock provider client
 *
 * TODO: Replace this stub with a mock that matches your generated provider client.
 * For an SDK-based provider:
 *   return { sdk: { customers: { create: jest.fn() }, ... } };
 * For an HTTP-based provider:
 *   return { post: jest.fn(), get: jest.fn(), verifyWebhookSignature: jest.fn() };
 */
export function createMockProviderClient() {
  return {
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
  };
}
