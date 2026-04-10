/**
 * Adyen Service
 *
 * Implements PaymentProviderService for Adyen.
 *
 * Key differences from Stripe:
 * - No separate Customer API — shoppers are identified by shopperReference
 * - createCustomer() generates a shopper reference (no API call)
 * - createPaymentIntent() calls POST /payments
 * - attachPaymentMethod() stores the token ID (tokenization happens at payment time)
 * - cancelSubscription() disables stored payment method tokens
 */

import { LogService } from './log.service';
import AdyenClient from '../clients/adyen-client';
import { retryWithBackoff } from '../utils/retry';
import ModuleError from '../utils/error';
import {
  PaymentProviderService,
  CreateCustomerParams,
  CreatePaymentIntentParams,
  AttachPaymentMethodParams,
  ProviderCustomer,
  ProviderPaymentIntent,
  ProviderPaymentMethod,
  ProviderSubscription,
} from '../interfaces/provider.interfaces';

export class AdyenService implements PaymentProviderService {
  constructor(
    private readonly logService: LogService,
    private readonly providerClient: AdyenClient,
  ) {}

  /**
   * Create a shopper reference for Adyen.
   *
   * Adyen has no Customer API — shoppers are identified by a shopperReference
   * string passed with each payment. This method generates and returns the
   * reference without making an API call.
   */
  async createCustomer(params: CreateCustomerParams): Promise<ProviderCustomer> {
    this.logService.info('Creating customer (shopper reference)', 'AdyenService', params);

    const shopperReference = params.metadata?.root_policy_id
      ? `root_${params.metadata.root_policy_id}`
      : `root_${Date.now()}`;

    return {
      id: shopperReference,
      email: params.email,
      name: params.name ?? null,
      metadata: params.metadata,
    };
  }

  /**
   * Get customer details.
   *
   * Since Adyen has no customer API, this returns the shopperReference as-is.
   */
  async getCustomer(customerId: string): Promise<ProviderCustomer> {
    this.logService.info('Getting customer', 'AdyenService', { customerId });
    return {
      id: customerId,
      email: null,
      name: null,
    };
  }

  /**
   * Update customer details.
   *
   * No-op for Adyen since there is no customer API.
   */
  async updateCustomer(
    customerId: string,
    params: { email?: string; name?: string; metadata?: Record<string, string> },
  ): Promise<ProviderCustomer> {
    this.logService.info('Updating customer', 'AdyenService', { customerId, ...params });
    return {
      id: customerId,
      email: params.email ?? null,
      name: params.name ?? null,
      metadata: params.metadata,
    };
  }

  /**
   * Create a payment via Adyen Checkout API.
   *
   * For merchant-initiated recurring payments, uses storedPaymentMethodId
   * with shopperInteraction: ContAuth.
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntent> {
    this.logService.info('Creating payment intent', 'AdyenService', params);

    try {
      const merchantAccount = this.providerClient.getMerchantAccount();
      const paymentMethodId = params.metadata?.paymentMethodId;

      const requestBody: Record<string, any> = {
        merchantAccount,
        amount: {
          currency: params.currency,
          value: params.amount,
        },
        reference: params.metadata?.rootPaymentId ?? `payment_${Date.now()}`,
        shopperReference: params.customerId,
        shopperInteraction: 'ContAuth',
        recurringProcessingModel: 'Subscription',
        paymentMethod: {
          type: 'scheme',
          storedPaymentMethodId: paymentMethodId,
        },
      };

      const response = await retryWithBackoff(() =>
        this.providerClient.sdk.post<any>('/payments', requestBody),
      );

      return {
        id: response.pspReference,
        status: response.resultCode,
        amount: params.amount,
        currency: params.currency,
      };
    } catch (err) {
      this.logService.error('Failed to create payment intent', 'AdyenService', { error: (err as Error).message });
      throw new ModuleError('Failed to create payment intent', { cause: err });
    }
  }

  /**
   * Attach a payment method (store the token reference).
   *
   * In Adyen, tokenization happens during the first payment with storePaymentMethod: true.
   * The storedPaymentMethodId is received via webhook (recurring.token.created).
   * This method simply records the association.
   */
  async attachPaymentMethod(params: AttachPaymentMethodParams): Promise<ProviderPaymentMethod> {
    this.logService.info('Attaching payment method', 'AdyenService', params);
    return {
      id: params.paymentMethodId,
      type: 'scheme',
    };
  }

  /**
   * Get payment method details from Adyen.
   */
  async getPaymentMethod(paymentMethodId: string): Promise<ProviderPaymentMethod> {
    this.logService.info('Getting payment method', 'AdyenService', { paymentMethodId });
    return {
      id: paymentMethodId,
      type: 'scheme',
    };
  }

  /**
   * Cancel a subscription by disabling the stored payment method token.
   *
   * Calls DELETE /storedPaymentMethods/{id} to remove the token.
   */
  async cancelSubscription(subscriptionId: string): Promise<ProviderSubscription> {
    this.logService.info('Cancelling subscription (disabling token)', 'AdyenService', { subscriptionId });

    try {
      const merchantAccount = this.providerClient.getMerchantAccount();

      await retryWithBackoff(() =>
        this.providerClient.sdk.delete(
          `/storedPaymentMethods/${subscriptionId}?merchantAccount=${encodeURIComponent(merchantAccount)}`,
        ),
      );

      return {
        id: subscriptionId,
        status: 'disabled',
      };
    } catch (err) {
      this.logService.error('Failed to cancel subscription', 'AdyenService', { error: (err as Error).message });
      throw new ModuleError('Failed to cancel subscription (disable token)', { cause: err });
    }
  }
}
