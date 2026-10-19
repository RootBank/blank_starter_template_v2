#!/usr/bin/env node
'use strict';

/**
 * simulate.js
 *
 * Runs a webhook or a lifecycle hook through the *real* collection module,
 * offline, with no deploy and no sandbox.
 *
 *   npm run sim:webhook   -- --event=payment.succeeded
 *   npm run sim:lifecycle -- --hook=afterPolicyIssued
 *
 * What it actually does:
 *
 *   webhook    loads a fixture, computes a real signature from the scheme the
 *              fixture declares and the secret the module's own
 *              ConfigurationService resolves, then calls the real
 *              `processWebhookRequest` export in code/webhook-hooks.ts with the
 *              DI container wired as it is at runtime.
 *
 *   lifecycle  calls the real hook export from code/lifecycle-hooks/index.ts
 *              with the argument shape documented in docs/07-LIFECYCLE-HOOKS.md.
 *
 * Signatures are never stubbed out. There is no "skip verification" mode: a
 * fixture that does not declare a scheme is a usage error, because signature
 * handling is the part of a payment integration most worth simulating.
 *
 * Nothing leaves the machine. ROOT_CLIENT and PROVIDER_SERVICE are replaced
 * with recording stubs, and http/https/fetch are blocked for the duration of
 * the run so an un-stubbed call fails loudly instead of hitting a real API.
 *
 * Usage:
 *   node scripts/simulate.js webhook   [--event=<name>] [--fixture=<path>] [options]
 *   node scripts/simulate.js lifecycle --hook=<name>    [--fixture=<path>] [options]
 *   node scripts/simulate.js webhook   --list
 *   node scripts/simulate.js lifecycle --list
 *
 * Options:
 *   --event        Event name to match against fixture `event` or `name`.
 *   --hook         Lifecycle hook to invoke (see --list).
 *   --fixture      Explicit fixture path. Overrides --event / --hook lookup.
 *   --tamper       Corrupt the signature digest before sending. The run then
 *                  expects a rejection; an acceptance is a failure.
 *   --timestamp    Unix seconds used for `{timestamp}` in a payload template.
 *                  Defaults to now. Pass it to make a run reproducible.
 *   --env          sandbox | production. Default sandbox.
 *   --json         Emit a single JSON object on stdout and nothing else.
 *   --root         collection_module root (default: ../collection_module).
 *   --list         List the fixtures (webhook) or hooks (lifecycle) available.
 *   --help         Show this help.
 *
 * Exit codes:
 *   0  the run matched its expectation
 *   1  the handler errored, rejected a good signature, or accepted a bad one
 *   2  usage error — unknown fixture/hook, missing or unknown signature scheme
 *
 * See: collection_module/docs/08-WEBHOOKS.md   (payload shapes, verification)
 * See: collection_module/docs/07-LIFECYCLE-HOOKS.md (hook catalogue, signatures)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

// ─── Lifecycle hook catalogue ───────────────────────────────────────────────
//
// Argument shapes are taken verbatim from docs/07-LIFECYCLE-HOOKS.md § Hook
// reference, which is the documented contract for what Root passes in.

const LIFECYCLE_HOOKS = {
  afterPolicyIssued: { args: ['policy'], async: true },
  afterPolicyUpdated: { args: ['policy', 'updates'], async: false },
  afterPolicyCancelled: { args: ['policy'], async: true },
  afterPolicyExpired: { args: ['policy'], async: false },
  afterPolicyLapsed: { args: ['policy'], async: false },
  afterAlterationPackageApplied: {
    args: ['policy', 'alteration_package', 'alteration_hook_key'],
    async: false,
  },
  afterPaymentCreated: { args: ['policy', 'payment'], async: true },
  afterPaymentUpdated: { args: ['policy', 'payment'], async: true },
  createPaymentMethod: { args: ['data'], async: false },
  renderCreatePaymentMethod: { args: [], async: true },
  renderViewPaymentMethodSummary: { args: ['payment_method'], async: true },
  renderViewPaymentMethod: { args: [], async: false },
  afterPolicyPaymentMethodAssigned: { args: ['policy'], async: true },
  afterPaymentMethodRemoved: { args: ['policy'], async: true },
};

// ─── Signature digests ──────────────────────────────────────────────────────
//
// Every entry computes a real digest. Adding a scheme here is the only way to
// make the simulator understand a new one — there is deliberately no default.

const DIGESTS = {
  'hmac-sha256-hex': (payload, key) => hmac('sha256', key, payload, 'hex'),
  'hmac-sha256-base64': (payload, key) => hmac('sha256', key, payload, 'base64'),
  'hmac-sha1-hex': (payload, key) => hmac('sha1', key, payload, 'hex'),
  'hmac-sha512-hex': (payload, key) => hmac('sha512', key, payload, 'hex'),
  'md5-hex': (payload) => crypto.createHash('md5').update(payload).digest('hex'),
  'sha256-hex': (payload) => crypto.createHash('sha256').update(payload).digest('hex'),
};

const SECRET_ENCODINGS = ['utf8', 'hex', 'base64'];
const PLACEMENTS = ['header', 'body-path', 'body-query'];

function hmac(algorithm, key, payload, encoding) {
  return crypto.createHmac(algorithm, key).update(payload).digest(encoding);
}

// ─── Entry point ────────────────────────────────────────────────────────────

function main(argv) {
  const subcommand = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;
  const args = parseArgs(subcommand ? argv.slice(1) : argv);

  if (args.help || !subcommand) {
    printHelp();
    return args.help ? 0 : 2;
  }

  const root = args.root
    ? path.resolve(args.root)
    : path.resolve(__dirname, '..', 'collection_module');

  if (subcommand === 'webhook') return runWebhook(root, args);
  if (subcommand === 'lifecycle') return runLifecycle(root, args);

  fail(`Unknown subcommand: ${subcommand}. Expected "webhook" or "lifecycle".`);
  return 2;
}

// ─── webhook ────────────────────────────────────────────────────────────────

function runWebhook(root, args) {
  const fixtureDir = path.join(root, '__tests__', 'fixtures', 'webhooks');

  if (args.list) {
    listWebhookFixtures(fixtureDir, args.json);
    return 0;
  }

  let fixture;
  try {
    fixture = loadWebhookFixture(fixtureDir, args);
  } catch (err) {
    fail(err.message);
    return 2;
  }

  const record = newRecord();

  let unhook;
  try {
    unhook = registerTypeScript(root);
  } catch (err) {
    fail(err.message);
    return 2;
  }
  const envSource = redirectMissingEnv(root);

  let wiring;
  let processWebhookRequest;
  let secret;

  try {
    const loaded = loadModule(root, args, record);
    wiring = loaded.wiring;
    secret = resolveSecret(loaded, fixture);
    // eslint-disable-next-line global-require, import/no-dynamic-require
    processWebhookRequest = require(path.join(root, 'code', 'webhook-hooks.ts'))
      .processWebhookRequest;
  } catch (err) {
    unhook();
    fail(`Could not load the collection module: ${err.message}`);
    return 2;
  }

  let signed;
  try {
    signed = signFixture(fixture, secret, {
      timestamp: args.timestamp ? Number(args.timestamp) : Math.floor(Date.now() / 1000),
      tamper: Boolean(args.tamper),
    });
  } catch (err) {
    unhook();
    fail(err.message);
    return 2;
  }

  const request = {
    request: {
      method: (fixture.transport && fixture.transport.method) || 'POST',
      headers: signed.headers,
      body: Buffer.from(signed.body, 'utf8'),
    },
  };

  const restoreNetwork = installNetworkGuard(record);
  const stopCapture = captureConsole(record);

  let response = null;
  let thrown = null;

  return Promise.resolve()
    .then(() => processWebhookRequest(request))
    .then(
      (result) => {
        response = result;
      },
      (err) => {
        thrown = err;
      },
    )
    .then(() => {
      stopCapture();
      restoreNetwork();
      unhook();

      const outcome = judgeWebhook(fixture, signed, response, thrown, wiring, record);
      const report = {
        kind: 'webhook',
        fixture: {
          path: path.relative(root, fixture.__path),
          name: fixture.name,
          event: fixture.event || null,
          shape: fixture.shape || null,
          notes: fixture.notes || null,
        },
        environment: args.env || 'sandbox',
        envSource,
        wiring,
        signature: signed.report,
        request: {
          method: request.request.method,
          headers: signed.headers,
          bodyBytes: Buffer.byteLength(signed.body, 'utf8'),
          body: signed.body,
        },
        response: response && response.response ? response.response : null,
        error: thrown ? { message: thrown.message, name: thrown.name } : null,
        handlerLog: record.logs,
        interceptedCalls: record.calls,
        blockedNetworkCalls: record.network,
        expectation: outcome.expectation,
        result: outcome.status,
        reason: outcome.reason,
        doesNotProve: caveats(wiring, 'webhook'),
      };

      emit(report, args.json, () => printWebhookReport(report));
      return outcome.status === 'PASS' ? 0 : 1;
    });
}

function handlerError(record) {
  const errors = record.logs.filter((line) => String(line.level) === 'ERROR');
  if (errors.length === 0) return null;
  const last = errors[errors.length - 1];
  const detail = last.metadata && last.metadata.error ? `: ${last.metadata.error}` : '';
  return `${last.message}${detail}`;
}

function judgeWebhook(fixture, signed, response, thrown, wiring, record) {
  if (thrown) {
    return {
      expectation: describeExpectation(fixture, signed),
      status: 'FAIL',
      reason:
        `processWebhookRequest threw instead of returning a response: ${thrown.message}. ` +
        'A webhook handler must convert every failure into an HTTP response — ' +
        'see docs/12-ERROR-HANDLING.md.',
    };
  }

  const status = response && response.response ? response.response.status : null;

  if (status === null) {
    return {
      expectation: describeExpectation(fixture, signed),
      status: 'FAIL',
      reason:
        'processWebhookRequest returned no { response: { status } } object. ' +
        'See docs/08-WEBHOOKS.md § Implementation steps.',
    };
  }

  if (signed.report.tampered) {
    if (status >= 200 && status < 300) {
      return {
        expectation: describeExpectation(fixture, signed),
        status: 'FAIL',
        reason: wiring.verificationWired
          ? `The handler accepted a tampered signature (status ${status}). ` +
            'Signature verification is wired but is not rejecting bad digests.'
          : `The handler accepted a tampered signature (status ${status}) because ` +
            'signature verification is not wired yet — Step 1 of code/webhook-hooks.ts ' +
            'is still commented out. Wire it and run --tamper again.',
      };
    }
    return {
      expectation: describeExpectation(fixture, signed),
      status: 'PASS',
      reason: `Tampered signature rejected with status ${status}.`,
    };
  }

  const expected = (fixture.expect && fixture.expect.status) || 200;
  if (status !== expected) {
    return {
      expectation: describeExpectation(fixture, signed),
      status: 'FAIL',
      reason:
        `Expected status ${expected}, got ${status}. ` +
        (status === 403
          ? 'The handler rejected a signature this simulator computed with the module’s ' +
            'own configured secret — the signing scheme in the fixture and the scheme in ' +
            'the provider client disagree.'
          : handlerError(record)
            ? `The handler logged "${handlerError(record)}". ` +
              'A 500 means the handler could not process a payload it was handed — ' +
              'check that it parses this fixture’s content type.'
            : 'See the handler log below.'),
    };
  }

  return {
    expectation: describeExpectation(fixture, signed),
    status: 'PASS',
    reason: `Handler returned ${status} as expected.`,
  };
}

function describeExpectation(fixture, signed) {
  if (signed.report.tampered) return 'reject (any non-2xx status)';
  return `status ${(fixture.expect && fixture.expect.status) || 200}`;
}

// ─── lifecycle ──────────────────────────────────────────────────────────────

function runLifecycle(root, args) {
  if (args.list) {
    listHooks(args.json);
    return 0;
  }

  const hookName = args.hook;
  if (!hookName) {
    fail('lifecycle needs --hook=<name>. Run with --list to see the catalogue.');
    return 2;
  }
  if (!LIFECYCLE_HOOKS[hookName]) {
    fail(
      `Unknown lifecycle hook: ${hookName}\n` +
        `  Known hooks: ${Object.keys(LIFECYCLE_HOOKS).join(', ')}\n` +
        '  Catalogue: collection_module/docs/07-LIFECYCLE-HOOKS.md',
    );
    return 2;
  }

  const spec = LIFECYCLE_HOOKS[hookName];
  const fixtureDir = path.join(root, '__tests__', 'fixtures', 'lifecycle');

  let fixture;
  if (spec.args.length === 0 && !args.fixture) {
    // Nothing to supply — docs/07-LIFECYCLE-HOOKS.md documents these hooks as
    // taking no arguments, so requiring a fixture file would be busywork.
    fixture = { __path: '(none — this hook takes no arguments)', name: hookName, args: {} };
  } else {
    try {
      fixture = loadLifecycleFixture(fixtureDir, hookName, args);
    } catch (err) {
      fail(err.message);
      return 2;
    }
  }

  const missing = spec.args.filter((key) => !(key in (fixture.args || {})));
  if (missing.length > 0) {
    fail(
      `Fixture ${path.relative(root, fixture.__path)} is missing argument(s) ` +
        `${missing.join(', ')} required by ${hookName}.\n` +
        `  ${hookName} is documented as ({ ${spec.args.join(', ')} }) in ` +
        'collection_module/docs/07-LIFECYCLE-HOOKS.md.',
    );
    return 2;
  }

  const record = newRecord();

  let unhook;
  try {
    unhook = registerTypeScript(root);
  } catch (err) {
    fail(err.message);
    return 2;
  }
  const envSource = redirectMissingEnv(root);

  let wiring;
  let hooks;
  try {
    const loaded = loadModule(root, args, record);
    wiring = loaded.wiring;
    // eslint-disable-next-line global-require, import/no-dynamic-require
    hooks = require(path.join(root, 'code', 'lifecycle-hooks', 'index.ts'));
  } catch (err) {
    unhook();
    fail(`Could not load the collection module: ${err.message}`);
    return 2;
  }

  const hook = hooks[hookName];
  if (typeof hook !== 'function') {
    unhook();
    fail(
      `${hookName} is in the documented catalogue but is not exported from ` +
        'code/lifecycle-hooks/index.ts.',
    );
    return 2;
  }

  const callArgs = spec.args.length === 0 ? undefined : pick(fixture.args, spec.args);
  const restoreNetwork = installNetworkGuard(record);
  const stopCapture = captureConsole(record);

  let returned;
  let thrown = null;

  return Promise.resolve()
    .then(() => (callArgs === undefined ? hook() : hook(callArgs)))
    .then(
      (value) => {
        returned = value;
      },
      (err) => {
        thrown = err;
      },
    )
    .then(() => {
      stopCapture();
      restoreNetwork();
      unhook();

      const report = {
        kind: 'lifecycle',
        hook: hookName,
        documentedArgs: spec.args,
        fixture: {
          path: fixture.__path.startsWith('(')
            ? fixture.__path
            : path.relative(root, fixture.__path),
          name: fixture.name || hookName,
          notes: fixture.notes || null,
        },
        environment: args.env || 'sandbox',
        envSource,
        wiring,
        returned: jsonSafe(returned),
        error: thrown ? { message: thrown.message, name: thrown.name } : null,
        handlerLog: record.logs,
        interceptedCalls: record.calls,
        blockedNetworkCalls: record.network,
        result: thrown ? 'FAIL' : 'PASS',
        reason: thrown
          ? `${hookName} threw: ${thrown.message}`
          : `${hookName} completed without throwing.`,
        doesNotProve: caveats(wiring, 'lifecycle'),
      };

      emit(report, args.json, () => printLifecycleReport(report));
      return report.result === 'PASS' ? 0 : 1;
    });
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

function readFixtureDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dir, name));
}

function readFixtureFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Fixture ${file} is not valid JSON: ${err.message}`);
  }
  parsed.__path = file;
  return parsed;
}

function loadWebhookFixture(fixtureDir, args) {
  if (args.fixture) {
    const file = path.resolve(args.fixture);
    if (!fs.existsSync(file)) throw new Error(`Fixture not found: ${file}`);
    return readFixtureFile(file);
  }

  const files = readFixtureDir(fixtureDir);
  if (files.length === 0) {
    throw new Error(
      `No webhook fixtures in ${fixtureDir}. Add one, or pass --fixture=<path>.`,
    );
  }

  if (!args.event) {
    throw new Error(
      'webhook needs --event=<name> or --fixture=<path>.\n' +
        `  Available: ${files.map((f) => path.basename(f, '.json')).join(', ')}\n` +
        '  Run with --list for the full catalogue.',
    );
  }

  const matches = files
    .map(readFixtureFile)
    .filter(
      (f) =>
        f.event === args.event ||
        f.name === args.event ||
        path.basename(f.__path, '.json') === args.event,
    );

  if (matches.length === 0) {
    const available = files
      .map(readFixtureFile)
      .map((f) => `${path.basename(f.__path, '.json')} (event: ${f.event || '—'})`);
    throw new Error(
      `No fixture matches --event=${args.event}.\n  Available: ${available.join(', ')}`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `--event=${args.event} matches ${matches.length} fixtures ` +
        `(${matches.map((f) => path.basename(f.__path)).join(', ')}). Use --fixture=<path>.`,
    );
  }

  return matches[0];
}

function loadLifecycleFixture(fixtureDir, hookName, args) {
  if (args.fixture) {
    const file = path.resolve(args.fixture);
    if (!fs.existsSync(file)) throw new Error(`Fixture not found: ${file}`);
    return readFixtureFile(file);
  }

  const byName = path.join(fixtureDir, `${hookName}.json`);
  if (fs.existsSync(byName)) return readFixtureFile(byName);

  const matches = readFixtureDir(fixtureDir)
    .map(readFixtureFile)
    .filter((f) => f.hook === hookName);

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} fixtures declare hook ${hookName}. Use --fixture=<path>.`,
    );
  }

  throw new Error(
    `No fixture for ${hookName}.\n` +
      `  Expected ${path.relative(process.cwd(), byName)}, or pass --fixture=<path>.\n` +
      `  ${hookName} takes { ${LIFECYCLE_HOOKS[hookName].args.join(', ') || '— no arguments —'} } ` +
      '— see collection_module/docs/07-LIFECYCLE-HOOKS.md.',
  );
}

// ─── Signing ────────────────────────────────────────────────────────────────

/**
 * Serialise the fixture body, compute a real digest over the declared payload
 * template, and place the result where the fixture says the provider puts it.
 *
 * Throws (usage error) rather than falling back if the scheme is absent or
 * unknown. A simulator that quietly skips verification removes the only part
 * of a webhook worth simulating.
 */
