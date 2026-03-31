/**
 * Collection Module Main Entry Point
 *
 * This is the main entry point for the collection module.
 * It initializes the DI container and exports lifecycle hooks.
 */

import { getContainer } from './core/container.setup';

// Initialize the DI container on module load
// This sets up all services including ConfigurationService and LogService
getContainer();

// Export lifecycle hooks and webhook handlers
export * from './lifecycle-hooks/';
export * from './webhook-hooks';
