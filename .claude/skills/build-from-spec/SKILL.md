---
name: build-from-spec
description: Build a collection module from a provider spec, API doc, PDF, or URL. Use when the user wants to add a new payment provider, integrate a payment gateway, or build from API documentation.
argument-hint: [url-or-path-to-spec]
allowed-tools: Read Grep Glob Bash Edit Write WebFetch Agent
---

# Build From Spec

Build a collection module from a provider spec, API doc, PDF, or URL.

> Full SOP: `collection_module/docs/14-BUILD-FROM-SPEC.md`
> Reference implementation: `collection_module/docs/STRIPE-REFERENCE.md`

---

## Step 1 — Get a spec

If the user provided a URL, PDF, or OpenAPI file, extract it:

```bash
cd collection_module && npm run extract:spec -- --input=$ARGUMENTS --output=docs/provider-spec.md
```

If the user already has a filled `docs/SPEC-TEMPLATE.md`, skip to Step 2.

If the user provided raw API documentation (pasted text, a webpage), read it and fill `docs/SPEC-TEMPLATE.md` manually. The required sections are:

| Section | Required fields |
|---|---|
| Provider Overview | Name, API type (sdk/http), base URL or SDK package |
| Authentication | Header name, header format |
| Webhook Configuration | Signature header, signature algorithm |
| Webhook Events | Event names + what Root Platform action to take |
| Data Shapes | Payment object shape, customer object shape |
| Status Mapping | Provider status → Root `PaymentStatus` |

## Step 2 — Scaffold the provider

```bash
cd collection_module && npm run scaffold:provider -- --from-spec=docs/provider-spec.md --reason="<why>"
```

Or with explicit flags:

```bash
cd collection_module && npm run scaffold:provider -- \
  --provider=<Name> \
  --api-type=<sdk|http> \
  --base-url=<url> \
  --auth-header=<header> \
  --webhook-header=<header> \
  --reason="<why>"
```

Show the user the CLI output. **7 files** should be created:
- `code/clients/{provider}-client.ts`
- `code/services/{provider}.service.ts`
- `code/adapters/{provider}-to-root-adapter.ts`
- `code/interfaces/{provider}-events.ts`
- `__tests__/clients/{provider}-client.test.ts`
- `__tests__/services/{provider}.service.test.ts`
- `__tests__/adapters/{provider}-to-root-adapter.test.ts`

## Step 3 — Implement stubs

Read each generated file and implement the `// TODO` sections. Use `docs/STRIPE-REFERENCE.md` as the pattern for every method.

**Rules for all implementations:**
- Wrap all API calls in `retryWithBackoff()`
- Log at the start of every method: `this.logService.info('Creating customer', 'ProviderService', params)`
- Throw `ModuleError` on failures, not raw errors
- Use `LogService` only — no `console.log`

### Service methods to implement

| Method | What to implement |
|---|---|
| `createCustomer` | POST to provider's customer endpoint |
| `createPaymentIntent` | POST to payment/charge endpoint |
| `attachPaymentMethod` | Attach method to customer + set as default |
| `cancelSubscription` | DELETE/cancel subscription |

### Adapter — fill `statusMap`

Map provider payment statuses to Root's `PaymentStatus`:

```typescript
const statusMap: Record<string, string> = {
  'provider_success_status': PaymentStatus.Successful,
  'provider_pending_status': PaymentStatus.Pending,
  'provider_failed_status':  PaymentStatus.Failed,
  'provider_cancel_status':  PaymentStatus.Cancelled,
};
```

### Events — replace placeholders with real event names

```typescript
export const PROVIDER_EVENTS = {
  PAYMENT_COMPLETED: 'actual.event.name',
  PAYMENT_FAILED:    'actual.event.failed',
} as const;
```

## Step 4 — Wire into the module

Four files to update. Read each one before editing — the Stripe entries show the exact pattern.

### 4a. DI container (`code/core/container.setup.ts`)

Register client and service under provider-agnostic tokens:

```typescript
container.register(ServiceToken.PROVIDER_CLIENT, {
  useClass: MyProviderClient,
  lifetime: Lifetime.SINGLETON,
});
container.register(ServiceToken.PROVIDER_SERVICE, {
  useClass: MyProviderService,
  lifetime: Lifetime.SINGLETON,
});
```

### 4b. Webhooks (`code/webhook-hooks.ts`)

1. Verify signature using `providerClient.verifyWebhookSignature()`
2. Parse event body
3. Add `case` entries for each event in `PROVIDER_EVENTS`

### 4c. Lifecycle hooks (`code/lifecycle-hooks/`)

| Hook file | What to call |
|---|---|
| `policy.hooks.ts` → `afterPolicyIssued` | `providerService.createCustomer(...)` then update `policy.app_data` |
| `payment-method.hooks.ts` → `afterPolicyPaymentMethodAssigned` | `providerService.attachPaymentMethod(...)` |
| `payment.hooks.ts` → `afterPaymentCreated` | `providerService.createPaymentIntent(...)` |

### 4d. Config (`code/env.sample.ts`)

Add the provider's config keys (PROVIDER_SECRET_KEY_LIVE, PROVIDER_SECRET_KEY_TEST, PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE, PROVIDER_WEBHOOK_SIGNING_SECRET_TEST, etc.)

## Step 5 — Verify

```bash
cd collection_module && npm test
```

Fix all failures. Then run `/review-implementation` for self-review.

## Status Checklist

```
[ ] Spec filled (docs/SPEC-TEMPLATE.md or extracted)
[ ] Scaffold run — 7 files created
[ ] Service methods implemented (no TODO stubs remaining)
[ ] Adapter statusMap filled
[ ] Events constants use real event names
[ ] DI container registrations added
[ ] Webhooks: signature verification + event routing
[ ] Lifecycle hooks: policy, payment, payment-method
[ ] Config placeholders added to env.sample.ts
[ ] All tests pass (npm test)
[ ] Self-review complete (/review-implementation)
```
