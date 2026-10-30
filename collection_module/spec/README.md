# Provider specs

One validated spec per provider, as data. `provider.schema.json` is the contract;
`npm run spec:validate` is the gate.

```bash
cd collection_module
npm run spec:validate                              # every *.spec.yaml under spec/
npm run spec:validate -- spec/my-provider.spec.yaml
npm run spec:validate -- --strict                  # warnings fail too
npm run spec:validate -- --json                    # machine-readable
npm run spec:validate -- --help
```

Exit codes: `0` clean, `1` findings, `2` bad usage.

Start by copying the template:

```bash
cp spec/provider.spec.template.yaml spec/<your-provider>.spec.yaml
npm run spec:validate
```

The template does not validate while its `<PLACEHOLDER>` markers are still in
it, so a half-filled spec cannot pass as a real one. Validate it directly
(`npm run spec:validate -- spec/provider.spec.template.yaml`) to see the
outstanding fields as a checklist.

## Layout

| Path | What it is |
|---|---|
| `provider.spec.template.yaml` | Copy this. Every block, every placeholder, no provider named. |
| `provider.schema.json` | JSON Schema (draft-07). The field vocabulary. |
| `lib/` | The validator. No runtime dependencies — see *Dependencies* below. |

Two filled-in specs of deliberately opposite shapes live in
`__tests__/spec/fixtures/` — one HTTP-and-webhooks, one batch-file-and-SFTP.
They are test data rather than documentation, and they exist so that the schema
is checked against more than one provider shape. Read them if the template's
comments leave you unsure what a filled-in block looks like.

## Which blocks apply

Three fields decide the rest of the file. Delete what they rule out:

| If | Then |
|---|---|
| `provider.api_type: sdk` or `http` | keep `api` and `endpoints` |
| `provider.api_type: file` | delete `api` and `endpoints`, keep `file_exchange` |
| `integration.status_source: webhook` | keep `webhooks`, delete `status_reports` |
| `integration.status_source: response_file` or `polling` | delete `webhooks`, keep `status_reports` |
| `integration.collection_model: batch_file` | keep `file_exchange` and `billing_settings` |

Validation enforces every row of that table, so a spec cannot half-describe two
shapes at once.

## Two kinds of enumerated value

**Root-side vocabularies are closed.** Each is taken from a file in this repo,
and changing that file should change the schema:

| Schema field | Source of truth |
|---|---|
| `status_map[].root_status` | `PaymentStatus` in `@rootplatform/node-sdk` |
| `status_map[].failure_action`, `root_action.failure_action` | `FailureAction` in `@rootplatform/node-sdk` |
| `lifecycle_hooks` keys | exports of `code/lifecycle-hooks/index.ts` |
| `config_fields[].name` where `storage: standard` | `EnvironmentConfig` in `code/services/config.service.ts` |
| `endpoints[].maps_to_interface` | `PaymentProviderService` / `PaymentProviderClient` in `code/interfaces/provider.interfaces.ts` |
| `error_scenarios[].module_error` | `EnhancedModuleError` subclasses in `code/utils/error-types.ts` |
| `billing_settings` | `billingSettings` in `docs/17-SCHEDULED-PAYMENTS.md` |
| `deviations[].rule` | the rules in `docs/16-WHEN-TO-DEVIATE.md` |

**Provider-side vocabularies are open.** `auth.type`,
`webhooks.signature.algorithm`, `webhooks.signature.scheme`,
`webhooks.payload.shape`, `file_exchange.*.transport` and
`file_exchange.*.format` all accept `other`, which requires a notes field
describing what the provider actually does. The listed values are what has been
seen — the four payload shapes in `docs/08-WEBHOOKS.md` are four observed
providers, not a law. A provider that fits none of them should be described, not
blocked, and certainly not forced into the nearest wrong value.

## Blocks where a wrong value costs money carry a `source`

"Do not invent semantics" is a rule in `CLAUDE.md` that nothing enforced. Here it
is a validation failure, on the blocks where being wrong is expensive:

| Block | Why it is mandatory |
|---|---|
| `auth` | Wrong and nothing connects, or a credential goes somewhere it should not. |
| `idempotency` | Wrong and a retry charges a policyholder twice. |
| `status_map[]` | Wrong and a payment is marked paid when it was not, or a card is blocked that should not be. |
| `status_reports.codes[]` | The input to the status map for a file-based provider. Same consequence. |
| `webhooks.signature` | Wrong and either every webhook is rejected, or an unverified payload is acted on. |

Every other block *may* carry a `source`, and it is validated the same way when
present — the rules below do not change. It is simply not forced. Cite anything
you had to look up; the cost of being wrong about an endpoint's SDK call is a
failing test, not a wrong payment.

Three kinds:

```yaml
source:                                      # a documentation page
  kind: web
  url: https://docs.<provider>.com/webhooks  # host must be in provider.doc_hosts
  section: Verifying webhook signatures
  quote: Every webhook carries an HMAC-SHA256 signature of the raw request body.
  retrieved: '2026-10-19'
```

