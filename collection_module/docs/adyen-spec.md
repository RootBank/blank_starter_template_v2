# Adyen Provider Spec

## 1. Provider Overview

```
Provider name:         Adyen
Provider website:      https://www.adyen.com
API docs URL:          https://docs.adyen.com/api-explorer/
SDK (npm package):     none — REST only (uses BaseHttpClient)
API version:           v71 (Checkout API)
```

## 2. Authentication

```
Auth type:             API key
Header name:           X-API-Key
Header format:         {api_key}  (no prefix)
Key name in config:    providerSecretKey
Additional config:     providerMerchantAccount (merchantAccount required on every request)
```

## 3. API Endpoints Needed

| Operation | HTTP Method | Endpoint | Notes |
|---|---|---|---|
| Create payment (with tokenization) | POST | /payments | Use shopperReference + storePaymentMethod for "customer creation" |
| Create payment (recurring) | POST | /payments | Use storedPaymentMethodId for merchant-initiated payments |
| List stored payment methods | GET | /storedPaymentMethods | Query by merchantAccount + shopperReference |
| Delete stored payment method | DELETE | /storedPaymentMethods/{id} | Remove token |
| Cancel payment | POST | /payments/{pspReference}/cancels | Cancel authorized payment |
| Refund payment | POST | /payments/{pspReference}/refunds | Refund captured payment |

## 4. Webhook Configuration

```
Webhook delivery method:   HTTP POST
Signature header:          (in additionalData.hmacSignature inside payload)
Signature algorithm:       HMAC-SHA256
Signature secret config:   providerWebhookSigningSecret
Required response:         HTTP 200 with body "[accepted]"
```

### Webhook Events to Handle

| Event name | Trigger | Root Platform action |
|---|---|---|
| AUTHORISATION (success=true) | Payment authorized | Mark Root payment as successful |
| AUTHORISATION (success=false) | Payment refused | Mark Root payment as failed |
| CAPTURE | Payment captured | (informational) |
| CANCELLATION | Payment cancelled | Mark Root payment as cancelled |
| REFUND | Refund processed | Mark Root payment as refunded |
| REFUND_FAILED | Refund failed | Log warning |
| CHARGEBACK | Chargeback received | Mark Root payment as failed |

## 5. Data Shapes

### Shopper reference (Adyen has no Customer object)
```json
{
  "shopperReference": "root_policy_123",
  "shopperEmail": "customer@example.com",
  "shopperName": { "firstName": "Jane", "lastName": "Doe" }
}
```

### Payment response
```json
{
  "pspReference": "7914073381342284",
  "resultCode": "Authorised",
  "amount": { "currency": "ZAR", "value": 50000 },
  "merchantReference": "payment_test_123"
}
```

### Webhook notification item
```json
{
  "NotificationRequestItem": {
    "eventCode": "AUTHORISATION",
    "success": "true",
    "pspReference": "7914073381342284",
    "merchantReference": "payment_test_123",
    "amount": { "currency": "ZAR", "value": 50000 },
    "additionalData": { "hmacSignature": "..." }
  }
}
```

### Payment status mapping

| Provider resultCode | Root Platform status |
|---|---|
| Authorised | successful |
| Received | pending |
| Pending | pending |
| Refused | failed |
| Cancelled | cancelled |
| Error | failed |

## 6. Configuration Fields

| Config field | Description | Example value |
|---|---|---|
| `providerSecretKey` | Adyen API key | `AQE...` |
| `providerWebhookSigningSecret` | HMAC key (hex string) | `44782DEF547...` |
| `providerMerchantAccount` | Merchant account name | `YourCompanyECOM` |
| `providerPublishableKey` | Client key (for Drop-in) | `test_xxx` |

## 7. Lifecycle Hook Behaviour

| Hook | Action |
|---|---|
| `afterPolicyIssued` | Generate shopperReference from policy, store in app_data (no API call needed) |
| `afterPolicyPaymentMethodAssigned` | Store storedPaymentMethodId in app_data |
| `afterPaymentCreated` | POST /payments with storedPaymentMethodId for recurring charge |
| `afterPolicyCancelled` | DELETE /storedPaymentMethods/{id} to disable token |

## 8. Error Scenarios

| Scenario | Provider error | Handling |
|---|---|---|
| Payment refused | resultCode: "Refused" | Mark payment failed with refusalReason |
| Invalid API key | HTTP 401 | Throw ModuleError |
| Webhook HMAC invalid | Signature mismatch | Return 403, log warning |
| Rate limited | HTTP 429 | Retry with backoff |

## 9. Additional Notes

- Amounts are always in minor units (cents). ZAR 500.00 = `{ currency: "ZAR", value: 50000 }`
- Captures, cancels, refunds are asynchronous — API returns `status: "received"`, outcome arrives via webhook
- Adyen has no separate Customer API — use `shopperReference` consistently across all requests
- Base URLs differ per environment:
  - Test: `https://checkout-test.adyen.com/v71`
  - Live: `https://{prefix}-checkout-live.adyenpayments.com/checkout/v71`
- Idempotency supported via `Idempotency-Key` header
- HMAC verification concatenates: pspReference:originalReference:merchantAccountCode:merchantReference:amount.value:amount.currency:eventCode:success
