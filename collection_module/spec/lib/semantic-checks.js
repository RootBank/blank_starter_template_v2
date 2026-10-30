'use strict';

/**
 * Semantic checks over a schema-valid provider spec.
 *
 * These are the rules a JSON Schema cannot state: cross-references between
 * blocks, coverage of one list by another, and value checks that depend on
 * another field's value. Each finding carries the JSON-pointer `path` of the
 * field at fault so the CLI can print a file:line.
 *
 * Severity: `error` fails `spec:validate`. `warning` passes, and fails only
 * under `--strict`.
 */

/** Hosts that serve documentation, not an API. Used to catch the base-URL
 *  mistake of deriving the API host from the docs URL. */
const DOC_HOST_PREFIXES = /^(docs?|developers?|support|help|reference|api-docs|knowledge|learn)\./i;
const DOC_PATH_SEGMENTS = /\/(docs?|api-reference|reference|guides?|tutorials?|developer)(\/|$)/i;

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

class Findings {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(path, message) {
    this.errors.push({ path, message, severity: 'error' });
  }

  warn(path, message) {
    this.warnings.push({ path, message, severity: 'warning' });
  }
}

/** Walk every `source` block in the spec, collecting [path, source, ownerPath]. */
function eachSource(node, path, out) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((item, i) => eachSource(item, `${path}/${i}`, out));
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'source' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.push([`${path}/source`, value, path]);
      continue;
    }
    eachSource(value, `${path}/${key}`, out);
  }
  return out;
}