```yaml
source:                                   # a PDF, an onboarding pack, a file in this repo
  kind: document
  title: <Provider> file layout
  locator: Section 6, Response codes
  quote: '00 - the debit was accepted and funds have settled.'
  retrieved: '2026-10-19'
```

```yaml
source:                                   # the honest escape hatch
  kind: inferred
  rationale: >-
    Why this value was chosen and what it costs to get it wrong.
  todo: 'TODO(human): the specific question a human can answer?'
```

What makes a citation expensive to fabricate:

- **The quote is verbatim**, so a wrong citation is falsifiable — a later slice can
  fetch the page and grep for it. A quote that is too thin to confirm (under 20
  characters, or a single token), that opens with `TODO`, or that just repeats
  the section heading, fails now.
- **`provider.doc_hosts` is an explicit allow-list.** A `web` citation to a host
  that is not declared fails. Adding a host is a deliberate edit a reviewer sees,
  which is what stops a citation drifting to a plausible-looking invented domain.
- **`retrieved` cannot be in the future**, and one quote cited for more than three
  unrelated blocks warns.
- **`inferred` cannot be silent.** It needs a rationale and a `TODO(human): …?`
  question, and it warns on every run — so an unsourced spec is visibly unsourced
  rather than quietly plausible.

`inferred` warns rather than fails, because a spec with honest gaps is more useful
than one with invented citations. `--strict` turns it into a failure; run strict
on a spec you are about to generate code from.

## Deviations are data

`docs/16-WHEN-TO-DEVIATE.md` requires a deviation in three places — a `// DEVIATION:`
code comment, the provider doc, the PR description — and nothing checked any of
them. The `deviations` block holds all three as fields:

```yaml
deviations:
  - id: DEV-001
    rule: webhooks
    summary: The provider sends no webhooks.
    rationale: …
    code_marker: 'DEVIATION: Provider has no webhooks. Scheduled reader at …'
    files: [code/services/response-file.service.ts]
    provider_doc: 'docs/providers/<provider-slug>.md#deviations-from-template'
    pr_note: …
```

`code_marker` is the verbatim comment text, so a later slice can grep the code and
compare. `provider_doc` must point at this provider's own doc. Some deviations are
required rather than optional: a spec with no `webhooks` block must carry one with
`rule: webhooks`, and `api_type: file` must carry one with `rule: provider_interface`,
because `PaymentProviderService` has no file-exchange method.

## What validation checks beyond the schema

- Every declared webhook event has a Root-side action, and one that marks a payment
  failed also names a `failure_action`.
- Every provider status named anywhere — by an event, an endpoint, or a response-file
  code — resolves to exactly one `status_map` row. Where one status word is reused
  across two provider objects, the reference must say which with `applies_to`.
- A base URL is an API host: not the host of `api_docs_url`, not a host in
  `doc_hosts`, not `docs.`/`developer.`/`support.`, and with no documentation path
  segment. (`scripts/scaffold-provider.js` derives the base URL from the API docs
  URL's host, so a provider whose docs live at `developer.<provider>.com` gets
  that host baked into its generated client instead of its real API host. This
  check is where that stops being possible.)
- Config keys referenced by `auth`, `webhooks.signature` and `file_exchange` are
  declared in `config_fields`; hooks only call operations that exist in `endpoints`;
  `deviation_ref` resolves.
- The shape blocks agree: `status_source: webhook` requires `webhooks` and forbids
  `status_reports`; `collection_model: batch_file` requires `file_exchange` and
  `billingSettings.batching.enabled: false`; `api_type: file` forbids `api` and
  `endpoints`; hooks returning scheduling actions require `billing_settings`.
- Idempotency is stated, not implied. `required: true` with `mechanism: none` fails.

## YAML subset

The parser is strict on purpose. Supported: block mappings and sequences, plain and
quoted scalars, `|` and `>` block scalars, single-line flow sequences (`[a, b]`),
comments, one leading `---`. Rejected with a line number: tabs in indentation,
anchors and aliases, merge keys, flow mappings, multiple documents, duplicate keys.
A spec that code is generated from should not contain any of those.

Dates stay strings: write `retrieved: '2026-10-19'`, and quote version strings like
`api_version: '2023-10-16'` so they are not read as numbers.

## Dependencies

None. The YAML parser and the JSON Schema validator in `lib/` are written against
Node's standard library.

This is deliberate but not free. `ajv` and `js-yaml` exist in `node_modules` only
as transitive dependencies of other packages — nothing in `package.json` declares
them, so depending on them would mean depending on another package's dependency
tree. Declaring them properly was outside this slice's remit. The trade is roughly
even: the hand-rolled validator is more code to maintain, but it owns its error
messages (which `ajv`'s would have needed wrapping anyway) and it rejects unknown
schema keywords instead of ignoring them, so `provider.schema.json` and the
validator cannot drift apart silently.

If a future slice adds `ajv` + `js-yaml` as real dependencies, `lib/yaml.js` and
`lib/schema-validator.js` can be swapped out behind `lib/validate.js` without the
schema, the examples, or the semantic checks changing.
