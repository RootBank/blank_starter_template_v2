import { createHmac } from 'crypto';

jest.mock('../../code/services/config-instance');

import AdyenClient from '../../code/clients/adyen-client';
import { getConfigService } from '../../code/services/config-instance';

function createMockConfig() {
  return {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        providerSecretKey: 'test_api_key',
        providerMerchantAccount: 'TestMerchant',
        environment: 'sandbox',
      };
      return config[key] ?? '';
    }),
    isProduction: jest.fn().mockReturnValue(false),
  };
}

describe('AdyenClient', () => {
  let client: AdyenClient;

  beforeEach(() => {
    (getConfigService as jest.Mock).mockReturnValue(createMockConfig());
    client = new AdyenClient();
  });

  describe('constructor', () => {
    it('should initialize with sandbox base URL', () => {
      expect(client.sdk).toBeDefined();
    });

    it('should expose merchantAccount', () => {
      expect(client.getMerchantAccount()).toBe('TestMerchant');
    });
  });

  describe('verifyWebhookSignature', () => {
    const hmacKey = '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';

    function buildSignedPayload(item: Record<string, any>): string {
      return [
        item.pspReference,
        item.originalReference,
        item.merchantAccountCode,
        item.merchantReference,
        item.amount.value,
        item.amount.currency,
        item.eventCode,
        item.success,
      ].join(':');
    }

    function computeHmac(payload: string, key: string): string {
      const hmacKeyBuf = Buffer.from(key, 'hex');
      return createHmac('sha256', hmacKeyBuf)
        .update(payload, 'utf-8')
        .digest('base64');
    }

    it('should return true for valid HMAC signature', () => {
      const notificationItem = {
        pspReference: '7914073381342284',
        originalReference: '',
        merchantAccountCode: 'TestMerchant',
        merchantReference: 'TestPayment-001',
        amount: { currency: 'EUR', value: 1130 },
        eventCode: 'AUTHORISATION',
        success: 'true',
        reason: '',
        additionalData: {} as Record<string, string>,
      };

      const signedPayload = buildSignedPayload(notificationItem);
      notificationItem.additionalData.hmacSignature = computeHmac(signedPayload, hmacKey);

      const body = JSON.stringify({
        live: 'false',
        notificationItems: [{ NotificationRequestItem: notificationItem }],
      });

      const result = client.verifyWebhookSignature(
        { headers: {}, body },
        hmacKey,
      );

      expect(result).toBe(true);
    });

    it('should return false for invalid HMAC signature', () => {
      const body = JSON.stringify({
        live: 'false',
        notificationItems: [
          {
            NotificationRequestItem: {
              pspReference: '123',
              originalReference: '',
              merchantAccountCode: 'Test',
              merchantReference: 'ref',
              amount: { currency: 'EUR', value: 100 },
              eventCode: 'AUTHORISATION',
              success: 'true',
              additionalData: { hmacSignature: 'invalid_signature' },
            },
          },
        ],
      });

      const result = client.verifyWebhookSignature(
        { headers: {}, body },
        hmacKey,
      );

      expect(result).toBe(false);
    });

    it('should return false when hmacSignature is missing', () => {
      const body = JSON.stringify({
        live: 'false',
        notificationItems: [
          {
            NotificationRequestItem: {
              pspReference: '123',
              originalReference: '',
              merchantAccountCode: 'Test',
              merchantReference: 'ref',
              amount: { currency: 'EUR', value: 100 },
              eventCode: 'AUTHORISATION',
              success: 'true',
              additionalData: {},
            },
          },
        ],
      });

      const result = client.verifyWebhookSignature(
        { headers: {}, body },
        hmacKey,
      );

      expect(result).toBe(false);
    });

    it('should return false when notificationItems is empty', () => {
      const body = JSON.stringify({
        live: 'false',
        notificationItems: [],
      });

      const result = client.verifyWebhookSignature(
        { headers: {}, body },
        hmacKey,
      );

      expect(result).toBe(false);
    });

    it('should return false for malformed JSON', () => {
      const result = client.verifyWebhookSignature(
        { headers: {}, body: 'not json' },
        hmacKey,
      );

      expect(result).toBe(false);
    });

    it('should handle Buffer body', () => {
      const notificationItem = {
        pspReference: '999',
        originalReference: '',
        merchantAccountCode: 'Test',
        merchantReference: 'ref',
        amount: { currency: 'ZAR', value: 5000 },
        eventCode: 'AUTHORISATION',
        success: 'true',
        additionalData: {} as Record<string, string>,
      };

      const signedPayload = buildSignedPayload(notificationItem);
      notificationItem.additionalData.hmacSignature = computeHmac(signedPayload, hmacKey);

      const bodyStr = JSON.stringify({
        live: 'false',
        notificationItems: [{ NotificationRequestItem: notificationItem }],
      });

      const result = client.verifyWebhookSignature(
        { headers: {}, body: Buffer.from(bodyStr) },
        hmacKey,
      );

      expect(result).toBe(true);
    });
  });
});
