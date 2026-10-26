#!/usr/bin/env node
'use strict';

/**
 * validate-provider.js
 *
 * Deterministic half of the provider self-review. Mechanically checks the
 * pattern-matchable criteria from docs/14-SELF-REVIEW.md and exits non-zero on
 * any Critical or Major failure.
 *
 * Some criteria are mechanized only structurally: the script can tell that a
 * webhook switch routes two events, but not that they are the *right* two. Those
 * carry a `semanticGap` in the JSON output and a 🔎 marker alongside the ⚙ in
 * docs/14-SELF-REVIEW.md — the fresh-context reviewer in /review-implementation
 * closes them. Criteria with no honest mechanical check at all are reported in
 * `notChecked` rather than silently dropped.
 *
 * Usage:
 *   node scripts/validate-provider.js [--provider=<slug>] [--root=<path>] [--json]
 *   npm run validate:provider                 # auto-detects the provider
 *   npm run validate:provider -- --provider=gocardless
 *   npm run validate:provider -- --json       # machine-readable, no prose
 *
 * Options:
 *   --provider   Provider slug (e.g. gocardless). Auto-detected if omitted.
 *   --root       collection_module root (default: ../collection_module).
 *   --json       Emit the full result set as JSON on stdout and suppress the
 *                human-readable report entirely. Exit codes are unchanged.
 *   --allow-missing-provider
 *                Exit 0 instead of 2 when no provider is present. For CI on the
 *                bare template, where "no provider yet" is the normal state but
 *                a provider that IS present must still pass.
 *   --help       Show this help.
 *
 * JSON shape (schemaVersion 1):
 *   { schemaVersion, provider, root, results[], notChecked[], summary, exitCode }
 *   results[]:    { id, severity, passed, label, detail, file, line, semanticGap }
 *   notChecked[]: { id, severity, reason }
 *   On exit 2 the object is { schemaVersion, error, message, exitCode } instead.
 *
 * Exit codes:
 *   0  all Critical and (mechanizable) Major checks pass, or no provider is
 *      present and --allow-missing-provider was passed
 *   1  one or more checks failed
 *   2  usage / no provider found
 */

const fs = require('fs');
const path = require('path');

const args = parseArgs(process.argv.slice(2));
const JSON_MODE = args.json === true;

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
  // The bare template has no provider, which is its normal state. CI still runs
  // the script so that the moment a provider IS added, every criterion gates it.
  const tolerated = args['allow-missing-provider'] === true;
  const code = tolerated ? 0 : 2;
  const message =
    'No provider implementation found in code/clients/. Run `npm run scaffold:provider` first, or pass --provider=<slug>.';
  if (JSON_MODE) {
    process.stdout.write(
      `${JSON.stringify({ schemaVersion: 1, error: 'no-provider', message, exitCode: code }, null, 2)}\n`,
    );
  } else if (tolerated) {
    console.log(`○ No provider implementation yet — nothing to validate.\n  ${message}`);
  } else {
    console.error(`✗ ${message.replace('. ', '.\n  ')}`);
  }
  process.exit(code);
}

const Provider = provider.charAt(0).toUpperCase() + provider.slice(1);
say(`\nValidating provider: ${Provider} (slug: ${provider})\n`);

// ─── Files this provider should own ─────────────────────────────────────────

const clientPath = path.join(CODE, 'clients', `${provider}-client.ts`);
const servicePath = path.join(CODE, 'services', `${provider}.service.ts`);
const adapterPath = path.join(CODE, 'adapters', `${provider}-to-root-adapter.ts`);
const eventsPath = path.join(CODE, 'interfaces', `${provider}-events.ts`);
const containerPath = path.join(CODE, 'core', 'container.setup.ts');
const webhookPath = path.join(CODE, 'webhook-hooks.ts');
const envSamplePath = path.join(CODE, 'env.sample.ts');
const policyHooksPath = path.join(CODE, 'lifecycle-hooks', 'policy.hooks.ts');
const paymentHooksPath = path.join(CODE, 'lifecycle-hooks', 'payment.hooks.ts');
const paymentMethodHooksPath = path.join(CODE, 'lifecycle-hooks', 'payment-method.hooks.ts');
const serviceTestPath = path.join(TESTS, 'services', `${provider}.service.test.ts`);

