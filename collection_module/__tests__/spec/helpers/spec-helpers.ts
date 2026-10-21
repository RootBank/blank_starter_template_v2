import * as fs from 'fs';
import * as path from 'path';

// The spec tooling is CommonJS outside rootDir; require it at runtime so
// ts-jest does not try to compile it.
/* eslint-disable @typescript-eslint/no-var-requires */
const SPEC_DIR = path.join(__dirname, '..', '..', '..', 'spec');

export type Finding = {
  path: string;
  message: string;
  line?: number | null;
  stage?: string;
};

export type Result = {
  ok: boolean;
  errors: Finding[];
  warnings: Finding[];
  spec?: unknown;
};

export const validateLib = require(path.join(SPEC_DIR, 'lib', 'validate.js')) as {
  validateSpecText: (text: string, options?: Record<string, unknown>) => Result;
  validateSpecObject: (spec: unknown, options?: Record<string, unknown>) => Result;
  validateSpecFile: (file: string, options?: Record<string, unknown>) => Result & { file: string };
  getSchema: () => any;
  SCHEMA_PATH: string;
};

export const yamlLib = require(path.join(SPEC_DIR, 'lib', 'yaml.js')) as {
  parseSpecYaml: (text: string) => { value: any; lines: Map<string, number> };
  SpecParseError: new (...args: any[]) => Error;
};

export const schemaLib = require(path.join(SPEC_DIR, 'lib', 'schema-validator.js')) as {
  validateAgainstSchema: (value: unknown, schema: any) => Finding[];
};
/* eslint-enable @typescript-eslint/no-var-requires */

/** The date the fixtures were authored against, so tests never depend on today. */
export const AS_OF = '2026-10-19';

export const TEMPLATE = path.join(SPEC_DIR, 'provider.spec.template.yaml');

/**
 * Two deliberately opposite provider shapes. They are fixtures, not examples:
 * generic by design, and not shipped as documentation. Between them they are
 * the evidence that the schema is not built around a single provider shape.
 */
export const FIXTURES = {
  sync: path.join(__dirname, '..', 'fixtures', 'http-webhook.fixture.yaml'),
  batch: path.join(__dirname, '..', 'fixtures', 'batch-file.fixture.yaml'),
};

export function loadFixture(name: keyof typeof FIXTURES): any {
  return yamlLib.parseSpecYaml(fs.readFileSync(FIXTURES[name], 'utf8')).value;
}

export function validate(spec: unknown, options: Record<string, unknown> = {}): Result {
  return validateLib.validateSpecObject(spec, { today: AS_OF, ...options });
}

export function messages(result: Result): string {
  return [...result.errors, ...result.warnings].map((f) => f.message).join('\n');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Delete the value at a JSON pointer, returning a modified copy. */
export function without<T>(spec: T, pointer: string): T {
  const copy = clone(spec);
  const parts = pointer.split('/').filter(Boolean);
  let node: any = copy;
  for (const part of parts.slice(0, -1)) node = node[part];
  const last = parts[parts.length - 1];
  if (Array.isArray(node)) node.splice(Number(last), 1);
  else delete node[last];
  return copy;
}

/**
 * Every field the schema requires for this particular spec, as JSON pointers,
 * including fields required only because of a conditional (`if`/`then`) that
 * this spec's values activate.
 */
export function requiredPointers(spec: any): string[] {
  const schema = validateLib.getSchema();
  const found: string[] = [];

  const resolve = (node: any): any => {
    if (node && node.$ref) {
      const name = String(node.$ref).replace('#/$defs/', '');
      return schema.$defs[name];
    }
    return node;
  };

  const matches = (value: unknown, condition: any): boolean =>
    schemaLib.validateAgainstSchema(value, { ...condition, $defs: schema.$defs }).length === 0;

  const walk = (value: any, rawNode: any, pointer: string): void => {
    const node = resolve(rawNode);
    if (!node || typeof node !== 'object' || value === null || value === undefined) return;

    for (const key of node.required || []) {
      if (value[key] !== undefined) found.push(`${pointer}/${key}`);
    }

    const conditionals = [node, ...(node.allOf || [])];
    for (const entry of conditionals) {
      if (entry && entry.if && entry.then && matches(value, entry.if)) {
        for (const key of entry.then.required || []) {
          if (value[key] !== undefined) found.push(`${pointer}/${key}`);
        }
      }
    }

    if (node.properties) {
      for (const [key, sub] of Object.entries(node.properties)) {
        if (value[key] !== undefined) walk(value[key], sub, `${pointer}/${key}`);
      }
    }
    if (node.items && Array.isArray(value)) {
      value.forEach((item, i) => walk(item, node.items, `${pointer}/${i}`));
    }
    if (typeof node.additionalProperties === 'object' && !Array.isArray(value)) {
      for (const [key, sub] of Object.entries(value)) {
        if (!node.properties || node.properties[key] === undefined) {
          walk(sub, node.additionalProperties, `${pointer}/${key}`);
        }
      }
    }
  };

  walk(spec, schema, '');
  return [...new Set(found)];
}
