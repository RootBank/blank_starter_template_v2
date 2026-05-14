# Collection Module Template

> AI entry point. Use the table below to find what you need in ≤2 jumps. Don't load docs you don't need.
> Non-Claude agents: see [`AGENT.md`](AGENT.md). External agents: see [`llms.txt`](llms.txt) (index) and [`llms-full.txt`](llms-full.txt) (flat).

## Table of Contents

| Task | Go to |
|---|---|
| **Build a new provider from a spec/doc** | [`/build-from-spec`](.claude/commands/build-from-spec.md) |
| **Scaffold files via CLI** | `npm run scaffold:provider -- --help` |
| **Commission a new provider integration** | `collection_module/docs/PROVIDER-INTEGRATION-PROMPT.md` |
| Architecture overview + directory map | `collection_module/docs/00-OVERVIEW.md` |
| Setup and first run | `collection_module/docs/01-GETTING-STARTED.md` |
| DI container, layers, data flow | `collection_module/docs/02-ARCHITECTURE.md` |
| Provider interface + service patterns | `collection_module/docs/03-PROVIDER-INTERFACE.md` |
| Controller patterns | `collection_module/docs/04-CONTROLLERS.md` |
| Client patterns (SDK vs HTTP) | `collection_module/docs/05-CLIENTS.md` |
| Adapter patterns | `collection_module/docs/06-ADAPTERS.md` |
| Lifecycle hooks | `collection_module/docs/07-LIFECYCLE-HOOKS.md` |
| Webhooks and security | `collection_module/docs/08-WEBHOOKS.md` |
| Testing patterns | `collection_module/docs/09-TESTING.md` |
| Deployment and CI/CD | `collection_module/docs/10-DEPLOYMENT.md` |
| Config and environment | `collection_module/docs/11-CONFIGURATION.md` |
| Error handling, retry, idempotency | `collection_module/docs/12-ERROR-HANDLING.md` |
| Build from spec — master SOP | `collection_module/docs/13-BUILD-FROM-SPEC.md` |
| Self-review criteria | `collection_module/docs/14-SELF-REVIEW.md` |
| SDK vs HTTP provider patterns | `collection_module/docs/15-PROVIDER-PATTERNS.md` |
| When (and when not) to deviate | `collection_module/docs/16-WHEN-TO-DEVIATE.md` |
| Glossary of terms | `collection_module/docs/GLOSSARY.md` |
| Stripe reference implementation | `collection_module/docs/STRIPE-REFERENCE.md` |
| Provider spec template | `collection_module/docs/SPEC-TEMPLATE.md` |

## Key Commands

```bash
# First-time setup (run once after cloning)
cd collection_module
npm run setup -- --cm-key=cm_myprovider_yourco --org-id=your-org-id --reason="initial setup"
npm run setup -- --help   # full options

# Build a new provider
npm run scaffold:provider -- --provider=MyProvider --api-type=http --base-url=https://... --reason="why"
npm run extract:spec -- --input=./api-docs.md --output=docs/my-provider-spec.md

# Dev
npm test
npm run build
npm run lint
npm run scaffold:provider -- --help   # full options

# Regenerate llms-full.txt after any doc edit
npm run build:llms

# Pre-flight check (run before building a new provider)
cd collection_module && npm install && npm test && npm run build
```

## Conventions

- **DI**: constructor injection; register in `code/core/container.setup.ts`
- **Logging**: `LogService` only — no `console.log`
- **Errors**: prefer `EnhancedModuleError` subclasses; external calls: `retryWithBackoff`
- **Controllers**: thin orchestrators, <100 lines
- **Config fields**: provider-agnostic — `providerSecretKey`, `providerWebhookSigningSecret`
- **DI tokens**: provider-agnostic — `PROVIDER_CLIENT`, `PROVIDER_SERVICE`
- **Tests**: mirror `code/` in `__tests__/`; factories in `__tests__/helpers/factories.ts`
- **Reference**: Stripe is the working example — read it before writing a new provider
- **Don't invent semantics** — when source or spec is ambiguous, leave a `TODO(human):` with a specific question instead of guessing
