import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const scaffolder = path.join(__dirname, '..', '..', '..', 'scripts', 'scaffold-provider.js');

const DOCS_URL = 'https://developer.testco.com/api-reference';

/** A minimal REST-only spec. Extra `API base URL` lines are appended per test. */
const spec = (...extraOverviewLines: string[]) => `# TestCo spec

## 1. Provider Overview

\`\`\`
Provider name:             TestCo
API docs URL:              ${DOCS_URL}
${extraOverviewLines.join('\n')}
SDK (npm package):         none — REST only
\`\`\`

## 2. Authentication

\`\`\`
Header name:               Authorization
\`\`\`

## 4. Webhook Configuration

\`\`\`
Signature header:          X-TestCo-Signature
\`\`\`
`;

let tmpDir: string;

const writeSpec = (name: string, contents: string) => {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(file, contents, 'utf8');
  return file;
};

const scaffold = (specFile: string, ...extraArgs: string[]) =>
  execFileSync('node', [scaffolder, `--from-spec=${specFile}`, '--dry-run', ...extraArgs], {
    encoding: 'utf8',
  });

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-spec-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scaffold-provider --from-spec: base URL', () => {
  it('fails when the spec has an API docs URL but no base URL', () => {
    const specFile = writeSpec('no-base-url.md', spec());

    let output = '';
    let status: number | null = null;
    try {
      scaffold(specFile);
    } catch (err) {
      const e = err as { status: number; stdout: string };
      status = e.status;
      output = e.stdout;
    }

    expect(status).toBe(1);
    expect(output).toContain('No API base URL');
    // The docs host must never be guessed into a base URL.
    expect(output).not.toContain('developer.testco.com');
  });

  it('uses the sandbox base URL verbatim, including a version path', () => {
    const specFile = writeSpec(
      'both-urls.md',
      spec(
        'API base URL (sandbox):    https://api-sandbox.testco.com/v2',
        'API base URL (production): https://api.testco.com/v2',
      ),
    );

    expect(scaffold(specFile)).toContain('"base-url":"https://api-sandbox.testco.com/v2"');
  });

  it('falls back to the production base URL when no sandbox URL is given', () => {
    const specFile = writeSpec(
      'production-only.md',
      spec('API base URL (production): https://api.testco.com'),
    );

    expect(scaffold(specFile)).toContain('"base-url":"https://api.testco.com"');
  });

  it('accepts an explicit --base-url for a spec that has none', () => {
    const specFile = writeSpec('flag-override.md', spec());

    const output = scaffold(specFile, '--base-url=https://api.testco.com');
    expect(output).toContain('"created":8');
  });

  // extract-spec.js writes this shape whenever ANTHROPIC_API_KEY is unset: the template
  // first, then the provider's own documentation embedded below it. A base URL named only
  // in that trailing text is documentation prose, not a declared field.
  it('does not take a base URL from the raw content a passthrough spec embeds', () => {
    const specFile = writeSpec(
      'passthrough.md',
      `${spec()}
---

## Raw Source Content

<details>
<summary>Click to expand raw content</summary>

\`\`\`
TestCo Developer Guide

Getting started
API base URL: https://docs-example.testco.io/mock-server
All requests must be authenticated.
\`\`\`

</details>
`,
    );

    let output = '';
    let status: number | null = null;
    try {
      scaffold(specFile);
    } catch (err) {
      const e = err as { status: number; stdout: string };
      status = e.status;
      output = e.stdout;
    }

    expect(status).toBe(1);
    expect(output).toContain('No API base URL');
    expect(output).not.toContain('docs-example.testco.io');
  });

  it('ignores a base URL line still holding the template placeholder', () => {
    const specFile = writeSpec(
      'placeholder.md',
      spec('API base URL (sandbox):    e.g. https://api-sandbox.gocardless.com'),
    );

    let output = '';
    try {
      scaffold(specFile);
    } catch (err) {
      output = (err as { stdout: string }).stdout;
    }

    expect(output).toContain('No API base URL');
    expect(output).not.toContain('gocardless.com');
  });
});
