# /build-from-spec

Build a collection module from a provider spec, API doc, PDF, or URL.

> Full SOP: [`collection_module/docs/14-BUILD-FROM-SPEC.md`](../../collection_module/docs/14-BUILD-FROM-SPEC.md)

---

## Quick steps

**Step 1 — Get a spec**

If the user provided a URL or PDF, run:

```bash
cd collection_module && npm run extract:spec -- --input=<url-or-path> --output=docs/provider-spec.md
```

If the user already has a filled `docs/SPEC-TEMPLATE.md`, skip to Step 2.

**Step 2 — Scaffold**

```bash
cd collection_module && npm run scaffold:provider -- --from-spec=docs/provider-spec.md --reason="<why>"
```

Or with explicit flags if the spec extraction didn't capture everything:

```bash
cd collection_module && npm run scaffold:provider -- \
  --provider=<Name> \
  --api-type=<sdk|http> \
  --base-url=<url> \
  --auth-header=<header> \
  --webhook-header=<header> \
  --reason="<why>"
```

Show the user the CLI output.

**Step 3 — Implement stubs**

Read each generated file and implement the TODOs. See [collection_module/docs/14-BUILD-FROM-SPEC.md § Step 3](../../collection_module/docs/14-BUILD-FROM-SPEC.md#step-3--implement-the-stubs) for what to fill in each file. Use [collection_module/docs/STRIPE-REFERENCE.md](../../collection_module/docs/STRIPE-REFERENCE.md) as the pattern for every method.

**Step 4 — Wire into module**

Follow [collection_module/docs/14-BUILD-FROM-SPEC.md § Step 4](../../collection_module/docs/14-BUILD-FROM-SPEC.md#step-4--wire-into-the-module): DI container, webhooks, lifecycle hooks, env.sample.ts.

**Step 5 — Verify**

```bash
cd collection_module && npm test
```

Fix failures. Then run `/review-implementation`.
