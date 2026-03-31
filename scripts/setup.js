#!/usr/bin/env node
'use strict';

/**
 * setup.js
 *
 * One-time project setup CLI. Replaces the interactive setup.sh with a
 * deterministic, flag-driven tool that AI agents and humans can both run.
 *
 * Usage:
 *   node scripts/setup.js [options]
 *   node scripts/setup.js --help
 *
 * Quick start (minimal — generates placeholder env.ts and root-config):
 *   node scripts/setup.js \
 *     --cm-key=cm_myprovider_yourco \
 *     --cm-name="Your Provider Integration" \
 *     --org-id=your-org-id \
 *     --reason="initial project setup"
 *
 * Full setup with all credentials:
 *   node scripts/setup.js \
 *     --cm-key=cm_stripe_yourco \
 *     --cm-name="Stripe Integration" \
 *     --org-id=your-org-id \
 *     --root-api-key=production_xxx \
 *     --root-api-key-sandbox=sandbox_xxx \
 *     --provider-key-live=sk_live_xxx \
 *     --provider-key-test=sk_test_xxx \
 *     --provider-webhook-secret-live=whsec_xxx \
 *     --provider-webhook-secret-test=whsec_xxx \
 *     --reason="initial project setup"
 *
 * Options:
 *   --cm-key                    Collection Module Key (required)       e.g. cm_stripe_yourco
 *   --cm-name                   Collection Module display name         e.g. "Stripe Integration"
 *   --org-id                    Root Platform Organization ID          e.g. 00000000-...
 *   --root-host                 Root Platform API host                 (default: https://api.rootplatform.com)
 *   --root-api-key              Root Platform API key (production)     e.g. production_xxx
 *   --root-api-key-sandbox      Root Platform API key (sandbox)        e.g. sandbox_xxx
 *   --provider-key-live         Provider secret key (live)             e.g. sk_live_xxx
 *   --provider-key-test         Provider secret key (test/sandbox)     e.g. sk_test_xxx
 *   --provider-publishable-live Provider publishable key (live)        e.g. pk_live_xxx
 *   --provider-publishable-test Provider publishable key (test)        e.g. pk_test_xxx
 *   --provider-webhook-live     Provider webhook secret (live)         e.g. whsec_xxx
 *   --provider-webhook-test     Provider webhook secret (test)         e.g. whsec_xxx
 *   --provider-product-live     Provider product ID (live)             e.g. prod_xxx
 *   --provider-product-test     Provider product ID (test)             e.g. prod_xxx
 *   --env                       NODE_ENV value                         (default: sandbox)
 *   --skip-install              Skip npm install step
 *   --skip-validate             Skip lint + build validation step
 *   --skip-create-cm            Skip creating collection module on Root Platform API
 *   --dry-run                   Print what would be written without writing files
 *   --reason                    Why this setup is being run (logged)
 *   --help                      Show this help
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const CM_ROOT = path.join(REPO_ROOT, 'collection_module');
const ENV_SAMPLE = path.join(CM_ROOT, 'code', 'env.sample.ts');
const ENV_TS = path.join(CM_ROOT, 'code', 'env.ts');
const ROOT_CONFIG = path.join(CM_ROOT, '.root-config.json');
const ROOT_CONFIG_SAMPLE = path.join(CM_ROOT, '.root-config.json.sample');
const ROOT_AUTH = path.join(CM_ROOT, '.root-auth');
const NVMRC = path.join(CM_ROOT, '.nvmrc');

// ─── Config ───────────────────────────────────────────────────────────────────

const cmKey = args['cm-key'] || '';
const cmName = args['cm-name'] || cmKey || 'Collection Module';
const orgId = args['org-id'] || '';
const rootHost = args['root-host'] || 'https://api.rootplatform.com';
const rootApiKey = args['root-api-key'] || '';
const rootApiKeySandbox = args['root-api-key-sandbox'] || '';
const providerKeyLive = args['provider-key-live'] || '';
const providerKeyTest = args['provider-key-test'] || '';
const providerPublishableLive = args['provider-publishable-live'] || '';
const providerPublishableTest = args['provider-publishable-test'] || '';
const providerWebhookLive = args['provider-webhook-live'] || '';
const providerWebhookTest = args['provider-webhook-test'] || '';
const providerProductLive = args['provider-product-live'] || '';
const providerProductTest = args['provider-product-test'] || '';
const nodeEnv = args['env'] || 'sandbox';
const isDryRun = !!args['dry-run'];
const skipInstall = !!args['skip-install'];
const skipValidate = !!args['skip-validate'];
const skipCreateCm = !!args['skip-create-cm'];
const reason = args.reason || 'project setup';

// ─── Header ───────────────────────────────────────────────────────────────────

console.log('');
console.log('━'.repeat(60));
console.log('  Collection Module Template — Setup');
console.log('━'.repeat(60));
console.log('');

log('info', 'setup start', { cmKey, orgId, reason, dryRun: isDryRun });

if (!cmKey) {
  log('warn', '--cm-key not provided — .root-config.json will use placeholder value');
}

// ─── Step 1: Check Node version ───────────────────────────────────────────────

console.log('\n── Step 1: Node.js version ─────────────────────────────');

const requiredNode = fs.existsSync(NVMRC)
  ? parseInt(fs.readFileSync(NVMRC, 'utf8').trim(), 10)
  : 18;

const currentNode = parseInt(process.version.slice(1).split('.')[0], 10);

if (currentNode < requiredNode) {
  log('error', `Node.js ${currentNode}.x detected — ${requiredNode}.x or higher required`);
  log('error', `Install via nvm: nvm install ${requiredNode} && nvm use ${requiredNode}`);
  process.exit(1);
} else if (currentNode === requiredNode) {
  log('ok', `Node.js ${currentNode}.x ✓`);
} else {
  log('warn', `Node.js ${currentNode}.x detected — ${requiredNode}.x recommended`);
  log('info', `To match exactly: cd collection_module && nvm use`);
}

// ─── Step 2: Check Root Platform CLI ─────────────────────────────────────────

console.log('\n── Step 2: Root Platform CLI (rp) ─────────────────────');

try {
  execSync('rp --version', { stdio: 'pipe' });
  log('ok', 'Root Platform CLI (rp) is installed ✓');
} catch {
  log('warn', 'Root Platform CLI (rp) not found');
  log('info', 'Install it: npm install -g root-platform-cli');
  log('info', 'Required for deploy:sandbox and deploy:production');
}

// ─── Step 3: Install dependencies ────────────────────────────────────────────

console.log('\n── Step 3: Install dependencies ────────────────────────');

if (skipInstall) {
  log('skip', 'npm install (--skip-install)');
} else if (isDryRun) {
  log('dry-run', `npm install  ${CM_ROOT}`);
} else {
  log('info', 'Running npm install in collection_module/...');
  try {
    execSync('npm install', { cwd: CM_ROOT, stdio: 'inherit' });
    log('ok', 'Dependencies installed ✓');
  } catch (err) {
    log('error', `npm install failed: ${err.message}`);
    process.exit(1);
  }
}

// ─── Step 4: Write .root-config.json ─────────────────────────────────────────

console.log('\n── Step 4: .root-config.json ───────────────────────────');

const rootConfigContent = JSON.stringify({
  collectionModuleKey: cmKey || 'my_collection_module',
  collectionModuleName: cmName,
  organizationId: orgId || '00000000-0000-0000-0000-000000000000',
  host: rootHost,
  settings: { legacyCodeExecution: false },
  manualTransactions: [],
}, null, 2);

if (fs.existsSync(ROOT_CONFIG)) {
  log('skip', '.root-config.json already exists — not overwriting');
  log('info', 'Delete it and re-run to regenerate');
} else if (isDryRun) {
  log('dry-run', '.root-config.json would be written:');
  console.log(rootConfigContent);
} else {
  fs.writeFileSync(ROOT_CONFIG, rootConfigContent + '\n', 'utf8');
  log('create', '.root-config.json', { cmKey, orgId });
}

// ─── Step 5: Write .root-auth ─────────────────────────────────────────────────

console.log('\n── Step 5: .root-auth ──────────────────────────────────');

if (fs.existsSync(ROOT_AUTH)) {
  log('skip', '.root-auth already exists — not overwriting');
} else if (!rootApiKey) {
  log('warn', '--root-api-key not provided — .root-auth not created');
  log('info', 'Create manually: echo "ROOT_API_KEY=production_xxx" > collection_module/.root-auth');
} else if (isDryRun) {
  log('dry-run', '.root-auth would be written with ROOT_API_KEY');
} else {
  fs.writeFileSync(ROOT_AUTH, `ROOT_API_KEY=${rootApiKey}\n`, 'utf8');
  log('create', '.root-auth', { reason: 'Root Platform API key' });
  log('info', 'This file is gitignored — never commit it');
}

// ─── Step 6: Create collection module on Root Platform ────────────────────────

console.log('\n── Step 6: Create collection module on Root Platform ───');

if (skipCreateCm) {
  log('skip', 'Root Platform API call (--skip-create-cm)');
} else if (!cmKey || !orgId || !rootApiKey) {
  log('warn', 'Skipping — requires --cm-key, --org-id, and --root-api-key');
  log('info', 'Create manually via Root Platform dashboard if needed');
} else if (isDryRun) {
  log('dry-run', `POST ${rootHost}/v1/apps/${orgId}/insurance/collection-modules`);
  log('dry-run', `  body: { key: "${cmKey}", name: "${cmName}" }`);
} else {
  createCollectionModule(rootHost, orgId, rootApiKey, cmKey, cmName);
}

// ─── Step 7: Write code/env.ts ────────────────────────────────────────────────

console.log('\n── Step 7: code/env.ts ─────────────────────────────────');

if (fs.existsSync(ENV_TS)) {
  log('skip', 'code/env.ts already exists — not overwriting');
  log('info', 'Delete it and re-run to regenerate, or edit manually');
} else {
  const envContent = buildEnvTs({
    nodeEnv,
    providerWebhookLive: providerWebhookLive || 'PROVIDER_WEBHOOK_SECRET_LIVE',
    providerWebhookTest: providerWebhookTest || 'PROVIDER_WEBHOOK_SECRET_TEST',
    providerProductLive: providerProductLive || '',
    providerProductTest: providerProductTest || '',
    providerPublishableLive: providerPublishableLive || '',
    providerPublishableTest: providerPublishableTest || '',
    providerKeyLive: providerKeyLive || 'PROVIDER_SECRET_KEY_LIVE',
    providerKeyTest: providerKeyTest || 'PROVIDER_SECRET_KEY_TEST',
    cmKey: cmKey || 'my_collection_module',
    rootApiKeyLive: rootApiKey || 'production_xxxxx',
    rootApiKeySandbox: rootApiKeySandbox || 'sandbox_xxxxx',
    rootBaseUrlLive: `${rootHost}/v1/insurance`,
    rootBaseUrlSandbox: rootHost.replace('api.', 'sandbox.') + '/v1/insurance',
  });

  if (isDryRun) {
    log('dry-run', 'code/env.ts would be written:');
    console.log(envContent);
  } else {
    fs.mkdirSync(path.dirname(ENV_TS), { recursive: true });
    fs.writeFileSync(ENV_TS, envContent, 'utf8');
    log('create', 'code/env.ts', { reason: 'environment configuration' });
    log('warn', 'Never commit code/env.ts — it is already in .gitignore');
  }
}

// ─── Step 8: Validate ─────────────────────────────────────────────────────────

console.log('\n── Step 8: Validate ────────────────────────────────────');

if (skipValidate || isDryRun) {
  log('skip', `validation (${isDryRun ? 'dry-run' : '--skip-validate'})`);
} else {
  try {
    execSync('npm run build', { cwd: CM_ROOT, stdio: 'pipe' });
    log('ok', 'Build passed ✓');
  } catch {
    log('warn', 'Build has warnings — check code/env.ts and .root-config.json');
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('');
console.log('━'.repeat(60));
console.log(`  Setup complete${isDryRun ? ' (dry run — nothing written)' : ''}`);
console.log('━'.repeat(60));
console.log('');
console.log('Next steps:');
console.log('');
console.log('  cd collection_module && nvm use   # ensure correct Node version');
console.log('  npm test                           # run the test suite');
console.log('');
console.log('  # Add a new provider from a spec:');
console.log('  npm run extract:spec -- --input=https://docs.provider.com/api \\');
console.log('    --output=docs/provider-spec.md');
console.log('  npm run scaffold:provider -- --from-spec=docs/provider-spec.md \\');
console.log('    --reason="why"');
console.log('');
console.log('  # Deploy when ready:');
console.log('  npm run deploy:sandbox');
console.log('  npm run deploy:production');
console.log('');

log('info', 'setup complete', { cmKey, reason });

// ─── Root Platform API call ───────────────────────────────────────────────────

function createCollectionModule(host, organizationId, apiKey, key, name) {
  const url = `${host}/v1/apps/${organizationId}/insurance/collection-modules`;
  const body = JSON.stringify({ key, name });
  const isHttps = url.startsWith('https://');
  const client = isHttps ? https : http;

  log('info', `Creating collection module on Root Platform`, { url, key });

  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
    };

    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const status = res.statusCode;
        const responseBody = Buffer.concat(chunks).toString();

        if (status >= 200 && status < 300) {
          log('ok', `Collection module created on Root Platform ✓  (HTTP ${status})`);
        } else if (status === 409 || responseBody.includes('already exists')) {
          log('warn', `Collection module already exists (HTTP ${status}) — this is OK`);
        } else {
          log('warn', `Could not create collection module (HTTP ${status})`);
          log('info', `Response: ${responseBody}`);
          log('info', 'You may need to create it manually via the Root Platform dashboard');
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      log('warn', `API call failed: ${err.message}`);
      log('info', 'You can create the collection module manually via the Root Platform dashboard');
      resolve();
    });

    req.setTimeout(10000, () => {
      req.destroy();
      log('warn', 'API call timed out — create the collection module manually if needed');
      resolve();
    });

    req.write(body);
    req.end();
  });
}

// ─── env.ts generator ────────────────────────────────────────────────────────

function buildEnvTs(c) {
  return `/**
 * Environment Configuration
 *
 * IMPORTANT: Never commit this file to version control!
 * This file is already listed in .gitignore.
 *
 * Generated by scripts/setup.js on ${new Date().toISOString()}
 *
 * Variable names use the PROVIDER_* prefix so they work with any payment provider.
 * See code/env.sample.ts for documentation on each field.
 */

