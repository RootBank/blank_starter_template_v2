/**
 * ConfigurationService - Injectable configuration management
 *
 * This service provides type-safe access to environment-specific configuration.
 * It validates configuration on initialization and throws errors for missing values.
 *
 * Config field names use provider-agnostic naming (provider*) so the same
 * service works regardless of which payment provider is integrated.
 */

import * as env from '../env';

export interface EnvironmentConfig {
  timeDelayInMilliseconds: string;
  environment: Environment;
  rootCollectionModuleKey: string;
  rootApiKey: string;
  rootBaseUrl: string;
  // Provider-specific config — use generic names that work for any provider.
  providerWebhookSigningSecret: string;
  providerPublishableKey: string;
  providerSecretKey: string;
  providerProductId: string;
  providerMerchantAccount: string;
}

export interface ConfigMap {
  production: EnvironmentConfig;
  sandbox: EnvironmentConfig;
}

export interface ConfigurationServiceOptions {
  environment?: string;
  skipValidation?: boolean; // For testing
}

export enum Environment {
  PRODUCTION = 'production',
  SANDBOX = 'sandbox',
}

/**
 * ConfigurationService - Manages environment-specific configuration
 *
 * @example
 * ```typescript
 * const config = new ConfigurationService();
 * const apiKey = config.get('providerSecretKey');
 * const isProduction = config.isProduction();
 * ```
 */
export class ConfigurationService {
  private readonly configs: ConfigMap;
  private readonly environment: string;
  private readonly currentConfig: EnvironmentConfig;

  constructor(options: ConfigurationServiceOptions = {}) {
    this.environment =
      options.environment || process.env.ENVIRONMENT || Environment.SANDBOX;
    this.configs = this.buildConfigMap();

    if (!options.skipValidation) {
      this.validateEnvironment();
    }

    this.currentConfig = this.configs[this.environment as keyof ConfigMap];
  }

  /**
   * Build configuration map from environment variables
   *
   * Maps PROVIDER_* env vars to generic providerX config fields.
   * When switching providers, update env.ts with the new provider's values.
   */
  private buildConfigMap(): ConfigMap {
    const baseConfig = {
      timeDelayInMilliseconds: env.TIME_DELAY_IN_MILLISECONDS,
      rootCollectionModuleKey: env.ROOT_COLLECTION_MODULE_KEY,
      environment: this.environment,
    };

    const production: EnvironmentConfig = {
      ...baseConfig,
      environment: Environment.PRODUCTION,
      providerWebhookSigningSecret: env.PROVIDER_WEBHOOK_SIGNING_SECRET_LIVE,
      providerPublishableKey: env.PROVIDER_PUBLISHABLE_KEY_LIVE,
      providerSecretKey: env.PROVIDER_SECRET_KEY_LIVE,
      providerProductId: env.PROVIDER_PRODUCT_ID_LIVE,
      providerMerchantAccount: env.PROVIDER_MERCHANT_ACCOUNT_LIVE,
      rootApiKey: env.ROOT_API_KEY_LIVE,
      rootBaseUrl: env.ROOT_BASE_URL_LIVE,
    };

    const sandbox: EnvironmentConfig = {
      ...baseConfig,
      environment: Environment.SANDBOX,
      providerWebhookSigningSecret: env.PROVIDER_WEBHOOK_SIGNING_SECRET_TEST,
      providerPublishableKey: env.PROVIDER_PUBLISHABLE_KEY_TEST,
      providerSecretKey: env.PROVIDER_SECRET_KEY_TEST,
      providerProductId: env.PROVIDER_PRODUCT_ID_TEST,
      providerMerchantAccount: env.PROVIDER_MERCHANT_ACCOUNT_TEST,
      rootApiKey: env.ROOT_API_KEY_SANDBOX,
      rootBaseUrl: env.ROOT_BASE_URL_SANDBOX,
    };

    return {
      production,
      sandbox,
    };
  }

  /**
   * Validate that environment is set correctly and all config values are present
   */
  private validateEnvironment(): void {
    if (!this.environment) {
      throw new Error(
        'ENVIRONMENT is not set. Set ENVIRONMENT=production or ENVIRONMENT=sandbox'
      );
    }

    const validEnvironments = Object.keys(this.configs);

    if (!validEnvironments.includes(this.environment)) {
      throw new Error(
        `Invalid ENVIRONMENT: ${
          this.environment
        }. Valid values: ${validEnvironments.join(', ')}`
      );
    }

    const config = this.configs[this.environment as keyof ConfigMap];
    const missingKeys: string[] = [];
    const invalidUrls: string[] = [];

    // Check for missing values
    for (const [key, value] of Object.entries(config)) {
      if (value === '' || value === null || value === undefined) {
        missingKeys.push(key);
      }
    }

    // Validate URL formats
    if (config.rootBaseUrl && !this.isValidUrl(config.rootBaseUrl)) {
      invalidUrls.push(`rootBaseUrl: "${config.rootBaseUrl}"`);
    }

    // Combine validation errors
    const errors: string[] = [];

    if (missingKeys.length > 0) {
      errors.push(
        `Missing required configuration values for ${
          this.environment
        }: ${missingKeys.join(', ')}`,
        'Hint: Check that code/env.ts is properly configured with all required values.',
        'For AWS Lambda: Ensure all environment variables are set in Lambda configuration.'
      );
    }

    if (invalidUrls.length > 0) {
      errors.push(`Invalid URL format(s): ${invalidUrls.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  /**
   * Get a configuration value by key
   */
  public get<K extends keyof EnvironmentConfig>(key: K): EnvironmentConfig[K] {
    return this.currentConfig[key];
  }

  /**
   * Get the entire current configuration object
   */
  public getAll(): EnvironmentConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get the current environment name
   */
  public getEnvironment(): string {
    return this.environment;
  }

  /**
   * Check if running in production
   */
  public isProduction(): boolean {
    return this.environment === Environment.PRODUCTION.toString();
  }

  /**
   * Check if running in sandbox
   */
  public isSandbox(): boolean {
    return this.environment === Environment.SANDBOX.toString();
  }

  /**
   * @deprecated Use isSandbox() instead. This method is kept for backwards compatibility.
   */
  public isDevelopment(): boolean {
    return this.isSandbox();
  }

  /**
   * Get time delay in milliseconds as a number
   */
  public getTimeDelayMs(): number {
    return parseInt(this.currentConfig.timeDelayInMilliseconds, 10);
  }
}
