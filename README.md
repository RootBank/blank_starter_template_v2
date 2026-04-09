# Collection Module Template

A provider-agnostic template for connecting any payment provider to the [Root Platform](https://rootplatform.com). Built to be implemented with AI — Claude, Cursor, or Copilot can take provider API docs and produce a production-ready module in a single session.

---

## What Is a Collection Module?

When a Root Platform insurance product needs to collect premiums, it calls a **Collection Module** — a small hosted service that bridges Root to a payment provider.

This template gives you the full skeleton: DI container, lifecycle hooks, webhook handler, test suite, and CLI tooling. You fill in the provider-specific logic — or better, **you let AI do it**.

---

## Using AI to Build a Module

This is the primary way to use this template. You bring the provider API docs; the AI writes the code.

### Option A — Claude Code (recommended)

Claude Code has built-in skills for this template:

**`/build-from-spec`** — Full guided workflow from provider docs to working code:

```
/build-from-spec <url-or-path-to-api-docs>
```

Claude will:
1. Extract the provider API docs into a structured spec in `docs/`
2. Run `scaffold:provider` to generate all 7 provider files
3. Implement every TODO stub using the spec and the reference implementation as patterns
4. Wire the provider into `container.setup.ts`, `webhook-hooks.ts`, and lifecycle hooks
5. Run the test suite and fix any failures

**`/review-implementation`** — Quality gate after implementing:

```
/review-implementation
```

Claude audits your implementation against 21 criteria (Critical C1–C8, Major M1–M8, Minor m1–m5) and fixes any issues it finds. Run this before deploying.

**`/open-in-cursor`** — Open the collection module in Cursor:

```
/open-in-cursor          # opens in Cursor desktop
/open-in-cursor web      # opens in Cursor web (vscode.dev)
```

#### Prompting Tips for Claude

You don't need to understand the codebase to get started. These prompts work well:

```
"Build a collection module using the API docs at <provider-docs-url>.
Our Root org ID is abc123."

"I've pasted the provider API docs below. Build me a collection module.
Use the HTTP client pattern, not SDK."

"The spec is already in docs/myprovider-spec.md. Scaffold and implement
the full module. Wire all lifecycle hooks."

"/review-implementation — fix everything it flags as Critical or Major."
```

---

### Option B — Cursor

The `.cursor/rules/build-from-spec.mdc` rule activates automatically when you ask Cursor to add a provider.

```
@build-from-spec Add a new provider. API docs: <provider-docs-url>
```

Cursor will follow the same 5-step workflow as the Claude Code skill.

**Useful follow-up prompts in Cursor:**

```
"Implement all the TODO stubs in code/services/{provider}.service.ts
using the reference patterns from the docs"

"Wire the PROVIDER_EVENTS constants into webhook-hooks.ts and add
a controller for each event type"

"Write tests for all the methods in the adapter — use factories.ts for test data"
```

---

### Option C — GitHub Copilot

The `.github/copilot-instructions.md` gives Copilot full project context. Use inline suggestions or Copilot Chat:

```
# In Copilot Chat:
"Implement createCustomer in {Provider}Service following
the reference patterns in the docs"

"Generate a complete test for {Provider}ToRootAdapter.convertPaymentToRootUpdate.
Use factories from __tests__/helpers/factories.ts"
```

---

## Full Workflow: Zero to Deployed

### 1. First-time setup

```bash
git clone <this-repo> my-collection-module
cd my-collection-module

# Run from the repo root — configures credentials, installs deps, creates the module on Root Platform
node scripts/setup.js \
  --cm-key=cm_myprovider_yourco \
  --cm-name="MyProvider Integration" \
  --org-id=your-root-org-id \
  --root-api-key=production_xxx \
  --root-api-key-sandbox=sandbox_xxx \
  --reason="initial setup"

# Or minimal (placeholder credentials, you fill in env.ts manually)
node scripts/setup.js \
  --cm-key=cm_myprovider_yourco \
  --org-id=your-root-org-id \
  --reason="initial setup"

node scripts/setup.js --help   # see all options
```

### 2. Extract a spec from provider API docs

```bash
cd collection_module

# From a URL (Claude reads the docs and fills the SPEC-TEMPLATE)
npm run extract:spec -- \
  --input=<provider-docs-url> \
  --output=docs/myprovider-spec.md

# From a PDF
npm run extract:spec -- \
  --input=./provider-api-docs.pdf \
  --output=docs/myprovider-spec.md

# From an OpenAPI file
npm run extract:spec -- \
  --input=./openapi.yaml \
  --output=docs/myprovider-spec.md
```

> Requires `ANTHROPIC_API_KEY` in your environment. The spec is saved to `docs/` — review it before scaffolding.

### 3. Scaffold all provider files

```bash
# From spec (recommended — reads provider name, auth type, base URL automatically)
npm run scaffold:provider -- \
  --from-spec=docs/myprovider-spec.md \
  --reason="<why you're adding this provider>"

# Or with explicit flags
npm run scaffold:provider -- \
  --provider=MyProvider \
  --api-type=http \
  --base-url=https://api.myprovider.com \
  --auth-header=Authorization \
  --webhook-header=Webhook-Signature \
  --reason="<why you're adding this provider>"

npm run scaffold:provider -- --help   # see all options
```

The scaffold generates 7 files and **prints the exact TypeScript blocks** to paste into `container.setup.ts` and `webhook-hooks.ts`.

### 4. Implement the stubs

At this point, open Claude Code and run the skill:
```
/build-from-spec docs/myprovider-spec.md
```

Or manually implement:

| File | What to implement |
|---|---|
| `code/clients/{provider}-client.ts` | `verifyWebhookSignature()`, SDK init |
| `code/services/{provider}.service.ts` | `createCustomer()`, `createPaymentIntent()`, etc. |
| `code/adapters/{provider}-to-root-adapter.ts` | Status mapping, data transforms |
| `code/webhook-hooks.ts` | Signature verification + event routing |
| `code/lifecycle-hooks/*.ts` | `afterPolicyIssued()`, `afterPaymentCreated()`, etc. |

Reference patterns for every file: `collection_module/docs/REFERENCE.md`

### 5. Run the quality review

Run the review skill:
```
/review-implementation
```

Or manually check against `collection_module/docs/15-SELF-REVIEW.md`. Fix all Critical (C1–C8) before deploying.

### 6. Deploy

```bash
npm run deploy:sandbox      # deploy to Root Platform sandbox
npm run deploy:production   # deploy to production
```

---

## What Gets Generated

Running `scaffold:provider` creates:

| Generated file | Purpose |
|---|---|
| `code/clients/{provider}-client.ts` | Wraps the provider SDK or REST API; implements `verifyWebhookSignature()` |
| `code/services/{provider}.service.ts` | Business logic: `createCustomer`, `createPaymentIntent`, `cancelSubscription` |
| `code/adapters/{provider}-to-root-adapter.ts` | Pure data transforms: provider shapes → Root Platform shapes |
| `code/interfaces/{provider}-events.ts` | Webhook event type constants (e.g. `PROVIDER_EVENTS.PAYMENT_COMPLETED`) |
| `__tests__/clients/{provider}-client.test.ts` | Client unit tests |
| `__tests__/services/{provider}.service.test.ts` | Service unit tests |
| `__tests__/adapters/{provider}-to-root-adapter.test.ts` | Adapter unit tests |

**What you wire manually** (or ask AI to wire):

| File | What to add |
|---|---|
| `code/core/container.setup.ts` | Register `PROVIDER_CLIENT` + `PROVIDER_SERVICE` (scaffold prints the exact code) |
| `code/webhook-hooks.ts` | Verify signature + route events via switch statement |
| `code/lifecycle-hooks/*.ts` | Call provider from lifecycle hooks |
| `code/env.sample.ts` | Add `PROVIDER_SECRET_KEY` and `PROVIDER_WEBHOOK_SECRET` placeholders |

---

## Project Structure

```
collection_module/
├── code/
│   ├── main.ts                      # Entry point — exports all hooks to Root Platform
│   ├── env.sample.ts                # Environment variable template (copy → env.ts)
│   ├── core/
│   │   ├── container.ts             # DI container + ServiceToken symbols
│   │   └── container.setup.ts       # Service registration (wire your provider here)
│   ├── clients/
│   │   ├── root-client.ts           # Root Platform API client
│   │   └── base-http-client.ts      # Generic HTTP client (for REST-only providers)
│   ├── services/
│   │   ├── root.service.ts          # Root Platform operations
│   │   ├── config.service.ts        # Environment-aware config (live vs test)
│   │   ├── log.service.ts           # Structured JSON logging
│   │   └── render.service.ts        # HTML rendering for Root dashboard
│   ├── adapters/                    # Generated: {provider}-to-root-adapter.ts
│   ├── controllers/                 # Generated: one controller per webhook event
│   ├── interfaces/
│   │   ├── provider.interfaces.ts   # PaymentProviderClient, PaymentProviderService contracts
│   │   └── {provider}-events.ts    # Generated: webhook event constants
│   ├── lifecycle-hooks/
│   │   ├── policy.hooks.ts          # afterPolicyIssued, afterPolicyCancelled, etc.
│   │   ├── payment.hooks.ts         # afterPaymentCreated, afterPaymentUpdated
│   │   └── payment-method.hooks.ts  # createPaymentMethod, renderCreatePaymentMethod, etc.
│   ├── webhook-hooks.ts             # Signature verification + event routing
│   └── utils/
│       ├── error.ts                 # ModuleError base class
│       ├── error-types.ts           # ValidationError, NetworkError, etc.
│       ├── retry.ts                 # retryWithBackoff, retryWithJitter
│       └── timeout.ts               # withTimeout, withTimeoutFallback
├── __tests__/                       # Jest tests (mirrors code/ structure)
│   ├── helpers/
│   │   ├── factories.ts             # Mock data builders for Root + provider objects
│   │   └── test-utils.ts            # Test utilities
│   └── test-helpers.ts              # Mock service factories + createMockWebhookRequest()
├── docs/                            # Architecture and pattern docs (see table below)
└── scripts/
    ├── scaffold-provider.js         # CLI — scaffold all provider files
    ├── extract-spec.js              # CLI — extract spec from API docs via Claude
    ├── log-action.js                # CLI — append to audit log
    ├── deploy.sh                    # CLI — deploy to Root Platform
    └── validate-config.sh           # CLI — validate credentials and config
scripts/
└── setup.js                         # CLI — one-time project setup
```

---

## CLI Reference

All commands run from inside `collection_module/` unless noted.

| Command | Description |
|---|---|
| `node scripts/setup.js` | One-time setup — credentials, deps, Root Platform config (run from repo root) |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run lint` | Check for linting errors |
| `npm run format` | Auto-format code (Prettier + ESLint fix) |
| `npm run scaffold:provider -- --help` | Scaffold a new provider (see all options) |
| `npm run extract:spec -- --help` | Extract a spec from API docs (see all options) |
| `npm run validate` | Validate config files and credentials |
| `npm run predeploy` | Validate + test + build (run before deploying) |
| `npm run deploy:sandbox` | Deploy to Root Platform sandbox |
| `npm run deploy:production` | Deploy to Root Platform production |

---

## Documentation

Full pattern docs and implementation guides live in `collection_module/docs/`:

| Doc | What it covers |
|---|---|
| `00-OVERVIEW.md` | Architecture, directory layout, data flow diagram |
| `01-GETTING-STARTED.md` | Setup, prerequisites, first run |
| `02-ARCHITECTURE.md` | DI container, ServiceToken symbols, registration patterns |
| `03-PROVIDER-INTERFACE.md` | PaymentProviderClient, PaymentProviderService, ProviderToRootAdapter contracts |
| `04-SERVICES.md` | Service patterns and conventions |
| `05-CONTROLLERS.md` | Controller patterns with complete examples |
| `06-CLIENTS.md` | SDK vs HTTP client patterns with full file examples |
| `07-ADAPTERS.md` | Adapter patterns, status mapping, test examples |
| `08-LIFECYCLE-HOOKS.md` | Lifecycle hook patterns |
| `09-WEBHOOKS.md` | Webhook verification and routing |
| `10-TESTING.md` | Testing patterns, mock factories, coverage thresholds |
| `11-DEPLOYMENT.md` | Deployment and CI/CD |
| `12-CONFIGURATION.md` | Environment config, live vs test resolution |
| `13-ERROR-HANDLING.md` | ModuleError, retryWithBackoff, timeout patterns |
| `14-BUILD-FROM-SPEC.md` | **Master SOP** — end-to-end build workflow |
| `15-SELF-REVIEW.md` | Quality checklist — Critical / Major / Minor criteria |
| `REFERENCE.md` | **Complete working reference** — every pattern implemented |
| `SPEC-TEMPLATE.md` | Blank spec template (filled by `extract:spec`) |

---

## Requirements

- **Node.js** >= 18, **npm** >= 8
- **Root Platform account** — [rootplatform.com](https://rootplatform.com)
- **Payment provider account** — any provider with an API
- **`ANTHROPIC_API_KEY`** — only required for `npm run extract:spec` (AI spec extraction)
- **`root-platform-cli`** — only required for deployment: `npm install -g root-platform-cli`
