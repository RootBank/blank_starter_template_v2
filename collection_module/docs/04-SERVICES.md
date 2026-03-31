# Services

> See `docs/STRIPE-REFERENCE.md` for a complete working example.

## Overview

Services contain business logic. Each provider ships with a `{Provider}Service` class registered under `ServiceToken.PROVIDER_SERVICE`. The shared infrastructure services (`RootService`, `RenderService`, `ConfigurationService`, `LogService`) are always present.

## Conventions

- Constructor-injected via DI — never instantiate services directly.
- Use `LogService` only — no `console.log`.
- Wrap external calls in `retryWithBackoff` from `utils/`.
- Throw `ModuleError` (from `utils/`) for business errors.
- Keep services focused — one provider, one service class.

## Pattern

```typescript
export class {Provider}Service implements PaymentProviderService {
  constructor(
    private readonly logService: LogService,
    private readonly providerClient: {Provider}Client,
  ) {}

  async createCustomer(params: CreateCustomerParams): Promise<ProviderCustomer> {
    this.logService.info('Creating customer', '{Provider}Service', params);
    return retryWithBackoff(() => this.providerClient.sdk.customers.create(params));
  }
  // ... other methods
}
```

Register in `container.setup.ts` under `ServiceToken.PROVIDER_SERVICE`.

## Related

- `docs/02-ARCHITECTURE.md` — DI container
- `docs/STRIPE-REFERENCE.md` — Full working example
