# Collection Module Template

A provider-agnostic template for integrating payment providers with the [Root Platform](https://rootplatform.com) insurance system. Ships with a working **Stripe Subscriptions** implementation as the reference.

---

## What This Template Does

When a Root Platform insurance product needs to collect premiums, it calls a **Collection Module** — a small, hosted service that connects Root to a payment provider (Stripe, GoCardless, PayFast, etc.).

This template gives you:

- A fully-wired TypeScript project with DI container, lifecycle hooks, and webhook handling
- A working **Stripe** reference implementation you can copy patterns from
- CLI tools to **scaffold a new provider in minutes** from API docs
- An AI-assisted **spec extraction pipeline** that reads provider docs and fills a template
- A one-command **setup script** that configures credentials and creates the module on Root Platform

---

## Quickstart

```bash
# 1. Clone and set up (run from repo root)
git clone <this-repo> my-collection-module
cd my-collection-module

node scripts/setup.js \
  --cm-key=cm_myprovider_yourco \
  --cm-name="My Provider Integration" \
  --org-id=your-root-org-id \
  --reason="initial setup"

# 2. Fill in credentials
cd collection_module
cp code/env.sample.ts code/env.ts   # then edit with your keys

# 3. Run the tests
npm test

# 4. Build
npm run build
```

---

## How to Generate a Collection Module

There are two paths depending on whether you have provider API docs.

### Path A — Build from Spec (recommended)

Use this when you have a URL, PDF, OpenAPI file, or Markdown copy of the provider's API docs.

```bash
cd collection_module

# Step 1: Extract a spec from provider docs (requires ANTHROPIC_API_KEY)
npm run extract:spec -- \
  --input=https://docs.myprovider.com/api \
  --output=docs/myprovider-spec.md

# Step 2: Review the generated spec in docs/myprovider-spec.md
# Edit any fields marked "// NOT FOUND IN DOCS"

# Step 3: Scaffold all provider files from the spec
npm run scaffold:provider -- \
  --from-spec=docs/myprovider-spec.md \
  --reason="Adding MyProvider for ZA market"

# Step 4: Implement the TODO stubs in each generated file
# Step 5: Wire into container, webhooks, lifecycle hooks, and env.sample.ts
# Step 6: Run tests
npm test
```

**What gets generated:**

| File | Purpose |
|---|---|
| `code/clients/{provider}-client.ts` | SDK/HTTP wrapper + webhook signature verification |
| `code/services/{provider}.service.ts` | Business logic (customer, payment, subscription) |
| `code/adapters/{provider}-to-root-adapter.ts` | Status mapping + data transforms |
| `code/interfaces/{provider}-events.ts` | Webhook event name constants |
| `__tests__/clients/{provider}-client.test.ts` | Client unit tests |
| `__tests__/services/{provider}.service.test.ts` | Service unit tests |
| `__tests__/adapters/{provider}-to-root-adapter.test.ts` | Adapter unit tests |

### Path B — Scaffold with Explicit Flags

Use this when you already know the provider details.

```bash
cd collection_module

# HTTP-based provider (e.g. GoCardless, PayFast)
npm run scaffold:provider -- \
  --provider=GoCardless \
  --api-type=http \
  --base-url=https://api.gocardless.com \
  --auth-header=Authorization \
  --webhook-header=Webhook-Signature \
  --reason="Direct debit for ZA market"

# SDK-based provider (e.g. a provider with an npm package)
npm run scaffold:provider -- \
  --provider=MyProvider \
  --api-type=sdk \
  --sdk-package=myprovider-nodejs \
  --webhook-header=X-MyProvider-Signature \
  --reason="SDK-based integration"
```

### After Scaffolding — Wiring Checklist

After generating the 7 files, wire them into the module by updating these 4 files:

| File | What to add |
|---|---|
| `code/core/container.setup.ts` | Register `PROVIDER_CLIENT` and `PROVIDER_SERVICE` |
| `code/webhook-hooks.ts` | Verify signature + route events via switch statement |
| `code/lifecycle-hooks/*.ts` | Call provider from `afterPolicyIssued`, `afterPaymentCreated`, etc. |
| `code/env.sample.ts` | Add config placeholder keys for the new provider |

See `collection_module/docs/03-PROVIDER-INTERFACE.md` for the full step-by-step guide.

---

## Project Setup

### One-time Setup Script

```bash
# Minimal — generates placeholder files so you can start coding immediately
node scripts/setup.js \
  --cm-key=cm_stripe_yourco \
  --org-id=your-org-id \
  --reason="initial setup"

# Full — includes credentials and creates the collection module on Root Platform
node scripts/setup.js \
  --cm-key=cm_stripe_yourco \
  --cm-name="Stripe Integration" \
  --org-id=your-org-id \
  --root-api-key=production_xxx \
  --root-api-key-sandbox=sandbox_xxx \
  --provider-key-live=sk_live_xxx \
  --provider-key-test=sk_test_xxx \
  --provider-webhook-live=whsec_xxx \
  --provider-webhook-test=whsec_xxx \
  --reason="initial setup"

# Preview without writing files
node scripts/setup.js --cm-key=cm_test --org-id=xxx --dry-run

# Full options
node scripts/setup.js --help
```

**What the setup script does:**

1. Checks Node.js version against `.nvmrc`
2. Checks if `rp` (Root Platform CLI) is installed
3. Runs `npm install` in `collection_module/`
4. Writes `collection_module/.root-config.json`
5. Writes `collection_module/.root-auth` (if `--root-api-key` provided)
6. Creates the collection module on Root Platform via API (if credentials provided)
7. Writes `collection_module/code/env.ts` from your flags (or placeholder values)
8. Runs `npm run build` to validate the setup

> **Note:** Existing files are never overwritten. Delete a file and re-run to regenerate it.

### Manual Credential Setup

If you prefer to set credentials manually:

```bash
cd collection_module
cp code/env.sample.ts code/env.ts   # then fill in your keys
```

| Variable | Description |
|---|---|
| `PROVIDER_SECRET_KEY_LIVE` / `_TEST` | Provider secret key |
| `PROVIDER_PUBLISHABLE_KEY_LIVE` / `_TEST` | Provider publishable key (if applicable) |
| `PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE` / `_TEST` | Webhook endpoint signing secret |
| `PROVIDER_PRODUCT_ID_LIVE` / `_TEST` | Provider product/plan ID (if applicable) |
| `ROOT_API_KEY_LIVE` / `_SANDBOX` | Root Platform API keys |
| `ROOT_BASE_URL_LIVE` / `_SANDBOX` | Root Platform API base URLs |
| `ROOT_COLLECTION_MODULE_KEY` | Your collection module identifier |

The `ConfigurationService` resolves live vs test/sandbox values automatically based on `NODE_ENV`.

---

## Project Structure

```
collection_module/
  code/
    main.ts                           # Entry point — exports all hooks
    env.sample.ts                     # Environment variable template
    core/
      container.ts                    # DI container + ServiceToken symbols
      container.setup.ts              # Service registration (wiring)
    clients/
      stripe-client.ts                # Stripe SDK wrapper
      root-client.ts                  # Root Platform API client
      base-http-client.ts             # Generic HTTP client for non-SDK providers
    services/
      stripe.service.ts               # Stripe business logic
      root.service.ts                 # Root Platform operations
      config.service.ts               # Environment-aware config resolution
      log.service.ts                  # Structured JSON logging
      render.service.ts               # HTML rendering for dashboard
    adapters/
      stripe-to-root-adapter.ts       # Stripe → Root data transforms
    interfaces/
      provider.interfaces.ts          # Provider-agnostic contracts
      stripe-events.ts                # Webhook event constants
    lifecycle-hooks/                  # Root Platform lifecycle hooks
    webhook-hooks.ts                  # Webhook signature verify + routing
    utils/                            # Error classes, retry, timeout
  __tests__/                          # Jest tests (mirrors code/ structure)
  docs/                               # Architecture & pattern docs
  scripts/
    scaffold-provider.js              # CLI — scaffold a new provider
    extract-spec.js                   # CLI — extract spec from API docs
    log-action.js                     # CLI — append audit log entries
scripts/
  setup.js                            # CLI — one-time project setup
```

---

## How It Works

The module connects a payment provider to Root Platform through two flows:

**Lifecycle hooks** — Root calls exported functions at key moments (policy issued, payment created, etc.). The hooks resolve services from the DI container, call the provider API, and update Root.

**Webhooks** — The payment provider sends events (invoice paid, payment failed, etc.). The module verifies the signature, parses the event, and updates Root Platform accordingly.

---

## CLI Reference

All commands are run from inside `collection_module/` unless noted.

| Command | Description |
|---|---|
| `node scripts/setup.js` | One-time project setup (run from repo root) |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Check for linting errors |
| `npm run scaffold:provider -- --help` | Show scaffold CLI options |
| `npm run extract:spec -- --help` | Show spec extraction options |
| `npm run predeploy` | Validate + test + build (pre-deploy check) |
| `npm run deploy:sandbox` | Deploy to Root Platform sandbox |
| `npm run deploy:production` | Deploy to Root Platform production |

---

## AI Tool Usage

This template is designed for AI-assisted development with Claude, Cursor, and Copilot.

### Claude (via Claude Code)

```bash
# In Claude Code, use the built-in commands:
/build-from-spec      # Full guided workflow: extract → scaffold → implement → verify
/review-implementation  # Check your implementation against all quality criteria
```

### Cursor

The `.cursor/rules/build-from-spec.mdc` rule activates automatically when you ask Cursor to add a provider. It follows the same 5-step workflow.

### GitHub Copilot

The `.github/copilot-instructions.md` file gives Copilot full project context. Ask it to implement any stub using the Stripe reference patterns.

---

## Documentation

Detailed docs live in `collection_module/docs/`:

| Doc | Topic |
|---|---|
| `00-OVERVIEW.md` | Architecture, directory layout, data flow |
| `01-GETTING-STARTED.md` | Setup and first run |
| `02-ARCHITECTURE.md` | DI container deep dive |
| `03-PROVIDER-INTERFACE.md` | Provider contracts and step-by-step guide |
| `14-BUILD-FROM-SPEC.md` | End-to-end spec-to-implementation workflow |
| `15-SELF-REVIEW.md` | Quality checklist (Critical / Major / Minor criteria) |
| `STRIPE-REFERENCE.md` | Working Stripe reference for every pattern |
| `SPEC-TEMPLATE.md` | Blank spec template for new providers |

---

## Requirements

- Node.js >= 18
- npm >= 8
- A Root Platform account
- A payment provider account (Stripe by default)
- `ANTHROPIC_API_KEY` — only required for `npm run extract:spec`
- `root-platform-cli` (`npm install -g root-platform-cli`) — required for deployment
