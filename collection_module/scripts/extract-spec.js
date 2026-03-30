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
 *   ANTHROPIC_API_KEY   Required. Claude API key.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.input) {
  log('error', '--input is required (URL, PDF path, or OpenAPI file path)');
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  log('error', 'ANTHROPIC_API_KEY environment variable is not set');
  log('error', 'Export it: export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const inputSource = args.input;
const outputPath = args.output || path.resolve(__dirname, '..', 'docs', 'SPEC-EXTRACTED.md');
const isDryRun = !!args['dry-run'];

const ROOT = path.resolve(__dirname, '..');
const SPEC_TEMPLATE_PATH = path.join(ROOT, 'docs', 'SPEC-TEMPLATE.md');

// ─── Main ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  log('error', `extract-spec failed: ${err.message}`);
  process.exit(1);
});

async function main() {
  log('info', 'extract-spec start', { input: inputSource, output: outputPath, dryRun: isDryRun });

  // 1. Read the spec template
  if (!fs.existsSync(SPEC_TEMPLATE_PATH)) {
    log('error', `SPEC-TEMPLATE.md not found at ${SPEC_TEMPLATE_PATH}`);
    process.exit(1);
  }
  const specTemplate = fs.readFileSync(SPEC_TEMPLATE_PATH, 'utf8');

  // 2. Extract content from source
  log('info', 'Extracting content from source', { source: inputSource });
  const rawContent = await extractContent(inputSource);
  log('info', `Extracted ${rawContent.length} characters from source`);

  // 3. Call Claude to fill the spec
  log('info', 'Calling Claude to fill spec template...');
  const filledSpec = await fillSpecWithClaude(rawContent, specTemplate, inputSource);

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

// ─── Claude API call ──────────────────────────────────────────────────────────

async function fillSpecWithClaude(rawContent, specTemplate, sourceLabel) {
  const Anthropic = requireAnthropic();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Truncate very long docs to avoid context limits (keep first 80k chars)
  const MAX_CONTENT = 80000;
  const truncated = rawContent.length > MAX_CONTENT;
  const content = truncated ? rawContent.slice(0, MAX_CONTENT) : rawContent;
  if (truncated) {
    log('warn', `Content truncated from ${rawContent.length} to ${MAX_CONTENT} chars for API call`);
  }

  const prompt = `You are extracting information from a payment provider's API documentation to fill a spec template.

SOURCE: ${sourceLabel}

PROVIDER API DOCUMENTATION:
<docs>
${content}
</docs>

SPEC TEMPLATE TO FILL:
<template>
${specTemplate}
</template>

Instructions:
- Fill every field in the template using information from the docs
- Replace example values (e.g. "e.g. GoCardless") with actual values from the docs
- For webhook events, list every event the payment module needs to handle (focus on payment success, payment failure, subscription/mandate events)
- For status mapping, list every payment status the provider uses and map to: successful, pending, failed, or cancelled
- For API endpoints, list only the endpoints needed for: create customer, get customer, create payment, attach payment method, cancel subscription
- If a field is not in the docs, leave the placeholder text and add "// NOT FOUND IN DOCS" after it
- Keep the exact Markdown structure of the template
- Do not add sections that aren't in the template
- Output only the filled template — no preamble, no explanation

Return the complete filled SPEC-TEMPLATE.md content now:`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return text;
}

function requireAnthropic() {
  try {
    return require('@anthropic-ai/sdk');
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
  --help       Show this help

Env:
  ANTHROPIC_API_KEY   Required. Get from console.anthropic.com.

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
