# Collection Module Template -- Overview

> A provider-agnostic template for integrating payment providers with the Root Platform insurance system.

## Overview

This collection module template provides the scaffolding to connect any payment provider (Stripe, PayFast, custom gateways) to the Root Platform. It ships with a fully working Stripe implementation as the reference. The architecture uses dependency injection, layered separation, and provider-agnostic interfaces so you can swap providers by implementing a small set of contracts.

The module runs as a Root Platform collection module -- deployed via the Root CLI. It handles payment method creation, payment lifecycle events, webhook processing, and dashboard rendering.

## Directory Layout

```
collection_module/
  code/
    main.ts                              # Entry point: inits DI container, exports hooks
    env.sample.ts                        # Environment variable template (copy to env.ts)
    core/
      container.ts                       # DI container class + ServiceToken symbols
      container.setup.ts                 # Service registration (wiring)
    services/
      config.service.ts                  # EnvironmentConfig, validation, env-aware access
      config-instance.ts                 # Convenience helper to resolve ConfigurationService
      log.service.ts                     # Structured JSON logging with correlation IDs
      stripe.service.ts                  # Stripe business logic (reference provider impl)
      root.service.ts                    # Root Platform operations (policy, payment updates)
      render.service.ts                  # HTML rendering for Root dashboard views
    clients/
      stripe-client.ts                   # Stripe SDK wrapper (reference provider client)
      root-client.ts                     # Root Platform SDK singleton
      base-http-client.ts                # Generic HTTP client for non-SDK providers
    adapters/
      stripe-to-root-adapter.ts          # Data transformation: Stripe -> Root format
    interfaces/
      provider.interfaces.ts             # PaymentProviderClient, PaymentProviderService,
                                         #   ProviderToRootAdapter contracts
      stripe-events.ts                   # Stripe webhook event type constants
    lifecycle-hooks/
      index.ts                           # Re-exports all hooks
      payment-method.hooks.ts            # create, render, view payment methods
      payment.hooks.ts                   # afterPaymentCreated, afterPaymentUpdated
      policy.hooks.ts                    # afterPolicyIssued, Cancelled, Expired, Lapsed, etc.
    webhook-hooks.ts                     # Webhook signature verification + event routing
    utils/
      error.ts                           # ModuleError base class
      error-types.ts                     # EnhancedModuleError, ValidationError, NetworkError, etc.
      retry.ts                           # retryWithBackoff, retryWithJitter, retryForErrors
      timeout.ts                         # withTimeout, withTimeoutFallback, TimeoutError
  __tests__/                             # Jest tests mirroring code/ structure
  scripts/
    scaffold-provider.js                 # CLI: scaffold all files for a new provider
    extract-spec.js                      # CLI: extract spec from API docs via Claude
    log-action.js                        # CLI: append audit log entry
    deploy.sh                            # Deployment script (sandbox / production)
    validate-config.sh                   # Pre-deploy config validation
  package.json                           # Dependencies, scripts, engine requirements
  tsconfig.json                          # TypeScript configuration
```

## Layer Diagram

```
+--------------------------------------------------------------+
|                    Root Platform (Cloud)                      |
|   Lifecycle hooks called by Root    Webhook endpoint          |
+-------------------------------+------------------------------+
                |                           |
    +-----------v-----------+   +-----------v-----------+
    |   Lifecycle Hooks     |   |   webhook-hooks.ts    |
    | (payment-method,      |   | Signature verify +    |
    |  payment, policy)     |   | event routing         |
    +-----------+-----------+   +-----------+-----------+
                |                           |
    +-----------v---------------------------v-----------+
    |              Controllers (thin orchestrators)     |
    |        One per event type, resolves via DI        |
    +-------------------------+-------------------------+
                              |
    +-------------------------v-------------------------+
    |                  Service Layer                    |
    |  RootService  |  StripeService  |  RenderService  |
    |               |  (PROVIDER_SERVICE)               |
    +----------+----+---------+--------+----------------+
               |              |        |
    +----------v---+  +-------v----+   |
    |  RootClient  |  | StripeClient|  |
    |  (ROOT_CLIENT)| | (PROVIDER_ |  |
    |              |  |  CLIENT)   |   |
    +--------------+  +------------+   |
                                       |
    +----------------------------------v----------------+
    |              Adapters (pure data transforms)      |
    |         StripeToRootAdapter (no API calls)        |
    +---------------------------------------------------+
```

## Data Flow

### Lifecycle Hook Flow (Root -> Module -> Provider)

1. Root Platform calls an exported lifecycle hook (e.g., `renderCreatePaymentMethod`).
2. The hook resolves services from the DI container via `getContainer()`.
3. Services call clients (StripeClient, RootClient) to perform operations.
4. Adapters transform data between provider format and Root format.
5. The hook returns a response (HTML string, module data, or void).

### Webhook Flow (Provider -> Module -> Root)

1. Payment provider sends webhook to `processWebhookRequest`.
2. `webhook-hooks.ts` verifies the signature using `providerWebhookSigningSecret`.
3. The event type is matched in a `switch` statement.
4. The matched case resolves a controller from the DI container.
5. The controller calls services and adapters to process the event.
6. RootService updates the Root Platform (payment status, policy data).

### DI Container Initialization

1. `code/main.ts` calls `getContainer()` on module load.
2. `container.setup.ts` registers all services with `ServiceToken` symbols.
3. All services default to `SINGLETON` lifetime (one instance per container).
4. Services resolve their dependencies through the container factory functions.

## Key Concepts

- **Provider-agnostic tokens**: `PROVIDER_CLIENT` and `PROVIDER_SERVICE` are generic DI tokens. The default template registers Stripe implementations, but you can register any provider.
- **Lifecycle hooks**: Exported functions that Root Platform calls at specific points (policy issued, payment created, payment method assigned, etc.).
- **Webhook hooks**: A separate entry point for processing incoming webhooks from the payment provider.
- **Adapters**: Pure transformation functions that convert between provider data formats and Root Platform data formats. They never make API calls.

## Related Docs

- [01-GETTING-STARTED.md](./01-GETTING-STARTED.md) -- Setup and first run
- [02-ARCHITECTURE.md](./02-ARCHITECTURE.md) -- DI container deep dive
- [03-PROVIDER-INTERFACE.md](./03-PROVIDER-INTERFACE.md) -- Implementing a new provider
- [14-BUILD-FROM-SPEC.md](./14-BUILD-FROM-SPEC.md) -- End-to-end spec-to-implementation workflow