function signFixture(fixture, secret, options) {
  const sig = fixture.signature;

  if (!sig || typeof sig !== 'object') {
    throw new Error(
      `Fixture ${fixture.__path} declares no "signature" block, so the signing ` +
        'scheme cannot be determined.\n' +
        `  Add one. Known schemes: ${Object.keys(DIGESTS).join(', ')}.\n` +
        '  The simulator will not send an unsigned request in place of a signed one.',
    );
  }

  if (!sig.scheme) {
    throw new Error(
      `Fixture ${fixture.__path} has a "signature" block with no "scheme".\n` +
        `  Known schemes: ${Object.keys(DIGESTS).join(', ')}.`,
    );
  }

  const digest = DIGESTS[sig.scheme];
  if (!digest) {
    throw new Error(
      `Fixture ${fixture.__path} declares unknown signature scheme "${sig.scheme}".\n` +
        `  Known schemes: ${Object.keys(DIGESTS).join(', ')}.\n` +
        '  Add the scheme to DIGESTS in scripts/simulate.js rather than disabling verification.',
    );
  }

  const placement = sig.placement || 'header';
  if (!PLACEMENTS.includes(placement)) {
    throw new Error(
      `Fixture ${fixture.__path} declares unknown placement "${placement}". ` +
        `Known placements: ${PLACEMENTS.join(', ')}.`,
    );
  }

  const encoding = sig.secretEncoding || 'utf8';
  if (!SECRET_ENCODINGS.includes(encoding)) {
    throw new Error(
      `Fixture ${fixture.__path} declares unknown secretEncoding "${encoding}". ` +
        `Known encodings: ${SECRET_ENCODINGS.join(', ')}.`,
    );
  }

  const hasBody = typeof fixture.body === 'object' && fixture.body !== null;
  const hasRaw = typeof fixture.bodyRaw === 'string';
  if (hasBody === hasRaw) {
    throw new Error(
      `Fixture ${fixture.__path} must declare exactly one of "body" (JSON object) ` +
        'or "bodyRaw" (string, for form-encoded or XML providers).',
    );
  }

  const bodyObject = hasBody ? JSON.parse(JSON.stringify(fixture.body)) : null;
  const preSignatureBody = hasRaw ? fixture.bodyRaw : JSON.stringify(bodyObject);

  const payloadTemplate = sig.payloadTemplate || '{body}';
  // body-query appends the signature after the signed string, so {body} there is
  // the pre-signature body and stays well defined. body-path rewrites the object
  // that gets re-serialised, so signing over {body} would be circular.
  if (placement === 'body-path' && payloadTemplate.includes('{body}')) {
    throw new Error(
      `Fixture ${fixture.__path} signs over "{body}" but inserts the signature into ` +
        'the body. That is circular — the digest would cover a body that does not yet ' +
        'contain it. Use {field:<path>} tokens for the fields the provider actually signs.',
    );
  }

  const key = Buffer.from(secret, encoding);
  if (encoding !== 'utf8' && key.length === 0) {
    throw new Error(
      `Fixture ${fixture.__path} declares secretEncoding "${encoding}", but the secret ` +
        `in use is not valid ${encoding}. Buffer.from() decoded it to zero bytes, which ` +
        'would silently produce a digest keyed on nothing.\n' +
        `  Either set a ${encoding} secret in code/env.ts, or put an explicit "secret" ` +
        'in the fixture’s signature block.',
    );
  }

  const payload = interpolate(payloadTemplate, {
    body: preSignatureBody,
    timestamp: String(options.timestamp),
    secret,
    field: (dotted) => String(getByPath(bodyObject, dotted) ?? ''),
  });

  const honest = digest(payload, key);
  const sent = options.tamper ? corrupt(honest) : honest;

  const valueTemplate = sig.valueTemplate || '{signature}';
  const value = interpolate(valueTemplate, {
    signature: sent,
    timestamp: String(options.timestamp),
  });

  const headers = lowercaseKeys({
    'content-type': (fixture.transport && fixture.transport.contentType) || 'application/json',
    ...((fixture.transport && fixture.transport.headers) || {}),
  });

  let body = preSignatureBody;

  if (placement === 'header') {
    if (!sig.header) {
      throw new Error(
        `Fixture ${fixture.__path} uses placement "header" but declares no "header" name.`,
      );
    }
    headers[sig.header.toLowerCase()] = value;
  } else if (placement === 'body-path') {
    if (!sig.path) {
      throw new Error(
        `Fixture ${fixture.__path} uses placement "body-path" but declares no "path".`,
      );
    }
    if (!bodyObject) {
      throw new Error(
        `Fixture ${fixture.__path} uses placement "body-path" but has no JSON "body".`,
      );
    }
    setByPath(bodyObject, sig.path, value);
    body = JSON.stringify(bodyObject);
  } else {
    if (!sig.field) {
      throw new Error(
        `Fixture ${fixture.__path} uses placement "body-query" but declares no "field".`,
      );
    }
    const separator = body.length > 0 ? '&' : '';
    body = `${body}${separator}${sig.field}=${encodeURIComponent(value)}`;
  }

  return {
    headers,
    body,
    report: {
      scheme: sig.scheme,
      placement,
      target: sig.header || sig.path || sig.field,
      secretEncoding: encoding,
      payloadTemplate,
      signedPayload: payload,
      valueTemplate,
      honestDigest: honest,
      sentDigest: sent,
      sentValue: value,
      tampered: Boolean(options.tamper),
      timestamp: options.timestamp,
      secretSource: sig.secret
        ? 'the fixture’s own signature.secret (overrides the module’s config)'
        : 'ConfigurationService.get("providerWebhookSigningSecret")',
    },
  };
}

