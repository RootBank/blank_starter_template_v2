/**
 * LogService Instance Helper
 *
 * Provides easy access to the LogService from the DI container.
 * The LogService is automatically initialized when the container is created.
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from './log.service';

/**
 * Get the LogService instance from the container
 *
 * @returns LogService instance
 * @throws Error if container is not initialized
 *
 * @example
 * ```typescript
 * import { getLogService } from './services/log-instance';
 *
 * const logService = getLogService();
 * logService.info('Hello, world!');
 * ```
 */
export function getLogService(): LogService {
  const container = getContainer();
  return container.resolve<LogService>(ServiceToken.LOG_SERVICE);
}

/**
 * Check if LogService is initialized in the container
 *
 * @returns true if LogService is available
 */
export function isLogServiceInitialized(): boolean {
  try {
    const container = getContainer();
    return container.has(ServiceToken.LOG_SERVICE);
  } catch {
    return false;
  }
}
