#!/usr/bin/env node
'use strict';

/**
 * scaffold-provider.js
 *
 * Deterministic CLI tool — scaffolds all files for a new payment provider.
 * Skills and AI commands call this. It does the real work; they do the glue.
 *
 * Usage:
 *   node scripts/scaffold-provider.js --provider=GoCardless [options]
 *   npm run scaffold:provider -- --provider=GoCardless [options]
 *   npm run scaffold:provider -- --from-spec=docs/my-spec.md
 *
 * Options:
 *   --provider          PascalCase provider name (required)       e.g. GoCardless
 *   --from-spec         Path to a filled SPEC-TEMPLATE.md file    e.g. docs/gocardless-spec.md
 *   --api-type          sdk or http (default: http)               e.g. http
 *   --base-url          API base URL (required for http)          e.g. https://api.gocardless.com
 *   --sdk-package       npm package name (required for sdk)       e.g. gocardless-nodejs
 *   --auth-header       Auth header name                          e.g. Authorization
 *   --webhook-header    Webhook signature header name             e.g. Webhook-Signature
 *   --dry-run           Print output without writing files
 *   --reason            Why this provider is being added (logged) e.g. "GoCardless integration for ZA market"
 *   --help              Show this help
 */

const fs = require('fs');
const path = require('path');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

// ─── --from-spec: read and merge values from a filled SPEC-TEMPLATE.md ───────

if (args['from-spec']) {
  const specArgs = readSpecFile(args['from-spec']);
  // Spec values are defaults; explicit CLI flags take precedence
  for (const [key, val] of Object.entries(specArgs)) {
    if (!args[key]) args[key] = val;
  }
  log('info', `Loaded spec from ${args['from-spec']}`, specArgs);
}

// ─── Validation ──────────────────────────────────────────────────────────────

const errors = [];

if (!args.provider) {
  errors.push('--provider is required (e.g. --provider=GoCardless)');
}
if (args['api-type'] && !['sdk', 'http'].includes(args['api-type'])) {
  errors.push('--api-type must be "sdk" or "http"');
}
if (args['api-type'] === 'http' && !args['base-url']) {
  errors.push('--base-url is required when --api-type=http');
}
if (args['api-type'] === 'sdk' && !args['sdk-package']) {
  errors.push('--sdk-package is required when --api-type=sdk (e.g. --sdk-package=gocardless-nodejs)');
}

if (errors.length) {
  errors.forEach((e) => log('error', e));
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const Provider = toPascalCase(args.provider);          // e.g. GoCardless
const provider = toSlug(args.provider);                // e.g. gocardless
const apiType = args['api-type'] || 'http';
const baseUrl = args['base-url'] || 'https://api.example.com';
const sdkPackage = args['sdk-package'] || '';
const authHeader = args['auth-header'] || 'Authorization';
const webhookHeader = args['webhook-header'] || 'X-Webhook-Signature';
const isDryRun = !!args['dry-run'];
const reason = args.reason || `Add ${Provider} payment provider`;

const ROOT = path.resolve(__dirname, '..');

// ─── Log run start ────────────────────────────────────────────────────────────

log('info', `scaffold-provider start`, { provider: Provider, apiType, reason, dryRun: isDryRun });

// ─── File templates ───────────────────────────────────────────────────────────

const files = [
  {
    path: `code/clients/${provider}-client.ts`,
    reason: `Wraps the ${Provider} ${apiType === 'sdk' ? 'SDK' : 'HTTP API'} and implements PaymentProviderClient`,
    content: apiType === 'sdk' ? clientSdkTemplate() : clientHttpTemplate(),
  },
  {
    path: `code/services/${provider}.service.ts`,
    reason: `Business logic for ${Provider} operations (createCustomer, createPaymentIntent, etc.)`,
    content: serviceTemplate(),
  },
  {
    path: `code/adapters/${provider}-to-root-adapter.ts`,
    reason: `Pure data transformation: ${Provider} shapes → Root Platform shapes`,
    content: adapterTemplate(),
  },
  {
    path: `code/interfaces/${provider}-events.ts`,
    reason: `Webhook event type constants for ${Provider}`,
    content: eventsTemplate(),
  },
  {
    path: `__tests__/clients/${provider}-client.test.ts`,
    reason: `Unit tests for ${Provider}Client`,
    content: clientTestTemplate(),
  },
  {
    path: `__tests__/services/${provider}.service.test.ts`,
    reason: `Unit tests for ${Provider}Service`,
    content: serviceTestTemplate(),
  },
  {
    path: `__tests__/adapters/${provider}-to-root-adapter.test.ts`,
    reason: `Unit tests for ${Provider}ToRootAdapter`,
    content: adapterTestTemplate(),
  },
];

// ─── Write files ──────────────────────────────────────────────────────────────

let created = 0;
let skipped = 0;

for (const file of files) {
  const fullPath = path.join(ROOT, file.path);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    log('skip', file.path, { reason: 'file already exists — not overwriting' });
    skipped++;
    continue;
  }

  if (!isDryRun) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }

  log(isDryRun ? 'dry-run' : 'create', file.path, { reason: file.reason });
  created++;
}

