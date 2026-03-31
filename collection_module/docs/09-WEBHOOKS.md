# Webhooks

> See `docs/STRIPE-REFERENCE.md` for a complete working example.

## Overview

`code/webhook-hooks.ts` exports `processWebhookRequest`, called by Root Platform when your provider sends a webhook.

## Implementation steps

1. **Verify signature** — use your provider client to verify the webhook payload.
2. **Parse event** — extract event type and payload.
3. **Route event** — match event type in a `switch`, resolve the correct controller from DI.
4. **Return response** — `{ response: { status: 200, headers: {...}, body: '{"received":true}' } }`.

## Signature verification

```typescript
const providerClient = container.resolve(ServiceToken.PROVIDER_CLIENT);
const isValid = providerClient.verifyWebhookSignature(
  { body: request.request.body, headers: request.request.headers },
  config.get('providerWebhookSigningSecret'),
);
if (!isValid) return { response: { status: 403, ... } };
```

## Security

- Always verify the signature before processing.
- Use `crypto.timingSafeEqual` for HMAC comparisons.
- Store signing secrets in `providerWebhookSigningSecret` (live) and the test equivalent.

## Related

- `code/webhook-hooks.ts` — Stub
- `docs/STRIPE-REFERENCE.md` — Full working example
