/**
 * Collection Module — Main Entry Point
 *
 * Initialises the DI container and exports all lifecycle hooks and webhook handler.
 * The Root Platform calls these exports by the exact key names listed below.
 *
 * ── Lifecycle Hook → Root Platform key mapping ────────────────────────────────
 *
 * PAYMENT METHOD HOOKS  (code/lifecycle-hooks/payment-method.hooks.ts)
 *   createPaymentMethod              → called when Root captures a new payment method
 *   renderCreatePaymentMethod        → renders the payment capture form (HTML)
 *   renderViewPaymentMethodSummary   → renders compact payment method card (HTML)
 *   renderViewPaymentMethod          → renders full payment method detail view (HTML)
 *   afterPolicyPaymentMethodAssigned → called after payment method is linked to a policy
 *   afterPaymentMethodRemoved        → called after payment method is detached
 *
 * POLICY HOOKS  (code/lifecycle-hooks/policy.hooks.ts)
 *   afterPolicyIssued                → called when a new policy is issued
 *   afterPolicyUpdated               → called when policy data changes
 *   afterPolicyCancelled             → called when a policy is cancelled
 *   afterPolicyExpired               → called when a policy expires
 *   afterPolicyLapsed                → called when a policy lapses (non-payment)
 *   afterAlterationPackageApplied    → called when an alteration is applied to a policy
 *
 * PAYMENT HOOKS  (code/lifecycle-hooks/payment.hooks.ts)
 *   afterPaymentCreated              → called when Root creates a new payment record
 *   afterPaymentUpdated              → called when a payment record changes
 *
 * WEBHOOK HANDLER  (code/webhook-hooks.ts)
 *   processWebhookRequest            → called for every inbound webhook from your provider
 *
 * ── Implementation guide ──────────────────────────────────────────────────────
 *
 * See docs/07-LIFECYCLE-HOOKS.md   for hook implementation patterns
 * See docs/08-WEBHOOKS.md          for webhook routing patterns
 * See docs/STRIPE-REFERENCE.md     for a complete working example of all hooks
 * See docs/13-BUILD-FROM-SPEC.md   for the full build-from-spec workflow
 */

import { getContainer } from './core/container.setup';

// Initialise the DI container on module load.
// This wires up ConfigurationService, LogService, RootClient, and your provider.
getContainer();

// Export all lifecycle hooks and the webhook handler.
// The Root Platform resolves each export by its function name — do not rename them.
export * from './lifecycle-hooks/';
export * from './webhook-hooks';