function corrupt(digest) {
  // Flip the first character to a different one in the same alphabet so the
  // digest stays well-formed and the handler rejects it on comparison, not on
  // a parse error.
  const first = digest[0];
  const replacement = first === '0' ? '1' : '0';
  return replacement + digest.slice(1);
}

function interpolate(template, values) {
  return template.replace(/\{([a-z]+)(?::([^}]+))?\}/g, (match, key, argument) => {
    const value = values[key];
    if (typeof value === 'function') return value(argument);
    if (value === undefined) return match;
    return value;
  });
}

function getByPath(object, dotted) {
  return dotted
    .split('.')
    .reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), object);
}

function setByPath(object, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  const parent = keys.reduce((acc, key) => {
    if (acc[key] === undefined || acc[key] === null) acc[key] = {};
    return acc[key];
  }, object);
  parent[last] = value;
}

function lowercaseKeys(headers) {
  // Real gateways hand the handler lowercase header names, and the scaffolded
  // client reads them lowercased. Match that rather than the fixture's casing.
  const out = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = String(value);
  return out;
}

// ─── Module loading ─────────────────────────────────────────────────────────

/**
 * Teach `require` to load the module's TypeScript sources, using the
 * `typescript` compiler already present in collection_module/node_modules.
 * Transpile-only: the simulator runs the source, it does not type-check it.
 */
