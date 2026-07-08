# Collection Module Template

A provider-agnostic template for connecting any payment provider to the [Root Platform](https://rootplatform.com). Designed for AI-assisted development — Claude, Cursor, or Copilot can take provider API docs and produce a production-ready module in a single session.

---

## Quick Start

```bash
git clone <this-repo> my-collection-module
cd my-collection-module

# One-time setup (run from repo root)
node scripts/setup.js \
  --cm-key=cm_myprovider_yourco \
  --org-id=your-root-org-id \
  --reason="initial setup"

node scripts/setup.js --help   # all options
```

Then build with AI or manually:

```bash
cd collection_module

# AI-assisted (recommended) — give Claude the provider docs
/build-from-spec <url-or-path-to-api-docs>

# Or step-by-step via CLI
npm run extract:spec -- --input=<provider-docs-url> --output=docs/myprovider-spec.md
npm run scaffold:provider -- --from-spec=docs/myprovider-spec.md --reason="<why>"
```

---

## Building with AI

### Claude Code (recommended)

| Command | What it does |
|---|---|
| `/build-from-spec <docs>` | Extracts spec, scaffolds files, implements stubs, wires DI, runs tests |
| `/review-implementation` | Audits against 21 criteria (C1-C8 Critical, M1-M8 Major, m1-m5 Minor) and fixes issues |

### Cursor

The `.cursor/rules/build-from-spec.mdc` rule activates automatically:

```
@build-from-spec Add a new provider. API docs: <provider-docs-url>
```

### GitHub Copilot

The `.github/copilot-instructions.md` gives Copilot full project context. Use Copilot Chat to implement stubs and write tests.

---

## Manual Workflow

### 1. Extract spec

```bash
cd collection_module
npm run extract:spec -- --input=<url-or-pdf-or-openapi> --output=docs/myprovider-spec.md
```

Uses Claude to fill the template if `ANTHROPIC_API_KEY` is set. Without it, falls back to passthrough mode (template + raw content). Review the output and fill any gaps.

### 2. Scaffold provider files

```bash
npm run scaffold:provider -- --from-spec=docs/myprovider-spec.md --reason="<why>"
```

Generates 8 files (client, service, adapter, events + their tests and mock factories) and prints the exact code to paste into `container.setup.ts` and `webhook-hooks.ts`.

### 3. Implement stubs

| File | What to implement |
|---|---|
| `code/clients/{provider}-client.ts` | SDK init, `verifyWebhookSignature()` |
| `code/services/{provider}.service.ts` | `createCustomer()`, `createPaymentIntent()`, etc. |
| `code/adapters/{provider}-to-root-adapter.ts` | Status mapping, data transforms |
| `code/webhook-hooks.ts` | Signature verification + event routing |
| `code/lifecycle-hooks/*.ts` | `afterPolicyIssued()`, `afterPaymentCreated()`, etc. |

Reference patterns: `collection_module/docs/STRIPE-REFERENCE.md`

### 4. Review and deploy

```bash
npm test
npm run validate
npm run deploy:sandbox
npm run deploy:production
```

---

## Project Structure

```
collection_module/
├── code/
│   ├── main.ts                      # Entry point — exports all hooks
│   ├── core/
│   │   ├── container.ts             # DI container + ServiceToken symbols
│   │   └── container.setup.ts       # Service registration (wire provider here)
│   ├── clients/                     # Root client + base HTTP client
│   ├── services/                    # Config, logging, Root operations, rendering
│   ├── adapters/                    # Generated: {provider}-to-root-adapter.ts
│   ├── interfaces/                  # Provider contracts + event constants
│   ├── lifecycle-hooks/             # Policy, payment, payment-method hooks
│   ├── webhook-hooks.ts             # Signature verification + event routing
│   └── utils/                       # ModuleError, retryWithBackoff, timeout
├── __tests__/                       # Jest tests (mirrors code/ structure)
└── docs/                            # Architecture and pattern docs
scripts/
├── setup.js                         # One-time project setup
├── scaffold-provider.js             # Scaffold all provider files
├── extract-spec.js                  # Extract spec from API docs via Claude
├── log-action.js                    # Append to audit log
├── deploy.sh                        # Deploy to Root Platform
└── validate-config.sh               # Validate credentials and config
```

---

## CLI Reference

All `npm` commands run from `collection_module/`. Setup runs from repo root.

| Command | Description |
|---|---|
| `node scripts/setup.js` | One-time setup (repo root) |
| `npm run scaffold:provider -- --help` | Scaffold a new provider |
| `npm run extract:spec -- --help` | Extract spec from API docs |
| `npm test` | Run tests |
| `npm run build` | Compile TypeScript |
| `npm run validate` | Validate config and credentials |
| `npm run deploy:sandbox` | Deploy to sandbox |
| `npm run deploy:production` | Deploy to production |

---

## Documentation

Full docs live in `collection_module/docs/`:

| Doc | Covers |
|---|---|
| `00-OVERVIEW.md` | Architecture, directory layout, data flow |
| `02-ARCHITECTURE.md` | DI container, ServiceToken symbols, registration |
| `03-PROVIDER-INTERFACE.md` | Provider contracts (Client, Service, Adapter) |
| `05-CLIENTS.md` | SDK vs HTTP client patterns |
| `09-TESTING.md` | Test patterns, mock factories, coverage |
| `12-ERROR-HANDLING.md` | ModuleError, retryWithBackoff, timeouts |
| `13-BUILD-FROM-SPEC.md` | Master SOP — end-to-end build workflow |
| `14-SELF-REVIEW.md` | Quality checklist (Critical / Major / Minor) |
| `17-SCHEDULED-PAYMENTS.md` | Scheduling future payments, submission hook, events |
| `STRIPE-REFERENCE.md` | Complete working reference implementation |
| `SPEC-TEMPLATE.md` | Blank spec template (filled by `extract:spec`) |

All docs: `01-GETTING-STARTED`, `03-PROVIDER-INTERFACE`, `04-CONTROLLERS`, `06-ADAPTERS`, `07-LIFECYCLE-HOOKS`, `08-WEBHOOKS`, `10-DEPLOYMENT`, `11-CONFIGURATION`, `15-PROVIDER-PATTERNS`, `16-WHEN-TO-DEVIATE`, `17-SCHEDULED-PAYMENTS`.

---

## Requirements

- **Node.js** >= 18, **npm** >= 8
- **Root Platform account** — [rootplatform.com](https://rootplatform.com)
- **`ANTHROPIC_API_KEY`** — optional, enhances `extract:spec` with AI extraction
- **`root-platform-cli`** — only for deployment: `npm i -g root-platform-cli`
