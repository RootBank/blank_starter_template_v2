/**
 * Payment Method Lifecycle Hooks
 *
 * Handles payment method creation, rendering, and assignment.
 *
 * TODO: After scaffolding your provider, implement the render functions
 * using your provider client to create setup/payment intents.
 *
 * See: docs/07-LIFECYCLE-HOOKS.md for patterns
 * See: docs/STRIPE-REFERENCE.md#lifecycle-hooks for a complete example
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';

/**
 * Called when a payment method is submitted.
 * Returns the module data structure stored on the Root payment method.
 *
 * TODO: Map your provider's payment method data into the module object.
 */
export function createPaymentMethod({ data }: { data?: any }): { module: any } {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Creating payment method', 'createPaymentMethod', data);

  return { module: data };
}

/**
 * Renders the payment method capture form (embedded in Root dashboard).
 *
 * TODO: Use your provider client to create a setup/payment intent,
 * then render the form using RenderService.
 *
 * @example
 *   const providerClient = container.resolve(ServiceToken.PROVIDER_CLIENT);
 *   const setupIntent = await providerClient.sdk.setupIntents.create({});
 *   return renderService.renderCreatePaymentMethod({ clientSecret: setupIntent.client_secret });
 */
export async function renderCreatePaymentMethod(): Promise<string> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Rendering payment method creation form', 'renderCreatePaymentMethod');

  // TODO: implement using your provider client
  return '';
}

/**
 * Renders a compact payment method summary card.
 *
 * TODO: Use your provider client to retrieve payment method details,
 * then render via RenderService.
 */
export async function renderViewPaymentMethodSummary(params: {
  payment_method: any;
}): Promise<string> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Rendering payment method summary', 'renderViewPaymentMethodSummary');

  if (!params.payment_method) {
    return '<div>No payment method found</div>';
  }

  // TODO: implement using your provider client
  return '';
}

/**
 * Renders the full payment method details view.
 *
 * TODO: Implement if your dashboard requires a detailed view.
 */
export function renderViewPaymentMethod(): string {
  return '';
}

/**
 * Called after a payment method is assigned to a policy.
 *
 * TODO: Attach the payment method to the provider customer record if required.
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
 */
export async function afterPolicyPaymentMethodAssigned({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Payment method assigned to policy', 'afterPolicyPaymentMethodAssigned', {
    policyId: policy.policy_id,
  });

  // TODO: Implement provider-specific logic. Example:
  //
  // import { PaymentProviderService } from '../interfaces/provider.interfaces';
  // const providerService = container.resolve<PaymentProviderService>(ServiceToken.PROVIDER_SERVICE);
  // await providerService.attachPaymentMethod({
  //   paymentMethodId: policy.payment_method?.module?.id,
  //   customerId: policy.app_data?.provider_customer_id,
  // });
}

/**
 * Called after a payment method is removed from a policy.
 *
 * TODO: Detach the payment method from the provider if required.
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
 */
export async function afterPaymentMethodRemoved({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Payment method removed from policy', 'afterPaymentMethodRemoved', {
    policyId: policy.policy_id,
  });

  // Stub — implement your logic here
}
