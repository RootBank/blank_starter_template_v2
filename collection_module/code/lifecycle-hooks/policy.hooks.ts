/**
 * Policy Lifecycle Hooks
 *
 * Handles various policy lifecycle events
 */

import { getContainer } from '../core/container.setup';
import { ServiceToken } from '../core/container';
import { LogService } from '../services/log.service';
import { AdyenService } from '../services/adyen.service';
import { AdyenToRootAdapter } from '../adapters/adyen-to-root-adapter';

/**
 * Called after a policy is issued.
 *
 * Creates an Adyen shopper reference and stores it in policy app_data.
 */
export async function afterPolicyIssued({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);
  const providerService = container.resolve<AdyenService>(ServiceToken.PROVIDER_SERVICE);
  const rootClient = container.resolve<any>(ServiceToken.ROOT_CLIENT);
  const adapter = new AdyenToRootAdapter();

  logService.info('Policy issued', 'afterPolicyIssued', {
    policyId: policy.policy_id,
  });

  const customer = await providerService.createCustomer({
    email: policy.policyholder?.email ?? '',
    name: policy.policyholder
      ? `${policy.policyholder.first_name} ${policy.policyholder.last_name}`
      : undefined,
    metadata: { root_policy_id: policy.policy_id },
  });

  await rootClient.updatePolicy({
    policyId: policy.policy_id,
    body: { app_data: adapter.convertCustomerToAppData(customer) },
  });
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
 * Called after a policy is cancelled.
 *
 * Disables the Adyen stored payment method token to stop future charges.
 */
export async function afterPolicyCancelled({ policy }: { policy: any }): Promise<void> {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  logService.info('Policy cancelled', 'afterPolicyCancelled', {
    policyId: policy.policy_id,
  });

  const storedPaymentMethodId = policy.app_data?.adyen_stored_payment_method_id;
  if (storedPaymentMethodId) {
    const providerService = container.resolve<AdyenService>(ServiceToken.PROVIDER_SERVICE);
    await providerService.cancelSubscription(storedPaymentMethodId);
  }
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
