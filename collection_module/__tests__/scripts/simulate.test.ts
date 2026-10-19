/**
 * simulate.js — webhook and lifecycle simulator
 *
 * Two halves:
 *
 * 1. Against the template as checked in (no provider wired), where the point is
 *    that the simulator stays useful and says plainly what is missing.
 * 2. Against a throwaway copy of the module with signature verification wired
 *    and a provider client registered, where the point is that a bad signature
 *    is rejected, a good one is accepted, and an outbound call is blocked.
 *
 * The second half is the one that proves the simulator closes the loop. Without
 * it these tests would only show that a stub returns 200.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SIMULATOR = path.join(__dirname, '..', '..', '..', 'scripts', 'simulate.js');
const MODULE_ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(MODULE_ROOT, '__tests__', 'fixtures', 'webhooks');

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

// ── Against the template as checked in ──────────────────────────────────────

describe('simulate webhook — template with no provider wired', () => {
  let pass: { exitCode: number; report: any };
  let tampered: { exitCode: number; report: any };

  beforeAll(() => {
    pass = runJson(['webhook', '--event=payment.succeeded', '--timestamp=1760000000']);
    tampered = runJson([
      'webhook',
      '--event=payment.succeeded',
      '--timestamp=1760000000',
      '--tamper',
    ]);
  }, 60_000);

  it('runs the real processWebhookRequest and exits 0', () => {
    expect(pass.exitCode).toBe(0);
    expect(pass.report.result).toBe('PASS');
    expect(pass.report.response.status).toBe(200);
  });

  it('signs with a real digest rather than a placeholder', () => {
    expect(pass.report.signature.scheme).toBe('hmac-sha256-hex');
    expect(pass.report.signature.sentDigest).toMatch(/^[\da-f]{64}$/);
    expect(pass.report.signature.sentDigest).toBe(pass.report.signature.honestDigest);
    expect(pass.report.request.headers['x-webhook-signature']).toBe(
      pass.report.signature.sentDigest,
    );
  });

  it('reports what the handler did, not just the status code', () => {
    expect(pass.report.handlerLog).toEqual([
      expect.objectContaining({
        level: 'INFO',
        message: 'Received webhook',
        context: 'WebhookHandler',
        metadata: { type: 'payment.succeeded' },
      }),
    ]);
  });

  it('says signature verification is not wired', () => {
    expect(pass.report.wiring.verificationWired).toBe(false);
    expect(pass.report.doesNotProve.join(' ')).toContain('that signatures are verified at all');
  });

  it('reports the missing provider rather than crashing on it', () => {
    expect(pass.report.wiring.providerClient).toBe('missing');
    expect(pass.report.wiring.providerService).toBe('missing');
    expect(pass.report.error).toBeNull();
  });

  it('falls back to env.sample.ts when the gitignored env.ts is absent', () => {
    // A fresh clone has no code/env.ts. The simulator still has to run.
    expect(pass.report.envSource).toMatch(/env\.(ts|sample\.ts)/);
  });

  it('fails the tamper run and names the reason', () => {
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

  it('reports the JSON-only stub handler choking on a form-encoded body', () => {
    // Not a defect in the fixture. Option B in code/webhook-hooks.ts calls
    // JSON.parse unconditionally, so a form-encoded provider needs Option A.
    const result = runJson([
      'webhook',
      '--event=payment.form-encoded',
      '--timestamp=1760000000',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.report.response.status).toBe(500);
    expect(result.report.reason).toContain('not valid JSON');
  }, 30_000);
});

// ── Refusing to guess ───────────────────────────────────────────────────────

describe('simulate webhook — signature scheme is mandatory', () => {
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

  it('has no flag that skips verification', () => {
    const help = run(['webhook', '--help']).stdout;
    expect(help).toContain('no mode that skips verification');
    expect(help).not.toMatch(/--skip-(signature|verification)/);
  });
});

// ── Against a module with verification actually wired ───────────────────────

describe('simulate webhook — module with verification wired', () => {
  let wiredRoot: string;
  let accepted: { exitCode: number; report: any };
  let rejected: { exitCode: number; report: any };
  let blocked: { exitCode: number; report: any };

  beforeAll(() => {
    wiredRoot = buildWiredModule();
    const common = [`--root=${wiredRoot}`, '--timestamp=1760000000'];
    accepted = runJson([
      'webhook',
      `--fixture=${path.join(FIXTURES, 'payment-succeeded.json')}`,
      ...common,
    ]);
    rejected = runJson([
      'webhook',
      `--fixture=${path.join(FIXTURES, 'payment-succeeded.json')}`,
      '--tamper',
      ...common,
    ]);
    blocked = runJson([
      'webhook',
      `--fixture=${path.join(FIXTURES, 'payment-failed.json')}`,
      ...common,
    ]);
  }, 120_000);

  afterAll(() => {
    if (wiredRoot) fs.rmSync(wiredRoot, { recursive: true, force: true });
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
      expect.objectContaining({ via: 'https.request', target: expect.stringContaining('example') }),
    ]);
    // The handler turned the blocked call into a 500 rather than throwing out.
    expect(blocked.report.error).toBeNull();
    expect(blocked.report.response.status).toBe(500);
    expect(blocked.exitCode).toBe(1);
  });
});

/**
 * Build a throwaway copy of the module with webhook verification wired and a
 * provider client registered, so the simulator has something real to verify
 * against. node_modules is symlinked rather than copied.
 */
