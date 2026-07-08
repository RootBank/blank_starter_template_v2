#!/usr/bin/env node
'use strict';

/**
 * extract-spec.js
 *
 * Ingests a provider API doc (URL, PDF, OpenAPI JSON/YAML, or Markdown)
 * and uses Claude to extract and fill docs/SPEC-TEMPLATE.md fields.
 *
 * Usage:
 *   node scripts/extract-spec.js --input=<source> --output=<path>
 *   npm run extract:spec -- --input=https://docs.provider.com/api --output=docs/my-spec.md
 *
 * Options:
 *   --input     URL, file path (.pdf, .json, .yaml, .md) (required)
 *   --output    Output path for filled spec (default: docs/SPEC-EXTRACTED.md)
 *   --dry-run   Print extracted content without writing file
 *   --help      Show this help
 *
 * Env:
 *   ANTHROPIC_API_KEY   Optional. If set, Claude fills the template automatically.
 *                       If unset, runs in passthrough mode (raw content + template).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 16000;

// Instructions live in the system prompt; the source doc + template go in the
// user turn (keeps the fixed prefix stable and the volatile content separate).
const SYSTEM_PROMPT = `You extract information from a payment provider's API documentation to fill a spec template.

Rules:
- Fill every field in the template using information from the docs.
- Replace example values (e.g. "e.g. GoCardless") with actual values from the docs.
- For webhook events, list every event the payment module needs to handle (focus on payment success, payment failure, subscription/mandate events).
- For status mapping, list every payment status the provider uses and map each to: successful, pending, failed, or cancelled.
- For API endpoints, list only the endpoints needed for: create customer, get customer, create payment, attach payment method, cancel subscription.
- If a field is not in the docs, leave the placeholder text and add "// NOT FOUND IN DOCS" after it. Never invent values.
- Keep the exact Markdown structure of the template. Do not add sections that aren't in the template.
- Output only the filled template — no preamble, no explanation.`;

// ─── CLI entry point (only runs when invoked directly, not when required) ────

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input) {
    log('error', '--input is required (URL, PDF path, or OpenAPI file path)');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY && !args['no-ai']) {
    log('info', 'Running in passthrough mode (raw content + template for manual/AI review)');
  }

  const config = {
    useAi: !args['no-ai'] && !!process.env.ANTHROPIC_API_KEY,
    inputSource: args.input,
    outputPath:
      args.output || path.resolve(__dirname, '..', 'collection_module', 'docs', 'SPEC-EXTRACTED.md'),
    isDryRun: !!args['dry-run'],
  };

  main(config).catch((err) => {
    log('error', `extract-spec failed: ${err.message}`);
    process.exit(1);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(config) {
  const { useAi, inputSource, outputPath, isDryRun } = config;
  const ROOT = path.resolve(__dirname, '..', 'collection_module');
  const SPEC_TEMPLATE_PATH = path.join(ROOT, 'docs', 'SPEC-TEMPLATE.md');

  log('info', 'extract-spec start', { input: inputSource, output: outputPath, dryRun: isDryRun });

  // 1. Read the spec template
  if (!fs.existsSync(SPEC_TEMPLATE_PATH)) {
    throw new Error(`SPEC-TEMPLATE.md not found at ${SPEC_TEMPLATE_PATH}`);
  }
  const specTemplate = fs.readFileSync(SPEC_TEMPLATE_PATH, 'utf8');

  // 2. Extract content from source
  log('info', 'Extracting content from source', { source: inputSource });
  const rawContent = await extractContent(inputSource);
  log('info', `Extracted ${rawContent.length} characters from source`);

  // 3. Fill the spec — with Claude if available, otherwise passthrough
  let filledSpec;
  if (useAi) {
    log('info', 'Calling Claude to fill spec template...');
    filledSpec = await fillSpecWithClaude(rawContent, specTemplate, inputSource);

    // Two-layer validation of the AI-filled spec (see validateFilledSpec).
    const { errors, warnings } = validateFilledSpec(filledSpec);
    for (const w of warnings) log('warn', w);
    if (errors.length) {
      throw new Error(
        `Extracted spec is missing fields the scaffolder requires:\n  - ${errors.join('\n  - ')}\n` +
          'Fix the source doc or fill these in manually before scaffolding.',
      );
    }
  } else {
    log('info', 'Passthrough mode — embedding raw content alongside template for manual review');
    filledSpec = buildPassthroughSpec(rawContent, specTemplate, inputSource);
  }

  // 4. Write output
  if (isDryRun) {
    log('dry-run', 'Extracted spec (not written):');
    console.log('\n' + '─'.repeat(60));
    console.log(filledSpec);
    console.log('─'.repeat(60) + '\n');
  } else {
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, filledSpec, 'utf8');
    log('create', outputPath, { reason: 'filled spec from provider docs' });
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log(`✓ Spec extracted${isDryRun ? ' (dry run)' : ` → ${outputPath}`}`);
  console.log('━'.repeat(60));
  console.log('');
  console.log('Next step:');
  console.log(`  Review the spec, then scaffold:`);
  console.log(`  npm run scaffold:provider -- --from-spec=${outputPath} --reason="<why>"`);
  console.log('');

  log('info', 'extract-spec complete', { output: outputPath });
}

// ─── Content extraction ───────────────────────────────────────────────────────

async function extractContent(source) {
  if (isUrl(source)) {
    return extractFromUrl(source);
  }

  const ext = path.extname(source).toLowerCase();

  if (ext === '.pdf') {
    return extractFromPdf(source);
  }

  if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
    return extractFromFile(source);
  }

  if (ext === '.md' || ext === '.txt') {
    return extractFromFile(source);
  }

  // Unknown extension — try reading as text
  return extractFromFile(source);
}

function isUrl(str) {
  return str.startsWith('http://') || str.startsWith('https://');
}

async function extractFromUrl(url) {
  log('info', 'Fetching URL', { url });
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; extract-spec/1.0)',
        'Accept': 'text/html,application/json,text/plain,*/*',
      },
    };

    const req = client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        extractFromUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(
          `HTTP ${res.statusCode} fetching ${url}.\n` +
          `If this is a JS-rendered docs site, save the page as a PDF and use:\n` +
          `  npm run extract:spec -- --input=./page.pdf`
        ));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        // Strip HTML tags for cleaner extraction
        const text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{3,}/g, '\n\n')
          .trim();

        if (text.length < 200) {
          reject(new Error(
            `Page content is too short (${text.length} chars) — likely a JS-rendered site.\n` +
            `Save the page as a PDF and use:\n` +
            `  npm run extract:spec -- --input=./page.pdf`
          ));
          return;
        }

        resolve(text);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url} — try saving as PDF instead`));
    });
  });
}

async function extractFromPdf(filePath) {
  log('info', 'Extracting PDF', { filePath });

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`PDF not found: ${absPath}`);
  }

  try {
    // Dynamic require so the package is optional
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(absPath);
    const data = await pdfParse(buffer);
    if (!data.text || data.text.trim().length < 100) {
      throw new Error(
        'PDF appears to be scanned/image-only (no extractable text).\n' +
        'Use a text-based PDF or paste the content into docs/SPEC-TEMPLATE.md manually.'
      );
    }
    log('info', `PDF parsed: ${data.numpages} pages, ${data.text.length} chars`);
    return data.text;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'pdf-parse is not installed.\n' +
        'Run: npm install pdf-parse\n' +
        'Or install it: cd collection_module && npm install pdf-parse'
      );
    }
    throw err;
  }
}

function extractFromFile(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }
  const content = fs.readFileSync(absPath, 'utf8');
  log('info', `File read: ${content.length} chars`);
  return content;
}

// ─── Passthrough (no-AI) spec builder ─────────────────────────────────────────

function buildPassthroughSpec(rawContent, specTemplate, sourceLabel) {
  const MAX_EMBED = 120000;
  const truncated = rawContent.length > MAX_EMBED;
  const content = truncated ? rawContent.slice(0, MAX_EMBED) : rawContent;

  return `${specTemplate}

