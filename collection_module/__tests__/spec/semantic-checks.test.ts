import { AS_OF, loadExample, messages, validate } from './helpers/spec-helpers';

/** Mutate a deep-cloned copy of an example and validate it. */
function mutate(name: 'stripe' | 'bureau', change: (spec: any) => void) {
  const spec = loadExample(name);
  change(spec);
  return validate(spec);
}

describe('base URLs are API hosts, not documentation hosts', () => {
  // scripts/scaffold-provider.js derives --base-url from the API docs URL's
  // host, which is how developer.gocardless.com gets baked into a generated
  // HTTP client instead of api.gocardless.com. These are the shapes of that bug.
  it.each([
    ['the documentation host itself', 'https://docs.stripe.com', /uses the documentation host/],
    ['a developer. subdomain', 'https://developer.gocardless.com', /looks like a documentation host/],
    ['a docs path segment', 'https://gocardless.test/api-reference', /documentation path segment/],
  ])('rejects %s', (_name, url, pattern) => {
    const result = mutate('stripe', (spec) => {
      spec.api.base_urls.production = url;
    });
    expect(result.ok).toBe(false);
    expect(messages(result)).toMatch(pattern);
    expect(messages(result)).toContain('production base URL');
  });

  it('accepts a real API host with a version prefix', () => {
    const result = mutate('stripe', (spec) => {
      spec.api.base_urls.production = 'https://api.stripe.com/v1';
    });
    expect(result.errors).toEqual([]);
  });
});

describe('the status map covers every provider status the spec names', () => {
  it('fails when an event names a status with no row', () => {
    const result = mutate('stripe', (spec) => {
      spec.webhooks.events[0].provider_status = 'settled';
    });
    expect(messages(result)).toContain('provider status "settled" is named by webhook event "invoice.paid"');
    expect(messages(result)).toContain('has no status_map row');
  });

  it('fails when an endpoint returns a status with no row', () => {
    const result = mutate('stripe', (spec) => {
      spec.endpoints[3].provider_statuses.push('requires_action');
    });
    expect(messages(result)).toContain('provider status "requires_action" is named by endpoint "createPaymentIntent"');
  });

  it('fails when one status word is reused across objects and the reference does not disambiguate', () => {
    const result = mutate('stripe', (spec) => {
      spec.status_map.push({
        provider_status: 'paid',
        applies_to: 'charge',
        root_status: 'successful',
        source: spec.status_map[0].source,
      });
      delete spec.webhooks.events[0].applies_to;
    });
    expect(messages(result)).toContain('matches 2 status_map rows');
    expect(messages(result)).toContain('Set applies_to');
  });

  it('fails when no row reaches a terminal Root status', () => {
    const result = mutate('bureau', (spec) => {
      for (const row of spec.status_map) {
        if (row.root_status === 'successful') row.root_status = 'pending';
      }
    });
    expect(messages(result)).toContain('no status_map row maps to the Root status "successful"');
  });

  it('warns when nothing in the spec produces any status for a mapped object', () => {
    const result = mutate('stripe', (spec) => {
      spec.status_map.push({
        provider_status: 'refunded',
        applies_to: 'refund',
        root_status: 'cancelled',
        source: spec.status_map[0].source,
      });
    });
    expect(result.errors).toEqual([]);
    expect(messages(result)).toContain('nothing in this spec produces any status for "refund"');
  });
});

describe('webhook events must have a Root-side action', () => {
  it('fails when a failing event names no failure_action', () => {
    const result = mutate('stripe', (spec) => {
      delete spec.webhooks.events[1].root_action.failure_action;
    });
    expect(messages(result)).toContain('marks the payment failed but sets no failure_action');
  });

  it('fails when every subscribed event is ignored', () => {
    const result = mutate('stripe', (spec) => {
      spec.webhooks.events = [spec.webhooks.events[5]];
    });
    expect(messages(result)).toContain('every declared webhook event is ignored');
  });

  it('warns when a status-updating event does not say which provider status it carries', () => {
    const result = mutate('stripe', (spec) => {
      delete spec.webhooks.events[0].provider_status;
      delete spec.webhooks.events[0].applies_to;
    });
    expect(result.errors).toEqual([]);
    expect(messages(result)).toContain('does not say which provider status it carries');
  });
});

