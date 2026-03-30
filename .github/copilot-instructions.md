# Collection Module Template - Copilot Instructions

## Project Context
Root Platform collection module template for payment provider integration.
TypeScript, Node 18+, Jest, custom DI container. Stripe is the reference implementation.
The template is provider-agnostic — Stripe shows how it works; any provider follows the same patterns.

## Building from a Provider Spec

When given a provider API doc or spec, follow `collection_module/docs/14-BUILD-FROM-SPEC.md`. Quick steps:
1. Extract: provider name, API type (SDK/REST), base URL, auth method, webhook signature header, webhook events, operations needed, config fields
2. Create: `code/clients/{provider}-client.ts`, `code/services/{provider}.service.ts`, `code/adapters/{provider}-to-root-adapter.ts`
3. Update: `code/core/container.setup.ts` (register PROVIDER_CLIENT + PROVIDER_SERVICE), `code/webhook-hooks.ts`, `code/env.sample.ts`
4. Scaffold tests mirroring `code/` structure in `__tests__/`

See `collection_module/docs/SPEC-TEMPLATE.md` for the full spec template. See `collection_module/docs/03-PROVIDER-INTERFACE.md` for step-by-step implementation.

## Documentation
All implementation guidance is in `collection_module/docs/`.
- `docs/14-BUILD-FROM-SPEC.md` for the end-to-end workflow (canonical SOP)
- `docs/SPEC-TEMPLATE.md` for what a provider spec needs to contain
- `docs/00-OVERVIEW.md` for architecture
- `docs/03-PROVIDER-INTERFACE.md` for adding new payment providers
- `docs/STRIPE-REFERENCE.md` for Stripe-specific details and patterns

## Key Patterns

### Services
- Constructor injection; registered in `code/core/container.setup.ts`
- Resolve via `container.resolve<T>(ServiceToken.X)`
- Available tokens: `LOG_SERVICE`, `CONFIG_SERVICE`, `PROVIDER_CLIENT`, `ROOT_CLIENT`, `ROOT_SERVICE`, `PROVIDER_SERVICE`, `RENDER_SERVICE`

### Controllers
- Thin orchestrators, one per event type, <100 lines
- No business logic; delegate to services
- Register as `TRANSIENT` in container

### Clients
- `StripeClient`: wraps Stripe SDK, accessed via `stripeClient.sdk`
- `RootClient`: singleton, accessed via `rootClient.SDK`
- `BaseHttpClient`: typed HTTP for providers without SDKs

### Adapters
- Pure data transformation functions, no API calls
- `StripeToRootAdapter`: converts Stripe data to Root format

### Testing
- Tests in `__tests__/` mirror `code/` structure
- Mock factories in `__tests__/helpers/factories.ts`
- Coverage threshold: 70%

## Conventions
- Use `LogService` (not `console.log`)
- Handle errors with `ModuleError` from `code/utils/error.ts`
- Use `retryWithBackoff` for external API calls
- Config fields are provider-agnostic: `providerSecretKey`, `providerPublishableKey`
- DI tokens are provider-agnostic: `PROVIDER_CLIENT`, `PROVIDER_SERVICE`
