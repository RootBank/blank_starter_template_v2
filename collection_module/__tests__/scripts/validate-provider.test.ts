import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const script = path.join(__dirname, '..', '..', '..', 'scripts', 'validate-provider.js');

interface CheckResult {
  id: string;
  severity: 'critical' | 'major' | 'minor';
  passed: boolean;
  label: string;
  detail: string;
  file: string | null;
  line: number | null;
  semanticGap: string | null;
}

interface Report {
  schemaVersion: number;
  provider: string;
  root: string;
  results: CheckResult[];
  notChecked: { id: string; severity: string; reason: string }[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    criticalFailed: number;
    majorFailed: number;
    minorFailed: number;
  };
  exitCode: number;
}

// ─── A provider tree that passes every mechanized criterion ──────────────────
//
// Each test clones this and breaks exactly one file, so a failure names the
// criterion that regressed rather than "the fixture is wrong somewhere".

const PASSING: Record<string, string> = {
  'code/core/container.setup.ts': `import { ServiceToken, ServiceLifetime } from './container';

export function setupContainer(container: any): void {
  container.register(ServiceToken.PROVIDER_CLIENT, () => new TestcoClient(), ServiceLifetime.SINGLETON);
  container.register(ServiceToken.PROVIDER_SERVICE, (c: any) => new TestcoService(c), ServiceLifetime.SINGLETON);
}
`,

  'code/clients/testco-client.ts': `import * as crypto from 'crypto';
import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';

export default class TestcoClient implements PaymentProviderClient {
  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean {
    const sig = request.headers['x-testco-signature'];
    if (!sig) return false;
    const expected = crypto.createHmac('sha256', secret).update(request.body).digest('hex');
    return sig === expected;
  }
}
`,

  'code/services/testco.service.ts': `import { LogService } from './log.service';
import { retryWithBackoff, ModuleError } from '../utils';

// A module-level helper. Its \`if (\` sits at two-space indent, which is the
// shape that used to read as a public method named \`if\`.
function toCents(amount: number): number {
  if (amount < 0) {
    throw new ModuleError('amount must not be negative');
  }
  return Math.round(amount * 100);
}

export class TestcoService {
  constructor(
    private readonly logService: LogService,
    private readonly providerClient: any,
  ) {}

  async createCustomer(params: any): Promise<any> {
    this.logService.info('Creating customer', 'TestcoService', params);
    try {
      return await retryWithBackoff(() => this.providerClient.sdk.post('/customers', params));
    } catch (err) {
      throw new ModuleError('Failed to create customer', { cause: err });
    }
  }

  async createPaymentIntent(params: any): Promise<any> {
    this.logService.info('Creating payment intent', 'TestcoService', params);
    return retryWithBackoff(() => this.providerClient.sdk.post('/payments', params));
  }

  // Inline object return type: the \`{\` here is not the body brace.
  async getCustomer(id: string): Promise<{ id: string; email: string }> {
    this.logService.info('Getting customer', 'TestcoService', { id });
    return retryWithBackoff(() => this.providerClient.sdk.get('/customers'));
  }

  // A private helper deliberately does not log — M2 is about the public surface.
  private buildHeaders(): Record<string, string> {
    return { 'X-Testco-Version': '2024-01-01' };
  }
}
`,

  'code/adapters/testco-to-root-adapter.ts': `import { PaymentStatus } from '../interfaces/provider.interfaces';

export default class TestcoToRootAdapter {
  convertCustomerToAppData(providerCustomer: any): Record<string, any> {
    return {
      testco_customer_id: providerCustomer.id,
      testco_email: providerCustomer.email ?? null,
    };
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      paid_out: PaymentStatus.Successful,
      failed: PaymentStatus.Failed,
      pending: PaymentStatus.Pending,
    };
    return statusMap[status] ?? status;
  }
}
`,

  'code/interfaces/testco-events.ts': `export const TESTCO_EVENTS = {
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_CANCELLED: 'payment.cancelled',
} as const;
`,

  'code/env.sample.ts': `export const TESTCO_SECRET_KEY = '';
export const TESTCO_WEBHOOK_SIGNING_SECRET = '';
`,

  'code/webhook-hooks.ts': `import { getContainer } from './core/container.setup';
import { ServiceToken } from './core/container';
import { TESTCO_EVENTS } from './interfaces/testco-events';

// A regex literal holding a quote, next to a string holding a comment opener.
// Mis-read together, these blank the rest of the file.
const QUOTE = /'/g;
const BANNER = 'rate /* limit';

export const processWebhookRequest = async (request: any) => {
  const container = getContainer();
  const logService = container.resolve(ServiceToken.LOG_SERVICE);
  const providerClient = container.resolve(ServiceToken.PROVIDER_CLIENT);

  const isValid = providerClient.verifyWebhookSignature(
    { body: request.request.body, headers: request.request.headers },
    'signing-secret',
  );
  if (!isValid) {
    logService.warn('Webhook signature verification failed', 'WebhookHandler');
    return { response: { status: 403, body: '{}' } };
  }

  const payload = JSON.parse(request.request.body as string);

  switch (payload.type) {
    case TESTCO_EVENTS.PAYMENT_CONFIRMED: {
      await container.resolve(ServiceToken.PAYMENT_CONFIRMED_CONTROLLER).handle(payload);
      break;
    }
    case TESTCO_EVENTS.PAYMENT_CANCELLED: {
      await container.resolve(ServiceToken.PAYMENT_CANCELLED_CONTROLLER).handle(payload);
      break;
    }
    default:
      logService.info('Unhandled event type', 'WebhookHandler', { type: payload.type });
  }

  return { response: { status: 200, body: '{}' } };
};
`,

  'code/lifecycle-hooks/policy.hooks.ts': `import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';

export async function afterPolicyIssued({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const providerService = container.resolve(ServiceToken.PROVIDER_SERVICE);
  const rootClient = container.resolve(ServiceToken.ROOT_CLIENT);

  const customer = await providerService.createCustomer({
    email: policy.policyholder?.email,
    metadata: { root_policy_id: policy.policy_id },
  });

  await rootClient.SDK.updatePolicy({
    policyId: policy.policy_id,
    body: { app_data: { testco_customer_id: customer.id } },
  });
}
`,

  'code/lifecycle-hooks/payment.hooks.ts': `import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';

export async function afterPaymentCreated({ policy, payment }: { policy: any; payment: any }): Promise<void> {
  const container = getContainer();
  const providerService = container.resolve(ServiceToken.PROVIDER_SERVICE);

  await providerService.createPaymentIntent({
    amount: payment.amount,
    currency: policy.currency ?? 'ZAR',
    customerId: policy.app_data?.testco_customer_id,
  });
}
`,

  'code/lifecycle-hooks/payment-method.hooks.ts': `import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';

export async function afterPolicyPaymentMethodAssigned({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const providerService = container.resolve(ServiceToken.PROVIDER_SERVICE);

  await providerService.attachPaymentMethod({
    paymentMethodId: policy.payment_method?.module?.id,
    customerId: policy.app_data?.testco_customer_id,
  });
}
`,

  '__tests__/services/testco.service.test.ts': `describe('TestcoService', () => {
  describe('createCustomer', () => {
    it('creates a customer', () => expect(true).toBe(true));
  });
  describe('createPaymentIntent', () => {
    it('creates a payment intent', () => expect(true).toBe(true));
  });
  describe('getCustomer', () => {
    it('gets a customer', () => expect(true).toBe(true));
  });
});
`,
};

