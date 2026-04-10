/**
 * Environment Configuration Sample
 *
 * Copy this file to env.ts and fill in your actual values:
 *   cp code/env.sample.ts code/env.ts
 *
 * OR run the setup script (recommended):
 *   node ../scripts/setup.js --cm-key=cm_yourprovider_yourco --org-id=xxx
 *
 * IMPORTANT: Never commit env.ts to version control!
 * It is already listed in .gitignore.
 *
 * Variable names use the PROVIDER_* prefix so they work with any provider.
 * After scaffolding, fill these in with your actual provider credentials.
 */

// ============================================================================
// ENVIRONMENT
// ============================================================================
export const NODE_ENV = 'sandbox';

// ============================================================================
// PAYMENT PROVIDER CONFIGURATION
// Replace these placeholders with your actual provider credentials.
// ============================================================================

// Webhook Signing Secrets — from your provider's developer dashboard
export const PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE = 'PROVIDER_WEBHOOK_SECRET_LIVE';
export const PROVIDER_WEBHOOK_SIGNING_SECRET_TEST = 'PROVIDER_WEBHOOK_SECRET_TEST';

// Product / Plan IDs — if applicable for your provider; leave empty if not
export const PROVIDER_PRODUCT_ID_LIVE = '';
export const PROVIDER_PRODUCT_ID_TEST = '';

// Publishable / Public Keys — if applicable; leave empty if not
export const PROVIDER_PUBLISHABLE_KEY_LIVE = '';
export const PROVIDER_PUBLISHABLE_KEY_TEST = '';

// Secret / Access Keys — NEVER expose these publicly!
export const PROVIDER_SECRET_KEY_LIVE = 'PROVIDER_SECRET_KEY_LIVE';
export const PROVIDER_SECRET_KEY_TEST = 'PROVIDER_SECRET_KEY_TEST';

// Merchant Account — required by Adyen on every API call
export const PROVIDER_MERCHANT_ACCOUNT_LIVE = 'YourCompanyECOM';
export const PROVIDER_MERCHANT_ACCOUNT_TEST = 'YourCompanyTEST';

// ============================================================================
// ROOT PLATFORM CONFIGURATION
// ============================================================================

// Collection Module Key — must match the key in .root-config.json
export const ROOT_COLLECTION_MODULE_KEY = 'my_collection_module';

// Root API Keys — from Root Platform → Settings → API Keys
export const ROOT_API_KEY_LIVE = 'production_xxxxx';
export const ROOT_API_KEY_SANDBOX = 'sandbox_xxxxx';

// Root API Base URLs
export const ROOT_BASE_URL_LIVE = 'https://api.rootplatform.com/v1/insurance';
export const ROOT_BASE_URL_SANDBOX = 'https://sandbox.rootplatform.com/v1/insurance';

// ============================================================================
// OPTIONAL CONFIGURATION
// ============================================================================

export const TIME_DELAY_IN_MILLISECONDS = '10000';