---

## Raw Source Content

> **Source:** \`${sourceLabel}\`
> **Mode:** Passthrough (no AI extraction — fill the sections above manually using the content below)
${truncated ? `> **Note:** Content truncated from ${rawContent.length} to ${MAX_EMBED} characters\n` : ''}

<details>
<summary>Click to expand raw content (${content.length} characters)</summary>

\`\`\`
${content}
\`\`\`

</details>
`;
}

// ─── Claude API call ──────────────────────────────────────────────────────────

async function fillSpecWithClaude(rawContent, specTemplate, sourceLabel) {
  const Anthropic = requireAnthropic();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const userContent =
    `SOURCE: ${sourceLabel}\n\n` +
    `PROVIDER API DOCUMENTATION:\n<docs>\n${rawContent}\n</docs>\n\n` +
    `SPEC TEMPLATE TO FILL:\n<template>\n${specTemplate}\n</template>\n\n` +
    `Return the complete filled SPEC-TEMPLATE.md content now:`;
  const messages = [{ role: 'user', content: userContent }];

  // Size guard — fail loud instead of silently truncating the source (the old
  // behaviour sliced at 80k chars and the model filled the missing half blind).
  await assertWithinBudget(client, model, SYSTEM_PROMPT, messages);

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    throw toFriendlyApiError(Anthropic, err);
  }

  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      `Spec extraction hit the ${MAX_OUTPUT_TOKENS}-token output cap (stop_reason=max_tokens) — ` +
        'the filled spec would be truncated. Point --input at a narrower section of the docs, ' +
        'or raise MAX_OUTPUT_TOKENS.',
    );
  }

  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// Count the assembled prompt and refuse to send if it can't fit the model's