const tmpDirs: string[] = [];

/** Materialise the passing tree, with `overrides` replacing or deleting files. */
function writeTree(overrides: Record<string, string | null> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-validate-provider-'));
  tmpDirs.push(root);
  const files: Record<string, string | null> = { ...PASSING, ...overrides };
  for (const [relPath, content] of Object.entries(files)) {
    if (content === null) continue;
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
  return root;
}

function run(root: string, extra: string[] = []): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [script, `--root=${root}`, '--provider=testco', ...extra], {
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err: any) {
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function report(root: string): { status: number; json: Report } {
  const { status, stdout } = run(root, ['--json']);
  return { status, json: JSON.parse(stdout) as Report };
}

function byId(json: Report, id: string): CheckResult {
  const found = json.results.find((r) => r.id === id);
  if (!found) throw new Error(`no result for ${id} — have ${json.results.map((r) => r.id).join(', ')}`);
  return found;
}

function failedIds(json: Report): string[] {
  return json.results.filter((r) => !r.passed).map((r) => r.id);
}

afterAll(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('validate-provider --json', () => {
  it('emits parseable JSON and exits 0 for a fully compliant provider', () => {
    const { status, json } = report(writeTree());
    expect(failedIds(json)).toEqual([]);
    expect(status).toBe(0);
    expect(json.exitCode).toBe(0);
    expect(json.schemaVersion).toBe(1);
    expect(json.provider).toBe('testco');
    expect(json.summary.failed).toBe(0);
    expect(json.summary.total).toBe(json.results.length);
  });

  it('suppresses the human-readable report entirely under --json', () => {
    const { stdout } = run(writeTree(), ['--json']);
    // No prose preamble, no ✓/✗ lines — the whole stream is one JSON document.
    expect(stdout.trimStart().startsWith('{')).toBe(true);
    expect(stdout).not.toContain('Validating provider');
    expect(stdout).not.toContain('✓');
  });

  it('prints the human-readable report by default', () => {
    const { stdout } = run(writeTree());
    expect(stdout).toContain('Validating provider: Testco');
    expect(stdout).toContain('✓ [C1]');
    expect(stdout).toContain('Run /review-implementation');
  });

  it('carries file, line and severity on every result', () => {
    const { json } = report(writeTree());
    for (const r of json.results) {
      expect(['critical', 'major', 'minor']).toContain(r.severity);
      expect(typeof r.label).toBe('string');
    }
    const broken = report(writeTree({ 'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace("this.logService.info('Creating customer', 'TestcoService', params);\n", '') }));
    expect(byId(broken.json, 'M2').file).toBe('code/services/testco.service.ts');
    expect(byId(broken.json, 'M2').line).toBeGreaterThan(0);
  });

  it('reports the criteria it deliberately does not check', () => {
    const { json } = report(writeTree());
    expect(json.notChecked.map((n) => n.id).sort()).toEqual(['C7', 'S1']);
    for (const entry of json.notChecked) expect(entry.reason.length).toBeGreaterThan(20);
  });

  it('marks the structural-only checks with a semanticGap', () => {
    const { json } = report(writeTree());
    const partial = json.results.filter((r) => r.semanticGap).map((r) => r.id).sort();
    expect(partial).toEqual(['M4', 'M5', 'M6', 'M7', 'm1']);
  });

  it('emits JSON (not prose) when no provider can be found', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-validate-empty-'));
    tmpDirs.push(empty);
    let status = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [script, `--root=${empty}`, '--json'], { encoding: 'utf8' });
    } catch (err: any) {
      status = err.status;
      stdout = err.stdout;
    }
    expect(status).toBe(2);
    const json = JSON.parse(stdout);
    expect(json.error).toBe('no-provider');
    expect(json.exitCode).toBe(2);
  });
});

describe('validate-provider mechanized criteria', () => {
  // [criterion, the single mutation that should break it, expected exit code]
  const cases: [string, Record<string, string | null>, number][] = [
    [
      'C1',
      {
        'code/core/container.setup.ts': PASSING['code/core/container.setup.ts'].replace(
          /.*PROVIDER_CLIENT.*\n/,
          '',
        ),
      },
      1,
    ],
    [
      'C3',
      { 'code/webhook-hooks.ts': PASSING['code/webhook-hooks.ts'].replace(/verifyWebhookSignature/g, 'parseBody') },
      1,
    ],
    [
      'C4',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          '    return retryWithBackoff',
          '    // TODO: implement via this.providerClient.sdk\n    return retryWithBackoff',
        ),
      },
      1,
    ],
    [
      'C5',
      {
        'code/adapters/testco-to-root-adapter.ts': PASSING['code/adapters/testco-to-root-adapter.ts'].replace(
          /paid_out:[\s\S]*?pending: PaymentStatus\.Pending,\n/,
          '',
        ),
      },
      1,
    ],
    [
      'C6',
      {
        'code/interfaces/testco-events.ts': PASSING['code/interfaces/testco-events.ts'].replace(
          "'payment.confirmed'",
          "'provider.payment.completed'",
        ),
      },
      1,
    ],
    [
      'M1',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          /retryWithBackoff/g,
          'directCall',
        ),
      },
      1,
    ],
    [
      'M2',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          "    this.logService.info('Creating payment intent', 'TestcoService', params);\n",
          '',
        ),
      },
      1,
    ],
    [
      'M3',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          "new ModuleError('Failed to create customer', { cause: err })",
          "new Error('Failed to create customer')",
        ),
      },
      1,
    ],
    [
      'M4',
      {
        'code/lifecycle-hooks/policy.hooks.ts': `import { getContainer } from '../core/container.setup';

export async function afterPolicyIssued({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve('LOG_SERVICE');
  logService.info('Policy issued', 'afterPolicyIssued', { policyId: policy.policy_id });

  // TODO: Implement provider-specific logic. Example:
  //
  // const providerService = container.resolve(ServiceToken.PROVIDER_SERVICE);
  // await providerService.createCustomer({ email: policy.policyholder?.email });
}
`,
      },
      1,
    ],
    [
      'M5',
      {
        'code/lifecycle-hooks/payment.hooks.ts': PASSING['code/lifecycle-hooks/payment.hooks.ts'].replace(
          /await providerService\.createPaymentIntent\({[\s\S]*?}\);\n/,
          '',
        ),
      },
      1,
    ],
    [
      'M6',
      {
        'code/lifecycle-hooks/payment-method.hooks.ts': PASSING[
          'code/lifecycle-hooks/payment-method.hooks.ts'
        ].replace('ServiceToken.PROVIDER_SERVICE', 'ServiceToken.LOG_SERVICE'),
      },
      1,
    ],
    [
      'M7',
      {
        'code/webhook-hooks.ts': PASSING['code/webhook-hooks.ts'].replace(
          /    case TESTCO_EVENTS\.PAYMENT_CANCELLED: {[\s\S]*?\n    }\n/,
          '',
        ),
      },
      1,
    ],
    [
      'M8',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          "    return { 'X-Testco-Version': '2024-01-01' };",
          "    console.log('headers');\n    return { 'X-Testco-Version': '2024-01-01' };",
        ),
      },
      1,
    ],
    [
      'm1',
      {
        '__tests__/services/testco.service.test.ts': `describe('TestcoService', () => {
  describe('createCustomer', () => {
    it('creates a customer', () => expect(true).toBe(true));
  });
  describe('getCustomer', () => {
    it('gets a customer', () => expect(true).toBe(true));
  });
});
`,
      },
      0,
    ],
    [
      'm2',
      {
        'code/adapters/testco-to-root-adapter.ts': PASSING['code/adapters/testco-to-root-adapter.ts'].replace(
          'testco_customer_id: providerCustomer.id,',
          '',
        ),
      },
      0,
    ],
    [
      'm3',
      {
        'code/webhook-hooks.ts': PASSING['code/webhook-hooks.ts'].replace(
          /    default:\n.*\n/,
          '    default:\n      break;\n',
        ),
      },
      0,
    ],
    [
      'm4',
      {
        'code/services/testco.service.ts': PASSING['code/services/testco.service.ts'].replace(
          "'X-Testco-Version': '2024-01-01'",
          "Authorization: 'sk_live_abc123'",
        ),
      },
      0,
    ],
    [
      'm5',
      {
        'code/clients/testco-client.ts': PASSING['code/clients/testco-client.ts'].replace(
          'if (!sig) return false;',
          "if (!sig) throw new Error('missing signature');",
        ),
      },
      0,
    ],
  ];

  it.each(cases.map(([id, overrides, expectedExit]) => ({ id, overrides, expectedExit })))(
    'fails $id — and only $id — when that criterion is broken',
    ({ id, overrides, expectedExit }) => {
      const { status, json } = report(writeTree(overrides));
      expect(failedIds(json)).toEqual([id]);
      expect(status).toBe(expectedExit);
      expect(byId(json, id).detail).not.toBe('');
    },
  );

  it('fails C2 and C8 when the files they read are missing entirely', () => {
    const { status, json } = report(
      writeTree({ 'code/core/container.setup.ts': null, 'code/env.sample.ts': null }),
    );
    expect(status).toBe(1);
    expect(byId(json, 'C2').detail).toMatch(/missing code\/core\/container\.setup\.ts/);
    expect(byId(json, 'C8').detail).toMatch(/missing code\/env\.sample\.ts/);
  });

  it('fails C3 when the signature check exists only in a comment', () => {
    // The shipped template is exactly this shape. A raw text search passes it,
    // which would wave through an unsigned webhook on a Critical criterion.
    const commentedOut = PASSING['code/webhook-hooks.ts'].replace(
      /^(\s*)(const isValid = providerClient\.verifyWebhookSignature\()/m,
      '$1// $2',
    );
    const { json } = report(writeTree({ 'code/webhook-hooks.ts': commentedOut }));
    expect(byId(json, 'C3').passed).toBe(false);
    expect(byId(json, 'C3').detail).toMatch(/no live call/);
  });

  it('passes M2 for a method whose return type contains an object literal', () => {
    // `Promise<{ id: string }>` must not be mistaken for the method body.
    const { json } = report(writeTree());
    expect(byId(json, 'M2').passed).toBe(true);
    expect(byId(json, 'M2').detail).toMatch(/3 method\(s\) log first/);
  });

  it('fails M4 when the hook resolves the provider service but awaits something else', () => {
    const { json } = report(
      writeTree({
        'code/lifecycle-hooks/policy.hooks.ts': `import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';

export async function afterPolicyIssued({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const providerService = container.resolve(ServiceToken.PROVIDER_SERVICE);
  await somethingUnrelated(policy);
}
`,
      }),
    );
    expect(byId(json, 'M4').passed).toBe(false);
    expect(byId(json, 'M4').detail).toMatch(/never awaits a call on it/);
  });

  it('reports which provider method a wired hook actually calls', () => {
    const { json } = report(writeTree());
    expect(byId(json, 'M4').detail).toBe('calls createCustomer');
    expect(byId(json, 'M6').detail).toBe('calls attachPaymentMethod');
  });

  it('flags a hook that awaits a method not on PaymentProviderService', () => {
    // Still a pass: the hook is wired. The detail says the method is unknown so
    // the reviewer closing M4's semanticGap knows to look.
    const { json } = report(
      writeTree({
        'code/lifecycle-hooks/payment.hooks.ts': PASSING['code/lifecycle-hooks/payment.hooks.ts'].replace(
          'createPaymentIntent',
          'chargeTheThing',
        ),
      }),
    );
    expect(byId(json, 'M5').passed).toBe(true);
    expect(byId(json, 'M5').detail).toMatch(/not a PaymentProviderService method/);
  });

  it('ignores a module-level helper function when collecting service methods', () => {
    // `function toCents(n) { if (n < 0) { ... } }` puts an `if (` at two-space
    // indent. Counting it as a public method failed M2, which is Major, and so
    // blocked the build on valid code.
    const { status, json } = report(writeTree());
    expect(byId(json, 'M2').passed).toBe(true);
    expect(byId(json, 'M2').detail).not.toMatch(/\bif\b/);
    expect(status).toBe(0);
  });

  it('still finds no methods, rather than phantom ones, in a file with no class', () => {
    const { json } = report(
      writeTree({
        'code/services/testco.service.ts': `export function helper(n: number): number {
  if (n < 0) {
    return 0;
  }
  return n;
}
`,
      }),
    );
    expect(byId(json, 'M2').passed).toBe(false);
    expect(byId(json, 'M2').detail).toMatch(/no public methods/);
  });

  it('reads past a regex literal that contains a quote', () => {
    // The quote inside /'/g used to open a phantom string, putting every later
    // quote and comment marker one out of phase. A `/*` inside a real string
    // then read as a comment and blanked the rest of the file, failing C3.
    const { json } = report(writeTree());
    expect(byId(json, 'C3').passed).toBe(true);
    expect(byId(json, 'M7').passed).toBe(true);
    expect(byId(json, 'm3').passed).toBe(true);
  });

  it('treats a division sign as division, not as the start of a regex', () => {
    const { json } = report(
      writeTree({
        'code/adapters/testco-to-root-adapter.ts': PASSING['code/adapters/testco-to-root-adapter.ts'].replace(
          'testco_email: providerCustomer.email ?? null,',
          'testco_rate: providerCustomer.total / providerCustomer.count,',
        ),
      }),
    );
    expect(byId(json, 'm2').passed).toBe(true);
  });

  it('exempts LogService from M8 — it is the sanctioned console sink', () => {
    const { json } = report(
      writeTree({
        'code/services/log.service.ts': `export class LogService {
  private write(output: unknown): void {
    console.log(JSON.stringify(output));
  }
}
`,
      }),
    );
    expect(byId(json, 'M8').passed).toBe(true);
  });

  it('does not count commented-out example code as an implementation', () => {
    // The shipped template stubs every hook as a commented example. M4-M6 must
    // fail on that, or the gate would wave through an unimplemented module.
    const commentedOut = PASSING['code/lifecycle-hooks/payment.hooks.ts']
      .split('\n')
      .map((line) => (line.includes('providerService') ? `  // ${line.trim()}` : line))
      .join('\n');
    const { json } = report(writeTree({ 'code/lifecycle-hooks/payment.hooks.ts': commentedOut }));
    expect(byId(json, 'M5').passed).toBe(false);
  });

  it('exits 0 on a tree with no provider when --allow-missing-provider is passed', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-validate-noprov-'));
    tmpDirs.push(empty);
    const res = execFileSync('node', [script, `--root=${empty}`, '--allow-missing-provider', '--json'], {
      encoding: 'utf8',
    });
    const json = JSON.parse(res);
    expect(json.error).toBe('no-provider');
    expect(json.exitCode).toBe(0);
  });

  it('still exits 2 with no provider when the flag is absent', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-validate-noprov2-'));
    tmpDirs.push(empty);
    let status = 0;
    try {
      execFileSync('node', [script, `--root=${empty}`, '--json'], { encoding: 'utf8' });
    } catch (err: any) {
      status = err.status;
    }
    expect(status).toBe(2);
  });

  it('does not let --allow-missing-provider mask a failing provider', () => {
    // The flag tolerates absence, never failure.
    const { status } = report(
      writeTree({
        'code/core/container.setup.ts': PASSING['code/core/container.setup.ts'].replace(/.*PROVIDER_CLIENT.*\n/, ''),
      }),
    );
    expect(status).toBe(1);
    const broken = writeTree({
      'code/core/container.setup.ts': PASSING['code/core/container.setup.ts'].replace(/.*PROVIDER_CLIENT.*\n/, ''),
    });
    let withFlag = 0;
    try {
      execFileSync('node', [script, `--root=${broken}`, '--provider=testco', '--allow-missing-provider'], {
        encoding: 'utf8',
      });
    } catch (err: any) {
      withFlag = err.status;
    }
    expect(withFlag).toBe(1);
  });

  it('exits 0 when only minor criteria fail', () => {
    const { status, json } = report(
      writeTree({
        'code/clients/testco-client.ts': PASSING['code/clients/testco-client.ts'].replace(
          'if (!sig) return false;',
          "if (!sig) throw new Error('missing signature');",
        ),
      }),
    );
    expect(json.summary.minorFailed).toBe(1);
    expect(json.summary.criticalFailed + json.summary.majorFailed).toBe(0);
    expect(status).toBe(0);
  });
});