// ============================================================================
// ENVIRONMENT
// ============================================================================
export const NODE_ENV = '${c.nodeEnv}';

// ============================================================================
// PAYMENT PROVIDER CONFIGURATION
// Replace PROVIDER_* values with your actual provider credentials.
// ============================================================================

// Webhook Signing Secrets
export const PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE = '${c.providerWebhookLive}';
export const PROVIDER_WEBHOOK_SIGNING_SECRET_TEST = '${c.providerWebhookTest}';

// Product / Plan IDs (if applicable — leave empty if not used)
export const PROVIDER_PRODUCT_ID_LIVE = '${c.providerProductLive}';
export const PROVIDER_PRODUCT_ID_TEST = '${c.providerProductTest}';

// Publishable / Public Keys (if applicable — leave empty if not used)
export const PROVIDER_PUBLISHABLE_KEY_LIVE = '${c.providerPublishableLive}';
export const PROVIDER_PUBLISHABLE_KEY_TEST = '${c.providerPublishableTest}';

// Secret / Access Keys — NEVER expose these publicly!
export const PROVIDER_SECRET_KEY_LIVE = '${c.providerKeyLive}';
export const PROVIDER_SECRET_KEY_TEST = '${c.providerKeyTest}';

// ============================================================================
// ROOT PLATFORM CONFIGURATION
// ============================================================================

