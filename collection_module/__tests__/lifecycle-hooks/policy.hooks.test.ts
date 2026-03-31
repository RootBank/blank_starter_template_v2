/**
 * Policy Hooks Tests
 */

import * as policyHooks from '../../code/lifecycle-hooks/policy.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Policy Hooks', () => {
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

  describe('afterPolicyIssued', () => {
    it('should log policy issuance', () => {
      policyHooks.afterPolicyIssued();

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy issued',
        'afterPolicyIssued'
      );
    });
  });

  describe('afterPolicyUpdated', () => {
    it('should log policy update with policy ID and updates', () => {
      const policy = {
        policy_id: 'policy_456',
      };
      const updates = {
        status: 'active',
        sum_assured: 100000,
      };

      policyHooks.afterPolicyUpdated({ policy, updates });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy updated',
        'afterPolicyUpdated',
        {
          policyId: 'policy_456',
          updates: { status: 'active', sum_assured: 100000 },
        }
      );
    });

    it('should log policy update without IDs', () => {
      const policy = {};
      const updates = {};

      policyHooks.afterPolicyUpdated({ policy, updates });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy updated',
        'afterPolicyUpdated',
        {
          policyId: undefined,
          updates: {},
        }
      );
    });
  });

  describe('afterPolicyCancelled', () => {
    it('should log policy cancellation with policy ID', () => {
      const policy = {
        policy_id: 'policy_111',
        status: 'cancelled',
      };

      policyHooks.afterPolicyCancelled({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy cancelled',
        'afterPolicyCancelled',
        { policyId: 'policy_111' }
      );
    });

    it('should log policy cancellation without policy ID', () => {
      const policy = {};

      policyHooks.afterPolicyCancelled({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy cancelled',
        'afterPolicyCancelled',
        { policyId: undefined }
      );
    });
  });

  describe('afterPolicyExpired', () => {
    it('should log policy expiration with policy ID', () => {
      const policy = {
        policy_id: 'policy_222',
        status: 'expired',
      };

      policyHooks.afterPolicyExpired({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy expired',
        'afterPolicyExpired',
        { policyId: 'policy_222' }
      );
    });

    it('should log policy expiration without policy ID', () => {
      const policy = {};

      policyHooks.afterPolicyExpired({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy expired',
        'afterPolicyExpired',
        { policyId: undefined }
      );
    });
  });

  describe('afterPolicyLapsed', () => {
    it('should log policy lapse with policy ID', () => {
      const policy = {
        policy_id: 'policy_333',
        status: 'lapsed',
      };

      policyHooks.afterPolicyLapsed({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy lapsed',
        'afterPolicyLapsed',
        { policyId: 'policy_333' }
      );
    });

    it('should log policy lapse without policy ID', () => {
      const policy = {};

      policyHooks.afterPolicyLapsed({ policy });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Policy lapsed',
        'afterPolicyLapsed',
        { policyId: undefined }
      );
    });
  });

  describe('afterAlterationPackageApplied', () => {
    it('should log alteration package application with policy ID and hook key', () => {
      const policy = {
        policy_id: 'policy_444',
      };
      const alteration_package = {
        package_id: 'pkg_123',
        type: 'sum_assured_increase',
      };
      const alteration_hook_key = 'increase_sum_assured';

      policyHooks.afterAlterationPackageApplied({
        policy,
        alteration_package,
        alteration_hook_key,
      });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Alteration package applied',
        'afterAlterationPackageApplied',
        {
          policyId: 'policy_444',
          alterationHookKey: 'increase_sum_assured',
        }
      );
    });

    it('should log without policy ID', () => {
      const policy = {};
      const alteration_package = {};
      const alteration_hook_key = 'test_key';

      policyHooks.afterAlterationPackageApplied({
        policy,
        alteration_package,
        alteration_hook_key,
      });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Alteration package applied',
        'afterAlterationPackageApplied',
        {
          policyId: undefined,
          alterationHookKey: 'test_key',
        }
      );
    });
  });
});
