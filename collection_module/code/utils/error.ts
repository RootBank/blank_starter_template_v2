import { getConfigService } from '../services/config-instance';

export default class ModuleError extends Error {
  constructor(message: string, metadata?: Record<string, any>) {
    const metadataString = JSON.stringify(metadata);
    const stackTrace = new Error('Error').stack;
    const caller = stackTrace?.split('\n')[2].trim().split(' ')[1];
    const config = getConfigService();
    super(
      `[${config.get('environment')} | ${caller}] ${message} ${metadataString}`
    );
  }
}
