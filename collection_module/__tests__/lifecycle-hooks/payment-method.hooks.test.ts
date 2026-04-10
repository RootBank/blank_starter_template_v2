/**
 * Payment Method Hooks Tests — Adyen
 */

import * as paymentMethodHooks from '../../code/lifecycle-hooks/payment-method.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Payment Method Hooks', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderService: any;
  let mockRootClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogService = createMockLogService();
    mockProviderService = {
      attachPaymentMethod: jest.fn().mockResolvedValue({
        id: 'stored_pm_123',
        type: 'scheme',
      }),
    };
    mockRootClient = {
      getPolicyPaymentMethod: jest.fn().mockResolvedValue({
        module: { id: 'stored_pm_123' },
      }),
      updatePolicy: jest.fn().mockResolvedValue(undefined),
    };

    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === ServiceToken.LOG_SERVICE) return mockLogService;
        if (token === ServiceToken.PROVIDER_SERVICE) return mockProviderService;
        if (token === ServiceToken.ROOT_CLIENT) return mockRootClient;
        return null;
      }),
    };

    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  describe('createPaymentMethod', () => {
    it('should wrap data in module object', () => {
      const data = { token: 'tok_123', type: 'card' };
      const result = paymentMethodHooks.createPaymentMethod({ data });
      expect(result).toEqual({ module: data });
    });

    it('should handle empty data', () => {
      const result = paymentMethodHooks.createPaymentMethod({});
      expect(result).toEqual({ module: undefined });
    });

    it('should log the call', () => {
      paymentMethodHooks.createPaymentMethod({ data: { token: 'tok_123' } });
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Creating payment method',
        'createPaymentMethod',
        { token: 'tok_123' },
      );
    });
  });

  describe('renderCreatePaymentMethod', () => {
    it('should return a string', async () => {
      const result = await paymentMethodHooks.renderCreatePaymentMethod();
      expect(typeof result).toBe('string');
    });
  });

  describe('renderViewPaymentMethodSummary', () => {
    it('should return a string for a valid payment method', async () => {
      const result = await paymentMethodHooks.renderViewPaymentMethodSummary({
        payment_method: 'pm_123',
      });
      expect(typeof result).toBe('string');
    });

    it('should return no-payment-method message when payment_method is null', async () => {
      const result = await paymentMethodHooks.renderViewPaymentMethodSummary({
        payment_method: null,
      });
      expect(result).toContain('No payment method found');
    });
  });

  describe('renderViewPaymentMethod', () => {
    it('should return empty string', () => {
      expect(paymentMethodHooks.renderViewPaymentMethod()).toBe('');
    });
  });

  describe('afterPolicyPaymentMethodAssigned', () => {
    it('should attach payment method and update policy app_data', async () => {
      const policy = {
        policy_id: 'pol_123',
        app_data: { adyen_shopper_reference: 'root_pol_123' },
      };

      await paymentMethodHooks.afterPolicyPaymentMethodAssigned({ policy });

      expect(mockRootClient.getPolicyPaymentMethod).toHaveBeenCalledWith({
        policyId: 'pol_123',
      });
      expect(mockProviderService.attachPaymentMethod).toHaveBeenCalledWith({
        paymentMethodId: 'stored_pm_123',
        customerId: 'root_pol_123',
      });
      expect(mockRootClient.updatePolicy).toHaveBeenCalledWith({
        policyId: 'pol_123',
        body: {
          app_data: expect.objectContaining({
            adyen_stored_payment_method_id: 'stored_pm_123',
          }),
        },
      });
    });

    it('should skip when shopper reference is missing', async () => {
      const policy = { policy_id: 'pol_123', app_data: {} };

      await paymentMethodHooks.afterPolicyPaymentMethodAssigned({ policy });

      expect(mockProviderService.attachPaymentMethod).not.toHaveBeenCalled();
    });

    it('should log the assignment', async () => {
      const policy = {
        policy_id: 'pol_123',
        app_data: { adyen_shopper_reference: 'root_pol_123' },
      };

      await paymentMethodHooks.afterPolicyPaymentMethodAssigned({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment method assigned to policy',
        'afterPolicyPaymentMethodAssigned',
        { policyId: 'pol_123' },
      );
    });
  });

  describe('afterPaymentMethodRemoved', () => {
    it('should log payment method removal', () => {
      paymentMethodHooks.afterPaymentMethodRemoved({ policy: { policy_id: 'pol_456' } });
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment method removed from policy',
        'afterPaymentMethodRemoved',
        { policyId: 'pol_456' },
      );
    });
  });
});
