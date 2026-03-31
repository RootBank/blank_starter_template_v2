/**
 * Config Instance Tests
 */

import {
  getConfigService,
  isConfigServiceInitialized,
} from '../../code/services/config-instance';

describe('Config Instance', () => {
  describe('getConfigService', () => {
    it('should return a ConfigurationService instance', () => {
      const service = getConfigService();

      expect(service).toBeDefined();
      expect(service.get).toBeDefined();
      expect(typeof service.get).toBe('function');
    });

    it('should return the same instance on multiple calls', () => {
      const service1 = getConfigService();
      const service2 = getConfigService();

      expect(service1).toBe(service2);
    });
  });

  describe('isConfigServiceInitialized', () => {
    it('should return true after getConfigService is called', () => {
      getConfigService();

      expect(isConfigServiceInitialized()).toBe(true);
    });
  });
});
