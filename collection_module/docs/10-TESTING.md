# Testing

## Overview

Tests mirror the `code/` structure in `__tests__/`. Run with `npm test`.

## Conventions

- Mock the DI container with `jest.mock('../../code/core/container.setup')`.
- Use factories in `__tests__/helpers/factories.ts` for test data.
- Use mock services from `__tests__/test-helpers.ts`.
- Never hit real APIs in unit tests.

## Pattern for service tests

```typescript
jest.mock('../../code/core/container.setup');

describe('MyService', () => {
  let service: MyService;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderClient: ReturnType<typeof createMockProviderClient>;

  beforeEach(() => {
    mockLogService = createMockLogService();
    mockProviderClient = createMockProviderClient();
    service = new MyService(mockLogService, mockProviderClient);
  });

  it('should do something', async () => {
    mockProviderClient.someMethod.mockResolvedValue({ id: 'result_123' });
    const result = await service.doSomething({ id: 'input' });
    expect(result.id).toBe('result_123');
  });
});
```

## Coverage thresholds

`jest.config.js` enforces 70% branches/functions/lines/statements. Run `npm run test:coverage` to check.

## Related

- `__tests__/helpers/factories.ts` — Test data factories
- `__tests__/test-helpers.ts` — Mock service factories
