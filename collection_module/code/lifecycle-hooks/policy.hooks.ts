/**
 * Policy Lifecycle Hooks
 *
 * Handles various policy lifecycle events
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';

/**
 * Called after a policy is issued
 *
 * TODO: Implement policy issued logic
 * - Resolve the provider service via DI: container.resolve(ServiceToken.PROVIDER_SERVICE)
 * - Create a customer in the provider
 * - Update policy.app_data with provider customer ID
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
 * Type as PaymentProviderService from provider.interfaces.ts.
 */
export async function afterPolicyIssued({
  policy,
}: {
  policy: any;
}): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy issued', 'afterPolicyIssued', {
    policyId: policy?.policy_id,
  });

  // TODO: Implement provider-specific logic. Example:
  //
  // import { PaymentProviderService } from '../interfaces/provider.interfaces';
  // const providerService = container.resolve<PaymentProviderService>(ServiceToken.PROVIDER_SERVICE);
  // const customer = await providerService.createCustomer({
  //   email: policy.policyholder?.email,
  //   name: policy.policyholder?.first_name,
  //   metadata: { policy_id: policy.policy_id },
  // });
  //
  // const rootClient = container.resolve(ServiceToken.ROOT_CLIENT);
  // await rootClient.updatePolicy(policy.policy_id, {
  //   app_data: { provider_customer_id: customer.id },
  // });
}

/**
 * Called after a policy is updated
 *
 * TODO: Implement policy update logic
 */
export function afterPolicyUpdated({
  policy,
  updates,
}: {
  policy: any;
  updates: any;
}): void {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy updated', 'afterPolicyUpdated', {
    policyId: policy.policy_id,
    updates,
  });

  // Stub - implement your logic here
}

/**
 * Called after a policy is cancelled
 *
 * TODO: Implement policy cancellation logic
 * - Resolve provider service via DI token
 * - Cancel the subscription in the provider if applicable
 *
 * IMPORTANT: Use DI tokens only — never import provider classes directly.
 */
export async function afterPolicyCancelled({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy cancelled', 'afterPolicyCancelled', {
    policyId: policy.policy_id,
  });

  // TODO: Implement provider-specific logic. Example:
  //
  // import { PaymentProviderService } from '../interfaces/provider.interfaces';
  // const providerService = container.resolve<PaymentProviderService>(ServiceToken.PROVIDER_SERVICE);
  // const subscriptionId = policy.app_data?.provider_subscription_id;
  // if (subscriptionId) {
  //   await providerService.cancelSubscription(subscriptionId);
  // }
}

/**
 * Called after a policy expires
 *
 * TODO: Implement policy expiration logic
 */
export function afterPolicyExpired({ policy }: { policy: any }): void {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy expired', 'afterPolicyExpired', {
    policyId: policy.policy_id,
  });

  // Stub - implement your logic here
}

/**
 * Called after a policy lapses
 *
 * TODO: Implement policy lapse logic
 */
export function afterPolicyLapsed({ policy }: { policy: any }): void {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy lapsed', 'afterPolicyLapsed', {
    policyId: policy.policy_id,
  });

  // Stub - implement your logic here
}

/**
 * Called after an alteration package is applied to a policy
 *
 * TODO: Implement alteration package logic
 */
export function afterAlterationPackageApplied({
  policy,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  alteration_package,
  alteration_hook_key,
}: {
  policy: any;
  alteration_package: any;
  alteration_hook_key: string;
}): void {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info(
    'Alteration package applied',
    'afterAlterationPackageApplied',
    {
      policyId: policy.policy_id,
      alterationHookKey: alteration_hook_key,
    }
  );

  // Stub - implement your logic here
}
