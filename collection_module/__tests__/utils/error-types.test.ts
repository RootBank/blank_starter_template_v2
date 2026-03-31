/**
 * Error Types Tests
 */

import {
  ErrorCategory,
  EnhancedModuleError,
  ValidationError,
  NotFoundError,
  NetworkError,
  ServerError,
  TimeoutError,
  RateLimitError,
  categorizeError,
  isRetryableError,
  formatErrorForLogging,
} from '../../code/utils/error-types';

describe('Error Types', () => {
  describe('EnhancedModuleError', () => {
    it('should create error with default values', () => {
      const error = new EnhancedModuleError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('EnhancedModuleError');
      expect(error.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.retryable).toBe(false);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create error with custom values', () => {
      const error = new EnhancedModuleError(
        'Custom error',
        ErrorCategory.VALIDATION,
        true,
        400,
        { field: 'email' }
      );

      expect(error.message).toBe('Custom error');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ field: 'email' });
    });

    it('should add request tracking information', () => {
      const error = new EnhancedModuleError('Test');
      error.withRequestId('req_123', 'corr_456');

      expect(error.requestId).toBe('req_123');
      expect(error.correlationId).toBe('corr_456');
    });

    it('should use requestId as correlationId if not provided', () => {
      const error = new EnhancedModuleError('Test');
      error.withRequestId('req_123');

      expect(error.requestId).toBe('req_123');
      expect(error.correlationId).toBe('req_123');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Invalid input');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(400);
    });

    it('should accept context', () => {
      const error = new ValidationError('Invalid', { field: 'email' });

      expect(error.context).toEqual({ field: 'email' });
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error', () => {
      const error = new NotFoundError('Resource not found');

      expect(error.message).toBe('Resource not found');
      expect(error.category).toBe(ErrorCategory.NOT_FOUND);
      expect(error.retryable).toBe(false);
      expect(error.statusCode).toBe(404);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');

      expect(error.message).toBe('Connection failed');
      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.retryable).toBe(true);
    });
  });

  describe('ServerError', () => {
    it('should create server error', () => {
      const error = new ServerError('Internal server error');

      expect(error.message).toBe('Internal server error');
      expect(error.category).toBe(ErrorCategory.SERVER_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('Request timeout');

      expect(error.message).toBe('Request timeout');
      expect(error.category).toBe(ErrorCategory.TIMEOUT);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(504);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.message).toBe('Too many requests');
      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(429);
    });
  });

  describe('categorizeError', () => {
    it('should categorize EnhancedModuleError', () => {
      const error = new ValidationError('Test');
      expect(categorizeError(error)).toBe(ErrorCategory.VALIDATION);
    });

    it('should categorize unknown errors', () => {
      const error = new Error('Generic error');
      expect(categorizeError(error)).toBe(ErrorCategory.UNKNOWN);
    });

    it('should categorize timeout errors by message', () => {
      const error = new Error('Request timeout');
      expect(categorizeError(error)).toBe(ErrorCategory.TIMEOUT);
    });

    it('should categorize network errors by code', () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      expect(categorizeError(error)).toBe(ErrorCategory.NETWORK);
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const error = new NetworkError('Connection failed');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const error = new ValidationError('Invalid input');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should handle non-EnhancedModuleError', () => {
      const error = new Error('Generic');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('formatErrorForLogging', () => {
    it('should format EnhancedModuleError', () => {
      const error = new ValidationError('Test', { field: 'email' });
      error.withRequestId('req_123');

      const formatted = formatErrorForLogging(error);

      expect(formatted.name).toBe('ValidationError');
      expect(formatted.message).toBe('Test');
      expect(formatted.category).toBe(ErrorCategory.VALIDATION);
      expect(formatted.retryable).toBe(false);
      expect(formatted.statusCode).toBe(400);
      expect(formatted.requestId).toBe('req_123');
      expect(formatted.context).toEqual({ field: 'email' });
    });

    it('should format generic errors', () => {
      const error = new Error('Generic error');

      const formatted = formatErrorForLogging(error);

      expect(formatted.name).toBe('Error');
      expect(formatted.message).toBe('Generic error');
      expect(formatted.category).toBe(ErrorCategory.UNKNOWN);
    });
  });
});
