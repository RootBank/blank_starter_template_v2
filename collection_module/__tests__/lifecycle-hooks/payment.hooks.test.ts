/**
 * Payment Hooks Tests
 */

import * as paymentHooks from '../../code/lifecycle-hooks/payment.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Payment Hooks', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogService = createMockLogService();

    mockContainer = {
      resolve: jest.fn((token: symbol) => {
        if (token === ServiceToken.LOG_SERVICE) return mockLogService;
        return null;
      }),
    };

    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  describe('afterPaymentCreated', () => {
    it('should log payment creation with payment and policy IDs', () => {
      const policy = { policy_id: 'pol_123' };
      const payment = {
        payment_id: 'pay_123',
        amount: 10000,
        currency: 'USD',
      };

      paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment created',
        'afterPaymentCreated',
        { policyId: 'pol_123', paymentId: 'pay_123' }
      );
    });

    it('should log payment creation without IDs', () => {
      const policy = {};
      const payment = {};

      paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment created',
        'afterPaymentCreated',
        { policyId: undefined, paymentId: undefined }
      );
    });
  });

  describe('afterPaymentUpdated', () => {
    it('should log payment update with payment and policy IDs', () => {
      const policy = { policy_id: 'pol_456' };
      const payment = {
        payment_id: 'pay_456',
        status: 'successful',
      };

      paymentHooks.afterPaymentUpdated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment updated',
        'afterPaymentUpdated',
        { policyId: 'pol_456', paymentId: 'pay_456' }
      );
    });

    it('should log payment update without IDs', () => {
      const policy = {};
      const payment = {};

      paymentHooks.afterPaymentUpdated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment updated',
        'afterPaymentUpdated',
        { policyId: undefined, paymentId: undefined }
      );
    });
  });
});