// context window alongside the reserved output budget.
async function assertWithinBudget(client, model, system, messages) {
  let contextWindow = 200000; // conservative fallback if the lookup fails
  try {
    const info = await client.models.retrieve(model);
    if (info && info.max_input_tokens) contextWindow = info.max_input_tokens;
  } catch (err) {
    log('warn', `Could not look up context window for ${model} (${err.message}); using ${contextWindow}`);
  }

  const margin = 2000;
  const budget = contextWindow - MAX_OUTPUT_TOKENS - margin;

  let inputTokens;
  try {
    const tc = await client.messages.countTokens({ model, system, messages });
    inputTokens = tc.input_tokens;
  } catch (err) {
    log('warn', `Token count unavailable (${err.message}); skipping size guard`);
    return;
  }

  log('info', `Prompt size: ${inputTokens} input tokens (budget ${budget} for ${model})`);
  if (inputTokens > budget) {
    throw new Error(
      `Source too large: ${inputTokens} input tokens exceeds the ${budget}-token budget for ${model}. ` +
        'Split the docs or point --input at a narrower section. ' +
        '(This used to be silently truncated to 80k characters.)',
    );
  }
}

function toFriendlyApiError(Anthropic, err) {
  const reqId = err && err.request_id ? ` (request_id: ${err.request_id})` : '';
  if (Anthropic.RateLimitError && err instanceof Anthropic.RateLimitError) {
    return new Error(`Rate limited by the Anthropic API${reqId}. Retry later.`);
  }
  if (Anthropic.AuthenticationError && err instanceof Anthropic.AuthenticationError) {
    return new Error(`ANTHROPIC_API_KEY was rejected${reqId}. Check the key.`);
  }
  if (Anthropic.APIStatusError && err instanceof Anthropic.APIStatusError) {
    return new Error(`Anthropic API error ${err.status}: ${err.message}${reqId}`);
  }
  return err;
}