describe('citations', () => {
  it('fails a web citation to a host that is not declared in doc_hosts', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.url = 'https://stripe-docs.example.com/idempotency';
    });
    expect(messages(result)).toContain('cites "stripe-docs.example.com"');
    expect(messages(result)).toContain('not in provider.doc_hosts');
  });

  it('fails a web citation that points at a bare host', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.url = 'https://docs.stripe.com/';
    });
    expect(messages(result)).toContain('points at a bare host');
  });

  it('fails when a spec uses web citations without declaring doc_hosts', () => {
    const result = mutate('stripe', (spec) => {
      delete spec.provider.doc_hosts;
    });
    expect(messages(result)).toContain('provider.doc_hosts must declare which hosts a citation may come from');
  });

  it('fails a quote too short to locate in the source', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.quote = 'see the docs';
    });
    expect(messages(result)).toContain('quote must be at least 20 characters');
  });

  it('fails a long quote that is still a single token', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.quote = 'https://docs.stripe.com/idempotency';
    });
    expect(messages(result)).toContain('too thin to confirm against the source');
  });

  it('fails a quote that only repeats the section heading', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.section = 'Idempotent requests and retries';
      spec.idempotency.source.quote = 'Idempotent requests and retries';
    });
    expect(messages(result)).toContain('just repeats source.section');
  });

  it('fails a citation retrieved in the future', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source.retrieved = '2099-01-01';
    });
    expect(messages(result)).toContain('is in the future');
  });

  it('warns, rather than fails, on an inferred source', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.source = {
        kind: 'inferred',
        rationale: 'The published reference does not state this and it has not been confirmed.',
        todo: 'TODO(human): Does the provider dedupe on the idempotency key for this call?',
      };
    });
    expect(result.errors).toEqual([]);
    expect(messages(result)).toContain('sourced as "inferred"');
    expect(validate(loadExample('stripe'), { strict: true }).ok).toBe(false);
  });

  it('warns when one quote is cited for many unrelated blocks', () => {
    const result = mutate('stripe', (spec) => {
      const quote = spec.status_map[0].source.quote;
      for (const row of spec.status_map) row.source.quote = quote;
    });
    expect(messages(result)).toContain('the same quote is cited for');
  });
});

describe('the shape blocks must agree with each other', () => {
  it('a webhook-less provider must record the deviation', () => {
    const result = mutate('bureau', (spec) => {
      spec.deviations = spec.deviations.filter((d: any) => d.rule !== 'webhooks');
    });
    expect(messages(result)).toContain('docs/16-WHEN-TO-DEVIATE.md treats as a deviation');
    expect(messages(result)).toContain('rule "webhooks"');
  });

  it('a file provider must record that the interface has no slot for it', () => {
    const result = mutate('bureau', (spec) => {
      spec.deviations = spec.deviations.filter((d: any) => d.rule !== 'provider_interface');
    });
    expect(messages(result)).toContain('PaymentProviderService has no file-exchange slot');
  });

  it('a batch_file provider may not set batching.enabled true', () => {
    const result = mutate('bureau', (spec) => {
      spec.billing_settings.batching.enabled = true;
      spec.billing_settings.batching.submit_payments_function = 'submitPayments';
    });
    expect(messages(result)).toContain('the platform batcher submits the file');
  });

  it('a spec cannot claim two status sources at once', () => {
    const stripe = loadExample('stripe');
    const bureau = loadExample('bureau');
    const result = mutate('stripe', (spec) => {
      spec.status_reports = bureau.status_reports;
    });
    expect(messages(result)).toContain('status_reports does not apply');
    expect(stripe.status_reports).toBeUndefined();
  });

  it('a file provider cannot declare endpoints', () => {
    const stripe = loadExample('stripe');
    const result = mutate('bureau', (spec) => {
      spec.endpoints = stripe.endpoints;
    });
    expect(messages(result)).toContain('File-exchange operations belong in file_exchange');
  });

  it('hooks that return scheduling actions require billing_settings', () => {
    const result = mutate('bureau', (spec) => {
      delete spec.billing_settings;
    });
    expect(messages(result)).toContain('afterPolicyIssued, afterPolicyCancelled');
    expect(messages(result)).toContain('billing_settings must declare');
  });

  it('an sdk provider must say which SDK call each endpoint makes', () => {
    const result = mutate('stripe', (spec) => {
      delete spec.endpoints[0].sdk_call;
      spec.endpoints[0].path = '/v1/customers';
      spec.endpoints[0].method = 'POST';
    });
    expect(messages(result)).toContain('must declare the sdk_call it makes');
  });
});

