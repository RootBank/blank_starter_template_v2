# Provider Spec Template

> Use this document when preparing a provider spec for AI-assisted implementation.
> The more detail you provide, the better the AI can generate production-ready code.
> You can also share existing provider API docs directly — Claude/Cursor will extract the relevant information.

---

## 1. Provider Overview

```
Provider name:         e.g. GoCardless
Provider website:      e.g. https://gocardless.com
API docs URL:          e.g. https://developer.gocardless.com/api-reference
SDK (npm package):     e.g. gocardless-nodejs  (or "none — REST only")
API version:           e.g. 2015-07-06
```

---

## 2. Authentication

```
Auth type:             API key / OAuth / HMAC / other
Header name:           e.g. Authorization
Header format:         e.g. Bearer {api_key}  /  Token {api_key}
Key name in config:    e.g. providerSecretKey
```

---

## 3. API Endpoints Needed

List each operation the module needs to perform:

| Operation | HTTP Method | Endpoint | Notes |
|---|---|---|---|
| Create customer | POST | /customers | |
| Get customer | GET | /customers/{id} | |
| Update customer | PUT | /customers/{id} | |
| Create payment intent | POST | /payments | |
| Get payment method | GET | /payment-methods/{id} | |
| Attach payment method | POST | /payment-methods/{id}/attach | |
| Cancel subscription | DELETE | /subscriptions/{id} | |

---

## 4. Webhook Configuration

```
Webhook delivery method:   HTTP POST to your endpoint
Signature header:          e.g. X-GoCardless-Signature
Signature algorithm:       e.g. HMAC-SHA256
Signature secret config:   providerWebhookSigningSecret
```

### Webhook Events to Handle

List the events the module must respond to:

| Event name | Trigger | Root Platform action |
|---|---|---|
| payment.completed | Payment succeeded | Mark Root payment as paid |
| payment.failed | Payment failed | Mark Root payment as failed |
| mandate.cancelled | Direct debit cancelled | Cancel Root policy |
| subscription.finished | Subscription ended | Update Root policy status |

---

## 5. Data Shapes

### Customer object (from provider)
```json
{
  "id": "CU123",
  "email": "customer@example.com",
  "given_name": "Jane",
  "family_name": "Doe",
  "metadata": {}
}
```

### Payment object (from provider)
```json
{
  "id": "PM123",
  "status": "paid_out",
  "amount": 5000,
  "currency": "ZAR",
  "description": "Insurance premium"
}
```

### Payment status mapping

| Provider status | Root Platform status |
|---|---|
| paid_out | successful |
| failed | failed |
| pending_submission | pending |
| cancelled | failed |

---

## 6. Configuration Fields

List all config values the module needs:

| Config field | Description | Example value |
|---|---|---|
| `providerSecretKey` | API access token | `access_token_xxx` |
| `providerWebhookSigningSecret` | Webhook signature secret | `whsec_xxx` |
| `providerProductId` | Product/plan ID (if applicable) | `plan_xxx` |

---

## 7. Lifecycle Hook Behaviour

Describe what should happen at each Root Platform lifecycle event:

| Hook | Action |
|---|---|
| `afterPolicyIssued` | Create customer in provider, store customer ID in policy app_data |
| `afterPolicyPaymentMethodAssigned` | Attach payment method / create mandate |
| `afterPaymentCreated` | Create payment intent / charge |
| `afterPaymentUpdated` | Sync payment status |
| `afterPolicyCancelled` | Cancel subscription / mandate |
| `renderCreatePaymentMethod` | Return HTML form for payment method capture |
| `createPaymentMethod` | Validate and store tokenised payment method |

---

## 8. Error Scenarios

List known error cases to handle:

| Scenario | Provider error | Handling |
|---|---|---|
| Invalid card | `card_error` | Return validation error to Root |
| Insufficient funds | `insufficient_funds` | Mark payment failed, notify |
| Customer not found | `resource_not_found` | Log warning, skip update |
| Webhook signature invalid | 400 Bad Request | Reject and log |

---

## 9. Additional Notes

Any other context the AI needs:
- Special auth flows (OAuth token refresh, etc.)
- Idempotency key requirements
- Sandbox vs production base URL differences
- Rate limits or retry behaviour
- Currency or amount formatting (cents vs units)

## You've understood this if…

- You can list the nine sections every spec must contain.
- You know which section drives the status-mapping table in the adapter.
- You can identify which sections, if left blank, will block scaffolding.
