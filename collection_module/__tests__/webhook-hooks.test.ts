/**
 * Webhook Hooks Tests
 *
 * STUB-TEST: These tests validate the stub/logging behaviour of the template webhook handler.
 * When you implement signature verification and event routing, replace these tests
 * with provider-specific assertions covering:
 * - Signature verification (valid + invalid)
 * - Event routing for each event type you handle
 * - Error handling for malformed payloads
 *
 * See: docs/10-TESTING.md for testing patterns
 * See: docs/STRIPE-REFERENCE.md#webhook-routing for a full example
 */

import { processWebhookRequest } from '../code/webhook-hooks';
import { getContainer } from '../code/core/container.setup';
import { ServiceToken } from '../code/core/container';
import { createMockLogService } from './test-helpers';

jest.mock('../code/core/container.setup');

describe('processWebhookRequest', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogService = createMockLogService();
    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === ServiceToken.LOG_SERVICE) return mockLogService;
        // STUB-TEST: When implementing, add your provider mocks here:
        // if (token === ServiceToken.PROVIDER_CLIENT) return mockProviderClient;
        // if (token === ServiceToken.WEBHOOK_PARSER) return mockWebhookParser;
        return null;
      }),
    };
    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  it('should return 200 for a valid JSON event', async () => {
    const request = {
      request: {
        headers: {},
        body: Buffer.from(JSON.stringify({ type: 'payment.succeeded', data: {} })),
      },
    };

    const result = await processWebhookRequest(request);

    expect(result.response.status).toBe(200);
    expect(JSON.parse(result.response.body)).toEqual({ received: true });
    expect(result.response.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('should log the event type', async () => {
    const request = {
      request: {
        headers: {},
        body: Buffer.from(JSON.stringify({ type: 'payment.succeeded', data: {} })),
      },
    };

    await processWebhookRequest(request);

    expect(mockLogService.info).toHaveBeenCalledWith(
      'Received webhook',
      'WebhookHandler',
      { type: 'payment.succeeded' }
    );
  });

  it('should return 500 and log on JSON parse error', async () => {
    const request = {
      request: {
        headers: {},
        body: Buffer.from('not valid json'),
      },
    };

    const result = await processWebhookRequest(request);

    expect(result.response.status).toBe(500);
    expect(JSON.parse(result.response.body)).toEqual({ error: 'Internal server error' });
    expect(mockLogService.error).toHaveBeenCalledWith(
      'Error processing webhook',
      'WebhookHandler',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('should return correct Content-Type header on error', async () => {
    const request = {
      request: {
        headers: {},
        body: Buffer.from('bad json'),
      },
    };

    const result = await processWebhookRequest(request);

    expect(result.response.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});
