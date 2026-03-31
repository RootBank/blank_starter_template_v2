/**
 * Container Setup Tests
 */

import {
  createContainer,
  getContainer,
  setContainer,
  resetContainer,
} from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';

describe('Container Setup', () => {
  describe('createContainer', () => {
    it('should create a container with core services registered', () => {
      const container = createContainer();

      expect(container).toBeDefined();
      expect(container.has(ServiceToken.CONFIG_SERVICE)).toBe(true);
      expect(container.has(ServiceToken.LOG_SERVICE)).toBe(true);
      expect(container.has(ServiceToken.ROOT_CLIENT)).toBe(true);
      expect(container.has(ServiceToken.ROOT_SERVICE)).toBe(true);
      expect(container.has(ServiceToken.RENDER_SERVICE)).toBe(true);
    });

    // PROVIDER_CLIENT and PROVIDER_SERVICE are registered after scaffolding.
    // Uncomment once you have wired your provider in container.setup.ts:
    //
    // it('should have PROVIDER_CLIENT registered', () => {
    //   const container = createContainer();
    //   expect(container.has(ServiceToken.PROVIDER_CLIENT)).toBe(true);
    // });
    //
    // it('should have PROVIDER_SERVICE registered', () => {
    //   const container = createContainer();
    //   expect(container.has(ServiceToken.PROVIDER_SERVICE)).toBe(true);
    // });

    it('should allow resolving ConfigService', () => {
      const container = createContainer();
      const configService = container.resolve(ServiceToken.CONFIG_SERVICE) as any;

      expect(configService).toBeDefined();
      expect(configService.get).toBeDefined();
    });

    it('should allow resolving LogService', () => {
      const container = createContainer();
      const logService = container.resolve(ServiceToken.LOG_SERVICE) as any;

      expect(logService).toBeDefined();
      expect(logService.info).toBeDefined();
    });
  });

  describe('getContainer', () => {
    beforeEach(() => {
      resetContainer();
    });

    it('should return a container instance', () => {
      const container = getContainer();

      expect(container).toBeDefined();
    });

    it('should return the same instance on multiple calls (singleton)', () => {
      const container1 = getContainer();
      const container2 = getContainer();

      expect(container1).toBe(container2);
    });

    it('should create container if not exists', () => {
      resetContainer();
      const container = getContainer();

      expect(container).toBeDefined();
      expect(container.has(ServiceToken.LOG_SERVICE)).toBe(true);
    });
  });

  describe('setContainer', () => {
    it('should allow setting a custom container', () => {
      const customContainer = createContainer();
      setContainer(customContainer);

      const retrieved = getContainer();
      expect(retrieved).toBe(customContainer);
    });
  });

  describe('resetContainer', () => {
    it('should reset the global container', () => {
      const container1 = getContainer();
      resetContainer();
      const container2 = getContainer();

      expect(container1).not.toBe(container2);
    });
  });
});