// Collection Module Key — must match the key in .root-config.json
export const ROOT_COLLECTION_MODULE_KEY = '${c.cmKey}';

// Root API Keys
export const ROOT_API_KEY_LIVE = '${c.rootApiKeyLive}';
export const ROOT_API_KEY_SANDBOX = '${c.rootApiKeySandbox}';

// Root API Base URLs
export const ROOT_BASE_URL_LIVE = 'https://api.rootplatform.com/v1/insurance';
export const ROOT_BASE_URL_SANDBOX = 'https://sandbox.rootplatform.com/v1/insurance';

// ============================================================================
// OPTIONAL CONFIGURATION
// ============================================================================

export const TIME_DELAY_IN_MILLISECONDS = '10000';
`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level, message, meta = {}) {
  const prefix = {
    info: '→',
    ok: '✓',
    create: '✓',
    skip: '~',
    error: '✗',
    warn: '⚠',
    'dry-run': '○',
  }[level] || ' ';
  const metaStr = Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : '';
  console.log(`${prefix} [${level}] ${message}${metaStr}`);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--dry-run') { result['dry-run'] = true; continue; }
    if (arg === '--skip-install') { result['skip-install'] = true; continue; }
    if (arg === '--skip-validate') { result['skip-validate'] = true; continue; }
    if (arg === '--skip-create-cm') { result['skip-create-cm'] = true; continue; }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function printHelp() {
  console.log(`
