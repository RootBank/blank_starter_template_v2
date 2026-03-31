/**
 * RootService - Business logic for Root Platform operations
 *
 * This service provides a high-level interface for Root Platform operations.
 * It wraps the Root client and provides domain-specific methods.
 */

import * as root from '@rootplatform/node-sdk';
import { LogService } from './log.service';
import { RootClient } from '../clients/root-client';

export interface UpdatePaymentStatusParams {
  paymentId: string;
  status: root.PaymentStatus;
  failureReason?: string;
  failureAction?: root.FailureAction;
}

export class RootService {
  constructor(
    private readonly logService: LogService,
    private readonly rootClient: RootClient
  ) {}

  /**
   * Get a policy by ID
   */
  async getPolicy(policyId: string): Promise<root.Policy> {
    this.logService.debug(`Getting policy: ${policyId}`, 'RootService');

    try {
      const result = await this.rootClient.getPolicyById({ policyId });
      return result;
    } catch (error: any) {
      this.logService.error(
        `Failed to get policy: ${error.message}`,
        'RootService',
        { policyId, error }
      );
      throw error;
    }
  }

  /**
   * Update payment status on Root Platform
   */
  async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
    this.logService.info('Updating payment status', 'RootService', params);

    try {
      await this.rootClient.updatePaymentsAsync({
        paymentUpdates: [
          {
            payment_id: params.paymentId,
            status: params.status,
            failure_reason: params.failureReason,
            failure_action: params.failureAction,
          },
        ],
      });

      this.logService.info(
        'Payment status updated successfully',
        'RootService',
        {
          paymentId: params.paymentId,
          status: params.status,
        }
      );
    } catch (error: any) {
      this.logService.error(
        `Failed to update payment status: ${error.message}`,
        'RootService',
        { params, error }
      );
      throw error;
    }
  }
}