// Methods on PaymentProviderService (code/interfaces/provider.interfaces.ts).
// Used to report *which* provider calls a hook makes — reporting only, never a gate.
const SERVICE_METHODS = [
  'createCustomer',
  'getCustomer',
  'updateCustomer',
  'createPaymentIntent',
  'getPaymentMethod',
  'attachPaymentMethod',
  'cancelSubscription',
];

// Control-flow keywords read as a method name when followed by `(`. Belt and
// braces alongside the class-body bound in publicMethods().
const RESERVED = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'with']);

// ─── Checks ──────────────────────────────────────────────────────────────────

const results = [];

function check(meta, fn) {
  const entry = {
    id: meta.id,
    severity: meta.severity,
    passed: false,
    label: meta.label,
    detail: '',
    file: meta.file ? rel(meta.file) : null,
    line: null,
    semanticGap: meta.semanticGap || null,
  };
  try {
    const out = fn();
    entry.passed = out === true || Boolean(out && out.passed);
    if (out && typeof out === 'object') {
      entry.detail = out.detail || '';
      if (out.file) entry.file = rel(out.file);
      if (out.line) entry.line = out.line;
    }
  } catch (err) {
    entry.passed = false;
    entry.detail = err.message;
    if (err.file) entry.file = rel(err.file);
  }
  results.push(entry);
}

// Criteria with no honest mechanical check. Surfaced rather than dropped — a gap
// you can read is worth more than a check that cannot fail.
const notChecked = [
  {
    id: 'C7',
    severity: 'critical',
    reason:
      'All tests pass. Left to `npm test`, which already is the command with the exit code. Shelling out to jest from here would conflate a lint failure with a test failure under one exit code, and would make --json unparseable by interleaving jest output.',
  },
  {
    id: 'S1',
    severity: 'critical',
    reason:
      'statusMap and events match the filled spec. Requires reading the provider spec and judging semantic correctness — the fresh-context reviewer in /review-implementation owns it.',
  },
];

// --- Critical ---------------------------------------------------------------

check(
  { id: 'C1', severity: 'critical', label: 'PROVIDER_CLIENT registered in container.setup.ts', file: containerPath },
  () => fileIncludes(containerPath, 'ServiceToken.PROVIDER_CLIENT'),
);
check(
  { id: 'C2', severity: 'critical', label: 'PROVIDER_SERVICE registered in container.setup.ts', file: containerPath },
  () => fileIncludes(containerPath, 'ServiceToken.PROVIDER_SERVICE'),
);
check(
  { id: 'C3', severity: 'critical', label: 'Webhook signature verified before parsing', file: webhookPath },
  () => {
    // Comment-stripped, like M7 and m3. The template ships this file with the
    // signature check present only inside a commented-out example, and a raw
    // text search would pass it — on the one criterion that stops an unsigned
    // webhook being trusted.
    const text = stripComments(readOrThrow(webhookPath));
    const at = text.indexOf('verifyWebhookSignature');
    return {
      passed: at !== -1,
      detail: at === -1 ? 'no live call to verifyWebhookSignature' : '',
      line: at === -1 ? null : lineAt(text, at),
    };
  },
);
check({ id: 'C4', severity: 'critical', label: 'No unimplemented TODO stubs in service', file: servicePath }, () => {
  const text = readOrThrow(servicePath);
  // Deliberately scans comments too: the scaffolder writes its stub markers as
  // `// TODO: implement`, so skipping comment lines would make C4 unfireable.
  const hits = matchAllLines(text, /TODO:\s*implement/i);
  return {
    passed: hits.length === 0,
    detail: hits.length ? `${hits.length} stub(s) left` : '',
    line: hits.length ? hits[0].line : null,
  };
});
check({ id: 'C5', severity: 'critical', label: 'Adapter statusMap is non-empty', file: adapterPath }, () => {
  const text = readOrThrow(adapterPath);
  const block = extractBlock(text, 'statusMap');
  const entries = block ? matchLines(block, /PaymentStatus\./) : [];
  return {
    passed: entries.length > 0,
    detail: entries.length ? `${entries.length} mapping(s)` : 'statusMap empty or not found',
  };
});
check({ id: 'C6', severity: 'critical', label: 'Event constants use real names (no placeholders)', file: eventsPath }, () => {
  const text = readOrThrow(eventsPath);
  const placeholders = matchLines(
    text,
    /'(actual\.event\.[a-z.]+|provider\.payment\.[a-z.]+|TODO[^']*|placeholder[^']*)'/i,
  );
  return {
    passed: placeholders.length === 0,
    detail: placeholders.length ? `${placeholders.length} placeholder(s)` : '',
    line: placeholders.length ? placeholders[0].line : null,
  };
});
check({ id: 'C8', severity: 'critical', label: 'Config keys added to env.sample.ts', file: envSamplePath }, () =>
  fileMatches(envSamplePath, /SECRET_KEY/),
);

