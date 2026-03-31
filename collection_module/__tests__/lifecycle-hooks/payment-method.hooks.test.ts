/**
 * Payment Method Hooks Tests
 *
 * These tests cover the stub behaviour.
 * After implementing provider-specific logic, extend these tests with
 * your provider client mocks.
 *
 * See: docs/10-TESTING.md for testing patterns
 */

import * as paymentMethodHooks from '../../code/lifecycle-hooks/payment-method.hooks';
import { getContainer } from '../../code/core/container.setup';
import { ServiceToken } from '../../code/core/container';
import { createMockLogService } from '../test-helpers';

jest.mock('../../code/core/container.setup');

describe('Payment Method Hooks', () => {
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
        { token: 'tok_123' }
      );
    });
  });

  describe('renderCreatePaymentMethod', () => {
    it('should return a string (stub)', async () => {
      const result = await paymentMethodHooks.renderCreatePaymentMethod();

      expect(typeof result).toBe('string');
      expect(mockLogService.info).toHaveBeenCalledWith(
        'Rendering payment method creation form',
        'renderCreatePaymentMethod'
      );
    });
  });

  describe('renderViewPaymentMethodSummary', () => {
    it('should return a string for a valid payment method (stub)', async () => {
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
    it('should return empty string (stub)', () => {
      expect(paymentMethodHooks.renderViewPaymentMethod()).toBe('');
    });
  });

  describe('afterPolicyPaymentMethodAssigned', () => {
    it('should log payment method assignment', () => {
      paymentMethodHooks.afterPolicyPaymentMethodAssigned({ policy: { policy_id: 'pol_123' } });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment method assigned to policy',
        'afterPolicyPaymentMethodAssigned',
        { policyId: 'pol_123' }
      );
    });
  });

  describe('afterPaymentMethodRemoved', () => {
    it('should log payment method removal', () => {
      paymentMethodHooks.afterPaymentMethodRemoved({ policy: { policy_id: 'pol_456' } });

      expect(mockLogService.info).toHaveBeenCalledWith(
        'Payment method removed from policy',
        'afterPaymentMethodRemoved',
        { policyId: 'pol_456' }
      );
    });
  });
});