// ─── Post-scaffold instructions ───────────────────────────────────────────────

console.log('');
console.log('━'.repeat(60));
console.log(`✓ Scaffolded ${created} file(s) for ${Provider}${isDryRun ? ' (dry run)' : ''}`);
if (skipped) console.log(`  ${skipped} file(s) skipped (already exist)`);
console.log('━'.repeat(60));
console.log('');
console.log('Next steps — complete these manually or ask Claude:');
console.log('');
console.log('  1. Register in DI container:');
console.log(`       code/core/container.setup.ts`);
console.log(`       → register ServiceToken.PROVIDER_CLIENT (${Provider}Client)`);
console.log(`       → register ServiceToken.PROVIDER_SERVICE (${Provider}Service)`);
console.log('');
console.log('  2. Wire webhooks:');
console.log('       code/webhook-hooks.ts');
console.log(`       → verify signature with providerClient.verifyWebhookSignature()`);
console.log(`       → route events from code/interfaces/${provider}-events.ts`);
console.log('');
console.log('  3. Wire lifecycle hooks:');
console.log('       code/lifecycle-hooks/policy.hooks.ts  (afterPolicyIssued, etc.)');
console.log('       code/lifecycle-hooks/payment.hooks.ts (afterPaymentCreated, etc.)');
console.log('       code/lifecycle-hooks/payment-method.hooks.ts');
console.log('');
console.log('  4. Add config placeholders:');
console.log('       code/env.sample.ts');
console.log(`       → providerSecretKey: '${Provider.toUpperCase()}_SECRET_KEY'`);
console.log(`       → providerWebhookSigningSecret: '${Provider.toUpperCase()}_WEBHOOK_SECRET'`);
console.log('');
console.log('  5. Implement service methods in:');
console.log(`       code/services/${provider}.service.ts`);
console.log('       (stubs are generated — fill in the actual API calls)');
console.log('');
console.log('  6. Run tests:');
console.log('       npm test');
console.log('');

log('info', `scaffold-provider complete`, { provider: Provider, created, skipped, reason });

// ─── Templates ────────────────────────────────────────────────────────────────

function clientHttpTemplate() {
  return `import { BaseHttpClient } from './base-http-client';
import { getConfigService } from '../services/config-instance';
import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';
import * as crypto from 'crypto';

/**
 * ${Provider}Client — wraps the ${Provider} REST API.
 * Registered as ServiceToken.PROVIDER_CLIENT in container.setup.ts.
 */
export default class ${Provider}Client implements PaymentProviderClient {
  public readonly sdk: BaseHttpClient;

  constructor() {
    const config = getConfigService();
    this.sdk = new BaseHttpClient({
      baseUrl: '${baseUrl}',
      apiKey: config.get('providerSecretKey'),
      headers: {
        '${authHeader}': \`Bearer \${config.get('providerSecretKey')}\`,
      },
    });
  }

  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean {
    const sig = request.headers['${webhookHeader.toLowerCase()}'];
    if (!sig) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(request.body)
      .digest('hex');
    return sig === expected;
  }
}
`;
}

function clientSdkTemplate() {
  return `import { getConfigService } from '../services/config-instance';
import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';

// TODO: import ${sdkPackage || 'provider-sdk'}
// import ${Provider}SDK from '${sdkPackage || 'provider-sdk'}';

/**
 * ${Provider}Client — wraps the ${Provider} SDK.
 * Registered as ServiceToken.PROVIDER_CLIENT in container.setup.ts.
 */
export default class ${Provider}Client implements PaymentProviderClient {
  public readonly sdk: any; // TODO: type as ${Provider}SDK

  constructor() {
    const config = getConfigService();
    // TODO: initialise SDK
    // this.sdk = new ${Provider}SDK(config.get('providerSecretKey'));
    this.sdk = null;
  }

  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean {
    // TODO: use SDK's webhook verification
    // return this.sdk.webhooks.constructEvent(request.body, request.headers['${webhookHeader.toLowerCase()}'], secret);
    return false;
  }
}
`;
}

