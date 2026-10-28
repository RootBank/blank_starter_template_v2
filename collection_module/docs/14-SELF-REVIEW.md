# Self-Review Criteria

> Run this via `/review-implementation` after completing a new provider. Critical and Major items should be fixed before shipping — but confirm fixes with a human first (see Report format).

## How to use

Review runs as a two-stage gate:

1. **Deterministic (mechanized).** `npm run validate:provider` hard-fails the pattern-checkable criteria. `npm test` covers C7. These run first and don't need a model.
2. **Semantic (fresh context).** A read-only reviewer with no implementation history checks what's left: the spec-fidelity check (S1) and the semantic half of the criteria marked ⚙🔎 below. Running it fresh avoids the bias of the context that wrote the code ratifying its own work.

```
/review-implementation
```

The command orchestrates both stages, consolidates one report grouped by severity with file references, and **confirms with you before applying any fix**.

CI runs this on every pull request (`.github/workflows/ci.yml`) with `--allow-missing-provider`, which exits 0 on the bare template where having no provider is the normal state. A provider that *is* present still has to pass every criterion.

For an orchestrating agent, `npm run validate:provider -- --json` emits the whole result set as one JSON document and suppresses the prose. Each result carries `id`, `severity`, `passed`, `detail`, `file`, `line`, and — where the check is structural only — a `semanticGap` string naming what a human still has to judge. A separate `notChecked` array names the criteria the script deliberately does not touch, with the reason. Exit codes are the same either way: `0` all Critical and Major pass, `1` a Critical or Major check failed, `2` no provider found. A failing Minor check is reported but still exits `0`.

**Legend**

| Marker | Meaning |
|---|---|
| ⚙ | Fully mechanized by `npm run validate:provider` — a deterministic check with an exit code. |
| ⚙🔎 | Structurally mechanized *and* semantically open. The script proves the shape (the hook is wired, the switch routes two events); the reviewer judges whether it's the *right* shape. `--json` names the gap on each one. |
| ▶ | Mechanized, but by a different command — `npm test`. |
| 🔎 | Reviewer only. No honest mechanical check exists. |

Critical and Major failures exit non-zero. Minor failures are reported but do not fail the build.

---

## Critical — must fix before shipping

These are blockers. Code will not work correctly without them.

| # | ✓ | Criterion | How it's checked |
|---|---|---|---|
| C1 | ⚙ | `PROVIDER_CLIENT` registered in `container.setup.ts` | Grep: `ServiceToken.PROVIDER_CLIENT` |
| C2 | ⚙ | `PROVIDER_SERVICE` registered in `container.setup.ts` | Grep: `ServiceToken.PROVIDER_SERVICE` |
| C3 | ⚙ | Webhook signature verification present in `webhook-hooks.ts` | A **live** call to `verifyWebhookSignature` in `code/webhook-hooks.ts`. Comments are stripped first: the template ships this file with the call present only inside a commented-out example, and a raw text search would pass it |
| C4 | ⚙ | No `// TODO` stubs remaining in service methods | Grep: `TODO: implement` in `code/services/{provider}.service.ts`. Comments are scanned deliberately — the scaffolder writes its stub markers as `//` comments |
| C5 | ⚙ | `statusMap` in adapter is not empty | At least one `PaymentStatus.*` entry inside the adapter's `statusMap` literal |
| C6 | ⚙ | Event constants use real names (not placeholders) | `code/interfaces/{provider}-events.ts` contains no `actual.event.*` / `provider.payment.*` / `TODO` / `placeholder` values |
| C7 | ▶ | All tests pass | `npm test` returns exit 0. `validate:provider` does **not** shell out to jest — see "Why C7 isn't in the script" below |
| C8 | ⚙ | Config keys added to `env.sample.ts` | Grep: `SECRET_KEY` in `code/env.sample.ts` |
| S1 | 🔎 | `statusMap` and events match the filled spec | Reviewer compares the adapter `statusMap` keys and `PROVIDER_EVENTS` values against `docs/<provider>-spec.md` § Status Mapping / § Webhook Events — nothing in the spec left unhandled, nothing handled that isn't in the spec. Catches a `pending → Successful` mis-map that C5/C6 (presence-only) can't |

