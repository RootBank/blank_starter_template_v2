/**
 * Timeout Utility Tests
 */

import {
  withTimeout,
  withTimeoutFallback,
  withTimeoutError,
  TimeoutError,
} from '../../code/utils/timeout';

describe('Timeout Utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withTimeout', () => {
    it('should return result if operation completes before timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100);
      });

      const promise = withTimeout(operation, 200);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should throw timeout error if operation exceeds timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeout(operation, 100);

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation timeout');
    });

    it('should propagate operation errors', async () => {
      const operation = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation failed')), 50);
      });

      const promise = withTimeout(operation, 200);

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation failed');
    });

    it('should handle immediately resolved promise', async () => {
      const operation = Promise.resolve('immediate');

      const result = await withTimeout(operation, 100);

      expect(result).toBe('immediate');
    });

    it('should handle immediately rejected promise', async () => {
      const operation = Promise.reject(new Error('immediate error'));

      await expect(withTimeout(operation, 100)).rejects.toThrow(
        'immediate error'
      );
    });
  });

  describe('withTimeoutFallback', () => {
    it('should return result if operation completes before timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100);
      });

      const promise = withTimeoutFallback(operation, 200, 'fallback');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should return fallback value on timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutFallback(operation, 100, 'fallback');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('fallback');
    });

    it('should return fallback object on timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve({ data: 'real' }), 300);
      });

      const fallback = { data: 'fallback' };
      const promise = withTimeoutFallback(operation, 100, fallback);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual(fallback);
    });

    it('should propagate operation errors', async () => {
      const operation = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation failed')), 50);
      });

      const promise = withTimeoutFallback(operation, 200, 'fallback');

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation failed');
    });

    it('should handle null fallback value', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutFallback(operation, 100, null);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeNull();
    });

    it('should handle undefined fallback value', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutFallback(operation, 100, undefined as any);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should create error with timeout info', () => {
      const error = new TimeoutError('Custom timeout', 5000, 'fetchData');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Custom timeout');
      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('fetchData');
    });

    it('should create error without operation name', () => {
      const error = new TimeoutError('Timeout occurred', 3000);

      expect(error.timeoutMs).toBe(3000);
      expect(error.operation).toBeUndefined();
    });
  });

  describe('withTimeoutError', () => {
    it('should return result if operation completes', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100);
      });

      const promise = withTimeoutError(operation, 200, 'Timeout', 'testOp');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });

    it('should throw TimeoutError on timeout', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutError(
        operation,
        100,
        'Custom timeout message',
        'myOperation'
      );

      jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toThrow('Custom timeout message');
      
      try {
        await promise;
      } catch (error) {
        expect((error as TimeoutError).timeoutMs).toBe(100);
        expect((error as TimeoutError).operation).toBe('myOperation');
      }
    });

    it('should use default message if not provided', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutError(operation, 100);

      jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toThrow('Operation timeout');
    });

    it('should propagate operation errors', async () => {
      const operation = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Operation failed')), 50);
      });

      const promise = withTimeoutError(operation, 200, 'Timeout');

      jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation failed');
    });

    it('should work without operation name', async () => {
      const operation = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 300);
      });

      const promise = withTimeoutError(operation, 100, 'Timed out');

      jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(TimeoutError);
      
      try {
        await promise;
      } catch (error) {
        expect((error as TimeoutError).operation).toBeUndefined();
      }
    });
  });
});