describe('cross-references', () => {
  it('fails when auth names an undeclared config key', () => {
    const result = mutate('stripe', (spec) => {
      spec.auth.config_key = 'providerApiToken';
      spec.auth.format = 'Bearer {providerApiToken}';
    });
    expect(messages(result)).toContain('auth uses config key "providerApiToken", which is not declared in config_fields');
  });

  it('fails when a hook calls an operation that does not exist', () => {
    const result = mutate('stripe', (spec) => {
      spec.lifecycle_hooks.afterPaymentCreated.provider_operations = ['chargeCustomer'];
    });
    expect(messages(result)).toContain('hook afterPaymentCreated calls operation "chargeCustomer"');
  });

  it('fails when a deviation points at another provider\'s doc', () => {
    const result = mutate('bureau', (spec) => {
      spec.deviations[0].provider_doc = 'docs/providers/stripe.md#deviations';
    });
    expect(messages(result)).toContain('DEV-001 points at "docs/providers/stripe.md#deviations"');
  });

  it('fails on a duplicate endpoint operation', () => {
    const result = mutate('stripe', (spec) => {
      spec.endpoints[1].operation = 'createCustomer';
    });
    expect(messages(result)).toContain('duplicate endpoint operation "createCustomer"');
  });

  it('warns when a webhook provider does not declare the signing secret config field', () => {
    const result = mutate('stripe', (spec) => {
      spec.config_fields = spec.config_fields.filter((c: any) => c.name !== 'providerWebhookSigningSecret');
      spec.webhooks.signature.secret_config_key = 'providerSecretKey';
    });
    expect(result.errors).toEqual([]);
    expect(messages(result)).toContain('does not declare providerWebhookSigningSecret');
  });
});

describe('idempotency is stated, not implied', () => {
  it('fails when idempotency is required but has no mechanism', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.mechanism = 'none';
      delete spec.idempotency.header;
      delete spec.idempotency.key_source;
    });
    expect(messages(result)).toContain('never-deviate rule');
  });

  it('warns when a spec claims it does not need idempotency', () => {
    const result = mutate('stripe', (spec) => {
      spec.idempotency.required = false;
    });
    expect(result.errors).toEqual([]);
    expect(messages(result)).toContain('Every external write must be idempotent under retry');
  });
});

describe('schema failures name the field and carry a line number', () => {
  it('reports an out-of-vocabulary Root status', () => {
    const result = mutate('stripe', (spec) => {
      spec.status_map[0].root_status = 'paid';
    });
    expect(messages(result)).toContain('root_status must be one of');
    expect(messages(result)).toContain('"successful"');
  });

  it('reports an unknown lifecycle hook name', () => {
    const result = mutate('stripe', (spec) => {
      spec.lifecycle_hooks.afterPolicyRenewed = spec.lifecycle_hooks.afterPolicyIssued;
    });
    expect(messages(result)).toContain('afterPolicyRenewed must be one of');
  });

  it('reports a provider-named config field smuggled into the standard set', () => {
    const result = mutate('stripe', (spec) => {
      spec.config_fields[0].name = 'stripeSecretKey';
    });
    expect(messages(result)).toContain('name must be one of');
    expect(messages(result)).toContain('providerSecretKey');
  });

  it('reports a deviation whose code marker is not a DEVIATION comment', () => {
    const result = mutate('bureau', (spec) => {
      spec.deviations[0].code_marker = 'NOTE: no webhooks here';
    });
    expect(messages(result)).toContain('code_marker must match');
  });

  it('attaches the source line of the offending field', () => {
    const { validateSpecText } = require('../../spec/lib/validate.js');
    const result = validateSpecText(
      ['# a comment', '', 'spec_version: 2', 'provider:', '  name: X'].join('\n'),
      { today: AS_OF },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.find((e: { path: string }) => e.path === '/spec_version')).toMatchObject({
      line: 3,
      message: 'spec_version must be 1',
    });
    expect(result.errors.find((e: { path: string }) => e.path === '/provider/slug')).toMatchObject({ line: 4 });
  });
});
