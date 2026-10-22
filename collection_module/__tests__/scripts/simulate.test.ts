/**
 * simulate.js — webhook and lifecycle simulator
 *
 * These tests are about the simulator, not about the state of the module they
 * run inside. That distinction matters here more than in an ordinary
 * repository: this is a template, so the suite ships inside every provider
 * module built from it. A test that asserts "no provider is registered" or
 * "verification is not wired" would go red the first time a team follows the
 * simulator's own instructions, for reasons that have nothing to do with their
 * provider.
 *
 * So anything that depends on how a module is wired runs against a throwaway
 * module this file builds and controls (`buildModule`). Only assertions that
 * hold for any module run against the repository's own `code/`.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SIMULATOR = path.join(__dirname, '..', '..', '..', 'scripts', 'simulate.js');
const MODULE_ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(MODULE_ROOT, '__tests__', 'fixtures', 'webhooks');

const SUCCEEDED = path.join(FIXTURES, 'payment-succeeded.json');
const FORM_ENCODED = path.join(FIXTURES, 'shape-form-encoded.json');
const LIFECYCLE_ISSUED = path.join(
  MODULE_ROOT,
  '__tests__',
  'fixtures',
  'lifecycle',
  'afterPolicyIssued.json',
);

interface Run {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): Run {
  try {
    const stdout = execFileSync('node', [SIMULATOR, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (error: any) {
    return {
      exitCode: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

function runJson(args: string[]): { exitCode: number; report: any } {
  const result = run([...args, '--json']);
  return { exitCode: result.exitCode, report: JSON.parse(result.stdout) };
}

// ── Against the repository's own module ─────────────────────────────────────
//
// Only things that stay true however the module is filled in.

describe('simulate webhook — against the module in this repository', () => {
  let pass: { exitCode: number; report: any };

  beforeAll(() => {
    pass = runJson(['webhook', '--event=payment.succeeded', '--timestamp=1760000000']);
  }, 60_000);

  it('loads the real module and returns a response rather than throwing', () => {
    expect(pass.report.error).toBeNull();
    expect(typeof pass.report.response.status).toBe('number');
  });

  it('signs with a real digest and sends it in the declared header', () => {
    expect(pass.report.signature.scheme).toBe('hmac-sha256-hex');
    expect(pass.report.signature.sentDigest).toMatch(/^[\da-f]{64}$/);
    expect(pass.report.signature.sentDigest).toBe(pass.report.signature.honestDigest);
    expect(pass.report.request.headers['x-webhook-signature']).toBe(
      pass.report.signature.sentDigest,
    );
  });

  it('resolves config from env.ts, or from env.sample.ts when it is absent', () => {
    expect(pass.report.envSource).toMatch(/env\.(ts|sample\.ts)/);
  });

  it('always says what the run does not prove', () => {
    expect(pass.report.doesNotProve.length).toBeGreaterThan(0);
    expect(pass.report.doesNotProve.join(' ')).toContain('nothing was deployed');
  });
});

// ── Against a module with nothing wired ─────────────────────────────────────

describe('simulate webhook — module with nothing wired', () => {
  let root: string;
  let pass: { exitCode: number; report: any };
  let tampered: { exitCode: number; report: any };

  beforeAll(() => {
    root = buildModule({ wired: false });
    const common = [`--root=${root}`, '--timestamp=1760000000'];
    pass = runJson(['webhook', `--fixture=${SUCCEEDED}`, ...common]);
    tampered = runJson(['webhook', `--fixture=${SUCCEEDED}`, '--tamper', ...common]);
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('runs the handler and reports what it logged', () => {
    expect(pass.exitCode).toBe(0);
    expect(pass.report.response.status).toBe(200);
    expect(pass.report.handlerLog).toEqual([
      expect.objectContaining({
        level: 'INFO',
        message: 'Received webhook',
        context: 'WebhookHandler',
        metadata: { type: 'payment.succeeded' },
      }),
    ]);
  });

  it('reports a missing provider rather than crashing on it', () => {
    expect(pass.report.wiring.providerClient).toBe('missing');
    expect(pass.report.wiring.providerService).toBe('missing');
    expect(pass.report.error).toBeNull();
  });

  it('never lets a missing provider client pass verification by accident', () => {
    expect(pass.report.wiring.substitutions.join(' ')).toContain('always returns false');
  });

  it('says signature verification is not wired, and warns it proves nothing', () => {
    expect(pass.report.wiring.verificationWired).toBe(false);
    expect(pass.report.doesNotProve.join(' ')).toContain('that signatures are verified at all');
  });

  it('fails the tamper run and names the unwired step as the reason', () => {
    expect(tampered.exitCode).toBe(1);
    expect(tampered.report.result).toBe('FAIL');
    expect(tampered.report.error).toBeNull();
    expect(tampered.report.reason).toContain('accepted a tampered signature');
    expect(tampered.report.reason).toContain('not wired yet');
  });

  it('tampers the digest without corrupting the surrounding header format', () => {
    expect(tampered.report.signature.sentDigest).toHaveLength(
      tampered.report.signature.honestDigest.length,
    );
    expect(tampered.report.signature.sentDigest).not.toBe(
      tampered.report.signature.honestDigest,
    );
  });

  it('does not read a block-commented verification step as wired', () => {
    // A handler whose Step 1 is commented out with /* ... */ must not be
    // reported as verifying. Reporting it as wired would also change the
    // --tamper diagnosis to "wired but not rejecting", sending the reader to
    // debug a verifier that does not exist.
    const blockCommented = buildModule({ wired: false, commentStyle: 'block' });
    try {
      const result = runJson([
        'webhook',
        `--fixture=${SUCCEEDED}`,
        `--root=${blockCommented}`,
        '--timestamp=1760000000',
      ]);
      expect(result.report.wiring.verificationWired).toBe(false);
    } finally {
      fs.rmSync(blockCommented, { recursive: true, force: true });
    }
  }, 60_000);

  it('reports a JSON-only handler choking on a form-encoded body', () => {
    // Not a defect in the fixture. The template's Option B handler calls
    // JSON.parse unconditionally, so a form-encoded provider needs Option A.
    const result = runJson([
      'webhook',
      `--fixture=${FORM_ENCODED}`,
      `--root=${root}`,
      '--timestamp=1760000000',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.response.status).toBe(500);
    expect(result.report.reason).toContain('not valid JSON');
  }, 60_000);

  it('does not count a handler crash as a rejected signature', () => {
    // The whole value of --tamper is proving the handler rejects a bad digest.
    // A handler that errors before it reaches its signature check has proved
    // nothing, so a 5xx must fail the run rather than pass it.
    const result = runJson([
      'webhook',
      `--fixture=${FORM_ENCODED}`,
      '--tamper',
      `--root=${root}`,
      '--timestamp=1760000000',
    ]);
    expect(result.report.response.status).toBe(500);
    expect(result.exitCode).toBe(1);
    expect(result.report.result).toBe('FAIL');
    expect(result.report.reason).toContain('not a rejection');
    expect(result.report.reason).toContain('A rejection is a 4xx');
  }, 60_000);
});

