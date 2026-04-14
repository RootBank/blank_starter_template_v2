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

export const processWebhookRequest = async (request: any) => {
  const container = getContainer();
  const logService = container.resolve<LogService>(ServiceToken.LOG_SERVICE);

  try {
    // ── Step 1: Verify webhook signature ──────────────────────────────────────
    //
    // TODO: Uncomment and fill in after scaffolding your provider.
    //
    // import { getConfigService } from './services/config-instance';
    // const providerClient = container.resolve(ServiceToken.PROVIDER_CLIENT);
    // const config = getConfigService();
    // const isValid = providerClient.verifyWebhookSignature(
    //   { body: request.request.body, headers: request.request.headers },
    //   config.get('providerWebhookSigningSecret'),
    // );
    // if (!isValid) {
    //   logService.warn('Webhook signature verification failed', 'WebhookHandler');
    //   return {
    //     response: {
    //       status: 403,
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify({ error: 'Invalid signature' }),
    //     },
    //   };
    // }

    // ── Step 2: Parse event ───────────────────────────────────────────────────
    //
    // Option A (recommended): Use WebhookParser for provider-agnostic parsing.
    // After scaffolding, register a WebhookParser and use:
    //
    // import { WebhookParser, ParsedWebhookEvent } from './interfaces/provider.interfaces';
    // const parser = container.resolve<WebhookParser>(ServiceToken.WEBHOOK_PARSER);
    // const config = getConfigService();
    // const events = parser.verifyAndParse(
    //   request.request.headers,
    //   request.request.body,
    //   config.get('providerWebhookSigningSecret'),
    // );
    // for (const event of events) {
    //   switch (event.eventType) { /* route each event */ }
    // }
    //
    // Option B (simple): Parse directly (assumes Stripe-style flat structure).

    const payload = JSON.parse(request.request.body as string);

    logService.info('Received webhook', 'WebhookHandler', {
      type: payload.type,
    });

    // ── Step 3: Route events ──────────────────────────────────────────────────
    //
    // The scaffold prints the exact import line for your provider's events file.
    // The constant is named {YOURPROVIDER}_EVENTS — e.g. GOCARDLESS_EVENTS.
    // File location: code/interfaces/{provider}-events.ts
    //
    // Example after scaffolding GoCardless:
    //
    // import { GOCARDLESS_EVENTS } from './interfaces/gocardless-events';
    //
    // switch (payload.type) {
    //   case GOCARDLESS_EVENTS.PAYMENT_COMPLETED: {
    //     const controller = container.resolve(ServiceToken.PAYMENT_COMPLETED_CONTROLLER);
    //     await controller.handle(payload);
    //     break;
    //   }
    //   case GOCARDLESS_EVENTS.PAYMENT_FAILED: {
    //     const controller = container.resolve(ServiceToken.PAYMENT_FAILED_CONTROLLER);
    //     await controller.handle(payload);
    //     break;
    //   }
    //   default:
    //     logService.info(`Unhandled event: ${payload.type}`, 'WebhookHandler');
    // }

    return {
      response: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received: true }),
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
