# Self-Review Criteria

> Run this via `/review-implementation` after completing a new provider. Fix all Critical and Major items before shipping.

## How to use

After implementing a provider, ask Claude/Cursor/Copilot:

```
/review-implementation
```

The AI reads this document and checks each criterion against the current codebase. It returns a report grouped by severity, with specific file references and suggested fixes for any failures.

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

---

## Related Docs

- [docs/14-BUILD-FROM-SPEC.md](./14-BUILD-FROM-SPEC.md) — full implementation workflow
- [docs/STRIPE-REFERENCE.md](./STRIPE-REFERENCE.md) — working reference for all patterns
