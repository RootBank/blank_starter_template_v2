# Webhook fixtures

Input for `npm run sim:webhook`. One file = one request a provider could send.

```bash
npm run sim:webhook -- --list
npm run sim:webhook -- --event=payment.succeeded
npm run sim:webhook -- --event=payment.succeeded --tamper
npm run sim:webhook -- --fixture=./__tests__/fixtures/webhooks/payment-failed.json --json
```

The simulator computes a **real** digest from the scheme below and the secret the
module's own `ConfigurationService` resolves, then calls the real
`processWebhookRequest`. There is no flag that skips verification — a fixture
without a `signature.scheme` is a usage error (exit 2), not an unsigned request.

## Format

| Key | Required | Meaning |
|---|---|---|
| `name` | yes | Display name. |
| `event` | yes | What `--event=` matches on. |
| `shape` | no | `flat`, `wrapped-batch`, `batched-body-signature`, `form-encoded`. |
| `description` | no | What scenario this is. |
| `notes` | no | Caveats and `TODO(human):` questions. |
| `transport.method` | no | Default `POST`. |
| `transport.contentType` | no | Default `application/json`. |
| `transport.headers` | no | Extra headers. All header names are lowercased before sending, which is what a real gateway does. |
| `body` | one of | JSON object, serialised compactly. |
| `bodyRaw` | one of | Raw string — form-encoded, XML, anything non-JSON. |
| `signature` | yes | See below. |
| `expect.status` | no | Status a correct handler returns. Default `200`. |

Declare exactly one of `body` / `bodyRaw`.

## `signature`

| Key | Required | Meaning |
|---|---|---|
| `scheme` | yes | `hmac-sha256-hex`, `hmac-sha256-base64`, `hmac-sha1-hex`, `hmac-sha512-hex`, `md5-hex`, `sha256-hex`. Unknown values are an error — add the scheme to `DIGESTS` in `scripts/simulate.js` rather than working around it. |
| `placement` | no | `header` (default), `body-path`, `body-query`. |
| `header` | if `header` | Header name, e.g. `X-Webhook-Signature`. |
| `path` | if `body-path` | Dotted path the digest is written to, e.g. `notificationItems.0.NotificationRequestItem.additionalData.hmacSignature`. |
| `field` | if `body-query` | Parameter name appended to a form-encoded body, e.g. `signature`. |
| `secret` | no | Overrides the module's configured secret. Omit it so the fixture exercises real config. |
| `secretEncoding` | no | `utf8` (default), `hex`, `base64` — how the secret string decodes to key bytes. |
| `payloadTemplate` | no | What gets signed. Default `{body}`. |
| `valueTemplate` | no | What the header/field carries. Default `{signature}`. |

### Template tokens

| Token | Available in | Expands to |
|---|---|---|
| `{body}` | `payloadTemplate` | The serialised body, before the signature is placed. |
| `{timestamp}` | both | `--timestamp=`, or now. Pass it explicitly for a reproducible digest. |
| `{secret}` | `payloadTemplate` | The raw secret string, for providers that append it rather than key an HMAC with it. |
| `{field:a.b.0.c}` | `payloadTemplate` | A value read out of `body` by dotted path. |
| `{signature}` | `valueTemplate` | The computed digest. |

`body-path` may not sign over `{body}` — the digest would have to cover a body
that does not yet contain it. Use `{field:…}` tokens instead. `body-query` may,
because the signature is appended after the signed string.

## What ships here

| Fixture | Shape | Why it exists |
|---|---|---|
| `payment-succeeded.json` | flat | Baseline. Signed exactly the way the scaffolder's generated HTTP client verifies — HMAC-SHA256 hex over the raw body in the `--webhook-header` header — so a scaffolded provider verifies it for real with no edits. |
| `payment-failed.json` | flat | Baseline failure, carrying the failure reason the adapter maps onto a Root payment update. |
| `shape-timestamped-signature.json` | flat | The signed payload includes a timestamp and the header carries more than the bare digest. Stripe has this form. |
| `shape-wrapped-batch.json` | wrapped-batch | Several events in one request. A handler that reads `payload.type` processes nothing here. GoCardless has this form. |
| `shape-batched-body-signature.json` | batched-body-signature | Signature inside the body, base64, hex-decoded key, covering a joined field list rather than the whole body. Adyen has this form. |
| `shape-form-encoded.json` | form-encoded | Not JSON at all. PayFast ITN has this form. |

The `shape-*` fixtures are **format demonstrations, not verified provider
fixtures**. They prove this format can express the four payload shapes in
`docs/08-WEBHOOKS.md`; each carries a `TODO(human):` naming what must be
confirmed against that provider's docs before it is used as a real fixture.

Two consequences worth knowing before you read a red run as a bug:

- `shape-form-encoded.json` fails against the template's stub handler, which
  calls `JSON.parse` unconditionally. That is the point — a form-encoded
  provider needs the `WebhookParser` route (Option A in `code/webhook-hooks.ts`),
  not Option B.
- `shape-batched-body-signature.json` sets its own `signature.secret`, because
  `secretEncoding: "hex"` needs a secret that is valid hex. It will not verify
  against your module's configured secret until you align the two.

## Related

- `docs/08-WEBHOOKS.md` — verification, the `WebhookParser` pattern, payload shapes
- `scripts/simulate.js` — the simulator (`--help` for flags and exit codes)
- `__tests__/scripts/simulate.test.ts` — what the simulator is held to
