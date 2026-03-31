/**
 * Lifecycle Hooks
 *
 * These are called by the Root platform at various points in the policy lifecycle.
 *
 * Architecture:
 * - Uses dependency injection via getContainer()
 * - Organized by domain (payment methods, payments, policy)
 * - Each hook resolves services as needed
 */

// Payment Method Hooks
export {
  createPaymentMethod,
  renderCreatePaymentMethod,
  renderViewPaymentMethodSummary,
  renderViewPaymentMethod,
  afterPolicyPaymentMethodAssigned,
  afterPaymentMethodRemoved,
} from './payment-method.hooks';

// Payment Hooks
export { afterPaymentCreated, afterPaymentUpdated } from './payment.hooks';

// Policy Hooks
export {
  afterPolicyIssued,
  afterPolicyUpdated,
  afterPolicyCancelled,
  afterPolicyExpired,
  afterPolicyLapsed,
  afterAlterationPackageApplied,
} from './policy.hooks';
