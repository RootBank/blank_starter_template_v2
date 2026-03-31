/**
 * Root Platform Client
 *
 * Singleton instance of the Root SDK Client initialized with configuration.
 *
 * @example
 * import rootClient from './clients/root-client';
 * const policy = await rootClient.getPolicyById({ policyId: 'pol_123' });
 */
import { RootSDKClient } from '@rootplatform/node-sdk';
import { getConfigService } from '../services/config-instance';

const config = getConfigService();
const apiKey = config.get('rootApiKey');
const baseUrl = config.get('rootBaseUrl');

const rootClient = new RootSDKClient(apiKey, baseUrl);

export default rootClient;