function serviceTemplate() {
  return `import { LogService } from './log.service';
import ${Provider}Client from '../clients/${provider}-client';
import {
  PaymentProviderService,
  ProviderCustomer,
  ProviderPaymentIntent,
  ProviderPaymentMethod,
  ProviderSubscription,
  CreateCustomerParams,
  UpdateCustomerParams,
  CreatePaymentIntentParams,
  AttachPaymentMethodParams,
} from '../interfaces/provider.interfaces';
import { retryWithBackoff } from '../utils/retry';
import { ModuleError } from '../utils/error';

/**
 * ${Provider}Service — business logic for ${Provider} operations.
 * Registered as ServiceToken.PROVIDER_SERVICE in container.setup.ts.
 */
export class ${Provider}Service implements PaymentProviderService {
  constructor(
    private readonly logService: LogService,
    private readonly providerClient: ${Provider}Client,
  ) {}

  async createCustomer(params: CreateCustomerParams): Promise<ProviderCustomer> {
    this.logService.info('Creating customer', '${Provider}Service', params);
    try {
      // TODO: implement via this.providerClient.sdk
      throw new ModuleError('createCustomer not yet implemented');
    } catch (err) {
      this.logService.error('Failed to create customer', '${Provider}Service', err);
      throw err instanceof ModuleError ? err : new ModuleError('Failed to create customer', { cause: err });
    }
  }

  async getCustomer(customerId: string): Promise<ProviderCustomer> {
    this.logService.info('Getting customer', '${Provider}Service', { customerId });
    // TODO: implement
    throw new ModuleError('getCustomer not yet implemented');
  }

  async updateCustomer(customerId: string, params: UpdateCustomerParams): Promise<ProviderCustomer> {
    this.logService.info('Updating customer', '${Provider}Service', { customerId, ...params });
    // TODO: implement
    throw new ModuleError('updateCustomer not yet implemented');
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntent> {
    this.logService.info('Creating payment intent', '${Provider}Service', params);
    // TODO: implement with retryWithBackoff
    // return retryWithBackoff(() => this.providerClient.sdk.post('/payments', { ... }));
    throw new ModuleError('createPaymentIntent not yet implemented');
  }

  async getPaymentMethod(paymentMethodId: string): Promise<ProviderPaymentMethod> {
    this.logService.info('Getting payment method', '${Provider}Service', { paymentMethodId });
    // TODO: implement
    throw new ModuleError('getPaymentMethod not yet implemented');
  }

  async attachPaymentMethod(params: AttachPaymentMethodParams): Promise<ProviderPaymentMethod> {
    this.logService.info('Attaching payment method', '${Provider}Service', params);
    // TODO: implement
    throw new ModuleError('attachPaymentMethod not yet implemented');
  }

  async cancelSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    this.logService.info('Cancelling subscription', '${Provider}Service', { subscriptionId });
    // TODO: implement
    throw new ModuleError('cancelSubscription not yet implemented');
  }
}
`;
}

function adapterTemplate() {
  return `import {
  ProviderToRootAdapter,
  ConvertPaymentParams,
} from '../interfaces/provider.interfaces';

/**
 * ${Provider}ToRootAdapter — pure data transformation.
 * No API calls. ${Provider} shapes → Root Platform shapes.
 */
export default class ${Provider}ToRootAdapter implements ProviderToRootAdapter {
  convertPaymentToRootUpdate(providerPayment: any, params: ConvertPaymentParams) {
    return {
      status: this.mapStatus(providerPayment.status, params),
      amount: providerPayment.amount,
      currency: (providerPayment.currency || 'ZAR').toUpperCase(),
      externalId: providerPayment.id,
    };
  }

  convertCustomerToAppData(providerCustomer: any): Record<string, any> {
    return {
      ${provider}_customer_id: providerCustomer.id,
      ${provider}_email: providerCustomer.email ?? null,
    };
  }

  // TODO: map provider-specific statuses to Root Platform statuses
  private mapStatus(status: string, _params: ConvertPaymentParams): string {
    const statusMap: Record<string, string> = {
      // 'provider_status': 'root_status',
      // e.g. 'paid_out': 'successful',
      //      'failed':   'failed',
      //      'pending':  'pending',
    };
    return statusMap[status] ?? status;
  }
}
`;
}

