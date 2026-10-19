import { AS_OF, EXAMPLES, loadExample, messages, requiredPointers, validate, validateLib, without } from './helpers/spec-helpers';

describe('worked examples', () => {
  it('both example specs validate', () => {
    for (const file of Object.values(EXAMPLES)) {
      const result = validateLib.validateSpecFile(file, { today: AS_OF });
      expect({ file, errors: result.errors }).toEqual({ file, errors: [] });
    }
  });

  it('the two examples are genuinely different shapes', () => {
    const stripe = loadExample('stripe');
    const bureau = loadExample('bureau');

    expect(stripe.integration.collection_model).toBe('api_sync');
    expect(stripe.integration.status_source).toBe('webhook');
    expect(stripe.provider.api_type).toBe('sdk');
    expect(stripe.webhooks).toBeDefined();
    expect(stripe.api).toBeDefined();
    expect(stripe.deviations).toBeUndefined();

    expect(bureau.integration.collection_model).toBe('batch_file');
    expect(bureau.integration.status_source).toBe('response_file');
    expect(bureau.provider.api_type).toBe('file');
    expect(bureau.webhooks).toBeUndefined();
    expect(bureau.api).toBeUndefined();
    expect(bureau.endpoints).toBeUndefined();
    expect(bureau.file_exchange).toBeDefined();
    expect(bureau.status_reports).toBeDefined();
  });

  it('the Stripe example warns only about the two things it documents', () => {
    const result = validateLib.validateSpecFile(EXAMPLES.stripe, { today: AS_OF });
    expect(result.warnings.map((w) => w.path)).toEqual([
      '/webhooks/events/1/provider_status',
      '/webhooks/events/5/root_action',
    ]);
  });

  it('the bureau example passes but fails --strict, because it still has open questions', () => {
    const loose = validateLib.validateSpecFile(EXAMPLES.bureau, { today: AS_OF });
    expect(loose.ok).toBe(true);

    const strict = validateLib.validateSpecFile(EXAMPLES.bureau, { today: AS_OF, strict: true });
    expect(strict.ok).toBe(false);
    expect(strict.warnings.length).toBeGreaterThan(0);
    expect(messages(strict)).toMatch(/TODO\(human\):/);
  });

  it('every inferred source in the bureau example asks a specific question', () => {
    const result = validateLib.validateSpecFile(EXAMPLES.bureau, { today: AS_OF });
    const inferred = result.warnings.filter((w) => w.message.includes('sourced as "inferred"'));
    expect(inferred.length).toBeGreaterThan(0);
    for (const warning of inferred) {
      expect(warning.message).toMatch(/TODO\(human\): .+\?$/);
      expect(warning.line).toBeGreaterThan(0);
    }
  });
});

describe('removing a required field fails with a message naming the field', () => {
  for (const name of ['stripe', 'bureau'] as const) {
    describe(name, () => {
      const spec = loadExample(name);
      const pointers = requiredPointers(spec);

      it('finds a meaningful number of required fields to try', () => {
        expect(pointers.length).toBeGreaterThan(40);
      });

      it.each(pointers)('%s', (pointer) => {
        const field = pointer.split('/').pop() as string;
        const result = validate(without(spec, pointer));
        expect(result.ok).toBe(false);
        expect(messages(result)).toContain(field);
      });
    });
  }
});