function registerTypeScript(root) {
  const previous = require.extensions['.ts'];
  let ts;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    ts = require(require.resolve('typescript', {
      paths: [path.join(root, 'node_modules'), root, __dirname],
    }));
  } catch {
    throw new Error(
      'typescript is not installed. Run `npm install` in collection_module/ first.',
    );
  }

  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    allowJs: true,
    inlineSourceMap: true,
    downlevelIteration: true,
  };

  require.extensions['.ts'] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions, fileName: filename });
    // eslint-disable-next-line no-underscore-dangle
    mod._compile(outputText, filename);
  };

  return function unhook() {
    if (previous) require.extensions['.ts'] = previous;
    else delete require.extensions['.ts'];
  };
}

/**
 * code/env.ts is gitignored, so a fresh clone does not have one. Fall back to
 * code/env.sample.ts and say so in the report — the simulator signs with
 * whatever secret the module resolves, so a sample secret still exercises
 * verification end to end.
 */
function redirectMissingEnv(root) {
  const real = path.join(root, 'code', 'env.ts');
  if (fs.existsSync(real)) return 'code/env.ts';

  const sample = path.join(root, 'code', 'env.sample.ts');
  if (!fs.existsSync(sample)) return 'missing';

  // eslint-disable-next-line no-underscore-dangle
  const original = Module._resolveFilename;
  // eslint-disable-next-line no-underscore-dangle
  Module._resolveFilename = function resolveFilename(request, parent, ...rest) {
    try {
      return original.call(this, request, parent, ...rest);
    } catch (err) {
      const fromCode = parent && parent.filename && parent.filename.includes(`${path.sep}code${path.sep}`);
      if (fromCode && /(^|[\\/])env$/.test(request)) return sample;
      throw err;
    }
  };

  return 'code/env.sample.ts (code/env.ts is gitignored and absent)';
}

