/**
 * Log Instance Tests
 */

import {
  getLogService,
  isLogServiceInitialized,
} from '../../code/services/log-instance';

describe('Log Instance', () => {
  describe('getLogService', () => {
    it('should return a LogService instance', () => {
      const service = getLogService();

      expect(service).toBeDefined();
      expect(service.info).toBeDefined();
      expect(service.debug).toBeDefined();
      expect(service.warn).toBeDefined();
      expect(service.error).toBeDefined();
    });

    it('should return the same instance on multiple calls', () => {
      const service1 = getLogService();
      const service2 = getLogService();

      expect(service1).toBe(service2);
    });
  });

  describe('isLogServiceInitialized', () => {
    it('should return true after getLogService is called', () => {
      getLogService();

      expect(isLogServiceInitialized()).toBe(true);
    });
  });
});
