/**
 * LogService - Structured logging system
 *
 * Features:
 * - Structured JSON output to stdout (for DataDog/CloudWatch)
 * - Correlation IDs for request tracking
 * - Multiple log levels
 */

import { randomUUID } from 'crypto';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

export interface LogServiceConfig {
  environment: string;
  minLogLevel?: LogLevel; // Minimum log level to output
}

export class LogService {
  private readonly minLogLevel: LogLevel;
  private readonly environment: string;
  private currentCorrelationId: string | null = null;

  // Map log levels to numeric priorities for comparison
  private static readonly LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };

  constructor(config: LogServiceConfig) {
    this.environment = config.environment;
    this.minLogLevel = config.minLogLevel || LogLevel.DEBUG;
  }

  /**
   * Set correlation ID for the current request/operation
   */
  public setCorrelationId(correlationId: string): void {
    this.currentCorrelationId = correlationId;
  }

  /**
   * Generate and set a new correlation ID
   */
  public generateCorrelationId(): string {
    const correlationId = randomUUID();
    this.currentCorrelationId = correlationId;
    return correlationId;
  }

  /**
   * Clear the current correlation ID
   */
  public clearCorrelationId(): void {
    this.currentCorrelationId = null;
  }

  /**
   * Get the current correlation ID
   */
  public getCorrelationId(): string | null {
    return this.currentCorrelationId;
  }

  /**
   * Log a debug message
   */
  public debug(
    message: string,
    context?: string,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  /**
   * Log an info message
   */
  public info(
    message: string,
    context?: string,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  /**
   * Log a warning message
   */
  public warn(
    message: string,
    context?: string,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  /**
   * Log an error message
   */
  public error(
    message: string,
    context?: string,
    metadata?: Record<string, any>,
    error?: Error
  ): void {
    const errorData = error
      ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        }
      : undefined;

    this.log(LogLevel.ERROR, message, context, metadata, errorData);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: string,
    metadata?: Record<string, any>,
    error?: { message: string; stack?: string; name?: string }
  ): void {
    // Check if this log level should be output
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      correlationId: this.currentCorrelationId || undefined,
      metadata,
      error,
    };

    // Output to stdout as JSON (for DataDog/CloudWatch)
    this.outputToStdout(entry);
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return (
      LogService.LOG_LEVEL_PRIORITY[level] >=
      LogService.LOG_LEVEL_PRIORITY[this.minLogLevel]
    );
  }

  /**
   * Output log entry to stdout as structured JSON
   */
  private outputToStdout(entry: LogEntry): void {
    const output = {
      timestamp: entry.timestamp,
      level: entry.level,
      environment: this.environment,
      message: entry.message,
      ...(entry.context && { context: entry.context }),
      ...(entry.correlationId && { correlationId: entry.correlationId }),
      ...(entry.metadata && { metadata: entry.metadata }),
      ...(entry.error && { error: entry.error }),
    };

    // Use console methods based on log level
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(output));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(output));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(output));
        break;
      case LogLevel.ERROR:
        console.error(JSON.stringify(output));
        break;
      default:
        console.log(JSON.stringify(output));
        break;
    }
  }
}
