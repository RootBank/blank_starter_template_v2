import { execFileSync } from 'child_process';
import * as path from 'path';

const scaffolder = path.join(__dirname, '..', '..', '..', 'scripts', 'scaffold-provider.js');

// The canonical file set the scaffolder produces. Pinning it here kills the
// 7-vs-8 drift the docs used to carry and fails loudly if the generator changes.
const EXPECTED_FILES = [
  'code/clients/test-co-client.ts',
  'code/services/test-co.service.ts',
  'code/adapters/test-co-to-root-adapter.ts',
  'code/interfaces/test-co-events.ts',
  '__tests__/clients/test-co-client.test.ts',
  '__tests__/services/test-co.service.test.ts',
  '__tests__/adapters/test-co-to-root-adapter.test.ts',
  '__tests__/helpers/test-co-factories.ts',
];

describe('scaffold-provider snapshot', () => {
  const output = execFileSync(
    'node',
    [
      scaffolder,
      '--provider=TestCo',
      '--api-type=http',
      '--base-url=https://api.testco.com',
      '--auth-header=Authorization',
      '--webhook-header=X-TestCo-Signature',
      '--reason=snapshot test',
      '--dry-run',
    ],
    { encoding: 'utf8' },
  );

  it('generates exactly the 8 canonical provider files', () => {
    for (const file of EXPECTED_FILES) {
      expect(output).toContain(file);
    }
    expect(output).toMatch(/"created":8/);
  });

  it('does not write anything to disk in dry-run mode', () => {
    // Dry-run marks every file with the dry-run glyph, never 'create'.
    expect(output).toContain('[dry-run]');
    expect(output).not.toMatch(/\[create\]/);
  });
});
