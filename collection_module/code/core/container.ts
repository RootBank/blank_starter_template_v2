/**
 * Simple Dependency Injection Container
 *
 * Provides a lightweight DI system for managing service dependencies
 * without the complexity of a full-featured DI framework.
 *
 * Features:
 * - Service registration with factory functions
 * - Singleton and transient service lifetimes
 * - Constructor injection pattern
 * - Easy testing with service replacement
 */

export enum ServiceLifetime {
  SINGLETON = 'singleton', // One instance for the lifetime of the container
  TRANSIENT = 'transient', // New instance every time
}

export interface ServiceDescriptor<T = any> {
  token: string | symbol;
  factory: (container: Container) => T;
  lifetime: ServiceLifetime;
  instance?: T; // Cached instance for singletons
}

export class Container {
  private services: Map<string | symbol, ServiceDescriptor> = new Map();

  /**
   * Register a service with the container
   *
   * @example
   * ```typescript
   * container.register(
   *   'LogService',
   *   (container) => new LogService({ environment: 'production' }),
   *   ServiceLifetime.SINGLETON
   * );
   * ```
   */
  public register<T>(
    token: string | symbol,
    factory: (container: Container) => T,
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON
  ): void {
    this.services.set(token, {
      token,
      factory,
      lifetime,
    });
  }

  /**
   * Resolve a service from the container
   *
   * @example
   * ```typescript
   * const logService = container.resolve<LogService>('LogService');
   * ```
   */
  public resolve<T>(token: string | symbol): T {
    const descriptor = this.services.get(token);

    if (!descriptor) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // Return singleton instance if it exists
    if (
      descriptor.lifetime === ServiceLifetime.SINGLETON &&
      descriptor.instance
    ) {
      return descriptor.instance as T;
    }

    // Create new instance
    const instance = descriptor.factory(this);

    // Cache singleton instance
    if (descriptor.lifetime === ServiceLifetime.SINGLETON) {
      descriptor.instance = instance;
    }

    return instance as T;
  }

  /**
   * Check if a service is registered
   */
  public has(token: string | symbol): boolean {
    return this.services.has(token);
  }

  /**
   * Unregister a service (useful for testing)
   */
  public unregister(token: string | symbol): void {
    this.services.delete(token);
  }

  /**
   * Replace a service (useful for testing/mocking)
   */
  public replace<T>(
    token: string | symbol,
    factory: (container: Container) => T,
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON
  ): void {
    this.unregister(token);
    this.register(token, factory, lifetime);
  }

  /**
   * Clear all services
   */
  public clear(): void {
    this.services.clear();
  }

  /**
   * Get all registered service tokens
   */
  public getRegisteredTokens(): (string | symbol)[] {
    return [...this.services.keys()];
  }
}

/**
 * Service tokens for type-safe resolution
 *
 * @example
 * ```typescript
 * const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);
 * ```
 */
export const ServiceToken = {
  // Core Services
  LOG_SERVICE: Symbol('LogService'),
  CONFIG_SERVICE: Symbol('ConfigService'),

  // API Clients (provider-agnostic tokens)
  // Register your scaffolded provider client and service under these tokens.
  // See: container.setup.ts for the registration pattern.
  PROVIDER_CLIENT: Symbol('ProviderClient'),
  ROOT_CLIENT: Symbol('RootClient'),

  // Business Services (provider-agnostic tokens)
  ROOT_SERVICE: Symbol('RootService'),
  PROVIDER_SERVICE: Symbol('ProviderService'),
  RENDER_SERVICE: Symbol('RenderService'),

  // Webhook processing
  WEBHOOK_PARSER: Symbol('WebhookParser'),

  // Add your controller tokens here:
  // EXAMPLE_CONTROLLER: Symbol('ExampleController'),
} as const;
