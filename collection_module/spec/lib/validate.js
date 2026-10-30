'use strict';

/**
 * Provider spec validation: parse, schema-check, then semantic-check.
 *
 * Exported as pure functions so tests can call them without spawning a
 * process. `scripts/validate-spec.js` is the thin CLI around this.
 */

const fs = require('fs');
const path = require('path');

const { parseSpecYaml, SpecParseError } = require('./yaml');
const { SchemaValidator } = require('./schema-validator');
const { runSemanticChecks } = require('./semantic-checks');

const SCHEMA_PATH = path.join(__dirname, '..', 'provider.schema.json');

let cachedValidator = null;

function getSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
}

function getValidator() {
  if (!cachedValidator) cachedValidator = new SchemaValidator(getSchema());
  return cachedValidator;
}

/** Nearest recorded line for a JSON pointer, walking up to the parent. */
function lineFor(lines, pointer) {
  let candidate = pointer;
  while (candidate) {
    if (lines.has(candidate)) return lines.get(candidate);
    const cut = candidate.lastIndexOf('/');
    if (cut <= 0) break;
    candidate = candidate.slice(0, cut);
  }
  return null;
}

/**
 * Validate an already-parsed spec object.
 * @returns {{ ok: boolean, errors: object[], warnings: object[] }}
 */
function validateSpecObject(spec, options = {}) {
  const schemaErrors = getValidator()
    .validate(spec)
    .map((error) => ({ ...error, severity: 'error', stage: 'schema' }));

  // Semantic checks assume the shape held; running them over a spec that
  // failed the schema produces noise, not signal.
  if (schemaErrors.length > 0) {
    return { ok: false, errors: schemaErrors, warnings: [] };
  }

  const findings = runSemanticChecks(spec, options);
  const errors = findings.errors.map((e) => ({ ...e, stage: 'semantic' }));
  const warnings = findings.warnings.map((w) => ({ ...w, stage: 'semantic' }));
  const strict = options.strict === true;
  return {
    ok: errors.length === 0 && (!strict || warnings.length === 0),
    errors,
    warnings,
  };
}

/**
 * Validate spec YAML text.
 * @returns {{ ok, errors, warnings, spec, lines }}
 */
function validateSpecText(text, options = {}) {
  let parsed;
  try {
    parsed = parseSpecYaml(text);
  } catch (error) {
    if (error instanceof SpecParseError) {
      return {
        ok: false,
        errors: [{ path: '', message: error.message, severity: 'error', stage: 'parse', line: error.line }],
        warnings: [],
        spec: null,
        lines: new Map(),
      };
    }
    throw error;
  }

  if (parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return {
      ok: false,
      errors: [{ path: '', message: 'the spec is empty or is not a mapping', severity: 'error', stage: 'parse', line: 1 }],
      warnings: [],
      spec: parsed.value,
      lines: parsed.lines,
    };
  }

  const result = validateSpecObject(parsed.value, options);
  const attach = (finding) => ({ ...finding, line: finding.line || lineFor(parsed.lines, finding.path) });
  return {
    ok: result.ok,
    errors: result.errors.map(attach),
    warnings: result.warnings.map(attach),
    spec: parsed.value,
    lines: parsed.lines,
  };
}

/** Validate one spec file. */
function validateSpecFile(file, options = {}) {
  const text = fs.readFileSync(file, 'utf8');
  return { file, ...validateSpecText(text, options) };
}

module.exports = {
  SCHEMA_PATH,
  getSchema,
  lineFor,
  validateSpecObject,
  validateSpecText,
  validateSpecFile,
};
