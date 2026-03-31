/**
 * RootClient Tests
 */

jest.mock('../../code/services/config-instance', () => ({
  getConfigService: jest.fn(() => ({
    get: jest.fn((key: string) => {
      if (key === 'rootApiKey') return 'test_root_key';
      if (key === 'rootBaseUrl') return 'https://test.root.co.za';
      return null;
    }),
  })),
}));

import rootClient from '../../code/clients/root-client';

describe('RootClient', () => {
  it('should export the Root SDK namespace', () => {
    expect(rootClient).toBeDefined();
  });

  it('should have getPolicyById function', () => {
    expect(rootClient.getPolicyById).toBeDefined();
    expect(typeof rootClient.getPolicyById).toBe('function');
  });

  it('should have updatePaymentsAsync function', () => {
    expect(rootClient.updatePaymentsAsync).toBeDefined();
    expect(typeof rootClient.updatePaymentsAsync).toBe('function');
  });
});
