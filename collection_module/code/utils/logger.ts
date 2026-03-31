import { getConfigService } from '../services/config-instance';

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export default class Logger {
  private static logMessage(
    logLevel: LogLevel,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const metadataString = JSON.stringify(metadata);
    // We're just using this to get the caller function name. No other way to do it in TS due to strict mode.
    const caller = new Error('Error').stack
      ?.split('\n')[2]
      .trim()
      .split(' ')[1];
    const config = getConfigService();
    console[logLevel](
      `[${config
        .get('environment')
        .toUpperCase()} | ${caller}] ${message} ${metadataString}`
    );
  }

  public static debug(message: string, metadata?: Record<string, any>): void {
    Logger.logMessage(LogLevel.DEBUG, message, metadata);
  }

  public static info(message: string, metadata?: Record<string, any>): void {
    Logger.logMessage(LogLevel.INFO, message, metadata);
  }

  public static warn(message: string, metadata?: Record<string, any>): void {
    Logger.logMessage(LogLevel.WARN, message, metadata);
  }
}
