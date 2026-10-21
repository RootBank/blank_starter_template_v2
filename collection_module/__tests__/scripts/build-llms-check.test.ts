import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BUILDER = path.join(REPO_ROOT, 'scripts', 'build-llms-full.js');

// Every test runs against a throwaway copy of the repo, pointed at by LLMS_REPO_ROOT.
// Nothing tracked is ever appended to or deleted, and the suite does not depend on
// whether the real llms-full.txt happens to be in sync — that is CI's job, via
// `npm run build:llms:check` against the real tree.
let fixture: string;

function run(args: string[] = []): SpawnSyncReturns<string> {
  return spawnSync('node', [BUILDER, ...args], {
    encoding: 'utf8',
    env: { ...process.env, LLMS_REPO_ROOT: fixture },
  });
}

/** Assert on exit status, surfacing the script's own output when it doesn't match. */
function expectExit(result: SpawnSyncReturns<string>, expected: number): void {
  if (result.status !== expected) {
    throw new Error(
      `expected exit ${expected}, got ${result.status}\n\n` +
        `--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
    );
  }
}

function fixtureDoc(name: string): string {
  return path.join(fixture, 'collection_module', 'docs', name);
}

const OUT = () => path.join(fixture, 'llms-full.txt');

beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'llms-check-'));
  fs.mkdirSync(path.join(fixture, 'collection_module'), { recursive: true });
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    fs.copyFileSync(path.join(REPO_ROOT, file), path.join(fixture, file));
  }
  fs.cpSync(
    path.join(REPO_ROOT, 'collection_module', 'docs'),
    path.join(fixture, 'collection_module', 'docs'),
    { recursive: true },
  );
  // Generate the fixture's own llms-full.txt so it starts self-consistent.
  expectExit(run(), 0);
});

afterEach(() => {
  fs.rmSync(fixture, { recursive: true, force: true });
});

function drift(name: string): void {
  fs.appendFileSync(fixtureDoc(name), '\nA line that only exists to drift the generated file.\n');
}

describe('build-llms-full --check', () => {
  it('exits 0 when llms-full.txt matches the docs', () => {
    const result = run(['--check']);

    expectExit(result, 0);
    expect(result.stdout).toContain('llms-full.txt is up to date');
  });

  it('exits 1 and names the drifted doc when a doc changes', () => {
    drift('09-TESTING.md');
    const result = run(['--check']);

    expectExit(result, 1);
    expect(result.stderr).toContain('llms-full.txt is out of date');
    // The section anchor and its source path are what make the CI log actionable.
    expect(result.stderr).toContain('[changed] ## 09-TESTING');
    expect(result.stderr).toContain('collection_module/docs/09-TESTING.md');
    expect(result.stderr).toContain('Run `npm run build:llms`');
  });

  it('names only the drifted section, not every section', () => {
    drift('09-TESTING.md');
    const changed = run(['--check']).stderr.match(/\[changed\]/g) ?? [];

    // Doc bodies contain their own `##` headings, so a parser that split on every
    // `## ` would report all 24 sections here instead of the one that moved.
    expect(changed).toHaveLength(1);
  });

  it('writes nothing in --check mode, on either the pass or the fail path', () => {
    const before = fs.readFileSync(OUT());

    run(['--check']);
    expect(fs.readFileSync(OUT()).equals(before)).toBe(true);

    drift('09-TESTING.md');
    run(['--check']);
    expect(fs.readFileSync(OUT()).equals(before)).toBe(true);
  });

  it('exits 1 rather than crashing when llms-full.txt is absent', () => {
    fs.unlinkSync(OUT());
    const result = run(['--check']);

    expectExit(result, 1);
    expect(result.stderr).toContain('llms-full.txt is missing');
  });

  it('regenerates byte-for-byte, so a clean tree never drifts on rerun', () => {
    const before = fs.readFileSync(OUT());

    expectExit(run(), 0);

    expect(fs.readFileSync(OUT()).equals(before)).toBe(true);
  });
});