/**
 * Build the container the module builds at runtime, then swap the two services
 * that would otherwise reach the network for recording stubs. PROVIDER_CLIENT
 * is left alone when it exists — its verifyWebhookSignature is the thing under
 * test, and it is pure crypto.
 */
function loadModule(root, args, record) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const containerModule = require(path.join(root, 'code', 'core', 'container.ts'));
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const setup = require(path.join(root, 'code', 'core', 'container.setup.ts'));
  const { ServiceToken, ServiceLifetime } = containerModule;

  process.env.ENVIRONMENT = args.env || 'sandbox';

  const container = setup.createContainer();

  const config = ensureConfigResolves(container, containerModule, root);

  const wiring = {
    config: config.status,
    providerClient: container.has(ServiceToken.PROVIDER_CLIENT) ? 'registered' : 'missing',
    providerService: container.has(ServiceToken.PROVIDER_SERVICE) ? 'registered' : 'missing',
    webhookParser: container.has(ServiceToken.WEBHOOK_PARSER) ? 'registered' : 'missing',
    verificationWired: handlerVerifiesSignatures(root),
    substitutions: [],
  };

  if (config.note) wiring.substitutions.push(config.note);

  if (wiring.providerClient === 'missing') {
    container.register(
      ServiceToken.PROVIDER_CLIENT,
      () => unverifiedClientStub(record),
      ServiceLifetime.SINGLETON,
    );
    wiring.substitutions.push(
      'PROVIDER_CLIENT — not registered; the simulator supplied a stub whose ' +
        'verifyWebhookSignature always returns false, so verification can never ' +
        'pass by accident.',
    );
  }

  container.replace(
    ServiceToken.PROVIDER_SERVICE,
    () => recorder('PROVIDER_SERVICE', record),
    ServiceLifetime.SINGLETON,
  );
  wiring.substitutions.push(
    'PROVIDER_SERVICE — replaced with a recording stub. Every call is logged and ' +
      'returns a placeholder; no provider request is made.',
  );

  container.replace(
    ServiceToken.ROOT_CLIENT,
    () => recorder('ROOT_CLIENT', record),
    ServiceLifetime.SINGLETON,
  );
  wiring.substitutions.push(
    'ROOT_CLIENT — replaced with a recording stub. Nothing is written back to Root.',
  );

  setup.setContainer(container);

  return { container, wiring, ServiceToken };
}

