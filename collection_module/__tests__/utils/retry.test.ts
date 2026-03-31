/**
 * Retry Utility Tests
 */

import {
  retryWithBackoff,
  retryWithJitter,
  retryForErrors,
  retryForNetworkErrors,
  sleep,
} from '../../code/utils/retry';

describe('Retry Utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const promise = retryWithBackoff(operation);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Always fails'));

      const promise = retryWithBackoff(operation, {
        maxRetries: 2,
        initialDelay: 100,
      });

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Always fails');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, {
        initialDelay: 100,
        backoffMultiplier: 2,
      });

      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should respect maxDelay', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation, {
        initialDelay: 1000,
        maxDelay: 1500,
        backoffMultiplier: 3,
      });

      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1500);
      expect(operation).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('success');
    });

    it('should call shouldRetry predicate', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Retryable'))
        .mockRejectedValueOnce(new Error('Not retryable'));

      const shouldRetry = jest.fn((error: Error) => {
        return error.message === 'Retryable';
      });

      const promise = retryWithBackoff(operation, {
        shouldRetry,
        initialDelay: 100,
      });

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Not retryable');
      expect(operation).toHaveBeenCalledTimes(2);
      expect(shouldRetry).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      const promise = retryWithBackoff(operation, {
        onRetry,
        initialDelay: 100,
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
    });

    it('should use default options', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const promise = retryWithBackoff(operation);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const promise = sleep(1000);
      
      await jest.advanceTimersByTimeAsync(999);
      expect(promise).not.toHaveProperty('resolvedValue');

      await jest.advanceTimersByTimeAsync(1);
      await promise;
    });
  });

  describe('retryWithJitter', () => {
    it('should add jitter to retry delay', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const promise = retryWithJitter(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should call custom onRetry after jitter', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValue('success');

      const customOnRetry = jest.fn();

      const promise = retryWithJitter(operation, {
        initialDelay: 100,
        onRetry: customOnRetry,
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(customOnRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryForErrors', () => {
    it('should retry only for specified error codes', async () => {
      const retryableError: any = new Error('Network error');
      retryableError.code = 'NETWORK_ERROR';

      const nonRetryableError: any = new Error('Auth error');
      nonRetryableError.code = 'AUTH_ERROR';

      const operation = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(nonRetryableError);

      const promise = retryForErrors(
        operation,
        ['NETWORK_ERROR', 'TIMEOUT'],
        { initialDelay: 100 }
      );

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Auth error');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should check statusCode as string', async () => {
      const error: any = new Error('Server error');
      error.statusCode = 500;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForErrors(operation, ['500'], { initialDelay: 100 });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should not retry if error code not in list', async () => {
      const error: any = new Error('Unknown error');
      error.code = 'UNKNOWN';

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryForErrors(operation, ['NETWORK_ERROR']);

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Unknown error');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryForNetworkErrors', () => {
    it('should retry on ECONNREFUSED', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForNetworkErrors(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on ETIMEDOUT', async () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForNetworkErrors(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should retry on ENOTFOUND', async () => {
      const error: any = new Error('Not found');
      error.code = 'ENOTFOUND';

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForNetworkErrors(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should retry on 5xx errors', async () => {
      const error: any = new Error('Server error');
      error.statusCode = 503;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForNetworkErrors(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should retry on 429 rate limit', async () => {
      const error: any = new Error('Rate limited');
      error.statusCode = 429;

      const operation = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const promise = retryForNetworkErrors(operation, { initialDelay: 100 });
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should not retry on 4xx client errors (except 429)', async () => {
      const error: any = new Error('Bad request');
      error.statusCode = 400;

      const operation = jest.fn().mockRejectedValue(error);

      const promise = retryForNetworkErrors(operation);

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Bad request');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });
});
