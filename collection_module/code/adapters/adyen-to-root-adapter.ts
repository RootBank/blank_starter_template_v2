/**
 * Adyen-to-Root Adapter
 *
 * Converts Adyen webhook notification items and shopper data
 * into Root Platform update formats.
 */

import {
  ProviderToRootAdapter,
  ConvertPaymentParams,
  RootPaymentUpdate,
} from '../interfaces/provider.interfaces';

/**
 * Root Platform payment statuses
 */
export const PaymentStatus = {
  Successful: 'successful',
  Pending: 'pending',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const;

export const FailureAction = {
  BlockRetry: 'block_and_notify',
} as const;

/**
 * Map Adyen resultCode / eventCode+success to Root PaymentStatus
 */
const statusMap: Record<string, string> = {
  Authorised: PaymentStatus.Successful,
  Received: PaymentStatus.Pending,
  Pending: PaymentStatus.Pending,
  Refused: PaymentStatus.Failed,
  Cancelled: PaymentStatus.Cancelled,
  Error: PaymentStatus.Failed,
};

export class AdyenToRootAdapter implements ProviderToRootAdapter {
  /**
   * Derive Root PaymentStatus from an Adyen resultCode string.
   */
  mapStatus(resultCode: string): string {
    return statusMap[resultCode] ?? PaymentStatus.Pending;
  }

  /**
   * Convert an Adyen webhook NotificationRequestItem to a Root payment update.
   */
  convertPaymentToRootUpdate(
    notificationItem: any,
    params: ConvertPaymentParams,
  ): RootPaymentUpdate {
    return {
      status: params.status,
      failureReason: params.failureReason ?? notificationItem.reason,
      failureAction: params.failureAction ?? FailureAction.BlockRetry,
      externalId: notificationItem.pspReference,
      amount: notificationItem.amount?.value,
      currency: notificationItem.amount?.currency,
    };
  }

  /**
   * Convert Adyen shopper data to Root app_data format.
   *
   * Since Adyen has no Customer object, we store the shopperReference
   * and any associated metadata.
   */
  convertCustomerToAppData(shopperData: any): Record<string, any> {
    return {
      adyen_shopper_reference: shopperData.id,
      adyen_email: shopperData.email,
      adyen_name: shopperData.name,
      adyen_created_at: new Date().toISOString(),
    };
  }
}