function checkCitations(spec, f, today) {
  const declaredHosts = new Set((spec.provider && spec.provider.doc_hosts) || []);
  const sources = eachSource(spec, '', []);
  const quoteUse = new Map();

  if (declaredHosts.size === 0 && sources.some(([, source]) => source.kind === 'web')) {
    f.error(
      '/provider/doc_hosts',
      'this spec contains web citations, so provider.doc_hosts must declare which hosts a citation may come from. Without it a citation can point anywhere.',
    );
  }

  for (const [path, source, ownerPath] of sources) {
    const owner = ownerPath || '(root)';
    if (source.kind === 'web') {
      const host = hostOf(source.url);
      if (!host) {
        f.error(`${path}/url`, `source.url on ${owner} is not a parseable URL: "${source.url}"`);
      } else {
        if (declaredHosts.size && !declaredHosts.has(host)) {
          f.error(
            `${path}/url`,
            `source.url on ${owner} cites "${host}", which is not in provider.doc_hosts (${[...declaredHosts].join(', ')}). Add the host deliberately or fix the citation.`,
          );
        }
        if (pathOf(source.url) === '/') {
          f.error(`${path}/url`, `source.url on ${owner} points at a bare host. Cite the page the fact is on, not the documentation root.`);
        }
      }
    }
    if (source.kind === 'inferred') {
      f.warn(path, `${owner} is sourced as "inferred", not from provider documentation. ${source.todo}`);
    }
    if (source.quote !== undefined) {
      const quote = source.quote.trim();
      // A quote may legitimately contain the word TODO (this repo's own rule
      // about TODO(human) is quotable). A quote that *opens* with it, or that
      // carries a template marker, is a placeholder.
      if (/^\s*TODO\b/i.test(quote) || /\{\{|<[A-Z_]{3,}>/.test(quote)) {
        f.error(`${path}/quote`, `source.quote on ${owner} is a placeholder, not a verbatim excerpt.`);
      }
      // A real excerpt is long enough to locate in the source and has more
      // than one token. "see the docs" clears neither bar; a code line or a
      // table row clears both.
      if (quote.length < 20 || quote.split(/\s+/).length < 2) {
        f.error(`${path}/quote`, `source.quote on ${owner} is too thin to confirm against the source. Quote the sentence or line that states the fact. Found "${quote}".`);
      }
      for (const field of ['section', 'locator', 'title']) {
        if (source[field] && source[field].trim() === quote) {
          f.error(`${path}/quote`, `source.quote on ${owner} just repeats source.${field}. Quote the sentence that states the fact.`);
        }
      }
      const key = quote.toLowerCase();
      quoteUse.set(key, (quoteUse.get(key) || 0) + 1);
    }
    if (source.retrieved && source.retrieved > today) {
      f.error(`${path}/retrieved`, `source.retrieved on ${owner} is in the future (${source.retrieved}; today is ${today}).`);
    }
  }

  for (const [quote, count] of quoteUse) {
    if (count > 3) {
      f.warn(
        '/provider',
        `the same quote is cited for ${count} different blocks ("${quote.slice(0, 50)}"). One sentence rarely states that many distinct facts.`,
      );
    }
  }
}

function checkBaseUrls(spec, f) {
  if (!spec.api || !spec.api.base_urls) return;
  const docsHost = hostOf((spec.provider || {}).api_docs_url || '');
  const declaredDocHosts = new Set((spec.provider && spec.provider.doc_hosts) || []);
  for (const env of ['sandbox', 'production']) {
    const url = spec.api.base_urls[env];
    if (typeof url !== 'string') continue;
    const path = `/api/base_urls/${env}`;
    const host = hostOf(url);
    if (!host) {
      f.error(path, `${env} base URL is not a parseable URL: "${url}"`);
      continue;
    }
    if (docsHost && host === docsHost) {
      f.error(path, `${env} base URL "${url}" uses the documentation host (${host}). The API host is a different host. Do not derive it from provider.api_docs_url.`);
      continue;
    }
    if (declaredDocHosts.has(host)) {
      f.error(path, `${env} base URL "${url}" uses "${host}", which is declared in provider.doc_hosts as a documentation host.`);
      continue;
    }
    if (DOC_HOST_PREFIXES.test(host)) {
      f.error(path, `${env} base URL "${url}" looks like a documentation host (it starts with "${host.split('.')[0]}."). Use the host the module actually calls.`);
      continue;
    }
    if (DOC_PATH_SEGMENTS.test(pathOf(url))) {
      f.error(path, `${env} base URL "${url}" has a documentation path segment. A base URL is a host plus an optional API version prefix.`);
    }
  }
}

function indexStatusMap(spec) {
  const byStatus = new Map();
  (spec.status_map || []).forEach((row, i) => {
    if (!row || typeof row !== 'object') return;
    const list = byStatus.get(row.provider_status) || [];
    list.push({ row, index: i });
    byStatus.set(row.provider_status, list);
  });
  return byStatus;
}

/** Every provider status named anywhere must resolve to exactly one status_map row. */
function checkStatusMapCoverage(spec, f) {
  const byStatus = indexStatusMap(spec);
  const referenced = new Set();
  const seenRows = new Set();

  (spec.status_map || []).forEach((row, i) => {
    if (!row) return;
    const key = `${row.provider_status} ${row.applies_to}`;
    if (seenRows.has(key)) {
      f.error(`/status_map/${i}`, `duplicate status_map row for "${row.provider_status}" on "${row.applies_to}".`);
    }
    seenRows.add(key);
  });

  const resolve = (status, appliesTo, path, label) => {
    referenced.add(status);
    const candidates = byStatus.get(status);
    if (!candidates || candidates.length === 0) {
      f.error(path, `provider status "${status}" is named by ${label} but has no status_map row. Add one mapping it to a Root PaymentStatus.`);
      return;
    }
    if (candidates.length > 1) {
      if (!appliesTo) {
        f.error(
          path,
          `provider status "${status}" is named by ${label} and matches ${candidates.length} status_map rows (${candidates.map((c) => c.row.applies_to).join(', ')}). Set applies_to on ${label} to say which object it refers to.`,
        );
        return;
      }
      if (!candidates.some((c) => c.row.applies_to === appliesTo)) {
        f.error(
          path,
          `provider status "${status}" on object "${appliesTo}" (${label}) has no status_map row. Rows exist only for: ${candidates.map((c) => c.row.applies_to).join(', ')}.`,
        );
      }
      return;
    }
    if (appliesTo && candidates[0].row.applies_to !== appliesTo) {
      f.error(
        path,
        `provider status "${status}" is declared on object "${appliesTo}" by ${label}, but its status_map row is for "${candidates[0].row.applies_to}".`,
      );
    }
  };

  ((spec.webhooks || {}).events || []).forEach((event, i) => {
    if (event && event.provider_status) {
      resolve(event.provider_status, event.applies_to, `/webhooks/events/${i}/provider_status`, `webhook event "${event.name}"`);
    }
  });

  ((spec.status_reports || {}).codes || []).forEach((code, i) => {
    if (code && code.provider_status) {
      resolve(code.provider_status, code.applies_to, `/status_reports/codes/${i}/provider_status`, `status report code "${code.code}"`);
    }
  });

  (spec.endpoints || []).forEach((endpoint, i) => {
    (endpoint.provider_statuses || []).forEach((status, j) => {
      resolve(status, endpoint.returns, `/endpoints/${i}/provider_statuses/${j}`, `endpoint "${endpoint.operation}"`);
    });
  });

  // A spec may legitimately record a provider object's full status vocabulary
  // while only some values arrive through a declared event or endpoint. A whole
  // object that nothing ever produces is a different matter.
  const referencedObjects = new Set(
    (spec.status_map || [])
      .filter((row) => row && referenced.has(row.provider_status))
      .map((row) => row.applies_to),
  );
  (spec.status_map || []).forEach((row, i) => {
    if (row && !referencedObjects.has(row.applies_to)) {
      f.warn(`/status_map/${i}`, `nothing in this spec produces any status for "${row.applies_to}". Either an event or endpoint is missing, or these rows are dead.`);
    }
  });

  const rootStatuses = new Set((spec.status_map || []).map((row) => row && row.root_status));
  if (!rootStatuses.has('successful')) {
    f.error('/status_map', 'no status_map row maps to the Root status "successful". The module could never mark a payment paid.');
  }
  if (!rootStatuses.has('failed')) {
    f.error('/status_map', 'no status_map row maps to the Root status "failed". The module could never mark a payment failed.');
  }
}

/** Every declared webhook event must have a Root-side action that is wired up. */
function checkWebhookEvents(spec, f) {
  const webhooks = spec.webhooks;
  if (!webhooks) return;
  const names = new Set();
  (webhooks.events || []).forEach((event, i) => {
    const path = `/webhooks/events/${i}`;
    if (!event) return;
    if (names.has(event.name)) {
      f.error(`${path}/name`, `duplicate webhook event "${event.name}".`);
    }
    names.add(event.name);
    const action = event.root_action || {};
    if (action.kind === 'update_payment_status' && !event.provider_status) {
      f.warn(
        `${path}/provider_status`,
        `webhook event "${event.name}" updates a payment status but does not say which provider status it carries, so the status_map cannot be checked against it.`,
      );
    }
    if (action.kind === 'update_payment_status' && action.payment_status === 'failed' && !action.failure_action) {
      f.error(
        `${path}/root_action/failure_action`,
        `webhook event "${event.name}" marks the payment failed but sets no failure_action. Root needs one of block_payment_method, block_retry, allow_retry.`,
      );
    }
    if (action.kind === 'ignore') {
      f.warn(`${path}/root_action`, `webhook event "${event.name}" is subscribed to but ignored: ${action.notes}`);
    }
  });

  const actions = (webhooks.events || []).map((e) => (e.root_action || {}).kind);
  if (actions.length && actions.every((kind) => kind === 'ignore')) {
    f.error('/webhooks/events', 'every declared webhook event is ignored. The module would never act on a provider update.');
  }
}

function checkShapeConsistency(spec, f) {
  const integration = spec.integration || {};
  const provider = spec.provider || {};
  const deviationRules = new Set((spec.deviations || []).map((d) => d && d.rule));

  if (integration.status_source === 'webhook') {
    if (!spec.webhooks) {
      f.error('/webhooks', 'integration.status_source is "webhook" but there is no webhooks block.');
    }
    if (spec.status_reports) {
      f.error('/status_reports', 'integration.status_source is "webhook", so status_reports does not apply. Pick one status source.');
    }
  } else if (integration.status_source) {
    if (spec.webhooks) {
      f.error('/webhooks', `integration.status_source is "${integration.status_source}" but a webhooks block is present. Pick one status source.`);
    }
    if (!spec.status_reports) {
      f.error('/status_reports', `integration.status_source is "${integration.status_source}" but there is no status_reports block.`);
    } else if (spec.status_reports.mechanism !== integration.status_source) {
      f.error('/status_reports/mechanism', `status_reports.mechanism is "${spec.status_reports.mechanism}" but integration.status_source is "${integration.status_source}".`);
    }
    if (!deviationRules.has('webhooks')) {
      f.error(
        '/deviations',
        'this provider has no webhooks, which docs/16-WHEN-TO-DEVIATE.md treats as a deviation. Record it with rule "webhooks" so the code comment and provider doc can be cross-checked.',
      );
    }
  }

  if (integration.collection_model === 'batch_file') {
    if (!spec.file_exchange) {
      f.error('/file_exchange', 'integration.collection_model is "batch_file" but there is no file_exchange block.');
    }
    if (spec.billing_settings && spec.billing_settings.batching && spec.billing_settings.batching.enabled === true) {
      f.error(
        '/billing_settings/batching/enabled',
        'collection_model "batch_file" means the platform batcher submits the file, so billingSettings.batching.enabled must be false (docs/17-SCHEDULED-PAYMENTS.md).',
      );
    }
  } else if (spec.file_exchange) {
    f.error('/file_exchange', `file_exchange applies to collection_model "batch_file", but this spec declares "${integration.collection_model}".`);
  }

  if (integration.status_source === 'response_file' && spec.file_exchange && !spec.file_exchange.response) {
    f.error('/file_exchange/response', 'status_source is "response_file" but file_exchange declares no response channel to read it from.');
  }

  if (provider.api_type === 'file') {
    if (spec.api) f.error('/api', 'provider.api_type is "file", so there is no HTTP API block to declare.');
    if (spec.endpoints) f.error('/endpoints', 'provider.api_type is "file". File-exchange operations belong in file_exchange, not endpoints.');
    if (!deviationRules.has('provider_interface')) {
      f.error(
        '/deviations',
        'provider.api_type is "file". PaymentProviderService has no file-exchange slot (see code/interfaces/provider.interfaces.ts), so this needs a deviation with rule "provider_interface".',
      );
    }
  } else if (provider.api_type) {
    if (!spec.api) f.error('/api', `provider.api_type is "${provider.api_type}" but there is no api block.`);
    if (!spec.endpoints) f.error('/endpoints', `provider.api_type is "${provider.api_type}" but no endpoints are declared.`);
  }

  const schedulingHooks = Object.entries(spec.lifecycle_hooks || {})
    .filter(([, hook]) => hook && (hook.actions || []).length > 0);
  if (schedulingHooks.length && !spec.billing_settings) {
    f.error(
      '/billing_settings',
      `${schedulingHooks.map(([name]) => name).join(', ')} return scheduled-payment actions, so billing_settings must declare the billingSettings block they depend on.`,
    );
  }
}

function checkReferences(spec, f) {
  const configNames = new Set((spec.config_fields || []).map((c) => c && c.name));
  const operations = new Set((spec.endpoints || []).map((e) => e && e.operation));
  const deviationIds = new Set((spec.deviations || []).map((d) => d && d.id));

  (spec.config_fields || []).forEach((field, i) => {
    const dupes = (spec.config_fields || []).filter((other) => other && other.name === field.name);
    if (dupes.length > 1 && dupes[0] !== field) {
      f.error(`/config_fields/${i}/name`, `duplicate config field "${field.name}".`);
    }
  });

  (spec.endpoints || []).forEach((endpoint, i) => {
    const dupes = (spec.endpoints || []).filter((other) => other && other.operation === endpoint.operation);
    if (dupes.length > 1 && dupes[0] !== endpoint) {
      f.error(`/endpoints/${i}/operation`, `duplicate endpoint operation "${endpoint.operation}".`);
    }
    if (endpoint.deviation_ref && !deviationIds.has(endpoint.deviation_ref)) {
      f.error(`/endpoints/${i}/deviation_ref`, `endpoint "${endpoint.operation}" references ${endpoint.deviation_ref}, which is not in deviations.`);
    }
    const apiType = (spec.provider || {}).api_type;
    if (apiType === 'sdk' && !endpoint.sdk_call) {
      f.error(`/endpoints/${i}`, `provider.api_type is "sdk", so endpoint "${endpoint.operation}" must declare the sdk_call it makes. The generated client calls the SDK, not a URL.`);
    }
    if (apiType === 'http' && !endpoint.path) {
      f.error(`/endpoints/${i}`, `provider.api_type is "http", so endpoint "${endpoint.operation}" must declare method and path.`);
    }
  });

  const requireConfig = (key, path, label) => {
    if (key && !configNames.has(key)) {
      f.error(path, `${label} uses config key "${key}", which is not declared in config_fields.`);
    }
  };

  if (spec.auth) {
    requireConfig(spec.auth.config_key, '/auth/config_key', 'auth');
    const format = spec.auth.format;
    if (typeof format === 'string') {
      const placeholders = format.match(/\{([^}]+)\}/g) || [];
      placeholders.forEach((placeholder) => {
        const name = placeholder.slice(1, -1);
        if (!configNames.has(name)) {
          f.error('/auth/format', `auth.format interpolates "${placeholder}", which is not declared in config_fields.`);
        }
      });
      if (placeholders.length === 0) {
        f.warn('/auth/format', 'auth.format contains no {configField} placeholder, so the generator cannot tell where the credential goes.');
      }
    }
  }

  if (spec.webhooks && spec.webhooks.signature) {
    requireConfig(spec.webhooks.signature.secret_config_key, '/webhooks/signature/secret_config_key', 'webhooks.signature');
  }

  if (spec.file_exchange) {
    for (const channel of ['submission', 'response']) {
      const value = spec.file_exchange[channel];
      if (value && value.host_config_key) {
        requireConfig(value.host_config_key, `/file_exchange/${channel}/host_config_key`, `file_exchange.${channel}`);
      }
    }
  }

  Object.entries(spec.lifecycle_hooks || {}).forEach(([name, hook]) => {
    ((hook && hook.provider_operations) || []).forEach((operation, j) => {
      if (!operations.has(operation)) {
        f.error(
          `/lifecycle_hooks/${name}/provider_operations/${j}`,
          `hook ${name} calls operation "${operation}", which is not declared in endpoints.`,
        );
      }
    });
  });

  if (spec.status_reports && spec.status_reports.poll_operation && !operations.has(spec.status_reports.poll_operation)) {
    f.error('/status_reports/poll_operation', `status_reports.poll_operation names "${spec.status_reports.poll_operation}", which is not declared in endpoints.`);
  }

  (spec.deviations || []).forEach((deviation, i) => {
    const dupes = (spec.deviations || []).filter((other) => other && other.id === deviation.id);
    if (dupes.length > 1 && dupes[0] !== deviation) {
      f.error(`/deviations/${i}/id`, `duplicate deviation id "${deviation.id}".`);
    }
    const slug = (spec.provider || {}).slug;
    if (slug && deviation.provider_doc && !deviation.provider_doc.startsWith(`docs/providers/${slug}.md#`)) {
      f.error(`/deviations/${i}/provider_doc`, `${deviation.id} points at "${deviation.provider_doc}" but this provider's doc is docs/providers/${slug}.md.`);
    }
  });

  if (spec.webhooks && !configNames.has('providerWebhookSigningSecret')) {
    f.warn('/config_fields', 'this provider receives webhooks but config_fields does not declare providerWebhookSigningSecret.');
  }
}

function checkIdempotency(spec, f) {
  const idem = spec.idempotency;
  if (!idem) return;
  if (idem.required === true && idem.mechanism === 'none') {
    f.error('/idempotency/mechanism', 'idempotency is required but the mechanism is "none". docs/16-WHEN-TO-DEVIATE.md lists idempotency as a never-deviate rule.');
  }
  if (idem.required === false) {
    f.warn('/idempotency/required', 'idempotency.required is false. Every external write must be idempotent under retry; confirm the provider is idempotent by nature and say so in notes.');
  }
}

/**
 * @param {object} spec schema-valid provider spec
 * @param {{ today?: string }} [options] `today` is injectable so tests are not
 *   time-dependent.
 */
function runSemanticChecks(spec, options = {}) {
  const today = options.today || new Date().toISOString().slice(0, 10);
  const f = new Findings();
  if (!spec || typeof spec !== 'object') return f;
  checkCitations(spec, f, today);
  checkBaseUrls(spec, f);
  checkStatusMapCoverage(spec, f);
  checkWebhookEvents(spec, f);
  checkShapeConsistency(spec, f);
  checkReferences(spec, f);
  checkIdempotency(spec, f);
  return f;
}

module.exports = { runSemanticChecks, DOC_HOST_PREFIXES };
