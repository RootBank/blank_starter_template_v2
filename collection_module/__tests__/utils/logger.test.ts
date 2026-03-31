/**
 * Logger Tests
 */

jest.mock('../../code/services/config-instance');

import Logger from '../../code/utils/logger';
import { setupConfigMock } from '../test-helpers';

describe('Logger', () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    setupConfigMock();

    // Spy on console methods
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleDebugSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('debug', () => {
    it('should log debug message', () => {
      Logger.debug('Debug message');

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should include environment in log', () => {
      Logger.debug('Test message');

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST')
      );
    });

    it('should include metadata', () => {
      const metadata = { userId: '123', action: 'create' };
      Logger.debug('Message with metadata', metadata);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(metadata))
      );
    });

    it('should work without metadata', () => {
      Logger.debug('Message without metadata');

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message without metadata')
      );
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      Logger.info('Info message');

      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
    });

    it('should include environment in log', () => {
      Logger.info('Test message');

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST')
      );
    });

    it('should include metadata', () => {
      const metadata = { status: 'success', count: 42 };
      Logger.info('Operation completed', metadata);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(metadata))
      );
    });

    it('should handle complex metadata', () => {
      const metadata = {
        user: { id: '123', name: 'Test' },
        items: [1, 2, 3],
        active: true,
      };
      Logger.info('Complex metadata', metadata);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(metadata))
      );
    });
  });

  describe('warn', () => {
    it('should log warn message', () => {
      Logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning message')
      );
    });

    it('should include environment in log', () => {
      Logger.warn('Test warning');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[TEST')
      );
    });

    it('should include metadata', () => {
      const metadata = { error: 'deprecated_api', version: '1.0' };
      Logger.warn('Deprecated API usage', metadata);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(metadata))
      );
    });
  });

  describe('caller information', () => {
    it('should extract caller information from stack trace', () => {
      Logger.info('Test caller');

      // Should include caller information in the format [ENV | caller]
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TEST \|.*\]/)
      );
    });
  });

  describe('metadata serialization', () => {
    it('should handle empty metadata', () => {
      Logger.info('Empty metadata', {});

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('{}')
      );
    });

    it('should handle undefined metadata', () => {
      Logger.info('Undefined metadata', undefined);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('undefined')
      );
    });

    it('should handle nested objects', () => {
      const metadata = {
        level1: {
          level2: {
            level3: 'deep',
          },
        },
      };
      Logger.info('Nested metadata', metadata);

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(metadata))
      );
    });
  });
});
