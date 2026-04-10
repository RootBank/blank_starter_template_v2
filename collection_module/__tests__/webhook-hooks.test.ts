/**
 * Webhook Hooks Tests — Adyen
 */

import { processWebhookRequest } from '../code/webhook-hooks';
import { getContainer } from '../code/core/container.setup';
import { ServiceToken } from '../code/core/container';
import { createMockLogService } from './test-helpers';

jest.mock('../code/core/container.setup');

describe('processWebhookRequest', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderClient: any;
  let mockConfigService: any;
  let mockRootService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogService = createMockLogService();
    mockProviderClient = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('test_webhook_secret'),
    };
    mockRootService = {
      updatePaymentStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === ServiceToken.LOG_SERVICE) return mockLogService;
        if (token === ServiceToken.PROVIDER_CLIENT) return mockProviderClient;
        if (token === ServiceToken.CONFIG_SERVICE) return mockConfigService;
        if (token === ServiceToken.ROOT_SERVICE) return mockRootService;
        return null;
      }),
    };
    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  function buildAdyenWebhook(eventCode: string, success: string = 'true', overrides: Record<string, any> = {}) {
    return {
      request: {
        headers: {},
        body: Buffer.from(JSON.stringify({
          live: 'false',
          notificationItems: [{
            NotificationRequestItem: {
              eventCode,
              success,
              pspReference: 'PSP_123',
              originalReference: '',
              merchantAccountCode: 'TestMerchant',
              merchantReference: 'payment_test_123',
              amount: { currency: 'ZAR', value: 50000 },
              eventDate: '2024-01-15T10:30:00Z',
              operations: [],
              paymentMethod: 'visa',
              reason: '',
              additionalData: {},
              ...overrides,
            },
          }],
        })),
      },
    };
  }

  it('should return 200 with [accepted] for a valid webhook', async () => {
    const request = buildAdyenWebhook('AUTHORISATION');

    const result = await processWebhookRequest(request);

    expect(result.response.status).toBe(200);
    expect(result.response.body).toBe('[accepted]');
  });

  it('should return 403 when signature verification fails', async () => {
    mockProviderClient.verifyWebhookSignature.mockReturnValue(false);
    const request = buildAdyenWebhook('AUTHORISATION');

    const result = await processWebhookRequest(request);

    expect(result.response.status).toBe(403);
    expect(mockLogService.warn).toHaveBeenCalledWith(
      'Webhook signature verification failed',
      'WebhookHandler',
    );
  });

  it('should log the event code and pspReference', async () => {
    const request = buildAdyenWebhook('AUTHORISATION');

    await processWebhookRequest(request);

    expect(mockLogService.info).toHaveBeenCalledWith(
      'Received webhook',
      'WebhookHandler',
      expect.objectContaining({
        eventCode: 'AUTHORISATION',
        pspReference: 'PSP_123',
      }),
    );
  });

  it('should update payment as successful for AUTHORISATION success=true', async () => {
    const request = buildAdyenWebhook('AUTHORISATION', 'true');

    await processWebhookRequest(request);

    expect(mockRootService.updatePaymentStatus).toHaveBeenCalledWith(
      'payment_test_123',
      expect.objectContaining({ status: 'successful' }),
    );
  });

  it('should update payment as failed for AUTHORISATION success=false', async () => {
    const request = buildAdyenWebhook('AUTHORISATION', 'false', { reason: 'Refused' });

    await processWebhookRequest(request);

    expect(mockRootService.updatePaymentStatus).toHaveBeenCalledWith(
      'payment_test_123',
      expect.objectContaining({
        status: 'failed',
        failureReason: 'Refused',
      }),
    );
  });

  it('should update payment as cancelled for CANCELLATION', async () => {
    const request = buildAdyenWebhook('CANCELLATION');

    await processWebhookRequest(request);

    expect(mockRootService.updatePaymentStatus).toHaveBeenCalledWith(
      'payment_test_123',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('should handle CHARGEBACK events', async () => {
    const request = buildAdyenWebhook('CHARGEBACK');

    await processWebhookRequest(request);

    expect(mockRootService.updatePaymentStatus).toHaveBeenCalledWith(
      'payment_test_123',
      expect.objectContaining({
        status: 'failed',
        failureReason: 'Chargeback received',
      }),
    );
  });

  it('should log unhandled events', async () => {
    const request = buildAdyenWebhook('CAPTURE');

    await processWebhookRequest(request);

    expect(mockLogService.info).toHaveBeenCalledWith(
      'Unhandled event: CAPTURE',
      'WebhookHandler',
    );
  });

  it('should return 500 and log on parse error', async () => {
    const request = {
      request: {
        headers: {},
        body: Buffer.from('not valid json'),
      },
    };

    const result = await processWebhookRequest(request);

    expect(result.response.status).toBe(500);
    expect(mockLogService.error).toHaveBeenCalledWith(
      'Error processing webhook',
      'WebhookHandler',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
