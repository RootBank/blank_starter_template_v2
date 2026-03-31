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
