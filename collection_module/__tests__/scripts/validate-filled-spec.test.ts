import * as fs from 'fs';
import * as path from 'path';

// The extraction tooling is repo-root CommonJS; require it at runtime so ts-jest
// doesn't try to compile it under collection_module's rootDir.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateFilledSpec } = require('../../../scripts/extract-spec.js') as {
  validateFilledSpec: (text: string) => { errors: string[]; warnings: string[] };
};

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
const blankTemplate = () =>
  fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'SPEC-TEMPLATE.md'), 'utf8');

describe('validateFilledSpec', () => {
  it('passes a fully filled spec with no errors', () => {
    const { errors } = validateFilledSpec(fixture('good-spec.md'));
    expect(errors).toEqual([]);
  });

  it('fails the blank template (all scaffolder-critical fields are placeholders)', () => {
    const { errors } = validateFilledSpec(blankTemplate());
    expect(errors.length).toBeGreaterThan(0);
    // The blank template must not silently pass — it would scaffold with defaults.
    expect(errors.join(' ')).toMatch(/Provider name/);
  });

  it('flags a missing auth header specifically', () => {
    const spec = fixture('good-spec.md').replace(/Header name:.*/, 'Header name:');
    const { errors } = validateFilledSpec(spec);
    expect(errors.join(' ')).toMatch(/Header name/);
  });

  it('warns (but does not error) when agent-facing sections keep template defaults', () => {
    const spec = `${fixture('good-spec.md')}\n\n| payment.completed | x |\n| payment.failed | y |\n| mandate.cancelled | z |\n`;
    const { errors, warnings } = validateFilledSpec(spec);
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/Webhook Events/);
  });
});