/**
 * ConfigurationService rejects any environment with an empty field, and
 * env.sample.ts deliberately leaves the optional provider fields blank. That is
 * a deployment gate (`npm run validate`), not a reason the simulator cannot
 * run — the only field it needs is providerWebhookSigningSecret, which the
 * sample does set. Fall back to an unvalidated config and say so.
 */
function ensureConfigResolves(container, { ServiceToken, ServiceLifetime }, root) {
  try {
    container.resolve(ServiceToken.CONFIG_SERVICE);
    return { status: 'valid' };
  } catch (err) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const { ConfigurationService } = require(
      path.join(root, 'code', 'services', 'config.service.ts'),
    );
    container.replace(
      ServiceToken.CONFIG_SERVICE,
      () => new ConfigurationService({ skipValidation: true }),
      ServiceLifetime.SINGLETON,
    );

    const detail =
      (err.message || '')
        .split('\n')
        .find((line) => line.includes('Missing required') || line.includes('Invalid')) ||
      err.message;

    return {
      status: 'incomplete (validation bypassed)',
      note:
        `CONFIG_SERVICE — config validation failed, so the simulator resolved it with ` +
        `skipValidation. ${detail.trim().replace(/\.$/, '')}. ` +
        'Deployment still gates on this: run `npm run validate`.',
    };
  }
}

/**
 * Does the checked-in handler resolve anything that could verify a signature?
 * On a fresh template Step 1 of webhook-hooks.ts is commented out, which means
 * a bad signature is accepted. The report has to say so.
 */
function handlerVerifiesSignatures(root) {
  const file = path.join(root, 'code', 'webhook-hooks.ts');
  if (!fs.existsSync(file)) return false;
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      return (
        trimmed.includes('verifyWebhookSignature') ||
        trimmed.includes('WEBHOOK_PARSER') ||
        trimmed.includes('verifyAndParse')
      );
    });
}

function resolveSecret(loaded, fixture) {
  if (fixture.signature && fixture.signature.secret) return String(fixture.signature.secret);

  const config = loaded.container.resolve(loaded.ServiceToken.CONFIG_SERVICE);
  const secret = config.get('providerWebhookSigningSecret');

  if (!secret) {
    throw new Error(
      'providerWebhookSigningSecret is empty. Set it in code/env.ts, or put an ' +
        'explicit "secret" in the fixture’s signature block.',
    );
  }

  return String(secret);
}

// ─── Recording stubs ────────────────────────────────────────────────────────

function newRecord() {
  return { calls: [], logs: [], network: [] };
}

/**
 * A stand-in for a service that would otherwise call out. Every property access
 * returns a function that records the call and resolves to a placeholder, so
 * the handler runs to completion and the report shows what it tried to do.
 */
function recorder(label, record, depth = 0) {
  return new Proxy(function noop() {}, {
    get(target, property) {
      if (property === 'then' || typeof property === 'symbol') return undefined;
      if (property === 'sdk' && depth < 3) return recorder(`${label}.sdk`, record, depth + 1);
      return (...callArgs) => {
        record.calls.push({
          target: label,
          method: String(property),
          args: callArgs.map(jsonSafe),
        });
        return Promise.resolve({ __simulated: true, from: `${label}.${String(property)}` });
      };
    },
    apply(target, thisArg, callArgs) {
      record.calls.push({ target: label, method: '(call)', args: callArgs.map(jsonSafe) });
      return Promise.resolve({ __simulated: true, from: label });
    },
  });
}

function unverifiedClientStub(record) {
  return {
    sdk: recorder('PROVIDER_CLIENT.sdk', record),
    verifyWebhookSignature(request) {
      record.calls.push({
        target: 'PROVIDER_CLIENT',
        method: 'verifyWebhookSignature',
        args: [{ headers: request && request.headers, bodyBytes: request && request.body
          ? Buffer.byteLength(request.body) : 0 }],
        note: 'No provider client is registered — the simulator returned false.',
      });
      return false;
    },
  };
}

// ─── Isolation ──────────────────────────────────────────────────────────────

/**
 * Block outbound HTTP for the duration of the run. The recording stubs should
 * already absorb every provider and Root call; this catches anything that
 * slipped past them — a client constructed directly, an SDK with its own agent
 * — and turns a silent network hit into a visible failure.
 */
function installNetworkGuard(record) {
  const http = require('http');
  const https = require('https');
  const originals = [];

  const block = (module_, name, label) => {
    const original = module_[name];
    if (typeof original !== 'function') return;
    originals.push(() => {
      module_[name] = original;
    });
    // eslint-disable-next-line no-param-reassign
    module_[name] = function blocked(...callArgs) {
      const target = describeNetworkTarget(callArgs);
      record.network.push({ via: label, target });
      throw new Error(
        `sim: blocked an outbound ${label} call to ${target}. The simulator runs ` +
          'offline — stub the call or register the service under a DI token.',
      );
    };
  };

  block(http, 'request', 'http.request');
  block(http, 'get', 'http.get');
  block(https, 'request', 'https.request');
  block(https, 'get', 'https.get');

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === 'function') {
    originals.push(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = (input) => {
      const target = typeof input === 'string' ? input : String(input && input.url);
      record.network.push({ via: 'fetch', target });
      return Promise.reject(
        new Error(`sim: blocked an outbound fetch to ${target}. The simulator runs offline.`),
      );
    };
  }

  return function restore() {
    originals.forEach((undo) => undo());
  };
}

function describeNetworkTarget(callArgs) {
  const first = callArgs[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    if (first.href) return first.href;
    return `${first.protocol || 'http:'}//${first.host || first.hostname || '?'}${first.path || ''}`;
  }
  return 'an unknown host';
}

/**
 * LogService writes structured JSON to stdout via console.*. Capture it so the
 * report can show what the handler did, and so --json emits one object and
 * nothing else.
 */