// --- Major (also hard failures, per the build-from-spec workflow design) -----

check({ id: 'M1', severity: 'major', label: 'Service API calls wrapped in retryWithBackoff()', file: servicePath }, () =>
  fileIncludes(servicePath, 'retryWithBackoff'),
);
check(
  {
    id: 'M2',
    severity: 'major',
    label: 'Every public service method logs as its first statement',
    file: servicePath,
  },
  () => {
    const methods = publicMethods(readOrThrow(servicePath), servicePath);
    if (methods.length === 0) {
      return { passed: false, detail: 'no public methods found on the service class' };
    }
    const silent = methods.filter((m) => !/^\s*(?:await\s+)?this\.log\w*\.\w+\(/.test(firstStatement(m.body)));
    return {
      passed: silent.length === 0,
      detail: silent.length ? `${silent.map((m) => m.name).join(', ')} do not log first` : `${methods.length} method(s) log first`,
      line: silent.length ? silent[0].line : null,
    };
  },
);
check({ id: 'M3', severity: 'major', label: 'Service throws ModuleError, not raw Error', file: servicePath }, () => {
  const text = readOrThrow(servicePath);
  const raw = matchLines(text, /throw new Error\(/);
  return {
    passed: raw.length === 0,
    detail: raw.length ? `${raw.length} raw throw(s)` : '',
    line: raw.length ? raw[0].line : null,
  };
});
check(
  {
    id: 'M4',
    severity: 'major',
    label: 'afterPolicyIssued is implemented (resolves PROVIDER_SERVICE and awaits a call on it)',
    file: policyHooksPath,
    semanticGap:
      'Whether it creates a customer and writes the id to app_data — the method and the app_data key are judgement calls.',
  },
  () => hookIsWired(policyHooksPath, 'afterPolicyIssued'),
);
check(
  {
    id: 'M5',
    severity: 'major',
    label: 'afterPaymentCreated is implemented (resolves PROVIDER_SERVICE and awaits a call on it)',
    file: paymentHooksPath,
    semanticGap: 'Whether it fires a payment intent with the right amount, currency and customer.',
  },
  () => hookIsWired(paymentHooksPath, 'afterPaymentCreated'),
);
check(
  {
    id: 'M6',
    severity: 'major',
    label: 'afterPolicyPaymentMethodAssigned is implemented (resolves PROVIDER_SERVICE and awaits a call on it)',
    file: paymentMethodHooksPath,
    semanticGap: 'Whether it attaches the payment method to the right provider customer.',
  },
  () => hookIsWired(paymentMethodHooksPath, 'afterPolicyPaymentMethodAssigned'),
);
check(
  {
    id: 'M7',
    severity: 'major',
    label: 'Webhook routing has a live switch with at least two event cases',
    file: webhookPath,
    semanticGap:
      'Whether the cases are the success and failure events for this provider. Event names are provider-specific — S1 covers it.',
  },
  () => {
    const sw = webhookSwitch();
    if (!sw) return { passed: false, detail: 'no live switch statement in webhook-hooks.ts' };
    return {
      passed: sw.cases.length >= 2,
      detail: `${sw.cases.length} case(s): ${sw.cases.join(', ') || 'none'}`,
      line: sw.line,
    };
  },
);
check({ id: 'M8', severity: 'major', label: 'No console.log in code/', file: CODE }, () => {
  // LogService is the sanctioned console sink — the convention is "LogService
  // only", not "nothing anywhere writes to stdout". Without this exemption M8
  // can never pass on any module built from this template.
  const hits = grepTree(CODE, /\bconsole\.log\s*\(/, (f) => /services[\\/]log\.service\.ts$/.test(f));
  return { passed: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(', ') : '' };
});

// --- Minor ------------------------------------------------------------------

check(
  {
    id: 'm1',
    severity: 'minor',
    label: 'Every public service method is named in the service test file',
    file: serviceTestPath,
    semanticGap:
      'Whether the test asserts anything meaningful. Presence of the name is checkable; a passing assertion is C7 (`npm test`).',
  },
  () => {
    const methods = publicMethods(readOrThrow(servicePath), servicePath);
    const testText = readOrThrow(serviceTestPath);
    const untested = methods.filter((m) => !new RegExp(`\\b${m.name}\\b`).test(testText));
    return {
      passed: untested.length === 0,
      detail: untested.length ? `untested: ${untested.map((m) => m.name).join(', ')}` : `${methods.length} method(s) referenced`,
    };
  },
);
check(
  { id: 'm2', severity: 'minor', label: 'Adapter convertCustomerToAppData stores the provider customer id', file: adapterPath },
  () => {
    const text = stripComments(readOrThrow(adapterPath));
    const fn = extractCallable(text, 'convertCustomerToAppData');
    if (!fn) return { passed: false, detail: 'convertCustomerToAppData not found' };
    const storesId = /:\s*[A-Za-z_$][\w$]*(?:\?)?\.id\b/.test(fn.body);
    return {
      passed: storesId,
      detail: storesId ? '' : 'no property assigned from the provider customer `.id`',
      line: fn.line,
    };
  },
);
check({ id: 'm3', severity: 'minor', label: 'Webhook switch default case logs the unhandled event type', file: webhookPath }, () => {
  const sw = webhookSwitch();
  if (!sw) return { passed: false, detail: 'no live switch statement in webhook-hooks.ts' };
  if (sw.defaultBody === null) return { passed: false, detail: 'switch has no default case', line: sw.line };
  const logs = /\blog\w*\.\w+\(/.test(sw.defaultBody);
  return { passed: logs, detail: logs ? '' : 'default case does not log', line: sw.line };
});
check({ id: 'm4', severity: 'minor', label: 'No hardcoded secrets in code/ (outside env files)', file: CODE }, () => {
  const hits = grepTree(CODE, /\b(sk_live_|sk_test_|whsec_)[A-Za-z0-9]/, (f) => /env(\.sample)?\.ts$/.test(f));
  return { passed: hits.length === 0, detail: hits.length ? hits.slice(0, 5).join(', ') : '' };
});
check(
  { id: 'm5', severity: 'minor', label: 'verifyWebhookSignature returns false rather than throwing', file: clientPath },
  () => {
    const text = stripComments(readOrThrow(clientPath));
    const fn = extractCallable(text, 'verifyWebhookSignature');
    if (!fn) return { passed: false, detail: 'verifyWebhookSignature not found in the client' };
    const throws = /\bthrow\b/.test(fn.body);
    const returnsFalse = /\breturn\s+false\b/.test(fn.body) || /\breturn\s+[^;]*===/.test(fn.body);
    if (throws) return { passed: false, detail: 'method throws on an invalid signature', line: fn.line };
    return {
      passed: returnsFalse,
      detail: returnsFalse ? '' : 'no `return false` path on an invalid signature',
      line: fn.line,
    };
  },
);

// ─── Report ──────────────────────────────────────────────────────────────────

const order = { critical: 0, major: 1, minor: 2 };
results.sort((a, b) => order[a.severity] - order[b.severity]);

const failed = results.filter((r) => !r.passed).length;
const criticalFails = results.filter((r) => !r.passed && r.severity === 'critical').length;
const majorFails = results.filter((r) => !r.passed && r.severity === 'major').length;
const minorFails = results.filter((r) => !r.passed && r.severity === 'minor').length;

// Critical and Major are hard failures; minor is reported but does not fail the build.
const exitCode = criticalFails + majorFails > 0 ? 1 : 0;

if (JSON_MODE) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        provider,
        root: ROOT,
        results,
        notChecked,
        summary: {
          total: results.length,
          passed: results.length - failed,
          failed,
          criticalFailed: criticalFails,
          majorFailed: majorFails,
          minorFailed: minorFails,
        },
        exitCode,
      },
      null,
      2,
    )}\n`,
  );
} else {
  for (const r of results) {
    const ok = r.passed ? '✓' : '✗';
    const where = !r.passed && r.file ? ` — ${r.file}${r.line ? `:${r.line}` : ''}` : '';
    const tail = !r.passed && r.detail ? `  (${r.detail})` : '';
    console.log(`  ${ok} [${r.id}] ${r.label}${where}${tail}`);
  }

  console.log('');
  console.log(
    `Mechanized checks: ${results.length - failed}/${results.length} passed ` +
      `(${criticalFails} critical, ${majorFails} major, ${minorFails} minor failing).`,
  );
  const partial = results.filter((r) => r.semanticGap).map((r) => r.id);
  console.log(
    `Structural only (a reviewer still has to judge these): ${partial.join(', ')}.\n` +
      `Not checked here: ${notChecked.map((n) => n.id).join(', ')} — see docs/14-SELF-REVIEW.md.\n` +
      'Run /review-implementation for the semantic half.\n',
  );
}

process.exit(exitCode);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function say(line) {
  if (!JSON_MODE) console.log(line);
}

function rel(p) {
  return path.relative(ROOT, p);
}

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
  if (!fs.existsSync(p)) {
    const err = new Error(`missing ${rel(p)}`);
    err.file = p;
    throw err;
  }
  return fs.readFileSync(p, 'utf8');
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function fileIncludes(p, needle) {
  const text = readOrThrow(p);
  const at = text.indexOf(needle);
  return { passed: at !== -1, detail: at === -1 ? `'${needle}' not found` : '', line: at === -1 ? null : lineAt(text, at) };
}

function fileMatches(p, re) {
  const text = readOrThrow(p);
  const m = text.match(re);
  return { passed: Boolean(m), detail: m ? '' : `pattern ${re} not found`, line: m ? lineAt(text, m.index) : null };
}

// Lines matching `re`, ignoring whole-line `//` comments. Returns {line, text}.
function matchLines(text, re) {
  return matchAllLines(text, re).filter((hit) => !hit.text.trim().startsWith('//'));
}

// Lines matching `re`, comments included.
function matchAllLines(text, re) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (re.test(line)) out.push({ line: i + 1, text: line });
  });
  return out;
}

