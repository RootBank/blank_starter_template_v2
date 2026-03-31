/**
 * Container Tests
 */

import {
  Container,
  ServiceLifetime,
  ServiceToken,
} from '../../code/core/container';

// Mock services for testing
class MockServiceA {
  constructor(public name: string = 'ServiceA') {}
}

class MockServiceB {
  constructor(
    public serviceA: MockServiceA,
    public name: string = 'ServiceB',
  ) {}
}

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Service Registration', () => {
    it('should register a service', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      expect(container.has('MockServiceA')).toBe(true);
    });

    it('should register multiple services', () => {
      container.register(
        'ServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );
      container.register(
        'ServiceB',
        () => new MockServiceB(new MockServiceA()),
        ServiceLifetime.SINGLETON,
      );

      expect(container.has('ServiceA')).toBe(true);
      expect(container.has('ServiceB')).toBe(true);
    });

    it('should support symbol tokens', () => {
      const token = Symbol('MockService');
      container.register(
        token,
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      expect(container.has(token)).toBe(true);
    });
  });

  describe('Service Resolution', () => {
    it('should resolve a registered service', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      const service = container.resolve<MockServiceA>('MockServiceA');

      expect(service).toBeInstanceOf(MockServiceA);
      expect(service.name).toBe('ServiceA');
    });

    it('should throw error when resolving unregistered service', () => {
      expect(() => {
        container.resolve('NonExistent');
      }).toThrow('Service not registered: NonExistent');
    });

    it('should support dependency injection', () => {
      container.register(
        'ServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      container.register(
        'ServiceB',
        (c) => new MockServiceB(c.resolve<MockServiceA>('ServiceA')),
        ServiceLifetime.SINGLETON,
      );

      const serviceB = container.resolve<MockServiceB>('ServiceB');

      expect(serviceB).toBeInstanceOf(MockServiceB);
      expect(serviceB.serviceA).toBeInstanceOf(MockServiceA);
      expect(serviceB.name).toBe('ServiceB');
    });
  });

  describe('Service Lifetimes', () => {
    it('should return same instance for singleton services', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      const instance1 = container.resolve<MockServiceA>('MockServiceA');
      const instance2 = container.resolve<MockServiceA>('MockServiceA');

      expect(instance1).toBe(instance2);
    });

    it('should return new instance for transient services', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA(),
        ServiceLifetime.TRANSIENT,
      );

      const instance1 = container.resolve<MockServiceA>('MockServiceA');
      const instance2 = container.resolve<MockServiceA>('MockServiceA');

      expect(instance1).not.toBe(instance2);
      expect(instance1).toBeInstanceOf(MockServiceA);
      expect(instance2).toBeInstanceOf(MockServiceA);
    });
  });

  describe('Service Replacement', () => {
    it('should replace a registered service', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA('Original'),
        ServiceLifetime.SINGLETON,
      );

      const original = container.resolve<MockServiceA>('MockServiceA');
      expect(original.name).toBe('Original');

      container.replace(
        'MockServiceA',
        () => new MockServiceA('Replaced'),
        ServiceLifetime.SINGLETON,
      );

      const replaced = container.resolve<MockServiceA>('MockServiceA');
      expect(replaced.name).toBe('Replaced');
      expect(replaced).not.toBe(original);
    });
  });

  describe('Service Unregistration', () => {
    it('should unregister a service', () => {
      container.register(
        'MockServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      expect(container.has('MockServiceA')).toBe(true);

      container.unregister('MockServiceA');

      expect(container.has('MockServiceA')).toBe(false);
    });
  });

  describe('Container Management', () => {
    it('should clear all services', () => {
      container.register(
        'ServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );
      container.register(
        'ServiceB',
        () => new MockServiceB(new MockServiceA()),
        ServiceLifetime.SINGLETON,
      );

      expect(container.has('ServiceA')).toBe(true);
      expect(container.has('ServiceB')).toBe(true);

      container.clear();

      expect(container.has('ServiceA')).toBe(false);
      expect(container.has('ServiceB')).toBe(false);
    });

    it('should return all registered tokens', () => {
      container.register(
        'ServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );
      container.register(
        'ServiceB',
        () => new MockServiceB(new MockServiceA()),
        ServiceLifetime.SINGLETON,
      );

      const tokens = container.getRegisteredTokens();

      expect(tokens).toHaveLength(2);
      expect(tokens).toContain('ServiceA');
      expect(tokens).toContain('ServiceB');
    });
  });

  describe('Service Tokens', () => {
    it('should have predefined service tokens', () => {
      expect(ServiceToken.LOG_SERVICE).toBeDefined();
      expect(ServiceToken.CONFIG_SERVICE).toBeDefined();
      expect(ServiceToken.PROVIDER_CLIENT).toBeDefined();
      expect(ServiceToken.ROOT_CLIENT).toBeDefined();
      expect(ServiceToken.ROOT_CLIENT).toBeDefined();
      expect(ServiceToken.ROOT_SERVICE).toBeDefined();
      expect(ServiceToken.PROVIDER_SERVICE).toBeDefined();
      expect(ServiceToken.RENDER_SERVICE).toBeDefined();
    });

    it('should use symbols for type-safe tokens', () => {
      expect(typeof ServiceToken.LOG_SERVICE).toBe('symbol');
      expect(typeof ServiceToken.CONFIG_SERVICE).toBe('symbol');
    });
  });

  describe('Testing Support', () => {
    it('should support mocking services for tests', () => {
      // Register real service
      container.register(
        'ServiceA',
        () => new MockServiceA('Real'),
        ServiceLifetime.SINGLETON,
      );

      // Use service
      const realService = container.resolve<MockServiceA>('ServiceA');
      expect(realService.name).toBe('Real');

      // Replace with mock for testing
      container.replace(
        'ServiceA',
        () => new MockServiceA('Mock'),
        ServiceLifetime.SINGLETON,
      );

      const mockService = container.resolve<MockServiceA>('ServiceA');
      expect(mockService.name).toBe('Mock');
    });

    it('should allow creating isolated test containers', () => {
      const testContainer = new Container();

      testContainer.register(
        'MockServiceA',
        () => new MockServiceA('Test'),
        ServiceLifetime.SINGLETON,
      );

      const service = testContainer.resolve<MockServiceA>('MockServiceA');
      expect(service.name).toBe('Test');

      // Original container is unaffected
      expect(container.has('MockServiceA')).toBe(false);
    });
  });

  describe('Complex Dependency Graph', () => {
    it('should resolve complex dependency chains', () => {
      class ServiceC {
        constructor(
          public serviceA: MockServiceA,
          public serviceB: MockServiceB,
        ) {}
      }

      container.register(
        'ServiceA',
        () => new MockServiceA(),
        ServiceLifetime.SINGLETON,
      );

      container.register(
        'ServiceB',
        (c) => new MockServiceB(c.resolve<MockServiceA>('ServiceA')),
        ServiceLifetime.SINGLETON,
      );

      container.register(
        'ServiceC',
        (c) =>
          new ServiceC(
            c.resolve<MockServiceA>('ServiceA'),
            c.resolve<MockServiceB>('ServiceB'),
          ),
        ServiceLifetime.SINGLETON,
      );

      const serviceC = container.resolve<ServiceC>('ServiceC');

      expect(serviceC.serviceA).toBeInstanceOf(MockServiceA);
      expect(serviceC.serviceB).toBeInstanceOf(MockServiceB);
      expect(serviceC.serviceB.serviceA).toBe(serviceC.serviceA); // Same singleton instance
    });
  });
});
