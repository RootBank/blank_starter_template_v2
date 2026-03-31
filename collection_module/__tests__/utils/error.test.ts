/**
 * ModuleError Tests
 */

jest.mock('../../code/services/config-instance');

import ModuleError from '../../code/utils/error';
import { setupConfigMock } from '../test-helpers';

describe('ModuleError', () => {
  beforeEach(() => {
    setupConfigMock();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('should create error with message', () => {
    const error = new ModuleError('Test error');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ModuleError);
    expect(error.message).toContain('Test error');
  });

  it('should include environment in message', () => {
    const error = new ModuleError('Test error');

    expect(error.message).toContain('[test');
  });

  it('should include metadata in message', () => {
    const metadata = { userId: '123', action: 'create' };
    const error = new ModuleError('Operation failed', metadata);

    expect(error.message).toContain('Operation failed');
    expect(error.message).toContain(JSON.stringify(metadata));
  });

  it('should include caller information in message', () => {
    const error = new ModuleError('Test');

    // Message should include caller info from stack trace
    expect(error.message).toMatch(/\[test \|.*\]/);
  });

  it('should handle metadata with various types', () => {
    const metadata = {
      string: 'value',
      number: 42,
      boolean: true,
      array: [1, 2, 3],
      nested: { key: 'value' },
    };
    const error = new ModuleError('Complex metadata', metadata);

    expect(error.message).toContain(JSON.stringify(metadata));
  });

  it('should handle empty metadata', () => {
    const error = new ModuleError('No metadata', {});

    expect(error.message).toContain('No metadata');
    expect(error.message).toContain('{}');
  });

  it('should handle undefined metadata', () => {
    const error = new ModuleError('Undefined metadata', undefined);

    expect(error.message).toContain('Undefined metadata');
  });

  it('should have stack trace', () => {
    const error = new ModuleError('Test error');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('Test error');
  });
});
