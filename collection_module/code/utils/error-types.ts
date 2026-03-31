/**
 * Enhanced Error Types with Request Tracking
 *
 * Provides structured error types with categorization, retry logic, and request tracking.
 */

/**
 * Error Categories
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  SERVER_ERROR = 'server_error',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown',
}

/**
 * Enhanced module error with request tracking
 */
export class EnhancedModuleError extends Error {
  public readonly timestamp: Date;
  public requestId?: string;
  public correlationId?: string;

  constructor(
    message: string,
    public readonly category: ErrorCategory = ErrorCategory.UNKNOWN,
    public readonly retryable: boolean = false,
    public readonly statusCode?: number,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'EnhancedModuleError';
    this.timestamp = new Date();
    Error.captureStackTrace(this, EnhancedModuleError);
  }

  /**
   * Add request tracking information
   */
  withRequestId(requestId: string, correlationId?: string): this {
    this.requestId = requestId;
    this.correlationId = correlationId || requestId;
    return this;
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      retryable: this.retryable,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      requestId: this.requestId,
      correlationId: this.correlationId,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.VALIDATION, false, 400, context);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.NOT_FOUND, false, 404, context);
    this.name = 'NotFoundError';
  }
}

/**
 * Network error
 */
export class NetworkError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.NETWORK, true, 503, context);
    this.name = 'NetworkError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.TIMEOUT, true, 504, context);
    this.name = 'TimeoutError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.RATE_LIMIT, true, 429, context);
    this.name = 'RateLimitError';
  }
}

/**
 * Server error
 */
export class ServerError extends EnhancedModuleError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, ErrorCategory.SERVER_ERROR, true, 500, context);
    this.name = 'ServerError';
  }
}

/**
 * Categorize an unknown error
 */
export function categorizeError(error: any): ErrorCategory {
  // Already categorized
  if (error instanceof EnhancedModuleError) {
    return error.category;
  }

  // HTTP status codes
  if (error.statusCode) {
    if (error.statusCode === 404) return ErrorCategory.NOT_FOUND;
    if (error.statusCode === 401 || error.statusCode === 403)
      return ErrorCategory.AUTHENTICATION;
    if (error.statusCode === 429) return ErrorCategory.RATE_LIMIT;
    if (error.statusCode >= 500) return ErrorCategory.SERVER_ERROR;
    if (error.statusCode >= 400) return ErrorCategory.VALIDATION;
  }

  // Network errors
  if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'NETWORK_ERROR'
  ) {
    return ErrorCategory.NETWORK;
  }

  // Timeout errors
  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return ErrorCategory.TIMEOUT;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Check if error should be retried
 */
export function isRetryableError(error: any): boolean {
  // Module errors have explicit retryable flag
  if (error instanceof EnhancedModuleError) {
    return error.retryable;
  }

  // Categorize and check
  const category = categorizeError(error);

  return [
    ErrorCategory.NETWORK,
    ErrorCategory.TIMEOUT,
    ErrorCategory.RATE_LIMIT,
    ErrorCategory.SERVER_ERROR,
  ].includes(category);
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: any): Record<string, any> {
  if (error instanceof EnhancedModuleError) {
    return error.toJSON();
  }

  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    category: categorizeError(error),
    retryable: isRetryableError(error),
    statusCode: error.statusCode,
    code: error.code,
    stack: error.stack,
  };
}
