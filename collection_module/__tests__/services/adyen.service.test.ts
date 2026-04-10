import { AdyenService } from '../../code/services/adyen.service';
import { createMockLogService } from '../test-helpers';

describe('AdyenService', () => {
  let service: AdyenService;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderClient: any;

  beforeEach(() => {
    mockLogService = createMockLogService();
    mockProviderClient = {
      sdk: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      },
      getMerchantAccount: jest.fn().mockReturnValue('TestMerchant'),
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
    };
    service = new AdyenService(mockLogService as any, mockProviderClient);
  });

  describe('createCustomer', () => {
    it('should generate a shopper reference from policy ID', async () => {
      const result = await service.createCustomer({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { root_policy_id: 'policy_123' },
      });

      expect(result.id).toBe('root_policy_123');
      expect(result.email).toBe('test@example.com');
      expect(result.name).toBe('Test User');
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Creating customer (shopper reference)',
        'AdyenService',
        expect.any(Object),
      );
    });

    it('should generate a fallback shopper reference without policy ID', async () => {
      const result = await service.createCustomer({
        email: 'test@example.com',
      });

      expect(result.id).toMatch(/^root_\d+$/);
      expect(result.email).toBe('test@example.com');
    });

    it('should not make any API calls', async () => {
      await service.createCustomer({
        email: 'test@example.com',
        metadata: { root_policy_id: 'policy_123' },
      });

      expect(mockProviderClient.sdk.post).not.toHaveBeenCalled();
      expect(mockProviderClient.sdk.get).not.toHaveBeenCalled();
    });
  });

  describe('getCustomer', () => {
    it('should return the shopper reference as-is', async () => {
      const result = await service.getCustomer('root_policy_123');

      expect(result.id).toBe('root_policy_123');
      expect(result.email).toBeNull();
    });
  });

  describe('updateCustomer', () => {
    it('should return updated fields', async () => {
      const result = await service.updateCustomer('root_policy_123', {
        email: 'new@example.com',
        name: 'New Name',
      });

      expect(result.id).toBe('root_policy_123');
      expect(result.email).toBe('new@example.com');
      expect(result.name).toBe('New Name');
    });
  });

  describe('createPaymentIntent', () => {
    it('should call POST /payments with correct body', async () => {
      mockProviderClient.sdk.post.mockResolvedValue({
        pspReference: 'PSP_123',
        resultCode: 'Authorised',
      });

      const result = await service.createPaymentIntent({
        amount: 50000,
        currency: 'ZAR',
        customerId: 'root_policy_123',
        metadata: {
          rootPaymentId: 'payment_456',
          paymentMethodId: 'stored_pm_789',
        },
      });

      expect(mockProviderClient.sdk.post).toHaveBeenCalledWith(
        '/payments',
        expect.objectContaining({
          merchantAccount: 'TestMerchant',
          amount: { currency: 'ZAR', value: 50000 },
          reference: 'payment_456',
          shopperReference: 'root_policy_123',
          shopperInteraction: 'ContAuth',
          recurringProcessingModel: 'Subscription',
          paymentMethod: {
            type: 'scheme',
            storedPaymentMethodId: 'stored_pm_789',
          },
        }),
      );

      expect(result.id).toBe('PSP_123');
      expect(result.status).toBe('Authorised');
      expect(result.amount).toBe(50000);
      expect(result.currency).toBe('ZAR');
    });

    it('should throw ModuleError on API failure', async () => {
      mockProviderClient.sdk.post.mockRejectedValue(new Error('API error'));

      await expect(
        service.createPaymentIntent({
          amount: 50000,
          currency: 'ZAR',
          customerId: 'root_policy_123',
          metadata: { paymentMethodId: 'pm_123' },
        }),
      ).rejects.toThrow('Failed to create payment intent');

      expect(mockLogService.error).toHaveBeenCalled();
    });
  });

  describe('attachPaymentMethod', () => {
    it('should return the payment method reference', async () => {
      const result = await service.attachPaymentMethod({
        paymentMethodId: 'stored_pm_123',
        customerId: 'root_policy_123',
      });

      expect(result.id).toBe('stored_pm_123');
      expect(result.type).toBe('scheme');
    });
  });

  describe('getPaymentMethod', () => {
    it('should return payment method details', async () => {
      const result = await service.getPaymentMethod('pm_123');

      expect(result.id).toBe('pm_123');
      expect(result.type).toBe('scheme');
    });
  });

  describe('cancelSubscription', () => {
    it('should call DELETE on stored payment method endpoint', async () => {
      mockProviderClient.sdk.delete.mockResolvedValue({});

      const result = await service.cancelSubscription('stored_pm_123');

      expect(mockProviderClient.sdk.delete).toHaveBeenCalledWith(
        '/storedPaymentMethods/stored_pm_123?merchantAccount=TestMerchant',
      );
      expect(result.id).toBe('stored_pm_123');
      expect(result.status).toBe('disabled');
    });

    it('should throw ModuleError on failure', async () => {
      mockProviderClient.sdk.delete.mockRejectedValue(new Error('Not found'));

      await expect(
        service.cancelSubscription('stored_pm_123'),
      ).rejects.toThrow('Failed to cancel subscription');
    });
  });
});
