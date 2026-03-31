# Lifecycle Hooks

> See `docs/STRIPE-REFERENCE.md` for a complete working example.

## Overview

Lifecycle hooks are functions exported from `code/main.ts` that Root Platform calls at specific points in the policy and payment lifecycle. Stubs live in `code/lifecycle-hooks/`.

## Hook files

| File | Hooks |
|---|---|
| `payment-method.hooks.ts` | `createPaymentMethod`, `renderCreatePaymentMethod`, `renderViewPaymentMethodSummary`, `renderViewPaymentMethod`, `afterPolicyPaymentMethodAssigned`, `afterPaymentMethodRemoved` |
| `payment.hooks.ts` | `afterPaymentCreated`, `afterPaymentUpdated` |
| `policy.hooks.ts` | `afterPolicyIssued`, `afterPolicyUpdated`, `afterPolicyCancelled`, `afterPolicyExpired`, `afterPolicyLapsed`, `afterAlterationPackageApplied` |

## Conventions

- Resolve services from the DI container using `getContainer()`.
- Use `LogService` for all logging.
- Return the correct shape for each hook (see Root Platform docs).
- Render hooks return an HTML string — use `RenderService` and `escapeHtml()`.

## Related

- `code/lifecycle-hooks/` — Stub implementations
- `docs/STRIPE-REFERENCE.md` — Full working example
