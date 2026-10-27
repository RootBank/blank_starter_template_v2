/**
 * Base HTTP Client
 *
 * A typed HTTP client for payment providers that don't have an official SDK.
 * Includes retry logic and timeout support.
 *
 * Use this when integrating providers that lack an official TypeScript SDK.
 * For providers with official SDKs, use the SDK directly instead.
 *
 * @example
 * ```typescript
 * const client = new BaseHttpClient('https://api.payfast.co.za', 'your-api-key');
 * const response = await client.post<PaymentResponse>('/payments', { amount: 1000 });
 * ```
 */

import fetch, { RequestInit, Response } from 'node-fetch';
import { retryWithBackoff } from '../utils/retry';
import { withTimeout } from '../utils/timeout';

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Default timeout in ms (default: 30000) */
  timeout?: number;
  /** Default headers merged into every request */
  defaultHeaders?: Record<string, string>;
}

export class BaseHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout ?? 30_000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      ...options.defaultHeaders,
    };
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, headers);
  }

  async post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>('POST', path, body, headers);
  }

  async put<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>('PUT', path, body, headers);
  }

  async delete<T>(
    path: string,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>('DELETE', path, undefined, headers);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: { ...this.defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    };

    const doRequest = async (): Promise<T> => {
      const response: Response = await withTimeout(
        fetch(url, options),
        this.timeout
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `HTTP ${method} ${path} failed: ${response.status} ${response.statusText} - ${errorBody}`
        );
      }

      return (await response.json()) as T;
    };

    return retryWithBackoff(doRequest, {
      maxRetries: 3,
      shouldRetry: (error: any) =>
        error.message?.includes('500') ||
        error.message?.includes('502') ||
        error.message?.includes('503') ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET',
    });
  }
}
