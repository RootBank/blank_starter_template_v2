import * as fs from 'fs';

import {
  AS_OF,
  FIXTURES,
  TEMPLATE,
  loadFixture,
  messages,
  requiredPointers,
  validate,
  validateLib,
  without,
} from './helpers/spec-helpers';

describe('the schema fits two opposite provider shapes', () => {
  it('both fixtures validate', () => {
    for (const file of Object.values(FIXTURES)) {
      const result = validateLib.validateSpecFile(file, { today: AS_OF });
      expect({ file, errors: result.errors }).toEqual({ file, errors: [] });
    }
  });

  // If this ever passes trivially, the second fixture has drifted towards the
  // first and stopped being evidence of anything.
  it('the fixtures really are opposite shapes', () => {
    const sync = loadFixture('sync');
    const batch = loadFixture('batch');

    expect(sync.integration.collection_model).toBe('api_sync');
    expect(sync.integration.status_source).toBe('webhook');
    expect(sync.provider.api_type).toBe('http');
    expect(sync.api).toBeDefined();
    expect(sync.endpoints).toBeDefined();
    expect(sync.webhooks).toBeDefined();
    expect(sync.file_exchange).toBeUndefined();
    expect(sync.status_reports).toBeUndefined();

    expect(batch.integration.collection_model).toBe('batch_file');
    expect(batch.integration.status_source).toBe('response_file');
    expect(batch.provider.api_type).toBe('file');
    expect(batch.api).toBeUndefined();
    expect(batch.endpoints).toBeUndefined();
    expect(batch.webhooks).toBeUndefined();
    expect(batch.file_exchange).toBeDefined();
    expect(batch.status_reports).toBeDefined();
  });

  it('between them they exercise every Root failure_action', () => {
    const used = new Set(
      [...loadFixture('sync').status_map, ...loadFixture('batch').status_map]
        .map((row: any) => row.failure_action)
        .filter(Boolean),
    );
    expect(used).toEqual(new Set(['block_retry', 'allow_retry', 'block_payment_method']));
  });

  it('a spec with an open question passes, but fails --strict', () => {
    expect(validateLib.validateSpecFile(FIXTURES.batch, { today: AS_OF }).ok).toBe(true);

    const strict = validateLib.validateSpecFile(FIXTURES.batch, { today: AS_OF, strict: true });
    expect(strict.ok).toBe(false);
    expect(messages(strict)).toMatch(/TODO\(human\): .+\?/);
  });

  it('every inferred source asks a specific question and points at a line', () => {
    const result = validateLib.validateSpecFile(FIXTURES.batch, { today: AS_OF });
    const inferred = result.warnings.filter((w) => w.message.includes('sourced as "inferred"'));
    expect(inferred.length).toBeGreaterThan(0);
    for (const warning of inferred) {
      expect(warning.message).toMatch(/TODO\(human\): .+\?$/);
      expect(warning.line).toBeGreaterThan(0);
    }
  });
});

describe('the blank template', () => {
  const text = () => fs.readFileSync(TEMPLATE, 'utf8');

  it('names no specific provider', () => {
    // The template is the thing people copy. A provider name in it becomes a
    // default, and a default becomes an assumption.
    expect(text()).not.toMatch(/stripe|gocardless|adyen|payfast|paystack/i);
  });

  it('does not validate while the placeholders are still in it', () => {
    const result = validateLib.validateSpecFile(TEMPLATE, { today: AS_OF });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(10);
  });

  it('covers every block the schema knows about', () => {
    const declared = Object.keys(validateLib.getSchema().properties);
    const present = text()
      .split('\n')
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(':')[0]);
    expect(new Set(present)).toEqual(new Set(declared));
  });

  it('tells the reader which blocks to delete for their provider shape', () => {
    for (const marker of ['api_type: file', 'status_source: webhook', 'collection_model: batch_file']) {
      expect(text()).toContain(marker);
    }
    expect(text()).toMatch(/DELETE THIS BLOCK/);
  });
});

describe('removing a required field fails with a message naming the field', () => {
  for (const name of ['sync', 'batch'] as const) {
    describe(name, () => {
      const spec = loadFixture(name);
      const pointers = requiredPointers(spec);

      it('finds a meaningful number of required fields to try', () => {
        expect(pointers.length).toBeGreaterThan(30);
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
