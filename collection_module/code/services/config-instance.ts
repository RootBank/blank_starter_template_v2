/**
 * Configuration Instance Helper
 *
 * Provides easy access to the ConfigurationService from the DI container.
 * This is a convenience wrapper similar to log-instance.ts
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { ConfigurationService } from './config.service';

/**
 * Get the ConfigurationService instance from the container
 *
 * @returns ConfigurationService instance
 * @throws Error if container is not initialized
 *
 * @example
 * ```typescript
 * import { getConfigService } from './services/config-instance';
 *
 * const config = getConfigService();
 * const apiKey = config.get('providerSecretKey');
 * ```
 */
export function getConfigService(): ConfigurationService {
  const container = getContainer();
  return container.resolve<ConfigurationService>(ServiceToken.CONFIG_SERVICE);
}

/**
 * Check if ConfigurationService is initialized in the container
 *
 * @returns true if ConfigurationService is available
 */
export function isConfigServiceInitialized(): boolean {
  try {
    const container = getContainer();
    return container.has(ServiceToken.CONFIG_SERVICE);
  } catch {
    return false;
  }
}
