/**
 * RenderService Tests
 *
 * These tests cover the stub behaviour and utility methods.
 * After implementing your provider's render methods, add
 * provider-specific assertions here.
 *
 * See: docs/10-TESTING.md for testing patterns
 */

import { RenderService } from '../../code/services/render.service';

describe('RenderService', () => {
  let renderService: RenderService;

  beforeEach(() => {
    renderService = new RenderService();
  });

  // ── Stub method contracts ─────────────────────────────────────────────────
  // Each method must return a string (even before it is implemented).

  describe('renderCreatePaymentMethod', () => {
    it('should return a string', () => {
      const result = renderService.renderCreatePaymentMethod({});
      expect(typeof result).toBe('string');
    });
  });

  describe('renderViewPaymentMethodSummary', () => {
    it('should return a string', () => {
      const result = renderService.renderViewPaymentMethodSummary({
        payment_method: { module: { payment_method: 'pm_test' } },
      });
      expect(typeof result).toBe('string');
    });
  });

  describe('renderViewPaymentMethod', () => {
    it('should return a string', () => {
      const result = renderService.renderViewPaymentMethod({
        payment_method: {
          collection_module_key: 'cm_test',
          module: { id: 'token_test_123', type: 'card', status: 'active' },
        },
        policy: { billing_day: 1 },
      });
      expect(typeof result).toBe('string');
    });
  });

  // ── Utility methods ───────────────────────────────────────────────────────

  describe('escapeHtml', () => {
    it('should escape angle brackets', () => {
      expect(renderService.escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('should escape ampersands', () => {
      expect(renderService.escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape double quotes', () => {
      expect(renderService.escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(renderService.escapeHtml("it's")).toBe('it&#039;s');
    });

    it('should not alter safe strings', () => {
      expect(renderService.escapeHtml('hello world 123')).toBe('hello world 123');
    });

    it('should prevent XSS payloads', () => {
      const xss = '<script>alert("xss")</script>';
      expect(renderService.escapeHtml(xss)).not.toContain('<script>');
    });
  });

  describe('escapeJs', () => {
    it('should escape backslashes', () => {
      expect(renderService.escapeJs('a\\b')).toBe('a\\\\b');
    });

    it('should escape single quotes', () => {
      expect(renderService.escapeJs("it's")).toBe(String.raw`it\'s`);
    });

    it('should escape double quotes', () => {
      expect(renderService.escapeJs('"hello"')).toBe(String.raw`\"hello\"`);
    });

    it('should escape newlines', () => {
      expect(renderService.escapeJs('a\nb')).toBe(String.raw`a\nb`);
    });

    it('should not alter safe strings', () => {
      expect(renderService.escapeJs('test_provider_key_abc123')).toBe('test_provider_key_abc123');
    });
  });
});
