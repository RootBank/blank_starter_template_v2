/**
 * Timeout Utilities
 *
 * Provides timeout handling for async operations.
 */

const TIMEOUT_MESSAGE = 'Operation timeout';

/**
 * Execute an operation with a timeout
 *
 * @param operation - The async operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that resolves with operation result or rejects on timeout
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withTimeout(apiCall(), 5000);
 * } catch (error) {
 *   if (error.message === 'Operation timeout') {
 *     console.error('Operation timed out after 5 seconds');
 *   }
 * }
 * ```
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(TIMEOUT_MESSAGE)), timeoutMs)
    ),
  ]);
}

/**
 * Execute an operation with a timeout and fallback value
 *
 * @param operation - The async operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param fallbackValue - Value to return on timeout
 * @returns Promise that resolves with operation result or fallback value
 *
 * @example
 * ```typescript
 * const result = await withTimeoutFallback(
 *   apiCall(),
 *   5000,
 *   { default: true }
 * );
 * ```
 */
export async function withTimeoutFallback<T>(
  operation: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  try {
    return await withTimeout(operation, timeoutMs);
  } catch (error) {
    if (error instanceof Error && error.message === TIMEOUT_MESSAGE) {
      return fallbackValue;
    }
    throw error;
  }
}

/**
 * Create a timeout error with context
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly operation?: string
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Execute operation with timeout and custom error
 *
 * @example
 * ```typescript
 * try {
 *   await withTimeoutError(
 *     apiCall(),
 *     5000,
 *     'API call timed out',
 *     'fetchUserData'
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.error(`${error.operation} timed out after ${error.timeoutMs}ms`);
 *   }
 * }
 * ```
 */
export async function withTimeoutError<T>(
  operation: Promise<T>,
  timeoutMs: number,
  errorMessage: string = TIMEOUT_MESSAGE,
  operationName?: string
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(errorMessage, timeoutMs, operationName)),
        timeoutMs
      )
    ),
  ]);
}
