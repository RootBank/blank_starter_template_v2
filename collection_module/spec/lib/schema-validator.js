'use strict';

/**
 * Minimal JSON Schema (draft-07 subset) validator.
 *
 * The repo has no declared schema-validation dependency and this slice may not
 * add one, so the keyword set below is implemented directly. It covers exactly
 * what `spec/provider.schema.json` uses; an unknown keyword is reported as a
 * schema bug rather than ignored, so the schema and the validator cannot drift
 * apart silently.
 *
 * Errors carry a JSON-pointer `path` so the caller can map them back to a
 * source line. Messages name the offending field.
 */

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment',
  'title', 'description', 'examples', 'default', 'deprecated',
  'type', 'enum', 'const',
  'properties', 'required', 'additionalProperties', 'patternProperties', 'propertyNames',
  'minProperties', 'maxProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems',
  'pattern', 'minLength', 'maxLength', 'format',
  'minimum', 'maximum',
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
]);

const FORMATS = {
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  uri: (value) => /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value),
  hostname: (value) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(value),
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === 'number') return actual === 'number' || actual === 'integer';
  if (type === 'integer') return actual === 'integer';
  return actual === type;
}

function describe(value) {
  const actual = typeOf(value);
  if (actual === 'string') return `the string "${value.length > 40 ? `${value.slice(0, 37)}...` : value}"`;
  if (actual === 'object') return 'an object';
  if (actual === 'array') return 'a list';
  return `${actual === 'null' ? 'nothing' : String(value)}`;
}

function fieldName(path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return 'the spec';
  const last = parts[parts.length - 1];
  // A bare array index reads as nonsense on its own: say endpoints[0].
  if (/^\d+$/.test(last) && parts.length > 1) return `${parts[parts.length - 2]}[${last}]`;
  return last;
}

class SchemaValidator {
  constructor(rootSchema) {
    this.root = rootSchema;
    this.assertKnownKeywords(rootSchema, '#');
  }

