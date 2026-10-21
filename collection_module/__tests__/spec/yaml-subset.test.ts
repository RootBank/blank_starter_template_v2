import { yamlLib } from './helpers/spec-helpers';

const parse = (lines: string[]) => yamlLib.parseSpecYaml(lines.join('\n')).value;
const parseFails = (lines: string[]) => {
  try {
    yamlLib.parseSpecYaml(lines.join('\n'));
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected a parse error');
};

describe('the YAML subset a spec may use', () => {
  it('reads nested mappings, sequences and sequences of mappings', () => {
    expect(
      parse([
        'provider:',
        '  name: Stripe',
        '  doc_hosts: [docs.stripe.com, stripe.com]',
        'endpoints:',
        '  - operation: createCustomer',
        '    returns: customer',
        '  - operation: getCustomer',
        'hooks:',
        '- name: afterPolicyIssued',
        '  nested:',
        '    deep: 1',
      ]),
    ).toEqual({
      provider: { name: 'Stripe', doc_hosts: ['docs.stripe.com', 'stripe.com'] },
      endpoints: [{ operation: 'createCustomer', returns: 'customer' }, { operation: 'getCustomer' }],
      hooks: [{ name: 'afterPolicyIssued', nested: { deep: 1 } }],
    });
  });

  it('reads scalars without guessing types that matter', () => {
    const value = parse([
      "api_version: '2023-10-16'",
      'retrieved: 2026-10-19',
      'tolerance: 300',
      'multiplier: 1.5',
      'enabled: false',
      'missing: null',
      "format: 'Bearer {providerSecretKey}'",
      'quoted: "a \\"b\\" c"',
      "escaped: 'it''s fine'",
    ]);
    // Quoted version strings and dates stay strings; nothing becomes a Date.
    expect(value.api_version).toBe('2023-10-16');
    expect(value.retrieved).toBe('2026-10-19');
    expect(value.tolerance).toBe(300);
    expect(value.multiplier).toBe(1.5);
    expect(value.enabled).toBe(false);
    expect(value.missing).toBeNull();
    expect(value.format).toBe('Bearer {providerSecretKey}');
    expect(value.quoted).toBe('a "b" c');
    expect(value.escaped).toBe("it's fine");
  });

  it('reads block scalars', () => {
    const value = parse([
      'literal: |-',
      '  line one',
      '    indented',
      'folded: >-',
      '  a',
      '  b',
      '',
      '  c',
    ]);
    expect(value.literal).toBe('line one\n  indented');
    expect(value.folded).toBe('a b\n\nc');
  });

  it('keeps a URL fragment but drops a real comment', () => {
    const value = parse(['url: https://docs.stripe.com/api#create  # the create call', 'other: 1']);
    expect(value.url).toBe('https://docs.stripe.com/api#create');
    expect(value.other).toBe(1);
  });

  it('records the source line of every field', () => {
    const { lines } = yamlLib.parseSpecYaml(
      ['a: 1', 'list:', '  - x: 1', '  - x: 2', '    y: 3'].join('\n'),
    );
    expect(lines.get('/a')).toBe(1);
    expect(lines.get('/list/1/y')).toBe(5);
  });

  describe('rejects, with a line number, what a generated-from spec must not contain', () => {
    it.each([
      ['tabs in indentation', ['a:', '\tb: 1'], /tab character/],
      ['anchors', ['a: &anchor 1'], /anchors and aliases/],
      ['merge keys', ['a:', '  <<: 1'], /merge keys/],
      ['flow mappings', ['a: { b: 1 }'], /flow mappings/],
      ['multiple documents', ['---', 'a: 1', '---', 'b: 2'], /multiple YAML documents/],
      ['duplicate keys', ['a: 1', 'a: 2'], /duplicate key "a"/],
      ['an unterminated quote', ["a: 'oops"], /unterminated quoted scalar/],
      ['an unterminated flow sequence', ['a: [1, 2'], /unterminated flow sequence/],
      ['a non-mapping line', ['just text'], /expected "key: value"/],
      ['stray indentation', ['a: 1', '    b: 2'], /unexpected indentation/],
    ])('%s', (_name, lines, pattern) => {
      const message = parseFails(lines as string[]);
      expect(message).toMatch(pattern as RegExp);
      expect(message).toMatch(/^line \d+: /);
    });
  });
});