// ── Fixture catalogue ───────────────────────────────────────────────────────

describe('webhook fixtures', () => {
  const files = fs
    .readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(FIXTURES, name));

  it('ships at least a payment-succeeded and a payment-failed payload', () => {
    const events = files
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).event)
      .filter(Boolean);
    expect(events).toContain('payment.succeeded');
    expect(events).toContain('payment.failed');
  });

  it('covers more payload shapes than Stripe-flat', () => {
    const shapes = new Set(
      files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).shape).filter(Boolean),
    );
    // docs/08-WEBHOOKS.md lists flat, batched, wrapped and form-encoded.
    expect(shapes.size).toBeGreaterThanOrEqual(4);
    expect([...shapes]).toEqual(
      expect.arrayContaining([
        'flat',
        'wrapped-batch',
        'batched-body-signature',
        'form-encoded',
      ]),
    );
  });

  it('every fixture declares a signature scheme', () => {
    for (const file of files) {
      const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(fixture.signature?.scheme).toBeTruthy();
    }
  });

  it.each(
    fs
      .readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name]),
  )(
    'signs %s without a usage error',
    (name) => {
      const result = runJson([
        'webhook',
        `--fixture=${path.join(FIXTURES, name as string)}`,
        '--timestamp=1760000000',
      ]);
      // Exit 2 means the simulator could not sign the fixture at all. Exit 1 is
      // a verdict about the module, which is a different thing.
      expect(result.exitCode).not.toBe(2);
      expect(result.report.signature.sentDigest).toBeTruthy();
    },
    30_000,
  );

  it('places a body-embedded signature inside the body it sends', () => {
    const result = runJson([
      'webhook',
      '--event=notifications.batched',
      '--timestamp=1760000000',
    ]);
    const sent = JSON.parse(result.report.request.body);
    const embedded =
      sent.notificationItems[0].NotificationRequestItem.additionalData.hmacSignature;
    expect(embedded).toBe(result.report.signature.sentDigest);
    expect(embedded).not.toBe('');
  }, 30_000);

  it('appends a form-encoded signature as another body parameter', () => {
    const result = runJson([
      'webhook',
      '--event=payment.form-encoded',
      '--timestamp=1760000000',
    ]);
    const params = new URLSearchParams(result.report.request.body);
    expect(params.get('signature')).toBe(result.report.signature.sentDigest);
  }, 30_000);
});