---

## Major — fix before shipping

These won't cause immediate failures but will cause silent bugs or maintenance pain.

| # | ✓ | Criterion | How it's checked |
|---|---|---|---|
| M1 | ⚙ | All service methods use `retryWithBackoff()` for API calls | Grep: `retryWithBackoff` in `code/services/{provider}.service.ts` |
| M2 | ⚙ | Every public service method logs as its first statement | Each public method on the service class is parsed; its first statement must be a `this.logService.*(...)` call. The constructor and `private`/`protected` helpers are exempt — the criterion is about the service's public surface |
| M3 | ⚙ | Errors thrown as `ModuleError`, not raw | Grep: `throw new Error` in the service (should be `ModuleError`) |
| M4 | ⚙🔎 | Lifecycle hooks: `afterPolicyIssued` creates customer + stores in `app_data` | **Script:** the hook assigns `ServiceToken.PROVIDER_SERVICE` to a variable and awaits a call **on that variable**, in live code. The detail names the method it calls, and says so when that method isn't on `PaymentProviderService`. **Reviewer:** whether it creates a customer and writes the id to the right `app_data` key |
| M5 | ⚙🔎 | Lifecycle hooks: `afterPaymentCreated` fires payment intent | **Script:** same binding check on `code/lifecycle-hooks/payment.hooks.ts`. **Reviewer:** whether the amount, currency and customer are right |
| M6 | ⚙🔎 | Lifecycle hooks: `afterPolicyPaymentMethodAssigned` attaches payment method | **Script:** same binding check on `code/lifecycle-hooks/payment-method.hooks.ts`. **Reviewer:** whether it attaches to the right provider customer |
| M7 | ⚙🔎 | Webhook routing handles at least `payment_success` and `payment_failed` events | **Script:** `code/webhook-hooks.ts` has a live `switch` with ≥2 non-default `case` clauses. **Reviewer:** whether those are this provider's success and failure events — the names are provider-specific, so S1 is what closes this |
| M8 | ⚙ | No `console.log` in service or controller code | Grep: `console.log` across `code/`, excluding `code/services/log.service.ts` — `LogService` is the sanctioned console sink |

---

## Minor — fix in follow-up if not blocking

Reported by `validate:provider`, but they do not fail the build.

| # | ✓ | Criterion | How it's checked |
|---|---|---|---|
| m1 | ⚙🔎 | Test coverage: each service method has at least one passing test | **Script:** every public service method name appears somewhere in `__tests__/services/{provider}.service.test.ts`. **Reviewer:** whether the test asserts anything meaningful — "passing" itself is C7 |
| m2 | ⚙ | Adapter `convertCustomerToAppData` stores at least customer ID | The method body assigns at least one property from the provider customer's `.id` |
| m3 | ⚙ | Webhook `default` case logs unhandled event type | The live `switch` has a `default:` clause and that clause calls a logger |
| m4 | ⚙ | No hardcoded secrets or API keys in code | Grep: `sk_live_`, `sk_test_`, `whsec_` across `code/`, excluding `env.ts` / `env.sample.ts` |
| m5 | ⚙ | `verifyWebhookSignature` returns `false` (not throws) on invalid sig | The method body in `code/clients/{provider}-client.ts` contains no `throw` and has a `return false` (or comparison) path |

---

## Why C7 isn't in the script

`npm test` is already a command with an exit code. Having `validate:provider` shell out to jest would:

- collapse "your wiring is wrong" and "your tests are red" into one exit code, so a CI failure wouldn't say which;
- put jest's output into `--json`'s stream and make it unparseable;
- turn a sub-second static check into a multi-minute one, so people stop running it.

CI runs both. `validate:provider --json` lists C7 in `notChecked` with this reason, so an orchestrating agent knows the gap exists rather than assuming the script covered it.

---

## Enhancements — optional improvements

Suggestions, not criteria. Nothing checks these.

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
- You can say which criteria a passing `validate:provider` has *not* proved — C7, S1, and the semantic half of every ⚙🔎 row.