function requireAnthropic() {
  try {
    const mod = require('@anthropic-ai/sdk');
    return mod.default || mod;
  } catch {
    throw new Error(
      '@anthropic-ai/sdk is not installed.\n' +
      'Run: cd collection_module && npm install @anthropic-ai/sdk'
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(level, message, meta = {}) {
  const prefix = { info: '→', create: '✓', skip: '~', error: '✗', 'dry-run': '○', warn: '⚠' }[level] || ' ';
  const metaStr = Object.keys(meta).length ? `  ${JSON.stringify(meta)}` : '';
  console.log(`${prefix} [${level}] ${message}${metaStr}`);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    if (arg === '--dry-run') { result['dry-run'] = true; continue; }
    if (arg === '--no-ai') { result['no-ai'] = true; continue; }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function printHelp() {
  console.log(`
extract-spec.js — extract provider spec from API docs

Usage:
  node scripts/extract-spec.js --input=<source> [options]
  npm run extract:spec -- --input=<source> [options]

Input types:
  URL          https://docs.provider.com/api-reference
  PDF file     ./provider-api-docs.pdf
  OpenAPI      ./openapi.json  or  ./openapi.yaml
  Markdown     ./api-docs.md

Options:
  --output     Output path (default: docs/SPEC-EXTRACTED.md)
  --dry-run    Print extracted spec without writing file
  --no-ai      Skip Claude — output the spec template with raw content appended
  --help       Show this help

Env:
  ANTHROPIC_API_KEY   Optional. When set, Claude fills the template automatically.
                      Works fine without it — runs in passthrough mode (same as --no-ai).

Examples:
  # From URL
  npm run extract:spec -- \\
    --input=https://developer.gocardless.com/api-reference \\
    --output=docs/gocardless-spec.md

  # From PDF
  npm run extract:spec -- \\
    --input=./docs/paygate-api.pdf \\
    --output=docs/paygate-spec.md

  # Preview without writing
  npm run extract:spec -- \\
    --input=./openapi.json \\
    --dry-run

Notes:
  - JS-rendered docs sites (React/Vue docs portals) may not fetch correctly.
    Save the page as PDF and use --input=./page.pdf instead.
  - PDF must contain selectable text (not a scanned image).
  - Review the extracted spec before running scaffold:provider.
`);
}

// ─── Spec validation (pure — exported for tests) ──────────────────────────────

/**
 * Validate an AI-filled spec against what the scaffolder needs.
 *  - errors:   missing/placeholder values the scaffolder regex-parses. Hard fail.
 *  - warnings: agent-facing sections left at their template defaults. Soft.
 *
 * @param {string} text  The filled SPEC-TEMPLATE.md content.
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateFilledSpec(text) {
  const errors = [];
  const warnings = [];

  // The 5 scaffolder-critical lines (see scaffold-provider.js readSpecFile()).
  const name = labelValue(text, 'Provider name:');
  if (isPlaceholder(name)) errors.push('Provider name is missing or still a placeholder');

  const sdk = labelValue(text, 'SDK \\(npm package\\):');
  const url = labelValue(text, 'API docs URL:');
  const sdkReal = !isPlaceholder(sdk) && !/^none/i.test(sdk || '');
  const urlReal = !isPlaceholder(url);
  if (!sdkReal && !urlReal) {
    errors.push('API type unresolvable — need a real "SDK (npm package):" or "API docs URL:"');
  }

  const authHeader = labelValue(text, 'Header name:');
  if (isPlaceholder(authHeader)) errors.push('Auth "Header name:" is missing or still a placeholder');

  const sigHeader = labelValue(text, 'Signature header:');
  if (isPlaceholder(sigHeader)) errors.push('Webhook "Signature header:" is missing or still a placeholder');

  // Agent-facing sections — warn if they still carry the template defaults.
  if (/payment\.completed[\s\S]*payment\.failed[\s\S]*mandate\.cancelled/.test(text)) {
    warnings.push('Webhook Events table still shows the template defaults — confirm real event names');
  }
  if (/paid_out[\s\S]*pending_submission/.test(text)) {
    warnings.push('Status mapping still shows the template defaults — confirm real provider statuses');
  }
  if (/"id":\s*"CU123"/.test(text) || /"id":\s*"PM123"/.test(text)) {
    warnings.push('Data Shapes still show the template example objects — replace with real shapes');
  }

  return { errors, warnings };
}

function labelValue(text, label) {
  // Capture only the remainder of the SAME line — [ \t]* (not \s*) so the match
  // can't span a newline and grab the next line's text when the value is blank.
  const m = text.match(new RegExp(label + '[ \\t]*(.*)'));
  return m ? m[1].trim() : null;
}

function isPlaceholder(value) {
  if (!value) return true;
  const v = value.trim();
  if (v === '') return true;
  if (/^e\.g\./i.test(v)) return true; // unchanged template hint
  if (/NOT FOUND IN DOCS/i.test(v)) return true;
  return false;
}

module.exports = { validateFilledSpec };
