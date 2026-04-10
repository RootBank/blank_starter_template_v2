/**
 * Payment Lifecycle Hooks
 *
 * Handles payment creation and updates
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';

/**
 * Called after a payment is created.
 *
 * Initiates a merchant-initiated recurring payment via Adyen using
 * the stored payment method token.
 */
export async function afterPaymentCreated({
  policy,
  payment,
}: {
  policy: any;
  payment: any;
}): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);
  const providerService = container.resolve<any>(ServiceToken.PROVIDER_SERVICE);

  logService.info('Payment created', 'afterPaymentCreated', {
    policyId: policy.policy_id,
    paymentId: payment.payment_id,
  });

  const shopperReference = policy.app_data?.adyen_shopper_reference;
  const storedPaymentMethodId = policy.app_data?.adyen_stored_payment_method_id;

  if (!shopperReference || !storedPaymentMethodId) {
    logService.warn(
      'Missing Adyen shopper reference or stored payment method, skipping payment',
      'afterPaymentCreated',
      { policyId: policy.policy_id },
    );
    return;
  }

  await providerService.createPaymentIntent({
    amount: payment.amount,
    currency: policy.currency ?? 'ZAR',
    customerId: shopperReference,
    metadata: {
      rootPaymentId: payment.payment_id,
      rootPolicyId: policy.policy_id,
      paymentMethodId: storedPaymentMethodId,
    },
  });
}

/**
 * Called after a payment is updated
 *
 * TODO: Implement payment update logic
 */
export function afterPaymentUpdated({
  policy,
  payment,
}: {
  policy: any;
  payment: any;
}): void {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Payment updated', 'afterPaymentUpdated', {
    policyId: policy.policy_id,
    paymentId: payment.payment_id,
  });

  // Stub - implement your logic here
}
