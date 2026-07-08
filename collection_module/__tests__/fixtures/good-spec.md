# Provider Spec Template — filled (test fixture)

## 1. Provider Overview

```
Provider name:         TestCo
Provider website:      https://testco.com
API docs URL:          https://developer.testco.com/api-reference
SDK (npm package):     none — REST only
API version:           2024-01-01
```

## 2. Authentication

```
Auth type:             API key
Header name:           Authorization
Header format:         Bearer {api_key}
Key name in config:    providerSecretKey
```

## 4. Webhook Configuration

```
Webhook delivery method:   HTTP POST to your endpoint
Signature header:          X-TestCo-Signature
Signature algorithm:       HMAC-SHA256
Signature secret config:   providerWebhookSigningSecret
```

### Webhook Events to Handle

| Event name | Trigger | Root Platform action |
|---|---|---|
| charge.succeeded | Payment captured | Mark Root payment as paid |
| charge.declined | Payment declined | Mark Root payment as failed |

## 5. Data Shapes

### Payment status mapping

| Provider status | Root Platform status |
|---|---|
| captured | successful |
| declined | failed |
| authorizing | pending |