// ── Refusing to guess ───────────────────────────────────────────────────────

describe('simulate webhook — refuses to sign on a guess', () => {
  let scratch: string;

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sim-fixtures-'));
  });

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  function writeFixture(name: string, fixture: Record<string, unknown>): string {
    const file = path.join(scratch, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(fixture));
    return file;
  }

  it('exits 2 when a fixture declares no signature block', () => {
    const file = writeFixture('unsigned', {
      name: 'unsigned',
      event: 'payment.succeeded',
      body: { type: 'payment.succeeded' },
    });
    const result = run(['webhook', `--fixture=${file}`]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('declares no "signature" block');
    expect(result.stderr).toContain('will not send an unsigned request');
  }, 30_000);

  it('exits 2 on an unknown scheme instead of guessing one', () => {
    const file = writeFixture('unknown-scheme', {
      name: 'unknown-scheme',
      event: 'payment.succeeded',
      signature: { scheme: 'wishful-thinking', header: 'X-Sig' },
      body: { type: 'payment.succeeded' },
    });
    const result = run(['webhook', `--fixture=${file}`]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown signature scheme');
    expect(result.stderr).toContain('rather than disabling verification');
  }, 30_000);

  it('exits 2 when a hex-encoded secret cannot be decoded to any bytes', () => {
    const file = writeFixture('bad-hex-secret', {
      name: 'bad-hex-secret',
      event: 'payment.succeeded',
      signature: {
        scheme: 'hmac-sha256-base64',
        header: 'X-Sig',
        secret: 'zzzz-not-hex',
        secretEncoding: 'hex',
      },
      body: { type: 'payment.succeeded' },
    });
    const result = run(['webhook', `--fixture=${file}`]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('decoded it to zero bytes');
  }, 30_000);

  it('exits 2 rather than signing a timestamp that is not a number', () => {
    // Number('oops') is NaN, which would otherwise be signed as the literal
    // text "NaN" and reported as a pass.
    const result = run([
      'webhook',
      `--fixture=${SUCCEEDED}`,
      '--timestamp=oops',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('whole seconds since the epoch');
  }, 30_000);

  it('has no flag that skips verification', () => {
    const help = run(['webhook', '--help']).stdout;
    expect(help).toContain('no mode that skips verification');
    expect(help).not.toMatch(/--skip-(signature|verification)/);
  });
});

// ── Against a module with verification wired ────────────────────────────────

describe('simulate webhook — module with verification wired', () => {
  let root: string;
  let accepted: { exitCode: number; report: any };
  let rejected: { exitCode: number; report: any };
  let blocked: { exitCode: number; report: any };

  beforeAll(() => {
    root = buildModule({ wired: true });
    const common = [`--root=${root}`, '--timestamp=1760000000'];
    accepted = runJson(['webhook', `--fixture=${SUCCEEDED}`, ...common]);
    rejected = runJson(['webhook', `--fixture=${SUCCEEDED}`, '--tamper', ...common]);
    blocked = runJson([
      'webhook',
      `--fixture=${path.join(FIXTURES, 'payment-failed.json')}`,
      ...common,
    ]);
  }, 120_000);

  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('detects that the handler verifies signatures', () => {
    expect(accepted.report.wiring.verificationWired).toBe(true);
    expect(accepted.report.wiring.providerClient).toBe('registered');
  });

  it('accepts a signature it computed from the module’s own configured secret', () => {
    expect(accepted.exitCode).toBe(0);
    expect(accepted.report.response.status).toBe(200);
    expect(accepted.report.result).toBe('PASS');
  });

  it('rejects a tampered signature — a 403, not an exception', () => {
    expect(rejected.report.error).toBeNull();
    expect(rejected.report.response.status).toBe(403);
    expect(JSON.parse(rejected.report.response.body)).toEqual({ error: 'Invalid signature' });
    expect(rejected.report.result).toBe('PASS');
    expect(rejected.exitCode).toBe(0);
  });

  it('records the provider call the handler made instead of making it', () => {
    expect(accepted.report.interceptedCalls).toEqual([
      expect.objectContaining({ target: 'PROVIDER_SERVICE', method: 'getCustomer' }),
    ]);
  });

  it('blocks an outbound HTTPS call and reports it', () => {
    expect(blocked.report.blockedNetworkCalls).toEqual([
      expect.objectContaining({
        via: 'https.request',
        target: expect.stringContaining('example'),
      }),
    ]);
    // The handler turned the blocked call into a 500 rather than throwing out.
    expect(blocked.report.error).toBeNull();
    expect(blocked.report.response.status).toBe(500);
    expect(blocked.exitCode).toBe(1);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

describe('simulate lifecycle', () => {
  it('invokes the real hook and reports what it logged', () => {
    const root = buildModule({ wired: false });
    try {
      const result = runJson([
        'lifecycle',
        '--hook=afterPolicyIssued',
        `--fixture=${LIFECYCLE_ISSUED}`,
        `--root=${root}`,
      ]);
      expect(result.exitCode).toBe(0);
      expect(result.report.result).toBe('PASS');
      expect(result.report.documentedArgs).toEqual(['policy']);
      expect(result.report.handlerLog).toEqual([
        expect.objectContaining({
          message: 'Policy issued',
          context: 'afterPolicyIssued',
          metadata: { policyId: '8f1b4d2e-0000-4000-8000-000000000001' },
        }),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('lists exactly the hooks the module exports', () => {
    const listed = runJson(['lifecycle', '--list']).report.hooks.map((h: any) => h.name).sort();
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const exported = Object.keys(require('../../code/lifecycle-hooks')).sort();
    expect(listed).toEqual(exported);
  }, 30_000);

  it('runs a zero-argument hook without demanding a fixture', () => {
    const result = runJson(['lifecycle', '--hook=renderViewPaymentMethod']);
    expect(result.exitCode).toBe(0);
    expect(result.report.documentedArgs).toEqual([]);
  }, 30_000);

  it('exits 2 on an unknown hook and prints the catalogue', () => {
    const result = run(['lifecycle', '--hook=afterPolicyEvaporated']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unknown lifecycle hook');
    expect(result.stderr).toContain('afterPolicyIssued');
  }, 30_000);

  it('exits 2 when a fixture is missing an argument the hook requires', () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sim-lifecycle-'));
    const file = path.join(scratch, 'incomplete.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ hook: 'afterPaymentCreated', args: { policy: { policy_id: 'p1' } } }),
    );

    const result = run(['lifecycle', '--hook=afterPaymentCreated', `--fixture=${file}`]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('missing argument(s) payment');

    fs.rmSync(scratch, { recursive: true, force: true });
  }, 30_000);
});

// ── Throwaway modules ───────────────────────────────────────────────────────

interface ModuleOptions {
  /** Register a provider client and verify signatures in the handler. */
  wired: boolean;
  /** How the unwired handler comments its verification step out. */
  commentStyle?: 'line' | 'block';
}

/**
 * Build a throwaway module the test controls end to end, so no assertion here
 * depends on how the surrounding repository happens to be wired. The container
 * is written rather than copied for the same reason: a module that has
 * scaffolded a provider must not change what these tests assert.
 *
 * node_modules is symlinked rather than copied.
 */
function buildModule(options: ModuleOptions): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sim-'));

  fs.cpSync(path.join(MODULE_ROOT, 'code'), path.join(root, 'code'), { recursive: true });
  fs.symlinkSync(
    path.join(MODULE_ROOT, 'node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );

  write(root, 'code/core/container.setup.ts', containerSource(options));
  write(root, 'code/webhook-hooks.ts', handlerSource(options));
  write(root, 'code/lifecycle-hooks/index.ts', lifecycleSource());

  if (options.wired) write(root, 'code/clients/wired-test-client.ts', clientSource());

  return root;
}

function write(root: string, relative: string, contents: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function containerSource({ wired }: ModuleOptions): string {
  return `import { Container, ServiceToken, ServiceLifetime } from './container';
import { LogService } from '../services/log.service';
import { ConfigurationService } from '../services/config.service';
import { RootClient } from '../clients/root-client';

export function createContainer(): Container {
  const container = new Container();

  container.register(
    ServiceToken.CONFIG_SERVICE,
    () => new ConfigurationService(),
    ServiceLifetime.SINGLETON,
  );

  container.register(
    ServiceToken.LOG_SERVICE,
    (c) => {
      const config = c.resolve<ConfigurationService>(ServiceToken.CONFIG_SERVICE);
      return new LogService({ environment: config.get('environment') });
    },
    ServiceLifetime.SINGLETON,
  );

  container.register(
    ServiceToken.ROOT_CLIENT,
    () => new RootClient(),
    ServiceLifetime.SINGLETON,
  );
${
  wired
    ? `
  container.register(
    ServiceToken.PROVIDER_CLIENT,
    // eslint-disable-next-line unicorn/prefer-module
    () => new (require('../clients/wired-test-client').default)(),
    ServiceLifetime.SINGLETON,
  );
`
    : ''
}
  return container;
}

let globalContainer: Container | null = null;

export function getContainer(): Container {
  if (!globalContainer) globalContainer = createContainer();
  return globalContainer;
}

export function setContainer(container: Container): void {
  globalContainer = container;
}

export function resetContainer(): void {
  globalContainer = null;
}
`;
}

function handlerSource({ wired, commentStyle }: ModuleOptions): string {
  const unwiredComment =
    commentStyle === 'block'
      ? `    /* TODO: verify the signature before processing.
       const isValid = providerClient.verifyWebhookSignature(request, secret);
    */`
      : `    // TODO: verify the signature before processing.
    // const isValid = providerClient.verifyWebhookSignature(request, secret);`;

  return `import { getContainer } from './core/container.setup';
import { ServiceToken } from './core/container';
import { LogService } from './services/log.service';
${wired ? "import { getConfigService } from './services/config-instance';\n" : ''}
export const processWebhookRequest = async (request: any) => {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  try {
${
  wired
    ? `    const providerClient: any = container.resolve(ServiceToken.PROVIDER_CLIENT);
    const config = getConfigService();
    const isValid = providerClient.verifyWebhookSignature(
      { body: request.request.body, headers: request.request.headers },
      config.get('providerWebhookSigningSecret'),
    );

    if (!isValid) {
      logService.warn('Webhook signature verification failed', 'WebhookHandler');
      return {
        response: {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid signature' }),
        },
      };
    }
`
    : `${unwiredComment}
`
}
    const payload = JSON.parse(request.request.body as string);
    logService.info('Received webhook', 'WebhookHandler', { type: payload.type });
${
  wired
    ? `
    if (payload.type === 'payment.succeeded') {
      const providerService: any = container.resolve(ServiceToken.PROVIDER_SERVICE);
      await providerService.getCustomer(payload.data.object.customer);
    }

    if (payload.type === 'payment.failed') {
      // Stands in for a provider call made outside the container, which is what
      // the simulator's network guard exists to catch.
      // eslint-disable-next-line unicorn/prefer-module
      require('https').request('https://api.example.com/v1/payments');
    }
`
    : ''
}
    return {
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true }),
      },
    };
  } catch (error: any) {
    logService.error('Error processing webhook', 'WebhookHandler', { error: error.message });
    return {
      response: {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error' }),
      },
    };
  }
};
`;
}

function lifecycleSource(): string {
  return `import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';

export async function afterPolicyIssued({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);
  logService.info('Policy issued', 'afterPolicyIssued', { policyId: policy?.policy_id });
}
`;
}

function clientSource(): string {
  return `import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';
import * as crypto from 'crypto';

export default class WiredTestClient implements PaymentProviderClient {
  public readonly sdk: any = null;

  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean {
    const sig = request.headers['x-webhook-signature'];
    if (!sig) return false;
    const expected = crypto.createHmac('sha256', secret).update(request.body).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
}
`;
}
