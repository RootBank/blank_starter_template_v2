# Self-Review Criteria

> Run this via `/review-implementation` after completing a new provider. Critical and Major items should be fixed before shipping — but confirm fixes with a human first (see Report format).

## How to use

Review runs as a two-stage gate:

1. **Deterministic (mechanized).** `npm run validate:provider` hard-fails the pattern-checkable criteria; `npm test` covers C7. These run first and don't need a model.
2. **Semantic (fresh context).** A read-only reviewer with no implementation history checks the criteria that need judgement — hook wiring, and the spec-fidelity check (S1). Running it fresh avoids the bias of the context that wrote the code ratifying its own work.

```
/review-implementation
```

The command orchestrates both stages, consolidates one report grouped by severity with file references, and **confirms with you before applying any fix**.

**Legend:** ⚙ = mechanized by `npm run validate:provider` (deterministic, exit-code). 🔎 = semantic, checked by the fresh-context reviewer. The ⚙ checks are: C1–C6, C8, M1, M3, M8, m4.

---

## Critical — must fix before shipping

These are blockers. Code will not work correctly without them.

| # | Criterion | How to check |
|---|---|---|
| C1 | `PROVIDER_CLIENT` registered in `container.setup.ts` | Grep: `ServiceToken.PROVIDER_CLIENT` |
| C2 | `PROVIDER_SERVICE` registered in `container.setup.ts` | Grep: `ServiceToken.PROVIDER_SERVICE` |
| C3 | Webhook signature verification present in `webhook-hooks.ts` | Look for `verifyWebhookSignature` call before parsing body |
| C4 | No `// TODO` stubs remaining in service methods | Grep: `TODO: implement` in `code/services/` |
| C5 | `statusMap` in adapter is not empty | Read adapter, check `statusMap` has entries |
| C6 | Event constants use real names (not placeholders) | Check `code/interfaces/{provider}-events.ts` — no `provider.payment.completed` format unless that's the real event |
| C7 | All tests pass | `npm test` returns exit 0 |
| C8 | Config keys added to `env.sample.ts` | Grep: `PROVIDER_SECRET_KEY` in env.sample.ts |
| S1 🔎 | `statusMap` and events match the filled spec | Reviewer compares the adapter `statusMap` keys and `PROVIDER_EVENTS` values against `docs/<provider>-spec.md` § Status Mapping / § Webhook Events — nothing in the spec left unhandled, nothing handled that isn't in the spec. Catches a `pending → Successful` mis-map that C5/C6 (presence-only) can't. |

---

## Major — fix before shipping

These won't cause immediate failures but will cause silent bugs or maintenance pain.

| # | Criterion | How to check |
|---|---|---|
| M1 | All service methods use `retryWithBackoff()` for API calls | Grep: `retryWithBackoff` in `code/services/{provider}.service.ts` |
| M2 | All service methods log at start: `this.logService.info(...)` | Check each method for a log call as first statement |
| M3 | Errors thrown as `ModuleError`, not raw | Grep: `throw new Error` (should be `ModuleError`) in service |
| M4 | Lifecycle hooks: `afterPolicyIssued` creates customer + stores in `app_data` | Read `code/lifecycle-hooks/policy.hooks.ts` |
| M5 | Lifecycle hooks: `afterPaymentCreated` fires payment intent | Read `code/lifecycle-hooks/payment.hooks.ts` |
| M6 | Lifecycle hooks: `afterPolicyPaymentMethodAssigned` attaches payment method | Read `code/lifecycle-hooks/payment-method.hooks.ts` |
| M7 | Webhook routing handles at least `payment_success` and `payment_failed` events | Read `code/webhook-hooks.ts` switch statement |
| M8 | No `console.log` in service or controller code | Grep: `console.log` in `code/` |

---

## Minor — fix in follow-up if not blocking

| # | Criterion | How to check |
|---|---|---|
| m1 | Test coverage: each service method has at least one passing test | Read `__tests__/services/{provider}.service.test.ts` |
| m2 | Adapter `convertCustomerToAppData` stores at least customer ID | Read adapter method |
| m3 | Webhook `default` case logs unhandled event type | Read switch statement default case |
| m4 | No hardcoded secrets or API keys in code | Grep: `sk_live`, `Bearer `, hardcoded secrets in non-config files |
| m5 | `verifyWebhookSignature` returns `false` (not throws) on invalid sig | Read client implementation |

---

## Enhancements — optional improvements

| # | Suggestion |
|---|---|
| E1 | Add `cancelSubscription` support if provider supports subscriptions |
| E2 | Add `updateCustomer` support if policy policyholder data changes |
| E3 | Add `getPaymentMethod` support for displaying saved payment methods |
| E4 | Add integration tests in `__tests__/integration/` using sandbox credentials |
| E5 | Add idempotency key support for payment creation if provider requires it |

---

## Report format

When Claude runs this review, it returns:

```
## Self-Review Report — {ProviderName}

### Critical (N issues)
- [C3] Webhook signature verification missing — webhook-hooks.ts has no verifyWebhookSignature call
  Fix: add `const isValid = providerClient.verifyWebhookSignature(...)` before JSON.parse

### Major (N issues)
- [M1] createPaymentIntent missing retryWithBackoff — code/services/myprovider.service.ts:45
  Fix: wrap API call in retryWithBackoff(...)

### Minor (N issues)
...

### Enhancements
...

### Summary
X critical, Y major, Z minor. [Ready to ship / Not ready — fix critical + major first]
```

After presenting the report, **confirm with the user before applying fixes** — list the Critical and Major items and ask which to fix rather than auto-editing. Several findings (a status mapping, an event choice) are judgement calls a human should sign off on for a payments integration. Re-run `npm run validate:provider` after fixing.

---

## Related Docs

- [docs/13-BUILD-FROM-SPEC.md](./13-BUILD-FROM-SPEC.md) — full implementation workflow
- [docs/STRIPE-REFERENCE.md](./STRIPE-REFERENCE.md) — working reference for all patterns

## You've understood this if…

- You can name three Critical checks (C1–C8) without re-reading the doc.
- You know the difference between a Major and a Minor finding.
- You know which command to run to invoke the review.
