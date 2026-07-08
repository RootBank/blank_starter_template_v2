#!/usr/bin/env node
'use strict';

/**
 * validate-provider.js
 *
 * Deterministic half of the provider self-review. Mechanically checks the
 * pattern-matchable criteria from docs/14-SELF-REVIEW.md and exits non-zero on
 * any failure. The semantic criteria that need judgement (is the statusMap
 * *correct*, are the event names the *right* ones, do the hooks call the right
 * methods) are left to the fresh-context reviewer in /review-implementation.
 *
 * Usage:
 *   node scripts/validate-provider.js [--provider=<slug>] [--root=<path>]
 *   npm run validate:provider                 # auto-detects the provider
 *   npm run validate:provider -- --provider=gocardless
 *
 * Options:
 *   --provider   Provider slug (e.g. gocardless). Auto-detected if omitted.
 *   --root       collection_module root (default: ../collection_module).
 *   --help       Show this help.
 *
 * Exit codes:
 *   0  all Critical and (mechanizable) Major checks pass
 *   1  one or more checks failed
 *   2  usage / no provider found
 */

const fs = require('fs');
const path = require('path');

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const ROOT = args.root
  ? path.resolve(args.root)
  : path.resolve(__dirname, '..', 'collection_module');

const CODE = path.join(ROOT, 'code');
const TESTS = path.join(ROOT, '__tests__');

const provider = args.provider || autoDetectProvider(CODE);

if (!provider) {
  console.error(
    '✗ No provider implementation found in code/clients/.\n' +
      '  Run `npm run scaffold:provider` first, or pass --provider=<slug>.',
  );
  process.exit(2);
}

const Provider = provider.charAt(0).toUpperCase() + provider.slice(1);
console.log(`\nValidating provider: ${Provider} (slug: ${provider})\n`);

// ─── Files this provider should own ─────────────────────────────────────────

const servicePath = path.join(CODE, 'services', `${provider}.service.ts`);
const adapterPath = path.join(CODE, 'adapters', `${provider}-to-root-adapter.ts`);
const eventsPath = path.join(CODE, 'interfaces', `${provider}-events.ts`);
const containerPath = path.join(CODE, 'core', 'container.setup.ts');
const webhookPath = path.join(CODE, 'webhook-hooks.ts');
const envSamplePath = path.join(CODE, 'env.sample.ts');

// ─── Checks ──────────────────────────────────────────────────────────────────

const results = [];

function check(id, severity, label, fn) {
  let passed = false;
  let detail = '';
  try {
    const out = fn();
    passed = out === true || (out && out.passed);
    detail = (out && out.detail) || '';
  } catch (err) {
    passed = false;
    detail = err.message;
  }
  results.push({ id, severity, label, passed, detail });
}

// --- Critical ---------------------------------------------------------------

check('C1', 'critical', 'PROVIDER_CLIENT registered in container.setup.ts', () =>
  fileIncludes(containerPath, 'ServiceToken.PROVIDER_CLIENT'),
);
check('C2', 'critical', 'PROVIDER_SERVICE registered in container.setup.ts', () =>
  fileIncludes(containerPath, 'ServiceToken.PROVIDER_SERVICE'),
);
check('C3', 'critical', 'Webhook signature verified before parsing', () =>
  fileIncludes(webhookPath, 'verifyWebhookSignature'),
);
check('C4', 'critical', 'No unimplemented TODO stubs in service', () => {
  const text = readOrThrow(servicePath);
  const hits = matchLines(text, /TODO:\s*implement/i);
  return { passed: hits.length === 0, detail: hits.length ? `${hits.length} stub(s) left` : '' };
});
check('C5', 'critical', 'Adapter statusMap is non-empty', () => {
  const text = readOrThrow(adapterPath);
  const block = extractBlock(text, 'statusMap');
  const entries = block ? matchLines(block, /PaymentStatus\./) : [];
  return { passed: entries.length > 0, detail: entries.length ? `${entries.length} mapping(s)` : 'statusMap empty or not found' };
});
check('C6', 'critical', 'Event constants use real names (no placeholders)', () => {
  const text = readOrThrow(eventsPath);
  const placeholders = matchLines(
    text,
    /'(actual\.event\.[a-z.]+|provider\.payment\.[a-z.]+|TODO[^']*|placeholder[^']*)'/i,
  );
  return { passed: placeholders.length === 0, detail: placeholders.length ? `${placeholders.length} placeholder(s)` : '' };
});
check('C8', 'critical', 'Config keys added to env.sample.ts', () =>
  fileMatches(envSamplePath, /SECRET_KEY/),
);

