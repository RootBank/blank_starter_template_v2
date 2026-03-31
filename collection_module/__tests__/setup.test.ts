/**
 * Test to verify Jest setup is working correctly
 */

describe('Jest Setup', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should have test environment variables configured', () => {
    expect(process.env.ENVIRONMENT).toBe('sandbox');
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.ROOT_COLLECTION_MODULE_KEY).toBe(
      'test_collection_module',
    );
  });

  it('should have mock timers available', () => {
    jest.useFakeTimers();
    const callback = jest.fn();

    setTimeout(callback, 1000);
    expect(callback).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
