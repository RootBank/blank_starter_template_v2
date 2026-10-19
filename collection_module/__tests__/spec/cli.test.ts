import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AS_OF, EXAMPLES } from './helpers/spec-helpers';

const CLI = path.join(__dirname, '..', '..', '..', 'scripts', 'validate-spec.js');
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

type Run = { status: number; stdout: string; stderr: string };

function run(args: string[]): Run {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status: number; stdout: string; stderr: string };
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('spec:validate CLI', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-cli-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exits 0 and validates every example when given no files', () => {
    const result = run([`--today=${AS_OF}`]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('stripe.spec.yaml');
    expect(result.stdout).toContain('acme-debit-bureau.spec.yaml');
    expect(result.stdout).toContain('PASS  2 spec(s), 0 error(s)');
  });

  it('exits 1 on a spec with errors, naming the file, the line and the field', () => {
    const broken = path.join(tempDir, 'broken.spec.yaml');
    const text = fs
      .readFileSync(EXAMPLES.stripe, 'utf8')
      .replace('    sandbox: https://api.stripe.com', '    sandbox: https://docs.stripe.com/api');
    fs.writeFileSync(broken, text);

    const result = run([broken, `--today=${AS_OF}`]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('FAIL');
    expect(result.stdout).toMatch(/broken\.spec\.yaml:\d+/);
    expect(result.stdout).toContain('/api/base_urls/sandbox');
    expect(result.stdout).toContain('uses the documentation host');
  });

  it('exits 1 under --strict when a spec only has warnings', () => {
    expect(run([EXAMPLES.bureau, `--today=${AS_OF}`]).status).toBe(0);
    expect(run([EXAMPLES.bureau, '--strict', `--today=${AS_OF}`]).status).toBe(1);
  });

  it('emits machine-readable findings under --json', () => {
    const result = run([EXAMPLES.stripe, '--json', `--today=${AS_OF}`]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].errors).toEqual([]);
    expect(payload.results[0].warnings[0]).toMatchObject({
      path: expect.stringContaining('/webhooks/events/'),
      stage: 'semantic',
      line: expect.any(Number),
    });
  });

  it('exits 2 on bad usage rather than pretending the spec passed', () => {
    expect(run(['--nonsense']).status).toBe(2);
    expect(run([path.join(tempDir, 'does-not-exist.spec.yaml')]).status).toBe(2);
  });

  it('prints usage for --help and exits 0', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: npm run spec:validate');
  });

  it('reports a parse error with a line number instead of crashing', () => {
    const bad = path.join(tempDir, 'unparseable.spec.yaml');
    fs.writeFileSync(bad, 'provider:\n\tname: Oops\n');
    const result = run([bad]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('line 2: tab character in indentation');
  });
});