function eventsTemplate() {
  return `/**
 * ${Provider} webhook event type constants.
 * Use these in webhook-hooks.ts switch statements.
 *
 * TODO: replace with actual event names from ${Provider} docs.
 */
export const ${Provider.toUpperCase()}_EVENTS = {
  PAYMENT_COMPLETED: '${provider}.payment.completed',
  PAYMENT_FAILED: '${provider}.payment.failed',
  SUBSCRIPTION_CANCELLED: '${provider}.subscription.cancelled',
  CUSTOMER_UPDATED: '${provider}.customer.updated',
} as const;

export type ${Provider}EventType = typeof ${Provider.toUpperCase()}_EVENTS[keyof typeof ${Provider.toUpperCase()}_EVENTS];
`;
}

function clientTestTemplate() {
  return `import ${Provider}Client from '../../../code/clients/${provider}-client';

jest.mock('../../../code/services/config-instance', () => ({
  getConfigService: () => ({ get: (key: string) => \`test-\${key}\` }),
}));

describe('${Provider}Client', () => {
  let client: ${Provider}Client;

  beforeEach(() => {
    client = new ${Provider}Client();
  });

  it('initialises with an sdk', () => {
    expect(client.sdk).toBeDefined();
  });

  describe('verifyWebhookSignature', () => {
    it('returns false for missing signature header', () => {
      const result = client.verifyWebhookSignature(
        { body: 'payload', headers: {} },
        'secret',
      );
      expect(result).toBe(false);
    });

    // TODO: add test for valid signature
  });
});
`;
}

function serviceTestTemplate() {
  return `import { ${Provider}Service } from '../../../code/services/${provider}.service';
import { LogService } from '../../../code/services/log.service';

const mockLogService = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as LogService;

const mockClient = {
  sdk: {},
  verifyWebhookSignature: jest.fn(),
};

describe('${Provider}Service', () => {
  let service: ${Provider}Service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ${Provider}Service(mockLogService, mockClient as any);
  });

  it('logs when creating a customer', async () => {
    await expect(
      service.createCustomer({ email: 'test@example.com' }),
    ).rejects.toThrow(); // TODO: replace with mock response once implemented

    expect(mockLogService.info).toHaveBeenCalledWith(
      'Creating customer',
      '${Provider}Service',
      expect.any(Object),
    );
  });

  // TODO: add tests for each method once implemented
});
`;
}

