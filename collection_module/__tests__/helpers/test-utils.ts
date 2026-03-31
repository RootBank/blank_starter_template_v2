/**
 * Test utilities and helper functions
 */

/**
 * Wait for a specified amount of time
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Mock timer utilities
 */
export const mockTimers = {
  enable: () => {
    jest.useFakeTimers();
  },
  disable: () => {
    jest.useRealTimers();
  },
  advance: (ms: number) => {
    jest.advanceTimersByTime(ms);
  },
  runAll: () => {
    jest.runAllTimers();
  },
};

/**
 * Create a mock function with type safety
 */
export const createMockFn = <
  T extends (...args: any[]) => any,
>(): jest.MockedFunction<T> => {
  return jest.fn() as unknown as jest.MockedFunction<T>;
};

/**
 * Assert that a function throws a specific error
 */
export const expectToThrow = async (
  fn: () => any,
  errorMessage?: string | RegExp
): Promise<void> => {
  await expect(fn()).rejects.toThrow(errorMessage);
};

/**
 * Create a spy on console methods
 */
export const spyOnConsole = (
  method: 'log' | 'info' | 'warn' | 'error' | 'debug'
) => {
  return jest.spyOn(console, method).mockImplementation(() => {});
};

/**
 * Restore all console spies
 */
export const restoreConsole = () => {
  jest.restoreAllMocks();
};
