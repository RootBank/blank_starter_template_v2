# AGENTS.md — Vendor-Neutral Entry Point

> Self-contained orientation for any AI agent (Cursor, Continue, Zed, Aider, Codex, etc.) working in this repo. Mirror of `CLAUDE.md`. Read this file fully before making changes — agents not built on Claude may not follow the links automatically.
>
> Filename follows the [agents.md](https://agents.md) convention adopted by OpenAI Codex CLI, Cursor, and Aider. The verbatim doc-improvement prompt further down references "`AGENT.md`" because that's how the original brief was written — content unchanged.

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

## Doc-improvement prompt (verbatim)

The current shape of these docs was set by the prompt below. Future agents extending the doc set should follow the same intent — same tone, same scope discipline, same anti-invention rules.

```
You are working on the `blank_starter_template_v2` repo. You have three jobs, in this order. Do not start job N+1 until job N is complete and you've re-read your own output. Work on a new branch.

Job 0 — Load context
Before writing anything, read:

1. `CLAUDE.md` — the routing table and conventions (`PROVIDER_CLIENT`, `PROVIDER_SERVICE`, etc.).
2. Every file in `collection_module/docs/` (`00-` through `15-`), plus `STRIPE-REFERENCE.md` and `SPEC-TEMPLATE.md`.
3. `.claude/commands/build-from-spec.md` and `.claude/commands/review-implementation.md`.
Do not begin writing until you have a complete mental model of the current doc set, the provider interface, and the existing slash commands. If anything is unclear after reading, stop and ask.
Job 1 — Fix the docs (Phase 1 of the overhaul)
1.1 Add `llms.txt` and `llms-full.txt` at the repo root

* `llms.txt`: short index following the [llms.txt convention](https://llmstxt.org/) — title, one-paragraph summary, linked list of the numbered docs with one-line descriptions.
* `llms-full.txt`: flat concatenation of `CLAUDE.md` + `AGENT.md` (created in Job 2) + all numbered docs in `collection_module/docs/` + `STRIPE-REFERENCE.md` + `SPEC-TEMPLATE.md`, with stable `##` anchors per file (e.g. `## 09-WEBHOOKS`). Preserve file boundaries so an agent can cite sections.
* Add a script under `scripts/` that regenerates `llms-full.txt` from source so it cannot drift. Wire it into whatever pre-commit or CI hook the repo already uses; if none, document the manual command in `CLAUDE.md`.
1.2 Add `collection_module/docs/GLOSSARY.md`
One page, alphabetised. Define every term that carries Root-specific or template-specific meaning: lifecycle hook, adapter, collection module, provider, PROVIDER_CLIENT, PROVIDER_SERVICE, spec, scaffolder, Root Platform, and anything else you encounter while reading the docs that isn't self-evident. Each entry: term, one-sentence definition, link to the doc where it's used in depth. Add it to the `CLAUDE.md` routing table.
1.3 Expand `13-ERROR-HANDLING.md` into a reference
Currently 46 lines of prose. Rewrite it to contain:

* A short intro (keep what's useful from the existing prose).
* An error code reference table: `Code | Meaning | Typical cause | Recommended retry behaviour | Example log line`.
* A section on error propagation across the provider boundary (provider error → collection-module error → Root-level error).
* A section on idempotency and retry semantics.
If the codebase doesn't have a canonical error code list, grep the source for thrown errors / error classes and seed the table from what's actually used. Flag anything ambiguous with `TODO(human):` rather than inventing semantics.
1.4 Fix the stub docs
`04-SERVICES.md` (39 lines) and `08-LIFECYCLE-HOOKS.md` (29 lines) are too thin to justify their own files. Per file, either expand to a real reference (signatures, examples, at least one worked Stripe-reference cross-link) or merge into the nearest larger doc and update `CLAUDE.md`. Default to merging unless you can write ≥80 lines of genuinely useful content.
1.5 Add `collection_module/docs/16-PROVIDER-PATTERNS.md` — the SDK-vs-HTTP diff
Side-by-side comparison:

* Left column: how Stripe (SDK-based) implements each part of the provider interface, with code excerpts from `STRIPE-REFERENCE.md`.
* Right column: how a hypothetical HTTP-only provider (no SDK, raw `fetch`) would implement the same parts.
* Cover at minimum: client construction, auth, request signing, pagination, webhook verification, error mapping, retry/backoff.
* Use real code, not pseudocode. HTTP-side examples can be illustrative but must be syntactically valid TypeScript.
1.6 Add `collection_module/docs/17-WHEN-TO-DEVIATE.md`
Model-behaviour guidance for an agent extending the template:

* When the provider interface genuinely doesn't fit (providers without webhooks, OAuth dance, bulk-only APIs) and what to do.
* When not to deviate — patterns that look optional but aren't (idempotency keys, lifecycle hook ordering, error-code mapping).
* How to signal a deviation in code. Pick one convention and document it.
* A short decision tree: "Before deviating, ask: …"
1.7 Add success criteria to every numbered doc
At the bottom of every `00-` through `17-` doc, add a `## You've understood this if…` section with 2–4 concrete, answerable checks. Good: "You can name the three lifecycle hooks invoked during a refund and the order they run in." Bad: "You understand lifecycle hooks."
1.8 Update `CLAUDE.md`

* Add the new docs (`GLOSSARY`, `16-PROVIDER-PATTERNS`, `17-WHEN-TO-DEVIATE`) to the routing table.
* Add a one-line pointer to `llms.txt` for external agents.
* Add a one-line pointer to `AGENT.md` (created in Job 2).
* Keep the file short. If it grows past ~100 lines, you've done it wrong.
Job 2 — Create `AGENT.md` at the repo root
This file is the vendor-neutral entry point for agents that aren't Claude (Cursor, Continue, Zed, Aider, Codex, etc.). It must be self-contained — agents that load it will not necessarily follow links.
Structure:

1. Header explaining its purpose — mirror of `CLAUDE.md` for non-Claude agents.
2. Quick orientation block — pointers to `CLAUDE.md`, `llms-full.txt`, `llms.txt`, `STRIPE-REFERENCE.md`, `GLOSSARY.md`, `SPEC-TEMPLATE.md`, and the slash commands.
3. Conventions block — provider-agnostic tokens, doc numbering rules, the "do not invent semantics" rule.
4. The doc-improvement prompt — paste this entire message (Job 0 through Job 3) inline, verbatim, inside a fenced block. Future agents need to see the intent behind the current doc structure to extend it consistently.
5. The reusable provider-integration prompt template — paste the template from Job 3 inline, verbatim, inside a fenced block. Title that section `## Adding a new provider`.
6. "When extending the template" footer — short list of standing rules: read `17-WHEN-TO-DEVIATE.md` first, use `/build-from-spec` not hand-rolled scaffolds, use `/review-implementation` before PRs, `TODO(human):` rather than guess.
Also create `AGENTS.md` as a symlink (or a copy if symlinks aren't supported in this repo) so OpenAI Codex CLI and similar tools find it.
Job 3 — Save the reusable provider-integration prompt
Create `collection_module/docs/PROVIDER-INTEGRATION-PROMPT.md`. This is a fill-in-the-blanks template humans use to commission a new provider integration. The exact contents are paste below under "Adding a new provider".

Add `PROVIDER-INTEGRATION-PROMPT.md` to the `CLAUDE.md` routing table under a new row: "Adding a new provider → `docs/PROVIDER-INTEGRATION-PROMPT.md`."

Constraints (apply to all three jobs)

* Do not invent semantics for the codebase. Grep the source. If still unsure, leave a `TODO(human):` with a specific question.
* Do not rewrite docs that aren't called out above. Scope discipline matters.
* Do not add an MCP server, scaffold a second provider, or write any code outside `scripts/`, `collection_module/docs/`, `CLAUDE.md`, `AGENT.md`, `AGENTS.md`, `llms.txt`, and `llms-full.txt`.
* Match the existing tone: dry, reference-style, link-heavy. No marketing voice.
* Every code example must be valid TypeScript and consistent with the conventions in `CLAUDE.md`.
```

Note: in the original prompt, the new docs were referenced as `16-PROVIDER-PATTERNS` and `17-WHEN-TO-DEVIATE`. After merging the `04-SERVICES` stub into `03-PROVIDER-INTERFACE.md`, the docs were renumbered 05→04 through 15→14, and the new docs became `15-PROVIDER-PATTERNS.md` and `16-WHEN-TO-DEVIATE.md`. Future doc-improvement work should preserve this final numbering.

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
5. **Keep doc changes inside `collection_module/docs/`, `CLAUDE.md`, `AGENT.md`, `AGENTS.md`, `llms.txt`, `llms-full.txt`** unless the change is genuinely about code (and then it's a code change, not a doc change).
6. **Regenerate `llms-full.txt` after any doc edit** with `npm run build:llms` (from `collection_module/`). The file is checked in — drift breaks downstream agents.