function adapterTestTemplate() {
  return `import ${Provider}ToRootAdapter from '../../../code/adapters/${provider}-to-root-adapter';

describe('${Provider}ToRootAdapter', () => {
  let adapter: ${Provider}ToRootAdapter;

  beforeEach(() => {
    adapter = new ${Provider}ToRootAdapter();
  });

  describe('convertPaymentToRootUpdate', () => {
    it('maps provider payment to root update shape', () => {
      const result = adapter.convertPaymentToRootUpdate(
        { id: 'pay_123', status: 'pending', amount: 5000, currency: 'zar' },
        {} as any,
      );
      expect(result).toMatchObject({
        externalId: 'pay_123',
        amount: 5000,
        currency: 'ZAR',
      });
    });
  });

  describe('convertCustomerToAppData', () => {
    it('maps provider customer to app data', () => {
      const result = adapter.convertCustomerToAppData({
        id: 'cust_123',
        email: 'test@example.com',
      });
      expect(result).toMatchObject({
        ${provider}_customer_id: 'cust_123',
        ${provider}_email: 'test@example.com',
      });
    });
  });
});
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level, message, meta = {}) {
  const prefix = { info: '→', create: '✓', skip: '~', error: '✗', 'dry-run': '○' }[level] || ' ';
  const metaStr = Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : '';
  console.log(`${prefix} [${level}] ${message}${metaStr}`);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--dry-run') { result['dry-run'] = true; continue; }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function toPascalCase(str) {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase());
}

function toSlug(str) {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * readSpecFile — parse a filled SPEC-TEMPLATE.md and extract scaffold args.
 * Reads the "Provider Overview" and other sections for known fields.
 */
function readSpecFile(specPath) {
  const absPath = path.resolve(specPath);
  if (!fs.existsSync(absPath)) {
    log('error', `Spec file not found: ${absPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const extracted = {};

  // Provider name
  const nameMatch = content.match(/Provider name:\s*(.+)/i);
  if (nameMatch) {
    const name = nameMatch[1].trim().replace(/^e\.g\.?\s*/i, '').split(/\s+/)[0];
    if (name && !name.toLowerCase().startsWith('e.g')) extracted.provider = name;
  }

  // SDK package
  const sdkMatch = content.match(/SDK\s*\(npm package\):\s*(.+)/i);
  if (sdkMatch) {
    const sdk = sdkMatch[1].trim().replace(/^e\.g\.?\s*/i, '').split(/\s+/)[0];
    if (sdk && sdk !== 'none' && !sdk.toLowerCase().startsWith('e.g') && !sdk.toLowerCase().includes('rest')) {
      extracted['sdk-package'] = sdk;
      extracted['api-type'] = 'sdk';
    } else {
      extracted['api-type'] = 'http';
    }
  }

  // API docs URL → use as base URL if no explicit base-url
  const urlMatch = content.match(/API docs URL:\s*(.+)/i);
  if (urlMatch) {
    const url = urlMatch[1].trim().replace(/^e\.g\.?\s*/i, '');
    if (url.startsWith('http') && !extracted['base-url']) {
      // Strip path to get base URL
      try {
        const parsed = new URL(url);
        extracted['base-url'] = `${parsed.protocol}//${parsed.host}`;
      } catch {
        // ignore malformed URL
      }
    }
  }

  // Auth header
  const authMatch = content.match(/Header name:\s*(.+)/i);
  if (authMatch) {
    const header = authMatch[1].trim().replace(/^e\.g\.?\s*/i, '').split(/\s+/)[0];
    if (header && !header.toLowerCase().startsWith('e.g')) extracted['auth-header'] = header;
  }

  // Webhook signature header
  const webhookMatch = content.match(/Signature header:\s*(.+)/i);
  if (webhookMatch) {
    const header = webhookMatch[1].trim().replace(/^e\.g\.?\s*/i, '').split(/\s+/)[0];
    if (header && !header.toLowerCase().startsWith('e.g')) extracted['webhook-header'] = header;
  }

  return extracted;
}

function printHelp() {
  console.log(`
scaffold-provider.js — scaffold a new payment provider for the collection module

Usage:
  node scripts/scaffold-provider.js --provider=<Name> [options]
  npm run scaffold:provider -- --provider=<Name> [options]
  npm run scaffold:provider -- --from-spec=<path>

Required (one of):
  --provider          PascalCase provider name        e.g. GoCardless
  --from-spec         Path to filled SPEC-TEMPLATE.md e.g. docs/gocardless-spec.md

Options:
  --api-type          sdk or http (default: http)     e.g. http
  --base-url          API base URL (http type)        e.g. https://api.gocardless.com
  --sdk-package       npm package (sdk type)          e.g. gocardless-nodejs
  --auth-header       Auth header name                e.g. Authorization
  --webhook-header    Webhook sig header              e.g. Webhook-Signature
  --reason            Why this provider is added      e.g. "ZA market expansion"
  --dry-run           Print without writing files
  --help              Show this help

Examples:
  # From spec file (after running extract:spec)
  npm run scaffold:provider -- \\
    --from-spec=docs/gocardless-spec.md \\
    --reason="Direct debit for ZA market"

  # HTTP provider (explicit flags)
  npm run scaffold:provider -- \\
    --provider=GoCardless \\
    --api-type=http \\
    --base-url=https://api.gocardless.com \\
    --auth-header=Authorization \\
    --webhook-header=Webhook-Signature \\
    --reason="Direct debit for ZA market"

  # SDK-based provider
  npm run scaffold:provider -- \\
    --provider=MyProvider \\
    --api-type=sdk \\
    --sdk-package=myprovider-nodejs \\
    --webhook-header=X-MyProvider-Signature

  # Dry run (preview only)
  npm run scaffold:provider -- --provider=PayFast --dry-run

Files created:
  code/clients/{provider}-client.ts
  code/services/{provider}.service.ts
  code/adapters/{provider}-to-root-adapter.ts
  code/interfaces/{provider}-events.ts
  __tests__/clients/{provider}-client.test.ts
  __tests__/services/{provider}.service.test.ts
  __tests__/adapters/{provider}-to-root-adapter.test.ts

Files you wire manually (or ask Claude):
  code/core/container.setup.ts    — register PROVIDER_CLIENT + PROVIDER_SERVICE
  code/webhook-hooks.ts           — verify signature + route events
  code/lifecycle-hooks/*.ts       — policy, payment, payment-method hooks
  code/env.sample.ts              — add config placeholders
`);
}
