/**
 * Policy Hooks Tests — Adyen
 */

import * as policyHooks from '../../code/lifecycle-hooks/policy.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Policy Hooks', () => {
  let mockContainer: any;
  let mockLogService: ReturnType<typeof createMockLogService>;
  let mockProviderService: any;
  let mockRootClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogService = createMockLogService();
    mockProviderService = {
      createCustomer: jest.fn().mockResolvedValue({
        id: 'root_policy_123',
        email: 'test@example.com',
        name: 'Test User',
      }),
      cancelSubscription: jest.fn().mockResolvedValue({ id: 'pm_123', status: 'disabled' }),
    };
    mockRootClient = {
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

  describe('afterPolicyIssued', () => {
    it('should create shopper reference and update policy app_data', async () => {
      const policy = {
        policy_id: 'policy_123',
        policyholder: {
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
        },
      };

      await policyHooks.afterPolicyIssued({ policy });

      expect(mockProviderService.createCustomer).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: { root_policy_id: 'policy_123' },
      });

      expect(mockRootClient.updatePolicy).toHaveBeenCalledWith({
        policyId: 'policy_123',
        body: {
          app_data: expect.objectContaining({
            adyen_shopper_reference: 'root_policy_123',
            adyen_email: 'test@example.com',
          }),
        },
      });
    });

    it('should log policy issuance', async () => {
      const policy = {
        policy_id: 'policy_123',
        policyholder: { email: 'test@example.com' },
      };

      await policyHooks.afterPolicyIssued({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy issued',
        'afterPolicyIssued',
        { policyId: 'policy_123' },
      );
    });
  });

  describe('afterPolicyUpdated', () => {
    it('should log policy update with policy ID and updates', () => {
      const policy = { policy_id: 'policy_456' };
      const updates = { status: 'active', sum_assured: 100000 };

      policyHooks.afterPolicyUpdated({ policy, updates });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy updated',
        'afterPolicyUpdated',
        {
          policyId: 'policy_456',
          updates: { status: 'active', sum_assured: 100000 },
        },
      );
    });
  });

  describe('afterPolicyCancelled', () => {
    it('should disable stored payment method when present', async () => {
      const policy = {
        policy_id: 'policy_111',
        app_data: { adyen_stored_payment_method_id: 'stored_pm_123' },
      };

      await policyHooks.afterPolicyCancelled({ policy });

      expect(mockProviderService.cancelSubscription).toHaveBeenCalledWith('stored_pm_123');
    });

    it('should skip cancellation when no stored payment method', async () => {
      const policy = {
        policy_id: 'policy_222',
        app_data: {},
      };

      await policyHooks.afterPolicyCancelled({ policy });

      expect(mockProviderService.cancelSubscription).not.toHaveBeenCalled();
    });

    it('should log policy cancellation', async () => {
      const policy = { policy_id: 'policy_111', app_data: {} };

      await policyHooks.afterPolicyCancelled({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy cancelled',
        'afterPolicyCancelled',
        { policyId: 'policy_111' },
      );
    });
  });

  describe('afterPolicyExpired', () => {
    it('should log policy expiration with policy ID', () => {
      policyHooks.afterPolicyExpired({ policy: { policy_id: 'policy_222' } });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy expired',
        'afterPolicyExpired',
        { policyId: 'policy_222' },
      );
    });
  });

  describe('afterPolicyLapsed', () => {
    it('should log policy lapse with policy ID', () => {
      policyHooks.afterPolicyLapsed({ policy: { policy_id: 'policy_333' } });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy lapsed',
        'afterPolicyLapsed',
        { policyId: 'policy_333' },
      );
    });
  });

  describe('afterAlterationPackageApplied', () => {
    it('should log alteration package application', () => {
      policyHooks.afterAlterationPackageApplied({
        policy: { policy_id: 'policy_444' },
        alteration_package: { package_id: 'pkg_123' },
        alteration_hook_key: 'increase_sum_assured',
      });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Alteration package applied',
        'afterAlterationPackageApplied',
        {
          policyId: 'policy_444',
          alterationHookKey: 'increase_sum_assured',
        },
      );
    });
  });
});
