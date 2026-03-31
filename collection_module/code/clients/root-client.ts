/**
 * Root Platform Client
 *
 * Class wrapper around the Root SDK, registered in the DI container.
 * Resolves config at construction time so it works correctly with the
 * singleton lifetime in container.setup.ts.
 *
 * @example
 * // Resolved via DI — do not instantiate directly in application code:
 * const rootClient = container.resolve<RootClient>(ServiceToken.ROOT_CLIENT);
 * const policy = await rootClient.getPolicyById({ policyId: 'pol_123' });
 */
import { RootSDKClient } from '@rootplatform/node-sdk';
import { getConfigService } from '../services/config-instance';

export class RootClient {
  private readonly sdk: RootSDKClient;

  constructor() {
    const config = getConfigService();
    this.sdk = new RootSDKClient(
      config.get('rootApiKey'),
      config.get('rootBaseUrl')
    );
  }

  getPolicyById(params: { policyId: string }) {
    return this.sdk.getPolicyById(params);
  }

  updatePaymentsAsync(params: Parameters<RootSDKClient['updatePaymentsAsync']>[0]) {
    return this.sdk.updatePaymentsAsync(params);
  }

  getPolicyPaymentMethod(params: Parameters<RootSDKClient['getPolicyPaymentMethod']>[0]) {
    return this.sdk.getPolicyPaymentMethod(params);
  }

  updatePolicy(params: Parameters<RootSDKClient['updatePolicy']>[0]) {
    return this.sdk.updatePolicy(params);
  }
}

export default RootClient;