function captureConsole(record) {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = {};

  for (const method of methods) {
    originals[method] = console[method];
    console[method] = (...callArgs) => {
      const text = callArgs
        .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
        .join(' ');
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      record.logs.push(
        parsed && typeof parsed === 'object'
          ? {
              level: parsed.level || method.toUpperCase(),
              message: parsed.message,
              context: parsed.context,
              metadata: parsed.metadata,
            }
          : { level: method.toUpperCase(), message: text },
      );
    };
  }

  return function restore() {
    for (const method of methods) console[method] = originals[method];
  };
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function caveats(wiring, kind) {
  const notes = [
    'that any request the module makes to the provider or to Root is correctly ' +
      'shaped — those services are recording stubs and return placeholders',
    'that the integration works end to end — nothing was deployed and no network ' +
      'call left this machine',
  ];

  if (kind === 'webhook') {
    notes.unshift(
      'that the provider actually sends this payload — the fixture is a local file, ' +
        'not a recording of provider traffic',
      'that the provider signs the way the fixture says it does — the scheme is ' +
        'asserted by the fixture, not discovered from the provider',
    );

    if (!wiring.verificationWired) {
      notes.unshift(
        'that signatures are verified at all — code/webhook-hooks.ts does not resolve ' +
          'PROVIDER_CLIENT or WEBHOOK_PARSER, so every signature is accepted. Run with ' +
          '--tamper to see this fail.',
      );
    }
  } else {
    notes.unshift(
      'that Root passes exactly these fields — the fixture asserts the policy and ' +
        'payment shape, it does not observe it',
      'that the hook is idempotent — that takes two runs, and Root will make them',
    );
  }

  if (wiring.providerService === 'missing') {
    notes.push(
      'anything about a provider service — none is registered in container.setup.ts yet',
    );
  }

  return notes;
}

function printWebhookReport(report) {
  const out = [];
  out.push('');
  out.push(`Webhook simulation — ${report.fixture.name}`);
  out.push(`  fixture      ${report.fixture.path}`);
  out.push(`  event        ${report.fixture.event || '—'}`);
  out.push(`  shape        ${report.fixture.shape || '—'}`);
  out.push(`  environment  ${report.environment}  (config from ${report.envSource})`);

  out.push('');
  out.push('Wiring');
  out.push(`  CONFIG_SERVICE    ${report.wiring.config}`);
  out.push(`  PROVIDER_CLIENT   ${report.wiring.providerClient}`);
  out.push(`  PROVIDER_SERVICE  ${report.wiring.providerService}`);
  out.push(`  WEBHOOK_PARSER    ${report.wiring.webhookParser}`);
  out.push(
    `  verification      ${
      report.wiring.verificationWired
        ? 'wired — webhook-hooks.ts resolves a verifier'
        : 'NOT WIRED — webhook-hooks.ts accepts every signature'
    }`,
  );
  for (const note of report.wiring.substitutions) out.push(`  · ${note}`);

  out.push('');
  out.push('Signature');
  out.push(`  scheme       ${report.signature.scheme}`);
  out.push(`  placement    ${report.signature.placement} → ${report.signature.target}`);
  out.push(`  secret       ${report.signature.secretSource}`);
  out.push(`  signed over  ${report.signature.payloadTemplate}`);
  out.push(`  sent as      ${truncate(report.signature.sentValue, 110)}`);
  out.push(`  tampered     ${report.signature.tampered ? 'YES — expecting a rejection' : 'no'}`);

  out.push('');
  out.push('Request');
  out.push(`  ${report.request.method}  ${report.request.bodyBytes} bytes`);
  for (const [key, value] of Object.entries(report.request.headers)) {
    out.push(`  ${key}: ${truncate(value, 110)}`);
  }

  out.push('');
  out.push('Response');
  if (report.error) {
    out.push(`  THREW  ${report.error.name}: ${report.error.message}`);
  } else if (report.response) {
    out.push(`  status ${report.response.status}`);
    out.push(`  body   ${truncate(String(report.response.body), 300)}`);
  } else {
    out.push('  (no response object returned)');
  }

  out.push('');
  out.push(`What the handler did (${report.handlerLog.length} log line(s))`);
  if (report.handlerLog.length === 0) out.push('  (the handler logged nothing)');
  for (const line of report.handlerLog) {
    out.push(
      `  ${String(line.level).padEnd(5)} ${line.message || ''}` +
        `${line.context ? `  [${line.context}]` : ''}` +
        `${line.metadata ? `  ${truncate(safeStringify(line.metadata), 120)}` : ''}`,
    );
  }

  out.push('');
  out.push(`Provider / Root calls intercepted (${report.interceptedCalls.length})`);
  if (report.interceptedCalls.length === 0) {
    out.push('  (none — the handler called neither the provider nor Root)');
  }
  for (const call of report.interceptedCalls) {
    out.push(`  ${call.target}.${call.method}(${truncate(safeStringify(call.args), 120)})`);
    if (call.note) out.push(`      ${call.note}`);
  }

  if (report.blockedNetworkCalls.length > 0) {
    out.push('');
    out.push(`Blocked outbound network calls (${report.blockedNetworkCalls.length})`);
    for (const call of report.blockedNetworkCalls) {
      out.push(`  ${call.via} → ${call.target}`);
    }
  }

  out.push('');
  out.push(`Expected: ${report.expectation}`);
  out.push(`Result:   ${report.result} — ${report.reason}`);

  out.push('');
  out.push('This run does NOT prove:');
  for (const note of report.doesNotProve) out.push(`  · ${note}`);
  out.push('');

  console.log(out.join('\n'));
}

function printLifecycleReport(report) {
  const out = [];
  out.push('');
  out.push(`Lifecycle simulation — ${report.hook}`);
  out.push(`  fixture      ${report.fixture.path}`);
  out.push(
    `  arguments    { ${report.documentedArgs.join(', ') || '— none —'} }  (per docs/07-LIFECYCLE-HOOKS.md)`,
  );
  out.push(`  environment  ${report.environment}  (config from ${report.envSource})`);

  out.push('');
  out.push('Wiring');
  out.push(`  CONFIG_SERVICE    ${report.wiring.config}`);
  out.push(`  PROVIDER_CLIENT   ${report.wiring.providerClient}`);
  out.push(`  PROVIDER_SERVICE  ${report.wiring.providerService}`);
  for (const note of report.wiring.substitutions) out.push(`  · ${note}`);

  out.push('');
  out.push('Outcome');
  if (report.error) {
    out.push(`  THREW  ${report.error.name}: ${report.error.message}`);
  } else {
    out.push(`  returned  ${truncate(safeStringify(report.returned), 300)}`);
  }

  out.push('');
  out.push(`What the hook did (${report.handlerLog.length} log line(s))`);
  if (report.handlerLog.length === 0) out.push('  (the hook logged nothing)');
  for (const line of report.handlerLog) {
    out.push(
      `  ${String(line.level).padEnd(5)} ${line.message || ''}` +
        `${line.context ? `  [${line.context}]` : ''}` +
        `${line.metadata ? `  ${truncate(safeStringify(line.metadata), 120)}` : ''}`,
    );
  }

  out.push('');
  out.push(`Provider / Root calls intercepted (${report.interceptedCalls.length})`);
  if (report.interceptedCalls.length === 0) {
    out.push('  (none — the hook is still a stub, or made no outbound call)');
  }
  for (const call of report.interceptedCalls) {
    out.push(`  ${call.target}.${call.method}(${truncate(safeStringify(call.args), 120)})`);
  }

  if (report.blockedNetworkCalls.length > 0) {
    out.push('');
    out.push(`Blocked outbound network calls (${report.blockedNetworkCalls.length})`);
    for (const call of report.blockedNetworkCalls) out.push(`  ${call.via} → ${call.target}`);
  }

  out.push('');
  out.push(`Result: ${report.result} — ${report.reason}`);

  out.push('');
  out.push('This run does NOT prove:');
  for (const note of report.doesNotProve) out.push(`  · ${note}`);
  out.push('');

  console.log(out.join('\n'));
}

function listWebhookFixtures(fixtureDir, asJson) {
  const fixtures = readFixtureDir(fixtureDir).map((file) => {
    const fixture = readFixtureFile(file);
    return {
      name: path.basename(file, '.json'),
      event: fixture.event || null,
      shape: fixture.shape || null,
      scheme: (fixture.signature && fixture.signature.scheme) || null,
      placement: (fixture.signature && fixture.signature.placement) || 'header',
      path: file,
    };
  });

  if (asJson) {
    console.log(JSON.stringify({ kind: 'webhook-fixtures', fixtures }, null, 2));
    return;
  }

  console.log('\nWebhook fixtures\n');
  if (fixtures.length === 0) console.log('  (none)');
  for (const fixture of fixtures) {
    console.log(`  ${fixture.name.padEnd(28)} event=${fixture.event || '—'}`);
    console.log(`  ${''.padEnd(28)} shape=${fixture.shape || '—'}  sig=${fixture.scheme} (${fixture.placement})`);
  }
  console.log('\n  npm run sim:webhook -- --event=<event>\n');
}

function listHooks(asJson) {
  const hooks = Object.entries(LIFECYCLE_HOOKS).map(([name, spec]) => ({
    name,
    args: spec.args,
    async: spec.async,
  }));

  if (asJson) {
    console.log(JSON.stringify({ kind: 'lifecycle-hooks', hooks }, null, 2));
    return;
  }

  console.log('\nLifecycle hooks (docs/07-LIFECYCLE-HOOKS.md)\n');
  for (const hook of hooks) {
    console.log(`  ${hook.name.padEnd(34)} { ${hook.args.join(', ') || '— none —'} }`);
  }
  console.log('\n  npm run sim:lifecycle -- --hook=<name>\n');
}

function emit(report, asJson, printHuman) {
  if (asJson) console.log(JSON.stringify(report, null, 2));
  else printHuman();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pick(object, keys) {
  const out = {};
  for (const key of keys) out[key] = object[key];
  return out;
}

function jsonSafe(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'function') return '[function]';
  if (typeof value !== 'object') return value;
  if (depth > 5) return '[depth limit]';
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = jsonSafe(item, depth + 1);
  return out;
}

function safeStringify(value) {
  try {
    return JSON.stringify(jsonSafe(value));
  } catch {
    return String(value);
  }
}

function truncate(text, limit) {
  const string = String(text);
  return string.length <= limit ? string : `${string.slice(0, limit - 1)}…`;
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    const withValue = arg.match(/^--([^=]+)=(.*)$/);
    if (withValue) {
      result[withValue[1]] = withValue[2];
      continue;
    }
    const flag = arg.match(/^--(.+)$/);
    if (flag) result[flag[1]] = true;
  }
  return result;
}

