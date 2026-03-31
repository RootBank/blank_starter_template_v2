# Error Handling

## Overview

Use `ModuleError` (from `utils/`) for all business errors. For external API calls, wrap in `retryWithBackoff`.

## Error types

| Class | When to use |
|---|---|
| `ModuleError` | Base error — generic business errors |
| `EnhancedModuleError` | When you need category, retryable flag, statusCode |
| `ValidationError` | Invalid input (400) |
| `NotFoundError` | Resource not found (404) |
| `NetworkError` | Network failure, retryable (503) |
| `TimeoutError` | Request timeout, retryable (504) |
| `RateLimitError` | Provider rate limit, retryable (429) |
| `ServerError` | Provider 5xx error, retryable (500) |

All types are exported from `utils/index.ts`.

## Pattern

```typescript
import { ModuleError, retryWithBackoff } from '../utils';

async createCustomer(params: CreateCustomerParams) {
  try {
    return await retryWithBackoff(() => this.sdk.customers.create(params));
  } catch (err: any) {
    throw err instanceof ModuleError
      ? err
      : new ModuleError('Failed to create customer', { cause: err });
  }
}
```

## Retry configuration

`retryWithBackoff` defaults: 3 retries, exponential backoff. Pass `shouldRetry` to control which errors retry.

## Related

- `code/utils/error.ts` — ModuleError
- `code/utils/error-types.ts` — Enhanced error types
- `code/utils/retry.ts` — retryWithBackoff
