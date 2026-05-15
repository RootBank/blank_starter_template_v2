/**
 * RenderService - HTML rendering for Root dashboard views
 *
 * This service consolidates all HTML rendering used by lifecycle hooks
 * to display UI elements in the Root dashboard.
 *
 * TODO: After scaffolding your provider, implement the render methods below.
 * Each method should return a complete HTML string for its view.
 *
 * See: docs/07-LIFECYCLE-HOOKS.md#rendering for patterns
 * See: docs/STRIPE-REFERENCE.md#render-service for a complete working example
 */

// ── Param interfaces ─────────────────────────────────────────────────────────
// TODO: Replace these with your provider's actual param types.

export interface RenderPaymentMethodParams {
  [key: string]: any;
}

export interface ViewPaymentMethodSummaryParams {
  payment_method: {
    module: Record<string, any>;
  };
  [key: string]: any;
}

export interface ViewPaymentMethodParams {
  payment_method: {
    collection_module_key: string;
    module: Record<string, any>;
  };
  policy: {
    billing_day: number;
  };
}

// ── Service ──────────────────────────────────────────────────────────────────

export class RenderService {
  /**
   * Renders the payment method capture form (shown in Root dashboard).
   *
   * TODO: Implement using your provider's JS SDK or hosted fields.
   * Return a complete HTML string — use escapeJs() to safely embed secrets.
   *
   * @example
   *   // See docs/STRIPE-REFERENCE.md#render-service for a complete working example.
   *   const { clientSecret, publishableKey } = params;
   *   return `<script src="https://js.yourprovider.com/v3/"></script>
   *           <div id="payment-element"></div>
   *           <script>
   *             const provider = ProviderSDK('${this.escapeJs(publishableKey)}');
   *           </script>`;
   */
  renderCreatePaymentMethod(_params: RenderPaymentMethodParams): string {
    // TODO: implement
    return '';
  }

  /**
   * Renders a compact payment method summary card (shown in policy list views).
   *
   * TODO: Implement to display the key details of the stored payment method
   * (e.g. card brand + last 4 digits, bank account number, etc.).
   * Use escapeHtml() on any user-supplied values.
   */
  renderViewPaymentMethodSummary(_params: ViewPaymentMethodSummaryParams): string {
    // TODO: implement
    return '';
  }

  /**
   * Renders the full payment method details view (shown in policy detail view).
   *
   * TODO: Implement to display all stored module fields in a formatted table.
   * Use escapeHtml() on every field value to prevent XSS.
   */
  renderViewPaymentMethod(_params: ViewPaymentMethodParams): string {
    // TODO: implement
    return '';
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  /**
   * Escape HTML to prevent XSS — use on all user-supplied or API-returned values
   * embedded in HTML output.
   */
  escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replaceAll(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Escape JavaScript strings for safe embedding inside HTML <script> tags.
   */
  escapeJs(text: string): string {
    return text
      .replaceAll('\\', '\\\\')
      .replaceAll("'", String.raw`\'`)
      .replaceAll('"', String.raw`\"`)
      .replaceAll('\n', String.raw`\n`)
      .replaceAll('\r', String.raw`\r`)
      .replaceAll('\t', String.raw`\t`);
  }
}
