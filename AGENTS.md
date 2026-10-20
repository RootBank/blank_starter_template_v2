# AGENTS.md — Vendor-Neutral Entry Point

> Self-contained orientation for any AI agent (Cursor, Continue, Zed, Aider, Codex, etc.) working in this repo. Mirror of `CLAUDE.md`. Read this file fully before making changes — agents not built on Claude may not follow the links automatically.
>
> Filename follows the [agents.md](https://agents.md) convention adopted by OpenAI Codex CLI, Cursor, and Aider.

This is the **collection module template** Root Platform engineers use to scaffold new payment-provider integrations. One module = one provider. Stripe is the reference implementation.

## Quick orientation

- **`CLAUDE.md`** — the canonical routing table for the docs and the working-agreement conventions. Read it.
- **`llms.txt`** — short index of every doc with one-line summaries (llmstxt.org convention).
- **`llms-full.txt`** — flat concatenation of every doc with `## <name>` anchors. Use it if your agent can't navigate the filesystem efficiently. Regenerate via `npm run build:llms` (from `collection_module/`) after any doc change.
- **`collection_module/docs/STRIPE-REFERENCE.md`** — the working reference implementation. Read it before writing a new provider.
- **`collection_module/docs/GLOSSARY.md`** — every template-specific term defined in one page.
- **`collection_module/docs/SPEC-TEMPLATE.md`** — fill-in-the-blanks template for a new provider's spec.
- **`collection_module/docs/PROVIDER-INTEGRATION-PROMPT.md`** — reusable prompt template for commissioning a new provider integration.
- **`.claude/commands/build-from-spec.md`** — slash command that drives the scaffolder.
- **`.claude/commands/review-implementation.md`** — slash command that runs the self-review checklist.

## Conventions

These are non-negotiable. Violating them silently breaks the provider abstraction.

- **DI tokens are provider-agnostic.** Use `ServiceToken.PROVIDER_CLIENT` and `ServiceToken.PROVIDER_SERVICE` — never `STRIPE_CLIENT`. Swapping providers is a registration change, not a rename.
- **Config field names are provider-agnostic.** `providerSecretKey`, `providerWebhookSigningSecret`, `providerPublishableKey`, `providerProductId`. Never `stripeSecretKey`.
- **Constructor injection only.** Resolve services from `getContainer()`; do not instantiate.
- **`LogService` only.** No `console.log`.
- **Wrap external calls in `retryWithBackoff`.** From `code/utils/retry.ts`.
- **Map provider errors at the service boundary.** Throw an `EnhancedModuleError` subclass — see `collection_module/docs/12-ERROR-HANDLING.md`.
- **Lifecycle hooks must be idempotent.** Root may retry. See `collection_module/docs/07-LIFECYCLE-HOOKS.md`.
- **Scheduled payments are driven from hooks, not a billing API.** Return `schedule_payment` / `reschedule_payment` / `unschedule_payment` actions; configure `billingSettings` in `root.config.json`. See `collection_module/docs/17-SCHEDULED-PAYMENTS.md`.
- **Doc numbering is gap-tolerant.** Numbered docs run 00–17. Renumbering breaks every cross-reference — don't do it casually.
- **Do not invent semantics.** If the codebase or spec is ambiguous, leave a `TODO(human):` with a specific question instead of guessing. This applies especially to webhook signature schemes and error mappings.

## Extending the doc set

The doc set has a house style. Keep it when you add or edit a doc:

- **Dry, reference-style, link-heavy.** No marketing voice.
- **Scope discipline.** Change the docs the task names. Don't rewrite a neighbouring doc because you happen to be in it.
- **Every code example is valid TypeScript** and consistent with the conventions above.
- **Every numbered doc ends with a `## You've understood this if…` section** — 2–4 concrete, answerable checks. "You can name the three lifecycle hooks invoked during a refund and the order they run in", not "You understand lifecycle hooks".

## Adding a new provider

This is the reusable prompt template. A human fills in every `{{PLACEHOLDER}}` and hands the result to an agent in this repo.

```
# Provider integration prompt template

Fill in every `{{PLACEHOLDER}}`. Hand the result to an agent in the repo.

---

I want to add **{{PROVIDER_NAME}}** ({{ONE_LINE_DESCRIPTION}}) to this project so we can {{PRIMARY_USE_CASE}}. Use the `/build-from-spec` command — it's set up to handle exactly this kind of job. Point it at the provider's API docs: {{API_DOCS_URL}}

## What it needs to do

1. **{{ONBOARDING_CAPABILITY}}** — let us register a {{ENTITY_TYPE}} with {{PROVIDER_NAME}} and complete the authorisation step they require ({{AUTHORISATION_ARTEFACT}}, e.g. mandate, consent, verified identity, signed agreement). If the provider offers a hosted flow, prefer it.
2. **{{CORE_TRANSACTION_CAPABILITY}}** — both {{ONE_OFF_VARIANT}} and {{RECURRING_OR_BATCH_VARIANT}}, if the provider supports both.
3. **Listen for updates from {{PROVIDER_NAME}}** — when a {{TRANSACTION_TYPE}} {{TERMINAL_STATES}}, the provider sends a webhook. Receive these, verify authenticity ({{SIGNATURE_SCHEME_IF_KNOWN}}), update our records.
4. **Handle failures** — retry policy: {{RETRY_POLICY}}. After exhausting retries, mark as {{TERMINAL_FAILURE_STATE}}.
5. **{{SANDBOX_NAME}} credentials only** — no production traffic, no real {{REAL_WORLD_SIDE_EFFECT}}.

## Before you start coding, show me

- **Which approach you're taking for {{ONBOARDING_CAPABILITY}}** — most providers offer at least two (hosted vs. API-direct, redirect vs. embedded, server-side vs. client-side). Pick one and justify it against the provider interface conventions in this repo.
- **Which webhook events you plan to subscribe to** — list them by name. Flag any documented events you're *not* subscribing to and explain why. Recommend any I didn't ask for.
- **Anything in the {{PROVIDER_NAME}} model that doesn't map cleanly** onto this template's provider interface. If you spot one, stop and ask before deviating. See `collection_module/docs/16-WHEN-TO-DEVIATE.md`.

## At the end, I want

- Working code that passes the project's tests, scaffolded via `/build-from-spec` and reviewed via `/review-implementation`.
- A short doc at `collection_module/docs/providers/{{PROVIDER_SLUG}}.md` explaining sandbox setup, how to run the test suite against the sandbox, and what to look for in logs.
- A flow diagram (Mermaid or ASCII) showing the happy path: {{HAPPY_PATH_FLOW}}.
- A summary of every `TODO(human):` you inserted and every assumption that wasn't directly supported by the provider's docs.

## Ground rules

- If anything in the {{PROVIDER_NAME}} docs is ambiguous, contradicts itself, or doesn't fit how this project is built — **stop and ask**. Do not guess. Do not paper over it with a comment.
- If the webhook signature scheme isn't documented clearly, do not invent verification logic. Ask.
- If the provider has a feature this template doesn't have a slot for (multi-currency, partial refunds, batching), flag it before writing code so we can decide whether to extend the interface or scope it out.

---

## Example: GoCardless filled in

For reference, here's what this template looks like fully filled in for a UK direct-debit provider:

- `{{PROVIDER_NAME}}` → GoCardless
- `{{ONE_LINE_DESCRIPTION}}` → the direct debit company
- `{{PRIMARY_USE_CASE}}` → collect payments from customers
- `{{API_DOCS_URL}}` → https://developer.gocardless.com/api-reference/
- `{{ONBOARDING_CAPABILITY}}` → set up customers
- `{{ENTITY_TYPE}}` → customer
- `{{AUTHORISATION_ARTEFACT}}` → mandate (bank details authorised)
- `{{CORE_TRANSACTION_CAPABILITY}}` → take payments
- `{{ONE_OFF_VARIANT}}` → one-off charges
- `{{RECURRING_OR_BATCH_VARIANT}}` → recurring subscriptions
- `{{TRANSACTION_TYPE}}` → payment
- `{{TERMINAL_STATES}}` → succeeds, fails, or gets charged back
- `{{SIGNATURE_SCHEME_IF_KNOWN}}` → HMAC (per GoCardless webhook docs)
- `{{RETRY_POLICY}}` → retry after 3 working days, up to 2 more times
- `{{TERMINAL_FAILURE_STATE}}` → uncollectable
- `{{SANDBOX_NAME}}` → sandbox
- `{{REAL_WORLD_SIDE_EFFECT}}` → money
- `{{PROVIDER_SLUG}}` → gocardless
- `{{HAPPY_PATH_FLOW}}` → customer signs up → bank details authorised → first payment taken → confirmation received
```

## When extending the template

Standing rules — apply on every change, including small ones:

1. **Read `collection_module/docs/16-WHEN-TO-DEVIATE.md` first** whenever a change might touch a template convention or interface. If you're going to deviate, signal it explicitly per that doc.
2. **Use `/build-from-spec` to scaffold new providers** — do not hand-roll the file tree. The scaffolder enforces the directory layout, DI registration shape, and stub placement.
3. **Run `/review-implementation` before opening a PR** — it checks against `collection_module/docs/14-SELF-REVIEW.md` (Critical C1–C8, Major M1–M8, Minor m1–m5).
4. **`TODO(human):` over guessing.** If you can't determine something from the source, spec, or provider docs with citation-level confidence, leave a specific question for a human. Don't invent.
5. **Keep doc changes inside `collection_module/docs/`, `CLAUDE.md`, `AGENTS.md`, `llms.txt`, `llms-full.txt`** unless the change is genuinely about code (and then it's a code change, not a doc change).
6. **Regenerate `llms-full.txt` after any doc edit** with `npm run build:llms` (from `collection_module/`). The file is checked in — drift breaks downstream agents.
