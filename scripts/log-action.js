#!/usr/bin/env node
'use strict';

/**
 * log-action.js
 *
 * Appends a structured action log entry to .logs/actions.jsonl.
 * Manual CLI: invoke from a terminal or wire into scripts that need an
 * audit trail. Nothing in this repo currently calls it automatically.
 *
 * Usage:
 *   node scripts/log-action.js --action=<name> --reason=<why> [--status=<ok|error>] [--meta=<json>]
 *   npm run log:action -- --action=scaffold --reason="Adding GoCardless" --status=ok
 *
 * Options:
 *   --action    Action name (required)           e.g. scaffold, extract-spec, deploy
 *   --reason    Why this action was taken        e.g. "Adding GoCardless for ZA market"
 *   --status    ok or error (default: ok)
 *   --meta      JSON string of extra metadata    e.g. '{"provider":"GoCardless"}'
 *   --help      Show this help
 */

const fs = require('fs');
const path = require('path');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.action) {
  console.error('✗ [error] --action is required');
  process.exit(1);
}

// ─── Build entry ──────────────────────────────────────────────────────────────

const entry = {
  ts: new Date().toISOString(),
  action: args.action,
  reason: args.reason || '',
  status: args.status || 'ok',
};

if (args.meta) {
  try {
    entry.meta = JSON.parse(args.meta);
  } catch {
    entry.meta = { raw: args.meta };
  }
}

// ─── Write to log ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', 'collection_module');
const LOG_DIR = path.join(ROOT, '.logs');
const LOG_FILE = path.join(LOG_DIR, 'actions.jsonl');

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');

console.log(`→ [log] ${entry.action} (${entry.status}) — ${LOG_FILE}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function printHelp() {
  console.log(`
log-action.js — append an action entry to .logs/actions.jsonl

Usage:
  node scripts/log-action.js --action=<name> [options]
  npm run log:action -- --action=<name> [options]

Options:
  --action    Action name (required)      e.g. scaffold, extract-spec, deploy
  --reason    Why this action was taken   e.g. "Adding GoCardless"
  --status    ok or error (default: ok)
  --meta      JSON string               e.g. '{"provider":"GoCardless","files":7}'
  --help      Show this help

Output:
  Appends one JSON line to collection_module/.logs/actions.jsonl

Example:
  npm run log:action -- \\
    --action=scaffold \\
    --reason="Adding GoCardless for ZA market" \\
    --status=ok \\
    --meta='{"provider":"GoCardless","filesCreated":7}'
`);
}
