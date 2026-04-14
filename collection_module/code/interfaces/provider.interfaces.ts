/**
 * Payment Provider Interfaces
 *
 * These interfaces define the contracts that any payment provider must fulfill
 * to integrate with the Root Platform collection module.
 *
 * Your scaffolded provider files implement these interfaces.
 * See: docs/STRIPE-REFERENCE.md for a complete working example.
 */

// =============================================================================
// Provider Client Interface
// =============================================================================

export interface PaymentProviderClient {
  /** The underlying SDK instance or API client */
  readonly sdk: any;

  /**
   * Verify a webhook request's authenticity
   * @param request - The raw webhook request with headers and body
   * @param secret - The webhook signing secret
   * @returns true if the signature is valid
   */
  verifyWebhookSignature(request: WebhookRequest, secret: string): boolean;
}

// =============================================================================
// Provider Service Interface
// =============================================================================

export interface PaymentProviderService {
  createCustomer(params: CreateCustomerParams): Promise<ProviderCustomer>;
  getCustomer(customerId: string): Promise<ProviderCustomer>;
  updateCustomer(
    customerId: string,
    params: UpdateCustomerParams
  ): Promise<ProviderCustomer>;
  createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<ProviderPaymentIntent>;
  getPaymentMethod(
    paymentMethodId: string
  ): Promise<ProviderPaymentMethod>;
  attachPaymentMethod(
    params: AttachPaymentMethodParams
  ): Promise<ProviderPaymentMethod>;
  cancelSubscription(
    subscriptionId: string
  ): Promise<ProviderSubscription>;
}

// =============================================================================
// Provider-to-Root Adapter Interface
// =============================================================================

export interface ProviderToRootAdapter {
  /**
   * Convert a provider payment event to a Root payment update
   */
  convertPaymentToRootUpdate(
    providerPayment: any,
    params: ConvertPaymentParams
  ): RootPaymentUpdate;

  /**
   * Convert provider customer data to Root app_data format
   */
  convertCustomerToAppData(
    providerCustomer: any
  ): Record<string, any>;
}

// =============================================================================
// Common Data Types
// =============================================================================

export interface ProviderCustomer {
  id: string;
  email: string | null;
  name: string | null;
  metadata?: Record<string, string>;
}

export interface ProviderPaymentIntent {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

export interface ProviderPaymentMethod {
  id: string;
  type: string;
}

export interface ProviderSubscription {
  id: string;
  status: string;
}

// =============================================================================
// Request/Param Types
// =============================================================================

export interface WebhookRequest {
  headers: Record<string, string>;
  body: string | Buffer;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: { object: any };
}

/**
 * Parsed webhook event — provider-agnostic structure after parsing.
 * The WebhookParser converts raw provider payloads into this shape,
 * allowing webhook-hooks.ts to work with any provider format.
 *
 * Examples of provider-specific payloads that map to this:
 * - Stripe: `{ type, data: { object } }` → single ParsedWebhookEvent
 * - Adyen: `{ notificationItems: [...] }` → multiple ParsedWebhookEvents
 * - GoCardless: `{ events: [...] }` → multiple ParsedWebhookEvents
 */
export interface ParsedWebhookEvent {
  /** The event type string (e.g., 'payment.succeeded', 'AUTHORISATION') */
  eventType: string;
  /** The primary reference ID for the event (e.g., payment ID, subscription ID) */
  reference: string;
  /** The parsed event data */
  data: Record<string, unknown>;
  /** The raw event object for provider-specific access */
  rawEvent: unknown;
}

/**
 * WebhookParser — converts provider-specific webhook payloads into ParsedWebhookEvents.
 * Implement this per provider to decouple webhook-hooks.ts from event structure.
 *
 * Register as ServiceToken.WEBHOOK_PARSER in container.setup.ts.
 */
export interface WebhookParser {
  /**
   * Verify the webhook signature and parse the body into normalized events.
   * @param headers - The raw request headers
   * @param body - The raw request body
   * @param secret - The webhook signing secret
   * @returns Array of parsed events (most providers return 1, some batch multiple)
   * @throws Error if signature verification fails
   */
  verifyAndParse(
    headers: Record<string, string>,
    body: string | Buffer,
    secret: string,
  ): ParsedWebhookEvent[];
}

export interface CreateCustomerParams {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface UpdateCustomerParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  customerId: string;
  description?: string;
  metadata?: Record<string, string>;
  confirm?: boolean;
  offSession?: boolean;
}

export interface AttachPaymentMethodParams {
  paymentMethodId: string;
  customerId: string;
}

export interface ConvertPaymentParams {
  status: string;
  failureReason?: string;
  failureAction?: string;
}

export interface RootPaymentUpdate {
  status: string;
  failureReason?: string;
  failureAction?: string;
  amount?: number;
  currency?: string;
  externalId?: string;
  metadata?: Record<string, any>;
}
