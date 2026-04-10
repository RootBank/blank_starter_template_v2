/**
 * Adyen Webhook Event Constants
 *
 * Maps Adyen webhook event codes to constants used in webhook routing.
 * See: https://docs.adyen.com/development-resources/webhooks/webhook-types/
 */

export const ADYEN_EVENTS = {
  AUTHORISATION: 'AUTHORISATION',
  CAPTURE: 'CAPTURE',
  CAPTURE_FAILED: 'CAPTURE_FAILED',
  CANCELLATION: 'CANCELLATION',
  REFUND: 'REFUND',
  REFUND_FAILED: 'REFUND_FAILED',
  CANCEL_OR_REFUND: 'CANCEL_OR_REFUND',
  CHARGEBACK: 'CHARGEBACK',
  EXPIRE: 'EXPIRE',
} as const;

export type AdyenEventCode = (typeof ADYEN_EVENTS)[keyof typeof ADYEN_EVENTS];

/**
 * Adyen webhook notification item shape
 */
export interface AdyenNotificationItem {
  NotificationRequestItem: {
    eventCode: string;
    success: string;
    pspReference: string;
    originalReference: string;
    merchantAccountCode: string;
    merchantReference: string;
    amount: {
      currency: string;
      value: number;
    };
    eventDate: string;
    operations: string[];
    paymentMethod: string;
    reason: string;
    additionalData: Record<string, string>;
  };
}

export interface AdyenWebhookPayload {
  live: string;
  notificationItems: AdyenNotificationItem[];
}
