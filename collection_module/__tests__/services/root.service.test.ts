/**
 * RootService Tests
 */

import * as root from '@rootplatform/node-sdk';
import { RootService } from '../../code/services/root.service';
import { createMockLogService, createMockRootClient } from '../test-helpers';

describe('RootService', () => {
  let rootService: RootService;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockRootClient: ReturnType<typeof createMockRootClient>;

  beforeEach(() => {
    mockLogService = createMockLogService();
    mockRootClient = createMockRootClient();

    rootService = new RootService(mockLogService as any, mockRootClient as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPolicy', () => {
    it('should get a policy successfully', async () => {
      const mockPolicy: Partial<root.Policy> = {
        policy_id: 'policy_123',
        policyholder: {
          id: 'holder_123',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          date_of_birth: '1990-01-01',
          country: 'ZA',
          id_number: '9001015009087',
          created_at: '2024-01-01T00:00:00Z',
        } as any,
        app_data: {
          provider_customer_id: 'cust_test_123',
        },
        monthly_premium: 50000,
        currency: 'ZAR',
        created_at: '2024-01-01T00:00:00Z',
      } as any;

      mockRootClient.getPolicyById.mockResolvedValue(mockPolicy);

      const result = await rootService.getPolicy('policy_123');

      expect(mockRootClient.getPolicyById).toHaveBeenCalledWith({
        policyId: 'policy_123',
      });
      expect(result).toEqual(mockPolicy);
      expect(mockLogService.debug).toHaveBeenCalledWith(
        'Getting policy: policy_123',
        'RootService'
      );
    });

    it('should handle errors when getting policy', async () => {
      const error = new Error('Policy not found');
      mockRootClient.getPolicyById.mockRejectedValue(error);

      await expect(rootService.getPolicy('policy_123')).rejects.toThrow(
        'Policy not found'
      );

      expect(mockLogService.error).toHaveBeenCalledWith(
        'Failed to get policy: Policy not found',
        'RootService',
        { policyId: 'policy_123', error }
      );
    });

    it('should handle network errors when getting policy', async () => {
      const error = new Error('Network timeout');
      mockRootClient.getPolicyById.mockRejectedValue(error);

      await expect(rootService.getPolicy('policy_456')).rejects.toThrow(
        'Network timeout'
      );

      expect(mockLogService.error).toHaveBeenCalledWith(
        'Failed to get policy: Network timeout',
        'RootService',
        { policyId: 'policy_456', error }
      );
    });

    it('should handle API errors with error codes', async () => {
      const error = new Error('Unauthorized');
      mockRootClient.getPolicyById.mockRejectedValue(error);

      await expect(rootService.getPolicy('policy_789')).rejects.toThrow(
        'Unauthorized'
      );

      expect(mockLogService.error).toHaveBeenCalled();
      expect(mockLogService.debug).toHaveBeenCalledWith(
        'Getting policy: policy_789',
        'RootService'
      );
    });
  });

  describe('updatePaymentStatus', () => {
    it('should update payment status to successful', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      const params = {
        paymentId: 'payment_123',
        status: root.PaymentStatus.Successful,
      };

      await rootService.updatePaymentStatus(params);

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledWith({
        paymentUpdates: [
          {
            payment_id: 'payment_123',
            status: root.PaymentStatus.Successful,
            failure_reason: undefined,
            failure_action: undefined,
          },
        ],
      });
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Updating payment status',
        'RootService',
        params
      );
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment status updated successfully',
        'RootService',
        {
          paymentId: 'payment_123',
          status: root.PaymentStatus.Successful,
        }
      );
    });

    it('should update payment status to failed with reason', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      const params = {
        paymentId: 'payment_456',
        status: root.PaymentStatus.Failed,
        failureReason: 'Insufficient funds',
        failureAction: root.FailureAction.BlockPaymentMethod,
      };

      await rootService.updatePaymentStatus(params);

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledWith({
        paymentUpdates: [
          {
            payment_id: 'payment_456',
            status: root.PaymentStatus.Failed,
            failure_reason: 'Insufficient funds',
            failure_action: root.FailureAction.BlockPaymentMethod,
          },
        ],
      });
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Updating payment status',
        'RootService',
        params
      );
    });

    it('should update payment status to pending', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      const params = {
        paymentId: 'payment_789',
        status: root.PaymentStatus.Pending,
      };

      await rootService.updatePaymentStatus(params);

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledWith({
        paymentUpdates: [
          {
            payment_id: 'payment_789',
            status: root.PaymentStatus.Pending,
            failure_reason: undefined,
            failure_action: undefined,
          },
        ],
      });
    });

    it('should update payment status to refunded', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      const params = {
        paymentId: 'payment_refund',
        status: root.PaymentStatus.Cancelled,
      };

      await rootService.updatePaymentStatus(params);

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledWith({
        paymentUpdates: [
          {
            payment_id: 'payment_refund',
            status: root.PaymentStatus.Cancelled,
            failure_reason: undefined,
            failure_action: undefined,
          },
        ],
      });
      expect(mockLogService.info).toHaveBeenCalledTimes(2);
    });

    it('should handle errors when updating payment status', async () => {
      const error = new Error('API error');
      mockRootClient.updatePaymentsAsync.mockRejectedValue(error);

      const params = {
        paymentId: 'payment_123',
        status: root.PaymentStatus.Failed,
        failureReason: 'Card declined',
      };

      await expect(rootService.updatePaymentStatus(params)).rejects.toThrow(
        'API error'
      );

      expect(mockLogService.error).toHaveBeenCalledWith(
        'Failed to update payment status: API error',
        'RootService',
        { params, error }
      );
    });

    it('should handle validation errors', async () => {
      const error = new Error('Invalid payment ID');
      mockRootClient.updatePaymentsAsync.mockRejectedValue(error);

      const params = {
        paymentId: 'invalid_id',
        status: root.PaymentStatus.Successful,
      };

      await expect(rootService.updatePaymentStatus(params)).rejects.toThrow(
        'Invalid payment ID'
      );

      expect(mockLogService.error).toHaveBeenCalled();
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Updating payment status',
        'RootService',
        params
      );
    });

    it('should handle network errors', async () => {
      const error = new Error('Connection timeout');
      mockRootClient.updatePaymentsAsync.mockRejectedValue(error);

      const params = {
        paymentId: 'payment_timeout',
        status: root.PaymentStatus.Successful,
      };

      await expect(rootService.updatePaymentStatus(params)).rejects.toThrow(
        'Connection timeout'
      );

      expect(mockLogService.error).toHaveBeenCalledWith(
        'Failed to update payment status: Connection timeout',
        'RootService',
        { params, error }
      );
    });

    it('should update payment status with all optional parameters', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      const params = {
        paymentId: 'payment_full',
        status: root.PaymentStatus.Failed,
        failureReason: 'Card expired',
        failureAction: root.FailureAction.AllowRetry,
      };

      await rootService.updatePaymentStatus(params);

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledWith({
        paymentUpdates: [
          {
            payment_id: 'payment_full',
            status: root.PaymentStatus.Failed,
            failure_reason: 'Card expired',
            failure_action: root.FailureAction.AllowRetry,
          },
        ],
      });
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment status updated successfully',
        'RootService',
        {
          paymentId: 'payment_full',
          status: root.PaymentStatus.Failed,
        }
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle getting policy then updating payment status', async () => {
      const mockPolicy: Partial<root.Policy> = {
        policy_id: 'policy_123',
        app_data: { provider_customer_id: 'cust_test_123' },
      } as any;

      mockRootClient.getPolicyById.mockResolvedValue(mockPolicy);
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      // Get policy
      const policy = await rootService.getPolicy('policy_123');
      expect(policy.policy_id).toBe('policy_123');

      // Update payment status
      await rootService.updatePaymentStatus({
        paymentId: 'payment_123',
        status: root.PaymentStatus.Successful,
      });

      expect(mockLogService.debug).toHaveBeenCalledTimes(1);
      expect(mockLogService.info).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple payment status updates', async () => {
      mockRootClient.updatePaymentsAsync.mockResolvedValue({});

      await rootService.updatePaymentStatus({
        paymentId: 'payment_1',
        status: root.PaymentStatus.Pending,
      });

      await rootService.updatePaymentStatus({
        paymentId: 'payment_1',
        status: root.PaymentStatus.Successful,
      });

      expect(mockRootClient.updatePaymentsAsync).toHaveBeenCalledTimes(2);
      expect(mockLogService.info).toHaveBeenCalledTimes(4); // 2 updates * 2 logs each
    });

    it('should handle error after successful operation', async () => {
      mockRootClient.getPolicyById.mockResolvedValue({
        policy_id: 'policy_123',
      } as root.Policy);

      const error = new Error('Update failed');
      mockRootClient.updatePaymentsAsync.mockRejectedValue(error);

      await rootService.getPolicy('policy_123');

      await expect(
        rootService.updatePaymentStatus({
          paymentId: 'payment_123',
          status: root.PaymentStatus.Successful,
        })
      ).rejects.toThrow('Update failed');

      expect(mockLogService.error).toHaveBeenCalledTimes(1);
    });
  });
});
