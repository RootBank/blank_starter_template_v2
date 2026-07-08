# /review-implementation

Review a provider implementation against the self-review criteria.

> Full criteria: [`collection_module/docs/14-SELF-REVIEW.md`](../../collection_module/docs/14-SELF-REVIEW.md)

---

## What to do

Run the two-stage gate: a deterministic script for the mechanizable checks, then a fresh-context reviewer for the judgement checks the script can't do.

### Stage 1 — Deterministic checks (mechanized)

```bash
cd collection_module && npm run validate:provider   # auto-detects the provider
cd collection_module && npm test
```

`validate:provider` hard-fails on the pattern-checkable criteria (C1–C6, C8, M1, M3, M8, m4). If it exits non-zero, report the failures and stop — those come first. `npm test` covers C7.

### Stage 2 — Semantic review (fresh context)

The checks that need judgement can't be grepped, and the context that wrote the code is biased toward ratifying it. So dispatch a **fresh-context reviewer** rather than reviewing inline:

1. Spawn a **read-only** review subagent (the `Agent` tool) — give it *only* the file list below, `collection_module/docs/14-SELF-REVIEW.md`, and the filled spec at `collection_module/docs/<provider>-spec.md`. Do **not** pass it the implementation conversation.
   - *If your harness has no subagents* (Cursor/Copilot/etc.): run this review in a **fresh session** with no implementation history.
2. Files to review (replace `<provider>` with the slug, e.g. `gocardless`):
   - `collection_module/code/clients/<provider>-client.ts`
   - `collection_module/code/services/<provider>.service.ts`
   - `collection_module/code/adapters/<provider>-to-root-adapter.ts`
   - `collection_module/code/interfaces/<provider>-events.ts`
   - `collection_module/code/core/container.setup.ts`
   - `collection_module/code/webhook-hooks.ts`
   - `collection_module/code/lifecycle-hooks/policy.hooks.ts`
   - `collection_module/code/lifecycle-hooks/payment.hooks.ts`
   - `collection_module/code/lifecycle-hooks/payment-method.hooks.ts`
3. The reviewer checks the **judgement** criteria: hook wiring (M4–M7), `verifyWebhookSignature` used correctly (m5), and the **spec-fidelity** criterion (S1) — the implemented `statusMap` keys and `PROVIDER_EVENTS` values match the filled spec's *Status Mapping* and *Webhook Events* sections, with nothing in the spec left unhandled and nothing handled that isn't in the spec.

### Stage 3 — Consolidate and fix

4. Merge the Stage 1 script output and the Stage 2 reviewer report into one report:

```
## Self-Review Report — <ProviderName>

### Critical ({N} issues)
- [C3] <description> — <file>:<line>
  Fix: <one-line fix>

### Major ({N} issues)
- [M1] <description> — <file>:<line>
  Fix: <one-line fix>

### Minor ({N} issues)
...

### Enhancements
...

### Summary
{X} critical, {Y} major, {Z} minor.
{Ready to ship | Not ready — fix Critical + Major items first}
```

5. **Confirm with the user before fixing.** List the Critical and Major issues and ask which to fix, rather than auto-editing — this is a payments integration, and some findings (e.g. a status mapping) are judgement calls the user should sign off on. Fix the confirmed items, then re-run Stage 1 to verify.