// --- Major (also hard failures, per the build-from-spec workflow design) -----

check('M1', 'major', 'Service API calls wrapped in retryWithBackoff()', () =>
  fileIncludes(servicePath, 'retryWithBackoff'),
);
check('M3', 'major', 'Service throws ModuleError, not raw Error', () => {
  const text = readOrThrow(servicePath);
  const raw = matchLines(text, /throw new Error\(/);
  return { passed: raw.length === 0, detail: raw.length ? `${raw.length} raw throw(s)` : '' };
});
check('M8', 'major', 'No console.log in code/', () => {
  const hits = grepTree(CODE, /\bconsole\.log\s*\(/);
  return { passed: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(', ') : '' };
});
check('m4', 'minor', 'No hardcoded secrets in code/ (outside env files)', () => {
  const hits = grepTree(CODE, /\b(sk_live_|sk_test_|whsec_)[A-Za-z0-9]/, (f) => /env(\.sample)?\.ts$/.test(f));
  return { passed: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(', ') : '' };
});

// ─── Report ──────────────────────────────────────────────────────────────────

const order = { critical: 0, major: 1, minor: 2 };
results.sort((a, b) => order[a.severity] - order[b.severity]);

let failed = 0;
for (const r of results) {
  const ok = r.passed ? '✓' : '✗';
  if (!r.passed) failed++;
  const tail = r.detail ? `  (${r.detail})` : '';
  console.log(`  ${ok} [${r.id}] ${r.label}${r.passed ? '' : tail}`);
}

const criticalFails = results.filter((r) => !r.passed && r.severity === 'critical').length;
const majorFails = results.filter((r) => !r.passed && r.severity === 'major').length;
const minorFails = results.filter((r) => !r.passed && r.severity === 'minor').length;

console.log('');
console.log(
  `Mechanized checks: ${results.length - failed}/${results.length} passed ` +
    `(${criticalFails} critical, ${majorFails} major, ${minorFails} minor failing).`,
);
console.log(
  'Semantic checks (statusMap correctness, event/hook wiring) are not covered here — run /review-implementation.\n',
);

// Critical and Major are hard failures; minor is reported but does not fail the build.
process.exit(criticalFails + majorFails > 0 ? 1 : 0);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoDetectProvider(codeDir) {
  const clientsDir = path.join(codeDir, 'clients');
  if (!fs.existsSync(clientsDir)) return null;
  const ignore = new Set(['root-client.ts', 'base-http-client.ts']);
  const match = fs
    .readdirSync(clientsDir)
    .filter((f) => f.endsWith('-client.ts') && !ignore.has(f))
    .map((f) => f.replace(/-client\.ts$/, ''))[0];
  return match || null;
}

function readOrThrow(p) {
  if (!fs.existsSync(p)) throw new Error(`missing ${path.relative(ROOT, p)}`);
  return fs.readFileSync(p, 'utf8');
}

function fileIncludes(p, needle) {
  const text = readOrThrow(p);
  return { passed: text.includes(needle), detail: text.includes(needle) ? '' : `'${needle}' not found` };
}

function fileMatches(p, re) {
  const text = readOrThrow(p);
  return { passed: re.test(text), detail: re.test(text) ? '' : `pattern ${re} not found` };
}

function matchLines(text, re) {
  return text.split('\n').filter((line) => re.test(line) && !line.trim().startsWith('//'));
}

// Extract a brace-balanced object literal that follows `<name>`.
function extractBlock(text, name) {
  const start = text.indexOf(name);
  if (start === -1) return null;
  const open = text.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

function grepTree(dir, re, skip) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) {
        if (skip && skip(full)) continue;
        const text = fs.readFileSync(full, 'utf8');
        text.split('\n').forEach((line, i) => {
          if (re.test(line) && !line.trim().startsWith('//')) {
            hits.push(`${path.relative(ROOT, full)}:${i + 1}`);
          }
        });
      }
    }
  };
  walk(dir);
  return hits;
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) result[m[1]] = m[2];
  }
  return result;
}

function printHelp() {
  console.log(`
validate-provider.js — deterministic provider self-review

Usage:
  npm run validate:provider                      # auto-detect provider
  npm run validate:provider -- --provider=<slug>

Options:
  --provider   Provider slug (auto-detected from code/clients/ if omitted)
  --root       collection_module root (default: ../collection_module)
  --help       Show this help

Mechanizes the pattern-checkable criteria from docs/14-SELF-REVIEW.md
(C1-C6, C8, M1, M3, M8, m4). Semantic checks live in /review-implementation.
`);
}
