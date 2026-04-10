/**
 * Payment Hooks Tests — Adyen
 */

import * as paymentHooks from '../../code/lifecycle-hooks/payment.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Payment Hooks', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogService = createMockLogService();
    mockProviderService = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        id: 'PSP_123',
        status: 'Authorised',
        amount: 50000,
        currency: 'ZAR',
      }),
    };

    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === ServiceToken.LOG_SERVICE) return mockLogService;
        if (token === ServiceToken.PROVIDER_SERVICE) return mockProviderService;
        return null;
      }),
    };

    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  describe('afterPaymentCreated', () => {
    it('should create payment intent with Adyen', async () => {
      const policy = {
        policy_id: 'pol_123',
        currency: 'ZAR',
        app_data: {
          adyen_shopper_reference: 'root_pol_123',
          adyen_stored_payment_method_id: 'stored_pm_456',
        },
      };
      const payment = { payment_id: 'pay_123', amount: 50000 };

      await paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockProviderService.createPaymentIntent).toHaveBeenCalledWith({
        amount: 50000,
        currency: 'ZAR',
        customerId: 'root_pol_123',
        metadata: {
          rootPaymentId: 'pay_123',
          rootPolicyId: 'pol_123',
          paymentMethodId: 'stored_pm_456',
        },
      });
    });

    it('should skip payment when shopper reference is missing', async () => {
      const policy = { policy_id: 'pol_123', app_data: {} };
      const payment = { payment_id: 'pay_123', amount: 50000 };

      await paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockProviderService.createPaymentIntent).not.toHaveBeenCalled();
      expect(mockLogService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing Adyen shopper reference'),
        'afterPaymentCreated',
        expect.any(Object),
      );
    });

    it('should log payment creation', async () => {
      const policy = {
        policy_id: 'pol_123',
        app_data: {
          adyen_shopper_reference: 'root_pol_123',
          adyen_stored_payment_method_id: 'stored_pm_456',
        },
      };
      const payment = { payment_id: 'pay_123', amount: 50000 };

      await paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment created',
        'afterPaymentCreated',
        { policyId: 'pol_123', paymentId: 'pay_123' },
      );
    });
  });

  describe('afterPaymentUpdated', () => {
    it('should log payment update with payment and policy IDs', () => {
      const policy = { policy_id: 'pol_456' };
      const payment = { payment_id: 'pay_456', status: 'successful' };

      paymentHooks.afterPaymentUpdated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment updated',
        'afterPaymentUpdated',
        { policyId: 'pol_456', paymentId: 'pay_456' },
      );
    });
  });
});
