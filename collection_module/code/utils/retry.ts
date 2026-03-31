/**
 * Retry Utilities
 *
 * Provides retry logic with exponential backoff and configurable strategies.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Maximum delay in milliseconds */
  maxDelay?: number;
  /** Backoff multiplier (2 = exponential) */
  backoffMultiplier?: number;
  /** Function to determine if error should trigger retry */
  shouldRetry?: (error: any) => boolean;
  /** Callback before each retry */
  onRetry?: (attempt: number, error: any) => void | Promise<void>;
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => apiClient.call(),
 *   {
 *     maxRetries: 3,
 *     initialDelay: 1000,
 *     shouldRetry: (error) => error.statusCode >= 500
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: Error;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Call onRetry callback if provided
      if (onRetry) {
        await onRetry(attempt + 1, error);
      }

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError!;
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with jitter to prevent thundering herd
 *
 * @example
 * ```typescript
 * const result = await retryWithJitter(
 *   () => apiClient.call(),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function retryWithJitter<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(operation, {
    ...options,
    onRetry: async (attempt, error) => {
      // Add random jitter (0-50% of delay)
      const jitter = Math.random() * 0.5;
      await sleep((options.initialDelay || 1000) * jitter);

      if (options.onRetry) {
        await options.onRetry(attempt, error);
      }
    },
  });
}

/**
 * Retry only for specific error types
 *
 * @example
 * ```typescript
 * const result = await retryForErrors(
 *   () => apiClient.call(),
 *   ['NETWORK_ERROR', 'TIMEOUT'],
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function retryForErrors<T>(
  operation: () => Promise<T>,
  retryableErrorCodes: string[],
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(operation, {
    ...options,
    shouldRetry: (error) => {
      const errorCode: string =
        error.code || error.statusCode?.toString() || '';
      return retryableErrorCodes.includes(errorCode);
    },
  });
}

/**
 * Retry for network and server errors only
 *
 * @example
 * ```typescript
 * const result = await retryForNetworkErrors(
 *   () => apiClient.call()
 * );
 * ```
 */
export async function retryForNetworkErrors<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retryWithBackoff(operation, {
    ...options,
    shouldRetry: (error) => {
      // Retry on network errors
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND'
      ) {
        return true;
      }

      // Retry on 5xx errors or 429 (rate limit)
      return (
        (error.statusCode && error.statusCode >= 500) ||
        error.statusCode === 429
      );
    },
  });
}