setup.js — one-time project setup for the collection module template

Usage:
  node scripts/setup.js [options]

Quick start (minimal — generates placeholder files):
  node scripts/setup.js \\
    --cm-key=cm_stripe_yourco \\
    --cm-name="Your Stripe Integration" \\
    --org-id=your-org-id \\
    --reason="initial setup"

Full setup with credentials:
  node scripts/setup.js \\
    --cm-key=cm_stripe_yourco \\
    --cm-name="Your Stripe Integration" \\
    --org-id=your-org-id \\
    --root-api-key=production_xxx \\
    --root-api-key-sandbox=sandbox_xxx \\
    --provider-key-live=sk_live_xxx \\
    --provider-key-test=sk_test_xxx \\
    --provider-webhook-live=whsec_xxx \\
    --provider-webhook-test=whsec_xxx \\
    --reason="initial setup"

Required:
  (none — all flags are optional; missing values use placeholders)

Options:
  --cm-key                    Collection Module Key            e.g. cm_stripe_yourco
  --cm-name                   Collection Module display name   e.g. "Stripe Integration"
  --org-id                    Root Platform Organization ID
  --root-host                 Root Platform API host           (default: https://api.rootplatform.com)
  --root-api-key              Root API key (production)        e.g. production_xxx
  --root-api-key-sandbox      Root API key (sandbox)           e.g. sandbox_xxx
  --provider-key-live         Provider secret key (live)       e.g. sk_live_xxx
  --provider-key-test         Provider secret key (test)       e.g. sk_test_xxx
  --provider-publishable-live Provider publishable key (live)  e.g. pk_live_xxx
  --provider-publishable-test Provider publishable key (test)  e.g. pk_test_xxx
  --provider-webhook-live     Provider webhook secret (live)   e.g. whsec_xxx
  --provider-webhook-test     Provider webhook secret (test)   e.g. whsec_xxx
  --provider-product-live     Provider product ID (live)       e.g. prod_xxx
  --provider-product-test     Provider product ID (test)       e.g. prod_xxx
  --env                       NODE_ENV value                   (default: sandbox)
  --skip-install              Skip npm install
  --skip-validate             Skip build validation
  --skip-create-cm            Skip Root Platform API call
  --dry-run                   Print what would be done without writing files
  --reason                    Why this setup is being run (logged)
  --help                      Show this help

What it creates:
  collection_module/.root-config.json   Collection module metadata
  collection_module/.root-auth          Root Platform API key (gitignored)
  collection_module/code/env.ts         Environment configuration (gitignored)

What it does:
  1. Checks Node.js version (vs .nvmrc)
  2. Checks Root Platform CLI (rp) is installed
  3. Runs npm install in collection_module/
  4. Writes .root-config.json
  5. Writes .root-auth (only if --root-api-key provided)
  6. Creates collection module on Root Platform (only if credentials provided)
  7. Writes code/env.ts from your flags (or placeholders if flags omitted)
  8. Runs npm run build to validate

Notes:
  - Existing files are never overwritten (delete first to regenerate)
  - Missing credential flags leave placeholder values in env.ts
  - Use --dry-run to preview what would be written before committing
`);
}