// Extract a brace-balanced object literal that follows `<name>`.
function extractBlock(text, name) {
  const start = text.indexOf(name);
  if (start === -1) return null;
  const open = text.indexOf('{', start);
  if (open === -1) return null;
  const end = matchBrace(text, open);
  return end === -1 ? text.slice(open) : text.slice(open, end + 1);
}

// Index of the `}` that closes the `{` at `open`, or -1.
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Blank out comments while preserving every byte offset and line break, so line
 * numbers computed against the result still point at the original file. Used by
 * the structural checks (M2, M4–M7, m1–m3, m5) so that a commented-out example —
 * which is exactly what the unimplemented template ships — never reads as
 * implemented code. The presence checks (C4, C6) deliberately do NOT use this:
 * the stubs they hunt for live in comments.
 */
function stripComments(text) {
  const out = text.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '\\') {
      i += 2;
    } else if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      blank(i, end === -1 ? text.length : end);
      i = end === -1 ? text.length : end;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "'" || c === '"' || c === '`') {
      i += 1;
      while (i < text.length && text[i] !== c) {
        i += text[i] === '\\' ? 2 : 1;
      }
      i += 1;
    } else if (c === '/' && startsRegex(text, i)) {
      // A regex literal can carry a quote (`/'/g`). Left unrecognised, that quote
      // opens a phantom string and every later quote and comment marker pairs up
      // one out of phase, which can blank live code: a `/*` inside a real string
      // then reads as a comment and silently removes the rest of the file.
      i += 1;
      let inClass = false;
      while (i < text.length) {
        const d = text[i];
        if (d === '\\') {
          i += 2;
          continue;
        }
        if (d === '\n') break; // unterminated: it was a division sign after all
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) {
          i += 1;
          break;
        }
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/**
 * Is the `/` at `index` the start of a regex literal rather than a division
 * sign? Division can only follow a value, so a `/` in prefix position — after an
 * operator, a comma, an opening bracket, or nothing at all — opens a regex.
 */
function startsRegex(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    return !/[A-Za-z0-9_$)\]."'`]/.test(c);
  }
  return true;
}

