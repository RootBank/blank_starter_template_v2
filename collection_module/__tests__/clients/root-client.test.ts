/**
 * RootClient Tests
 */

jest.mock('../../code/services/config-instance', () => ({
  getConfigService: () => ({
    get: (key: string) => {
      if (key === 'rootApiKey') return 'test_root_key';
      if (key === 'rootBaseUrl') return 'https://sandbox.rootplatform.com/v1/insurance';
      return null;
    },
  }),
}));

import { RootClient } from '../../code/clients/root-client';

describe('RootClient', () => {
  let client: RootClient;

  beforeEach(() => {
    client = new RootClient();
  });

  it('should instantiate via constructor', () => {
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(RootClient);
  });

  it('should expose getPolicyById', () => {
    expect(typeof client.getPolicyById).toBe('function');
  });

  it('should expose updatePaymentsAsync', () => {
    expect(typeof client.updatePaymentsAsync).toBe('function');
  });

  it('should expose getPolicyPaymentMethod', () => {
    expect(typeof client.getPolicyPaymentMethod).toBe('function');
  });

  it('should expose updatePolicy', () => {
    expect(typeof client.updatePolicy).toBe('function');
  });
});