  assertKnownKeywords(schema, where) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
    for (const key of Object.keys(schema)) {
      if (!SUPPORTED_KEYWORDS.has(key)) {
        throw new Error(`provider.schema.json uses unsupported keyword "${key}" at ${where}`);
      }
    }
    const descend = (sub, suffix) => this.assertKnownKeywords(sub, `${where}${suffix}`);
    for (const key of ['properties', 'patternProperties', '$defs']) {
      if (schema[key]) {
        for (const [name, sub] of Object.entries(schema[key])) descend(sub, `/${key}/${name}`);
      }
    }
    for (const key of ['items', 'not', 'if', 'then', 'else', 'propertyNames', 'additionalProperties']) {
      if (typeof schema[key] === 'object') descend(schema[key], `/${key}`);
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(schema[key])) schema[key].forEach((sub, i) => descend(sub, `/${key}/${i}`));
    }
  }

  resolve(schema) {
    if (!schema || !schema.$ref) return schema;
    const ref = schema.$ref;
    if (!ref.startsWith('#/$defs/')) {
      throw new Error(`provider.schema.json uses unsupported $ref "${ref}" — only #/$defs/<name> is supported`);
    }
    const name = ref.slice('#/$defs/'.length);
    const target = (this.root.$defs || {})[name];
    if (!target) throw new Error(`provider.schema.json references missing definition "${name}"`);
    return target;
  }

  validate(value) {
    const errors = [];
    this.check(value, this.root, '', errors);
    return errors;
  }

  /** @returns {boolean} true when `value` satisfies `schema`. */
  check(value, rawSchema, path, errors) {
    const schema = this.resolve(rawSchema);
    if (schema === true || schema === undefined) return true;
    if (schema === false) {
      errors.push({ path, message: `${fieldName(path)} is not allowed here` });
      return false;
    }
    const before = errors.length;

    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some((t) => matchesType(value, t))) {
        errors.push({
          path,
          message: `${fieldName(path)} must be ${types.join(' or ')}, but found ${describe(value)}`,
        });
        return false;
      }
    }

    if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
      errors.push({ path, message: `${fieldName(path)} must be ${JSON.stringify(schema.const)}` });
    }

    if (schema.enum && !schema.enum.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
      errors.push({
        path,
        message: `${fieldName(path)} must be one of: ${schema.enum.map((o) => JSON.stringify(o)).join(', ')} — found ${describe(value)}`,
      });
    }

    if (typeof value === 'string') this.checkString(value, schema, path, errors);
    if (typeof value === 'number') this.checkNumber(value, schema, path, errors);
    if (Array.isArray(value)) this.checkArray(value, schema, path, errors);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      this.checkObject(value, schema, path, errors);
    }

    this.checkCombinators(value, schema, path, errors);

    return errors.length === before;
  }

  checkString(value, schema, path, errors) {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `${fieldName(path)} must be at least ${schema.minLength} characters (found ${value.length})`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `${fieldName(path)} must be at most ${schema.maxLength} characters (found ${value.length})`,
      });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({
        path,
        message: `${fieldName(path)} must match ${schema.pattern} — found "${value}"`,
      });
    }
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](value)) {
      errors.push({ path, message: `${fieldName(path)} must be a valid ${schema.format} — found "${value}"` });
    }
  }

  checkNumber(value, schema, path, errors) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `${fieldName(path)} must be >= ${schema.minimum} (found ${value})` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `${fieldName(path)} must be <= ${schema.maximum} (found ${value})` });
    }
  }

  checkArray(value, schema, path, errors) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        message: `${fieldName(path)} must list at least ${schema.minItems} item(s) — found ${value.length}`,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        message: `${fieldName(path)} must list at most ${schema.maxItems} item(s) — found ${value.length}`,
      });
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      value.forEach((item, index) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push({ path: `${path}/${index}`, message: `${fieldName(path)} contains a duplicate entry ${key}` });
        }
        seen.add(key);
      });
    }
    if (schema.items) {
      value.forEach((item, index) => this.check(item, schema.items, `${path}/${index}`, errors));
    }
  }

  checkObject(value, schema, path, errors) {
    const keys = Object.keys(value);
    for (const required of schema.required || []) {
      if (value[required] === undefined || value[required] === null) {
        errors.push({
          path: `${path}/${required}`,
          message: `${required} is required${path ? ` on ${path}` : ''} but is missing`,
        });
      }
    }
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({
        path,
        message: `${fieldName(path)} must declare at least ${schema.minProperties} entr(y|ies) — found ${keys.length}`,
      });
    }
    const patternSchemas = Object.entries(schema.patternProperties || {});
    for (const key of keys) {
      const childPath = `${path}/${key}`;
      let matched = false;
      if (schema.properties && schema.properties[key] !== undefined) {
        matched = true;
        if (value[key] !== undefined) this.check(value[key], schema.properties[key], childPath, errors);
      }
      for (const [pattern, sub] of patternSchemas) {
        if (new RegExp(pattern).test(key)) {
          matched = true;
          this.check(value[key], sub, childPath, errors);
        }
      }
      if (schema.propertyNames) this.check(key, schema.propertyNames, childPath, errors);
      if (!matched && schema.additionalProperties === false) {
        const known = Object.keys(schema.properties || {});
        errors.push({
          path: childPath,
          message: `unknown field "${key}"${known.length ? ` — expected one of: ${known.join(', ')}` : ''}`,
        });
      } else if (!matched && typeof schema.additionalProperties === 'object') {
        this.check(value[key], schema.additionalProperties, childPath, errors);
      }
    }
  }

  checkCombinators(value, schema, path, errors) {
    if (schema.allOf) {
      for (const sub of schema.allOf) this.check(value, sub, path, errors);
    }
    if (schema.anyOf) {
      const branch = [];
      const ok = schema.anyOf.some((sub) => this.check(value, sub, path, branch));
      if (!ok) {
        errors.push({
          path,
          message: `${fieldName(path)} does not match any allowed shape: ${branch.map((e) => e.message).join('; ')}`,
        });
      }
    }
    if (schema.oneOf) {
      const branch = [];
      const matches = schema.oneOf.filter((sub) => this.check(value, sub, path, branch));
      if (matches.length !== 1) {
        errors.push({
          path,
          message: matches.length === 0
            ? `${fieldName(path)} does not match any allowed shape: ${branch.map((e) => e.message).join('; ')}`
            : `${fieldName(path)} is ambiguous — it matches ${matches.length} allowed shapes at once`,
        });
      }
    }
    if (schema.not) {
      const branch = [];
      if (this.check(value, schema.not, path, branch)) {
        errors.push({ path, message: `${fieldName(path)} matches a shape that is explicitly disallowed` });
      }
    }
    if (schema.if) {
      const branch = [];
      const conditionMet = this.check(value, schema.if, path, branch);
      if (conditionMet && schema.then) this.check(value, schema.then, path, errors);
      if (!conditionMet && schema.else) this.check(value, schema.else, path, errors);
    }
  }
}

function validateAgainstSchema(value, schema) {
  return new SchemaValidator(schema).validate(value);
}

module.exports = { SchemaValidator, validateAgainstSchema, SUPPORTED_KEYWORDS };
