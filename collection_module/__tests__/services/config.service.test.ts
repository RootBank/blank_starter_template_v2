/**
 * ConfigurationService Tests
 */

import {
  ConfigurationService,
  EnvironmentConfig,
} from '../../code/services/config.service';

describe('ConfigurationService', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.ENVIRONMENT;
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.ENVIRONMENT = originalEnv;
    } else {
      delete process.env.ENVIRONMENT;
    }
  });

  describe('Initialization', () => {
    it('should initialize with default environment (sandbox)', () => {
      delete process.env.ENVIRONMENT;

      const config = new ConfigurationService({ skipValidation: true });

      expect(config.getEnvironment()).toBe('sandbox');
      expect(config.isSandbox()).toBe(true);
      expect(config.isProduction()).toBe(false);
    });

    it('should initialize with production environment', () => {
      process.env.ENVIRONMENT = 'production';

      const config = new ConfigurationService({ skipValidation: true });

      expect(config.getEnvironment()).toBe('production');
      expect(config.isProduction()).toBe(true);
      expect(config.isSandbox()).toBe(false);
    });

    it('should initialize with environment from options', () => {
      const config = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });

      expect(config.getEnvironment()).toBe('production');
      expect(config.isProduction()).toBe(true);
    });

    it('should prioritize options.environment over process.env.ENVIRONMENT', () => {
      process.env.ENVIRONMENT = 'sandbox';

      const config = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });

      expect(config.getEnvironment()).toBe('production');
    });
  });

  describe('Validation', () => {
    it('should throw error for invalid environment', () => {
      expect(() => {
        new ConfigurationService({ environment: 'invalid' });
      }).toThrow('Invalid ENVIRONMENT: invalid');
    });

    it('should validate environment on initialization by default', () => {
      process.env.ENVIRONMENT = 'production';

      // Should not throw with valid config
      expect(() => {
        new ConfigurationService();
      }).not.toThrow();
    });

    it('should skip validation when skipValidation is true', () => {
      // This would normally fail validation due to missing env vars
      // but with skipValidation it should work
      expect(() => {
        new ConfigurationService({
          environment: 'production',
          skipValidation: true,
        });
      }).not.toThrow();
    });
  });

  describe('Configuration Access', () => {
    let config: ConfigurationService;

    beforeEach(() => {
      config = new ConfigurationService({ skipValidation: true });
    });

    it('should get configuration values by key', () => {
      const environment = config.get('environment');
      expect(typeof environment).toBe('string');
      expect(environment).toBeDefined();
    });

    it('should get provider secret key', () => {
      const secretKey = config.get('providerSecretKey');
      expect(secretKey).toBeDefined();
    });

    it('should get root API key', () => {
      const apiKey = config.get('rootApiKey');
      expect(apiKey).toBeDefined();
    });

    it('should get all configuration', () => {
      const allConfig = config.getAll();

      expect(allConfig).toHaveProperty('environment');
      expect(allConfig).toHaveProperty('providerSecretKey');
      expect(allConfig).toHaveProperty('rootApiKey');
    });

    it('should return a copy when getting all configuration', () => {
      const config1 = config.getAll();
      const config2 = config.getAll();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe('Environment-Specific Configuration', () => {
    it('should load production configuration', () => {
      const config = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });

      expect(config.get('environment')).toBe('production');
      // Production should use the LIVE variants
      expect(config.get('providerPublishableKey')).toContain('live');
      expect(config.get('providerSecretKey')).toContain('live');
    });

    it('should load sandbox configuration', () => {
      const config = new ConfigurationService({
        environment: 'sandbox',
        skipValidation: true,
      });

      expect(config.get('environment')).toBe('sandbox');
      // Sandbox should use the TEST/sandbox variants
      expect(config.get('providerPublishableKey')).toContain('sandbox');
      expect(config.get('providerSecretKey')).toContain('sandbox');
    });

    it('should have different API keys for production vs sandbox', () => {
      const prodConfig = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });
      const sandboxConfig = new ConfigurationService({
        environment: 'sandbox',
        skipValidation: true,
      });

      expect(prodConfig.get('providerSecretKey')).not.toBe(
        sandboxConfig.get('providerSecretKey')
      );
      expect(prodConfig.get('rootApiKey')).not.toBe(
        sandboxConfig.get('rootApiKey')
      );
    });
  });

  describe('Helper Methods', () => {
    let config: ConfigurationService;

    beforeEach(() => {
      config = new ConfigurationService({ skipValidation: true });
    });

    it('should parse time delay as number', () => {
      const delayMs = config.getTimeDelayMs();

      expect(typeof delayMs).toBe('number');
      expect(delayMs).toBeGreaterThanOrEqual(0);
    });

    it('should return correct environment name', () => {
      const sandboxConfig = new ConfigurationService({
        environment: 'sandbox',
        skipValidation: true,
      });
      const prodConfig = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });

      expect(sandboxConfig.getEnvironment()).toBe('sandbox');
      expect(prodConfig.getEnvironment()).toBe('production');
    });

    it('should correctly identify production environment', () => {
      const prodConfig = new ConfigurationService({
        environment: 'production',
        skipValidation: true,
      });

      expect(prodConfig.isProduction()).toBe(true);
      expect(prodConfig.isSandbox()).toBe(false);
    });

    it('should correctly identify sandbox environment', () => {
      const sandboxConfig = new ConfigurationService({
        environment: 'sandbox',
        skipValidation: true,
      });

      expect(sandboxConfig.isSandbox()).toBe(true);
      expect(sandboxConfig.isProduction()).toBe(false);
    });
  });

  describe('Type Safety', () => {
    it('should provide type-safe configuration access', () => {
      const config = new ConfigurationService({ skipValidation: true });

      // TypeScript should ensure these are the correct types
      const environment: string = config.get('environment');
      const providerKey: string = config.get('providerSecretKey');

      expect(typeof environment).toBe('string');
      expect(typeof providerKey).toBe('string');
    });

    it('should return complete EnvironmentConfig object', () => {
      const config = new ConfigurationService({ skipValidation: true });
      const allConfig: EnvironmentConfig = config.getAll();

      // Should have all required properties
      expect(allConfig).toHaveProperty('environment');
      expect(allConfig).toHaveProperty('providerSecretKey');
      expect(allConfig).toHaveProperty('providerPublishableKey');
      expect(allConfig).toHaveProperty('providerProductId');
      expect(allConfig).toHaveProperty('providerWebhookSigningSecret');
      expect(allConfig).toHaveProperty('rootApiKey');
      expect(allConfig).toHaveProperty('rootBaseUrl');
      expect(allConfig).toHaveProperty('rootCollectionModuleKey');
      expect(allConfig).toHaveProperty('timeDelayInMilliseconds');
    });
  });

  describe('Integration with Container', () => {
    it('should be instantiable without dependencies', () => {
      // ConfigurationService should not depend on other services
      expect(() => {
        new ConfigurationService({ skipValidation: true });
      }).not.toThrow();
    });

    it('should create new instance each time (not singleton by itself)', () => {
      const config1 = new ConfigurationService({ skipValidation: true });
      const config2 = new ConfigurationService({ skipValidation: true });

      expect(config1).not.toBe(config2);
      expect(config1.getAll()).toEqual(config2.getAll());
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error for invalid environment', () => {
      expect(() => {
        new ConfigurationService({ environment: 'staging' });
      }).toThrow(/Invalid ENVIRONMENT: staging/);
    });

    it('should list valid environments in error message', () => {
      try {
        new ConfigurationService({ environment: 'invalid' });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('production');
        expect(error.message).toContain('sandbox');
      }
    });
  });
});
