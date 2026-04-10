import {
  AdyenToRootAdapter,
  PaymentStatus,
  FailureAction,
} from '../../code/adapters/adyen-to-root-adapter';

describe('AdyenToRootAdapter', () => {
  let adapter: AdyenToRootAdapter;

  beforeEach(() => {
    adapter = new AdyenToRootAdapter();
  });

  describe('mapStatus', () => {
    it.each([
      ['Authorised', PaymentStatus.Successful],
      ['Received', PaymentStatus.Pending],
      ['Pending', PaymentStatus.Pending],
      ['Refused', PaymentStatus.Failed],
      ['Cancelled', PaymentStatus.Cancelled],
      ['Error', PaymentStatus.Failed],
    ])('should map "%s" to "%s"', (adyenStatus, expectedRootStatus) => {
      expect(adapter.mapStatus(adyenStatus)).toBe(expectedRootStatus);
    });

    it('should default to pending for unknown statuses', () => {
      expect(adapter.mapStatus('UnknownStatus')).toBe(PaymentStatus.Pending);
    });
  });

  describe('convertPaymentToRootUpdate', () => {
    it('should convert a notification item to a Root payment update', () => {
      const notification = {
        pspReference: 'PSP_123',
        amount: { currency: 'ZAR', value: 50000 },
        reason: '',
      };

      const result = adapter.convertPaymentToRootUpdate(notification, {
        status: PaymentStatus.Successful,
      });

      expect(result).toEqual({
        status: PaymentStatus.Successful,
        failureReason: '',
        failureAction: FailureAction.BlockRetry,
        externalId: 'PSP_123',
        amount: 50000,
        currency: 'ZAR',
      });
    });

    it('should use params.failureReason over notification reason', () => {
      const notification = {
        pspReference: 'PSP_456',
        amount: { currency: 'EUR', value: 1000 },
        reason: 'Insufficient funds',
      };

      const result = adapter.convertPaymentToRootUpdate(notification, {
        status: PaymentStatus.Failed,
        failureReason: 'Card declined',
      });

      expect(result.failureReason).toBe('Card declined');
    });

    it('should fall back to notification reason when no failureReason provided', () => {
      const notification = {
        pspReference: 'PSP_789',
        amount: { currency: 'EUR', value: 500 },
        reason: 'Refused',
      };

      const result = adapter.convertPaymentToRootUpdate(notification, {
        status: PaymentStatus.Failed,
      });

      expect(result.failureReason).toBe('Refused');
    });
  });

  describe('convertCustomerToAppData', () => {
    it('should convert shopper data to app_data format', () => {
      const shopperData = {
        id: 'root_policy_123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const result = adapter.convertCustomerToAppData(shopperData);

      expect(result).toEqual(
        expect.objectContaining({
          adyen_shopper_reference: 'root_policy_123',
          adyen_email: 'test@example.com',
          adyen_name: 'Test User',
        }),
      );
      expect(result.adyen_created_at).toBeDefined();
    });

    it('should handle null fields', () => {
      const shopperData = {
        id: 'root_policy_456',
        email: null,
        name: null,
      };

      const result = adapter.convertCustomerToAppData(shopperData);

      expect(result.adyen_shopper_reference).toBe('root_policy_456');
      expect(result.adyen_email).toBeNull();
      expect(result.adyen_name).toBeNull();
    });
  });
});
