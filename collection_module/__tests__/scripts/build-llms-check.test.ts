import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BUILDER = path.join(REPO_ROOT, 'scripts', 'build-llms-full.js');
const LLMS_FULL = path.join(REPO_ROOT, 'llms-full.txt');
const DOC = path.join(REPO_ROOT, 'collection_module', 'docs', '09-TESTING.md');

function runCheck() {
  return spawnSync('node', [BUILDER, '--check'], { encoding: 'utf8' });
}

/**
 * Append a line to a doc, run the check, and put the doc back exactly as it was.
 * Restoring in `finally` matters: a thrown expectation must not leave a modified
 * doc behind for the rest of the suite or for the working tree.
 */
function withDriftedDoc<T>(docPath: string, fn: () => T): T {
  const original = fs.readFileSync(docPath);
  try {
    fs.appendFileSync(docPath, '\nA line that only exists to drift the generated file.\n');
    return fn();
  } finally {
    fs.writeFileSync(docPath, original);
  }
}

describe('build-llms-full --check', () => {
  it('exits 0 when the committed llms-full.txt matches the docs', () => {
    const result = runCheck();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('llms-full.txt is up to date');
  });

  it('exits 1 and names the drifted doc when a doc changes', () => {
    withDriftedDoc(DOC, () => {
      const result = runCheck();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('llms-full.txt is out of date');
      // The section anchor and its source path are what make the CI log actionable.
      expect(result.stderr).toContain('[changed] ## 09-TESTING');
      expect(result.stderr).toContain('collection_module/docs/09-TESTING.md');
      expect(result.stderr).toContain('Run `npm run build:llms`');
    });
  });

  it('names only the drifted section, not every section', () => {
    withDriftedDoc(DOC, () => {
      const changed = runCheck().stderr.match(/\[changed\]/g) ?? [];

      // Doc bodies contain their own `##` headings, so a parser that split on every
      // `## ` would report all 24 sections here instead of the one that moved.
      expect(changed).toHaveLength(1);
    });
  });

  it('writes nothing in --check mode, on either the pass or the fail path', () => {
    const before = fs.readFileSync(LLMS_FULL);

    runCheck();
    expect(fs.readFileSync(LLMS_FULL).equals(before)).toBe(true);

    withDriftedDoc(DOC, () => {
      runCheck();
      expect(fs.readFileSync(LLMS_FULL).equals(before)).toBe(true);
    });
  });

  it('exits 1 rather than crashing when llms-full.txt is absent', () => {
    const saved = fs.readFileSync(LLMS_FULL);
    try {
      fs.unlinkSync(LLMS_FULL);
      const result = runCheck();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('llms-full.txt is missing');
    } finally {
      fs.writeFileSync(LLMS_FULL, saved);
    }
  });
});