function buildWiredModule(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sim-wired-'));

  fs.cpSync(path.join(MODULE_ROOT, 'code'), path.join(root, 'code'), { recursive: true });
  fs.symlinkSync(
    path.join(MODULE_ROOT, 'node_modules'),
    path.join(root, 'node_modules'),
    'dir',
  );

  fs.writeFileSync(
    path.join(root, 'code', 'clients', 'wired-test-client.ts'),
    `import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';
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
`,
  );

  const setupPath = path.join(root, 'code', 'core', 'container.setup.ts');
  const setup = fs.readFileSync(setupPath, 'utf8').replace(
    '  return container;',
    `  container.register(
    ServiceToken.PROVIDER_CLIENT,
    // eslint-disable-next-line unicorn/prefer-module
    () => new (require('../clients/wired-test-client').default)(),
    ServiceLifetime.SINGLETON,
  );

  return container;`,
  );
  fs.writeFileSync(setupPath, setup);

  fs.writeFileSync(
    path.join(root, 'code', 'webhook-hooks.ts'),
    `import { getContainer } from './core/container.setup';
import { ServiceToken } from './core/container';
import { LogService } from './services/log.service';
import { getConfigService } from './services/config-instance';

export const processWebhookRequest = async (request: any) => {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  try {
    const providerClient: any = container.resolve(ServiceToken.PROVIDER_CLIENT);
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

    const payload = JSON.parse(request.request.body as string);
    logService.info('Received webhook', 'WebhookHandler', { type: payload.type });

    if (payload.type === 'payment.succeeded') {
      const providerService: any = container.resolve(ServiceToken.PROVIDER_SERVICE);
      await providerService.getCustomer(payload.data.object.customer);
    }

    if (payload.type === 'payment.failed') {
      // Stands in for a provider call made outside the DI container — the thing
      // the simulator's network guard exists to catch.
      // eslint-disable-next-line unicorn/prefer-module
      require('https').request('https://api.example.com/v1/payments');
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
`,
  );

  return root;
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

describe('simulate lifecycle', () => {
  let issued: { exitCode: number; report: any };

  beforeAll(() => {
    issued = runJson(['lifecycle', '--hook=afterPolicyIssued']);
  }, 60_000);

  it('invokes the real hook and reports what it logged', () => {
    expect(issued.exitCode).toBe(0);
    expect(issued.report.result).toBe('PASS');
    expect(issued.report.handlerLog).toEqual([
      expect.objectContaining({
        message: 'Policy issued',
        context: 'afterPolicyIssued',
        metadata: { policyId: '8f1b4d2e-0000-4000-8000-000000000001' },
      }),
    ]);
  });

  it('passes the argument shape the docs say Root passes', () => {
    expect(issued.report.documentedArgs).toEqual(['policy']);
  });

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
