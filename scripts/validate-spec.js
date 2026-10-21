#!/usr/bin/env node
'use strict';

/**
 * validate-spec.js — validate a provider spec against spec/provider.schema.json.
 *
 *   npm run spec:validate                      # every spec in collection_module/spec
 *   npm run spec:validate -- path/to.spec.yaml # one or more named files
 *   npm run spec:validate -- --strict          # warnings fail too
 *   npm run spec:validate -- --json            # machine-readable output
 *
 * Exit codes: 0 clean, 1 findings, 2 bad usage.
 *
 * The validation itself lives in collection_module/spec/lib so tests can call
 * it directly; this file is argument parsing and formatting.
 */

const fs = require('fs');
const path = require('path');

const SPEC_ROOT = path.join(__dirname, '..', 'collection_module', 'spec');
const { validateSpecFile } = require(path.join(SPEC_ROOT, 'lib', 'validate.js'));

const USAGE = `
Usage: npm run spec:validate -- [options] [file...]

  Validates provider specs against spec/provider.schema.json, then applies the
  semantic checks a schema cannot express (webhook events have a Root-side
  action, the status map covers every provider status named in the spec, base
  URLs are API hosts and not documentation hosts, citations stay inside the
  declared documentation hosts).

Options:
  --strict      treat warnings as failures (use this in CI)
  --json        emit findings as JSON
  --today=DATE  override "today" for the future-dated-citation check
  -h, --help    show this message

With no file arguments, every *.spec.yaml under collection_module/spec is
validated. provider.spec.template.yaml is skipped unless you name it.
`.trim();

function parseArgs(argv) {
  const options = { strict: false, json: false, files: [], help: false };
  for (const arg of argv) {
    if (arg === '--strict') options.strict = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('--today=')) options.today = arg.slice('--today='.length);
    else if (arg.startsWith('-')) {
      process.stderr.write(`Unknown option: ${arg}\n\n${USAGE}\n`);
      process.exit(2);
    } else options.files.push(arg);
  }
  return options;
}

function findSpecs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'lib') continue;
      out.push(...findSpecs(full));
    } else if (
      (entry.name.endsWith('.spec.yaml') || entry.name.endsWith('.spec.yml'))
      // The template is not a spec. It is full of placeholders by design, so
      // validating it on every run would be noise. Pass it explicitly to see
      // what a filled-in copy still owes.
      && !entry.name.endsWith('.template.yaml')
      && !entry.name.endsWith('.template.yml')
    ) {
      out.push(full);
    }
  }
  return out.sort();
}

function relative(file) {
  const rel = path.relative(process.cwd(), file);
  // A spec outside the working directory reads better as its absolute path
  // than as a stack of "..".
  return !rel || rel.startsWith('..') ? file : rel;
}

function formatFinding(file, finding) {
  const where = finding.line ? `${relative(file)}:${finding.line}` : relative(file);
  const field = finding.path ? `  ${finding.path}` : '';
  return `  ${where}${field}\n    ${finding.message}`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let files = options.files.map((file) => path.resolve(process.cwd(), file));
  if (files.length === 0) {
    if (!fs.existsSync(SPEC_ROOT)) {
      process.stderr.write(`No spec directory at ${SPEC_ROOT}\n`);
      return 2;
    }
    files = findSpecs(SPEC_ROOT);
  }
  if (files.length === 0) {
    // A freshly cloned template has no provider yet. Say so plainly rather
    // than failing; it is stated loudly so it cannot read as a silent pass.
    process.stdout.write(
      'No provider specs found — 0 validated.\n'
        + 'Copy spec/provider.spec.template.yaml to spec/<provider>.spec.yaml to start one.\n',
    );
    return 0;
  }

  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    process.stderr.write(`No such file: ${missing.map(relative).join(', ')}\n`);
    return 2;
  }

  // A named directory is read as "every spec under here" rather than crashing
  // on an attempt to read a directory as a file.
  files = files.flatMap((file) => (fs.statSync(file).isDirectory() ? findSpecs(file) : [file]));
  if (files.length === 0) {
    process.stderr.write('No *.spec.yaml files in the given directory.\n');
    return 2;
  }

  const results = files.map((file) => validateSpecFile(file, { strict: options.strict, today: options.today }));

  if (options.json) {
    process.stdout.write(`${JSON.stringify(
      {
        ok: results.every((r) => r.ok),
        strict: options.strict,
        results: results.map((r) => ({
          file: relative(r.file),
          ok: r.ok,
          errors: r.errors.map(({ path: p, message, line, stage }) => ({ path: p, message, line, stage })),
          warnings: r.warnings.map(({ path: p, message, line, stage }) => ({ path: p, message, line, stage })),
        })),
      },
      null,
      2,
    )}\n`);
    return results.every((r) => r.ok) ? 0 : 1;
  }

  let totalErrors = 0;
  let totalWarnings = 0;
  for (const result of results) {
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    if (result.errors.length === 0 && result.warnings.length === 0) {
      process.stdout.write(`ok    ${relative(result.file)}\n`);
      continue;
    }
    process.stdout.write(`${result.ok ? 'warn ' : 'FAIL '} ${relative(result.file)}\n`);
    for (const error of result.errors) {
      process.stdout.write(`${formatFinding(result.file, error)}\n`);
    }
    for (const warning of result.warnings) {
      process.stdout.write(`${formatFinding(result.file, warning)}\n`);
    }
  }

  const summary = `${files.length} spec(s), ${totalErrors} error(s), ${totalWarnings} warning(s)`;
  const ok = results.every((r) => r.ok);
  process.stdout.write(`\n${ok ? 'PASS' : 'FAIL'}  ${summary}\n`);
  if (!ok && options.strict && totalErrors === 0) {
    process.stdout.write('Failing on warnings because --strict is set.\n');
  }
  if (ok && totalWarnings > 0) {
    process.stdout.write('Warnings do not fail the run. Use --strict in CI to make them fail.\n');
  }
  return ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, parseArgs, findSpecs };
