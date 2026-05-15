# /review-implementation

Review a provider implementation against the self-review criteria.

> Full criteria: [`collection_module/docs/14-SELF-REVIEW.md`](../../collection_module/docs/14-SELF-REVIEW.md)

---

## What to do

1. **Ask the user which provider** to review (or infer from context).

2. **Read these files** for the provider (replace `{provider}` with the slug, e.g. `gocardless`):
   - `collection_module/code/clients/{provider}-client.ts`
   - `collection_module/code/services/{provider}.service.ts`
   - `collection_module/code/adapters/{provider}-to-root-adapter.ts`
   - `collection_module/code/interfaces/{provider}-events.ts`
   - `collection_module/code/core/container.setup.ts`
   - `collection_module/code/webhook-hooks.ts`
   - `collection_module/code/lifecycle-hooks/policy.hooks.ts`
   - `collection_module/code/lifecycle-hooks/payment.hooks.ts`
   - `collection_module/code/lifecycle-hooks/payment-method.hooks.ts`

3. **Check every criterion** in `collection_module/docs/14-SELF-REVIEW.md` — Critical (C1–C8), Major (M1–M8), Minor (m1–m5).

4. **Return a report** in this format:

```
## Self-Review Report — {ProviderName}

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

5. For any Critical or Major issues, **fix them immediately** unless the user says otherwise.
