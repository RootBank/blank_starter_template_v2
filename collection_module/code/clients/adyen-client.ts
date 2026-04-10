/**
 * Adyen Client
 *
 * HTTP client for the Adyen Checkout API (v71).
 * Uses BaseHttpClient for retry and timeout support.
 *
 * Adyen uses X-API-Key authentication and requires merchantAccount on every request.
 * Webhook signatures use HMAC-SHA256 with a specific field concatenation scheme.
 */

import { createHmac } from 'crypto';
import { BaseHttpClient } from './base-http-client';
import { getConfigService } from '../services/config-instance';
import { PaymentProviderClient, WebhookRequest } from '../interfaces/provider.interfaces';
import { AdyenNotificationItem } from '../interfaces/adyen-events';

export default class AdyenClient implements PaymentProviderClient {
  public readonly sdk: BaseHttpClient;
  private readonly merchantAccount: string;

  constructor() {
    const config = getConfigService();
    const baseUrl = config.isProduction()
      ? `https://checkout-live.adyenpayments.com/checkout/v71`
      : 'https://checkout-test.adyen.com/v71';

    this.merchantAccount = config.get('providerMerchantAccount');

    this.sdk = new BaseHttpClient({
      baseUrl,
      apiKey: config.get('providerSecretKey'),
      defaultHeaders: {
        'X-API-Key': config.get('providerSecretKey'),
        Authorization: '',
        'Content-Type': 'application/json',
      },
    });
  }

  getMerchantAccount(): string {
    return this.merchantAccount;
  }

  /**
   * Verify an Adyen webhook HMAC signature.
   *
   * Adyen signs webhooks by concatenating specific fields from the NotificationRequestItem
   * with colons, then computing HMAC-SHA256 using the hex-encoded HMAC key.
   */
  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean {
    try {
      const body =
        typeof request.body === 'string'
          ? request.body
          : request.body.toString('utf-8');
      const payload = JSON.parse(body);

      const notificationItems = payload.notificationItems;
      if (!notificationItems || notificationItems.length === 0) {
        return false;
      }

      const item: AdyenNotificationItem = notificationItems[0];
      const notification = item.NotificationRequestItem;

      const hmacSignature = notification.additionalData?.hmacSignature;
      if (!hmacSignature) {
        return false;
      }

      const signedPayload = [
        notification.pspReference,
        notification.originalReference,
        notification.merchantAccountCode,
        notification.merchantReference,
        notification.amount.value,
        notification.amount.currency,
        notification.eventCode,
        notification.success,
      ].join(':');

      const hmacKey = Buffer.from(secret, 'hex');
      const computed = createHmac('sha256', hmacKey)
        .update(signedPayload, 'utf-8')
        .digest('base64');

      return computed === hmacSignature;
    } catch {
      return false;
    }
  }
}
