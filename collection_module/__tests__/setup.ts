/// <reference types="jest" />
/**
 * Jest setup file
 * This file runs before all tests
 */

// Mock the env module to prevent tests from using actual provider credentials.
// jest.config.js maps env imports to __tests__/fixtures/env.fixture.ts, and
// this mock overrides those values with explicit test fixtures.
jest.mock('../code/env', () => ({
  NODE_ENV: 'sandbox',

  // Payment Provider Configuration
  PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE: 'test_webhook_secret_live',
  PROVIDER_WEBHOOK_SIGNING_SECRET_TEST: 'test_webhook_secret_sandbox',
  PROVIDER_PRODUCT_ID_LIVE: 'test_product_id_live',
  PROVIDER_PRODUCT_ID_TEST: 'test_product_id_sandbox',
  PROVIDER_PUBLISHABLE_KEY_LIVE: 'test_publishable_key_live',
  PROVIDER_PUBLISHABLE_KEY_TEST: 'test_publishable_key_sandbox',
  PROVIDER_SECRET_KEY_LIVE: 'test_secret_key_live',
  PROVIDER_SECRET_KEY_TEST: 'test_secret_key_sandbox',
  PROVIDER_MERCHANT_ACCOUNT_LIVE: 'TestMerchantLive',
  PROVIDER_MERCHANT_ACCOUNT_TEST: 'TestMerchantSandbox',

  // Root Platform Configuration
  ROOT_COLLECTION_MODULE_KEY: 'test_collection_module',
  ROOT_API_KEY_LIVE: 'production_test_api_key',
  ROOT_API_KEY_SANDBOX: 'sandbox_test_api_key',
  ROOT_BASE_URL_LIVE: 'https://api.rootplatform.com/v1/insurance',
  ROOT_BASE_URL_SANDBOX: 'https://sandbox.rootplatform.com/v1/insurance',

  // Optional Configuration
  TIME_DELAY_IN_MILLISECONDS: '10000',
}));

// Set up test environment variables
process.env.ENVIRONMENT = 'sandbox';
process.env.NODE_ENV = 'test';
process.env.ROOT_COLLECTION_MODULE_KEY = 'test_collection_module';