/**
 * Find a callable named `name` — a class method or a `function` declaration —
 * and return its brace-balanced body. `text` should already be comment-stripped.
 */
function extractCallable(text, name) {
  // Matches `function name(`, a class method `async name(`, and the arrow form
  // `const name = async (`.
  const re = new RegExp(`(?:^|[\\s;{}])(?:function\\s+)?${name}\\s*(?:[:=]\\s*(?:async\\s+)?)?\\(`, 'g');
  let m = re.exec(text);
  while (m) {
    const parenOpen = text.indexOf('(', m.index + m[0].length - 1);
    const parenClose = matchParen(text, parenOpen);
    if (parenClose !== -1) {
      const braceOpen = findBodyBrace(text, parenClose);
      // Reject a call site: only a return type or `=>` may sit between `)` and `{`.
      const between = braceOpen === -1 ? '' : text.slice(parenClose + 1, braceOpen);
      if (braceOpen !== -1 && !/[;)]/.test(between)) {
        const braceClose = matchBrace(text, braceOpen);
        if (braceClose !== -1) {
          return { name, body: text.slice(braceOpen + 1, braceClose), line: lineAt(text, m.index + 1) };
        }
      }
    }
    m = re.exec(text);
  }
  return null;
}

function matchParen(text, open) {
  if (open === -1) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Public methods declared on the single class in `text`. Skips the constructor
 * and anything marked private/protected — the criterion is about the service's
 * public surface, and requiring a log line from a two-line private mapper would
 * be a false failure.
 */
function publicMethods(raw, file) {
  const text = stripComments(raw);
  const methods = [];
  // Confine the scan to the class body. The 2-space indent alone does not say
  // "method": a module-level `function toCents(n) { if (n < 0) { ... } }` puts an
  // `if (` at 2-space indent, which otherwise reads as a public method named
  // `if` and fails M2 on perfectly valid code.
  const classAt = text.search(/\bclass\s+[A-Za-z_$][\w$]*/);
  if (classAt === -1) return methods;
  const classOpen = text.indexOf('{', classAt);
  const classClose = classOpen === -1 ? -1 : matchBrace(text, classOpen);
  if (classClose === -1) return methods;

  const re = /^ {2}(?!\/\/)((?:public |private |protected |static |readonly )*)(?:(async)\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;
  re.lastIndex = classOpen;
  let m = re.exec(text);
  while (m && m.index < classClose) {
    const [, modifiers, , name] = m;
    const skip =
      name === 'constructor' || RESERVED.has(name) || /\b(private|protected)\b/.test(modifiers);
    if (!skip) {
      const parenClose = matchParen(text, text.indexOf('(', m.index + m[0].length - 1));
      const braceOpen = findBodyBrace(text, parenClose);
      const braceClose = braceOpen === -1 ? -1 : matchBrace(text, braceOpen);
      if (braceClose !== -1) {
        methods.push({
          name,
          body: text.slice(braceOpen + 1, braceClose),
          line: lineAt(text, m.index),
          file,
        });
      }
    }
    m = re.exec(text);
  }
  return methods;
}

function firstStatement(body) {
  const line = body.split('\n').find((l) => l.trim() !== '');
  return line || '';
}

/**
 * A lifecycle hook counts as wired when it resolves PROVIDER_SERVICE and awaits
 * something on the resolved value, in live code. Whether it calls the *right*
 * method, with the right arguments, is the semanticGap on M4–M6: the method
 * vocabulary is shared but the correct choice is provider-specific.
 */
function hookIsWired(file, hookName) {
  const text = stripComments(readOrThrow(file));
  const fn = extractCallable(text, hookName);
  if (!fn) return { passed: false, detail: `${hookName} not found`, file };
  // Bind to the variable the resolve is assigned to. Checking "PROVIDER_SERVICE
  // appears" and "some await exists" as two independent facts passes a hook that
  // resolves the service, never touches it, and awaits something else entirely.
  const binding = fn.body.match(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*[^;]*ServiceToken\.PROVIDER_SERVICE/,
  );
  if (!binding) {
    return { passed: false, detail: 'does not resolve ServiceToken.PROVIDER_SERVICE', file, line: fn.line };
  }
  const name = binding[1];
  const called = [...fn.body.matchAll(new RegExp(`\\b(?:await|return)\\s+${name}\\s*\\.\\s*([\\w$]+)\\s*\\(`, 'g'))].map(
    (m) => m[1],
  );
  if (called.length === 0) {
    return {
      passed: false,
      detail: `resolves PROVIDER_SERVICE as \`${name}\` but never awaits a call on it`,
      file,
      line: fn.line,
    };
  }
  const known = called.filter((m) => SERVICE_METHODS.includes(m));
  return {
    passed: true,
    detail: `calls ${[...new Set(called)].join(', ')}${known.length ? '' : ' (not a PaymentProviderService method)'}`,
    file,
    line: fn.line,
  };
}

/**
 * Index of the `{` that opens a function body, scanning from the signature's
 * closing paren. A `{` nested inside a generic type argument is not the body:
 * `async getCustomer(id: string): Promise<{ id: string }>` would otherwise have
 * its return type read as its body. Returns -1 when there is no body at all,
 * which is what an overload or interface signature looks like.
 */
function findBodyBrace(text, parenClose) {
  if (parenClose === -1) return -1;
  let angle = 0;
  for (let i = parenClose + 1; i < text.length; i += 1) {
    const c = text[i];
    if (c === '<') angle += 1;
    else if (c === '>') angle = Math.max(0, angle - 1);
    else if (c === ';') return -1;
    else if (c === '{') {
      if (angle === 0) return i;
      const close = matchBrace(text, i);
      if (close === -1) return -1;
      i = close;
    }
  }
  return -1;
}

// The first live `switch` in webhook-hooks.ts, with its case labels and default
// body. M7 and m3 both need it; memoised on the function itself so the cache is
// reachable from the checks above without a temporal-dead-zone trap.
function webhookSwitch() {
  if ('value' in webhookSwitch) return webhookSwitch.value;
  webhookSwitch.value = null;
  const text = stripComments(readOrThrow(webhookPath));
  const at = text.search(/\bswitch\s*\(/);
  if (at === -1) return webhookSwitch.value;
  const braceOpen = text.indexOf('{', matchParen(text, text.indexOf('(', at)));
  const braceClose = braceOpen === -1 ? -1 : matchBrace(text, braceOpen);
  if (braceClose === -1) return webhookSwitch.value;
  const body = text.slice(braceOpen + 1, braceClose);
  webhookSwitch.value = {
    cases: [...body.matchAll(/\bcase\s+([^:]+):/g)].map((m) => m[1].trim()),
    defaultBody: body.search(/\bdefault\s*:/) === -1 ? null : body.slice(body.search(/\bdefault\s*:/)),
    line: lineAt(text, at),
  };
  return webhookSwitch.value;
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
            hits.push(`${rel(full)}:${i + 1}`);
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
    const kv = arg.match(/^--([^=]+)=(.*)$/);
    if (kv) {
      result[kv[1]] = kv[2];
      continue;
    }
    const flag = arg.match(/^--([\w-]+)$/);
    if (flag) result[flag[1]] = true;
  }
  return result;
}

function printHelp() {
  console.log(`
validate-provider.js — deterministic provider self-review

Usage:
  npm run validate:provider                      # auto-detect provider
  npm run validate:provider -- --provider=<slug>
  npm run validate:provider -- --json            # machine-readable, no prose

Options:
  --provider   Provider slug (auto-detected from code/clients/ if omitted)
  --root       collection_module root (default: ../collection_module)
  --json       Emit JSON on stdout and suppress the human-readable report
  --allow-missing-provider
               Exit 0 rather than 2 when no provider is present (for CI on the
               bare template). A provider that IS present still has to pass.
  --help       Show this help

Mechanizes C1-C6, C8, M1-M8 and m1-m5 from docs/14-SELF-REVIEW.md. M4-M7 and m1
are structural only — the semantic half of each is reported as semanticGap in
--json and marked ⚙🔎 in the doc. C7 (npm test) and S1 (spec fidelity) are not
checked here; see the notChecked array in --json output.
`);
}
