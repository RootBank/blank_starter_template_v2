/**
 * Payment Lifecycle Hooks
 *
 * Handles payment creation and updates
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';

/**
 * Called after a payment is created
 *
 * TODO: Implement payment creation logic
 * - Resolve provider service via DI token
 * - Create a payment intent in the provider
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
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

  logService.info('Payment created', 'afterPaymentCreated', {
    policyId: policy.policy_id,
    paymentId: payment.payment_id,
  });

  // TODO: Implement provider-specific logic. Example:
  //
  // import { PaymentProviderService } from '../interfaces/provider.interfaces';
  // const providerService = container.resolve<PaymentProviderService>(ServiceToken.PROVIDER_SERVICE);
  // await providerService.createPaymentIntent({
  //   amount: payment.amount,
  //   currency: payment.currency,
  //   customerId: policy.app_data?.provider_customer_id,
  //   metadata: { payment_id: payment.payment_id },
  // });
}

/**
 * Called after a payment is updated
 *
 * TODO: Implement payment update logic
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
 */
export async function afterPaymentUpdated({
  policy,
  payment,
}: {
  policy: any;
  payment: any;
}): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Payment updated', 'afterPaymentUpdated', {
    policyId: policy.policy_id,
    paymentId: payment.payment_id,
  });

  // Stub — implement your logic here
}
