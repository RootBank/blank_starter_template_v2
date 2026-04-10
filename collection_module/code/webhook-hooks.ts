/**
 * Webhook Hooks
 *
 * Verifies webhook signatures and routes provider events to controllers.
 *
 * TODO: After running `npm run scaffold:provider`, implement the three steps below.
 * See: docs/09-WEBHOOKS.md for patterns
 * See: docs/STRIPE-REFERENCE.md#webhook-routing for a complete working example
 */

import { getContainer } from './core/container.setup';
import { ServiceToken } from './core/container';
import { LogService } from './services/log.service';
import { ConfigurationService } from './services/config.service';
import { ADYEN_EVENTS, AdyenWebhookPayload } from './interfaces/adyen-events';
import AdyenClient from './clients/adyen-client';
import { AdyenToRootAdapter, PaymentStatus } from './adapters/adyen-to-root-adapter';

export const processWebhookRequest = async (request: any) => {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  try {
    // ── Step 1: Verify webhook signature ──────────────────────────────────────

    const providerClient = container.resolve<AdyenClient>(ServiceToken.PROVIDER_CLIENT);
    const config = container.resolve<ConfigurationService>(ServiceToken.CONFIG_SERVICE);
    const isValid = providerClient.verifyWebhookSignature(
      { body: request.request.body, headers: request.request.headers },
      config.get('providerWebhookSigningSecret'),
    );
    if (!isValid) {
      logService.warn('Webhook signature verification failed', 'WebhookHandler');
      return {
        response: {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid signature' }),
        },
      };
    }

    // ── Step 2: Parse event ───────────────────────────────────────────────────

    const body =
      typeof request.request.body === 'string'
        ? request.request.body
        : request.request.body.toString('utf-8');
    const payload: AdyenWebhookPayload = JSON.parse(body);
    const items = payload.notificationItems ?? [];

    // Process each notification item (Adyen may batch multiple items)
    for (const item of items) {
      const notification = item.NotificationRequestItem;

      logService.info('Received webhook', 'WebhookHandler', {
        eventCode: notification.eventCode,
        success: notification.success,
        pspReference: notification.pspReference,
      });

      // ── Step 3: Route events ────────────────────────────────────────────────

      const adapter = new AdyenToRootAdapter();
      const rootService = container.resolve<any>(ServiceToken.ROOT_SERVICE);
      const isSuccess = notification.success === 'true';

      switch (notification.eventCode) {
        case ADYEN_EVENTS.AUTHORISATION: {
          const status = isSuccess
            ? PaymentStatus.Successful
            : PaymentStatus.Failed;
          const update = adapter.convertPaymentToRootUpdate(notification, {
            status,
            failureReason: isSuccess ? undefined : notification.reason,
          });
          await rootService.updatePaymentStatus(
            notification.merchantReference,
            update,
          );
          break;
        }

        case ADYEN_EVENTS.CANCELLATION: {
          const update = adapter.convertPaymentToRootUpdate(notification, {
            status: PaymentStatus.Cancelled,
          });
          await rootService.updatePaymentStatus(
            notification.merchantReference,
            update,
          );
          break;
        }

        case ADYEN_EVENTS.REFUND: {
          if (isSuccess) {
            const update = adapter.convertPaymentToRootUpdate(notification, {
              status: PaymentStatus.Cancelled,
            });
            await rootService.updatePaymentStatus(
              notification.merchantReference,
              update,
            );
          }
          break;
        }

        case ADYEN_EVENTS.REFUND_FAILED: {
          logService.warn('Refund failed', 'WebhookHandler', {
            pspReference: notification.pspReference,
            reason: notification.reason,
          });
          break;
        }

        case ADYEN_EVENTS.CHARGEBACK: {
          const update = adapter.convertPaymentToRootUpdate(notification, {
            status: PaymentStatus.Failed,
            failureReason: 'Chargeback received',
          });
          await rootService.updatePaymentStatus(
            notification.merchantReference,
            update,
          );
          break;
        }

        default:
          logService.info(
            `Unhandled event: ${notification.eventCode}`,
            'WebhookHandler',
          );
      }
    }

    // Adyen requires "[accepted]" in the response body
    return {
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '[accepted]',
      },
    };
  } catch (error: any) {
    logService.error('Error processing webhook', 'WebhookHandler', {
      error: error.message,
    });

    return {
      response: {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Internal server error' }),
      },
    };
  }
};
