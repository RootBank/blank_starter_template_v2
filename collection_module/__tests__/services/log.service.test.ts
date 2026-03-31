/**
 * LogService Tests
 */

import { LogService, LogLevel } from '../../code/services/log.service';

describe('LogService', () => {
  let logService: LogService;
  let consoleDebugSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logService = new LogService({
      environment: 'test',
    });

    // Spy on console methods
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Logging', () => {
    it('should log debug messages', () => {
      logService.debug('Test debug message', 'TestContext');

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleDebugSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('DEBUG');
      expect(logOutput.message).toBe('Test debug message');
      expect(logOutput.context).toBe('TestContext');
    });

    it('should log info messages', () => {
      logService.info('Test info message');

      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Test info message');
    });

    it('should log warning messages', () => {
      logService.warn('Test warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.message).toBe('Test warning message');
    });

    it('should log error messages', () => {
      const testError = new Error('Test error');
      logService.error('Test error message', 'ErrorContext', {}, testError);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.message).toBe('Test error message');
      expect(logOutput.error.message).toBe('Test error');
      expect(logOutput.error.stack).toBeDefined();
    });

    it('should include metadata in logs', () => {
      const metadata = { userId: '123', action: 'test' };
      logService.info('Test with metadata', 'TestContext', metadata);

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.metadata).toEqual(metadata);
    });

    it('should include environment in logs', () => {
      logService.info('Test environment');

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.environment).toBe('test');
    });
  });

  describe('Correlation IDs', () => {
    it('should generate and set correlation ID', () => {
      const correlationId = logService.generateCorrelationId();

      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(logService.getCorrelationId()).toBe(correlationId);
    });

    it('should include correlation ID in logs', () => {
      const correlationId = logService.generateCorrelationId();
      logService.info('Test with correlation ID');

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.correlationId).toBe(correlationId);
    });

    it('should allow setting custom correlation ID', () => {
      logService.setCorrelationId('custom-correlation-id');

      expect(logService.getCorrelationId()).toBe('custom-correlation-id');

      logService.info('Test message');
      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(logOutput.correlationId).toBe('custom-correlation-id');
    });

    it('should clear correlation ID', () => {
      logService.setCorrelationId('test-id');
      logService.clearCorrelationId();

      expect(logService.getCorrelationId()).toBeNull();
    });
  });

  // Buffer management tests removed - LogService now only outputs to stdout

  describe('Log Level Filtering', () => {
    it('should respect minimum log level', () => {
      const infoOnlyService = new LogService({
        environment: 'test',
        minLogLevel: LogLevel.INFO,
      });

      // Spy on console again for the new service
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      const infoSpy = jest.spyOn(console, 'info').mockImplementation();

      infoOnlyService.debug('Debug message');
      infoOnlyService.info('Info message');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalledTimes(1);

      debugSpy.mockRestore();
      infoSpy.mockRestore();
    });
  });

  describe('Structured Output', () => {
    it('should output valid JSON to stdout', () => {
      logService.info('Test message', 'TestContext', { key: 'value' });

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);

      expect(logOutput).toHaveProperty('timestamp');
      expect(logOutput).toHaveProperty('level');
      expect(logOutput).toHaveProperty('environment');
      expect(logOutput).toHaveProperty('message');
      expect(logOutput).toHaveProperty('context');
      expect(logOutput).toHaveProperty('metadata');
    });

    it('should include timestamp in ISO format', () => {
      logService.info('Test message');

      const logOutput = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      const timestamp = new Date(logOutput.timestamp);

      expect(timestamp.toISOString()).toBe(logOutput.timestamp);
    });
  });
});