function printHelp() {
  console.log(`
simulate.js — run a webhook or lifecycle hook through the real module, offline

Usage:
  npm run sim:webhook   -- --event=<name> [--fixture=<path>] [--tamper] [--json]
  npm run sim:lifecycle -- --hook=<name>  [--fixture=<path>] [--json]
  npm run sim:webhook   -- --list
  npm run sim:lifecycle -- --list

Options:
  --event       Match a fixture by its "event" or file name.
  --hook        Lifecycle hook to invoke. --list shows the catalogue.
  --fixture     Explicit fixture path; overrides --event / --hook lookup.
  --tamper      Corrupt the signature digest. The run then expects a rejection.
  --timestamp   Unix seconds for {timestamp} in a payload template (default: now).
  --env         sandbox | production (default: sandbox).
  --json        Emit one JSON object on stdout and nothing else.
  --root        collection_module root (default: ../collection_module).
  --list        List fixtures / hooks.
  --help        This message.

Exit codes:
  0  the run matched its expectation
  1  the handler errored, rejected a good signature, or accepted a bad one
  2  usage error — unknown fixture/hook, missing or unknown signature scheme

The simulator signs for real: the digest comes from the scheme the fixture
declares and the secret the module's own ConfigurationService resolves. There
is no mode that skips verification.

Nothing leaves the machine — PROVIDER_SERVICE and ROOT_CLIENT are recording
stubs and http/https/fetch are blocked for the duration of the run.
`);
}

// ─── Run ────────────────────────────────────────────────────────────────────

Promise.resolve()
  .then(() => main(process.argv.slice(2)))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    fail(`Unexpected simulator failure: ${err && err.stack ? err.stack : err}`);
    process.exitCode = 1;
  });
