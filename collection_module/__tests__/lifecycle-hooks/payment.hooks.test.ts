/**
 * Payment Hooks Tests
 *
 * STUB-TEST: These tests validate the stub/logging behaviour of the template hooks.
 * When you implement provider-specific logic, replace the test bodies with
 * provider-specific assertions.
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
        // STUB-TEST: When implementing, add your provider mocks here:
        // if (token === ServiceToken.PROVIDER_SERVICE) return mockProviderService;
        // if (token === ServiceToken.ROOT_CLIENT) return mockRootClient;
        return null;
      }),
    };

    (getContainer as jest.Mock).mockReturnValue(mockContainer);
  });

  describe('afterPaymentCreated', () => {
    // STUB-TEST: replace with provider-specific assertions when implementing
    it('should log payment creation with payment and policy IDs', async () => {
      const policy = { policy_id: 'pol_123' };
      const payment = {
        payment_id: 'pay_123',
        amount: 10000,
        currency: 'USD',
      };

      await paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment created',
        'afterPaymentCreated',
        { policyId: 'pol_123', paymentId: 'pay_123' }
      );
    });

    it('should log payment creation without IDs', async () => {
      const policy = {};
      const payment = {};

      await paymentHooks.afterPaymentCreated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment created',
        'afterPaymentCreated',
        { policyId: undefined, paymentId: undefined }
      );
    });
  });

  describe('afterPaymentUpdated', () => {
    // STUB-TEST: replace with provider-specific assertions when implementing
    it('should log payment update with payment and policy IDs', async () => {
      const policy = { policy_id: 'pol_456' };
      const payment = {
        payment_id: 'pay_456',
        status: 'successful',
      };

      await paymentHooks.afterPaymentUpdated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment updated',
        'afterPaymentUpdated',
        { policyId: 'pol_456', paymentId: 'pay_456' }
      );
    });

    it('should log payment update without IDs', async () => {
      const policy = {};
      const payment = {};

      await paymentHooks.afterPaymentUpdated({ policy, payment });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment updated',
        'afterPaymentUpdated',
        { policyId: undefined, paymentId: undefined }
      );
    });
  });
});
