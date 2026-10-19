# Lifecycle fixtures

Input for `npm run sim:lifecycle`. One file = one invocation Root could make.

```bash
npm run sim:lifecycle -- --list
npm run sim:lifecycle -- --hook=afterPolicyIssued
npm run sim:lifecycle -- --hook=afterPolicyIssued --fixture=./__tests__/fixtures/lifecycle/afterPolicyIssued-rerun.json --json
```

The simulator calls the real export from `code/lifecycle-hooks/index.ts` with
the argument shape `docs/07-LIFECYCLE-HOOKS.md` documents, and checks the
fixture supplies every argument that hook takes. Hooks documented as taking no
arguments need no fixture.

## Format

| Key | Required | Meaning |
|---|---|---|
| `name` | no | Display name. Defaults to the hook name. |
| `hook` | no | Hook this fixture is for. Used when the file is not named `<hook>.json`. |
| `description` | no | What scenario this is. |
| `notes` | no | Caveats and `TODO(human):` questions. |
| `args` | yes | Object keyed by argument name — `policy`, `payment`, `data`, `updates`, `payment_method`, `alteration_package`, `alteration_hook_key`. |

Lookup order for `--hook=X` with no `--fixture`: `X.json`, then any fixture
whose `hook` field is `X`.

## What ships here

| Fixture | Hook | Why it exists |
|---|---|---|
| `afterPolicyIssued.json` | `afterPolicyIssued` | First issue, empty `app_data`. |
| `afterPolicyIssued-rerun.json` | `afterPolicyIssued` | Same policy with `provider_customer_id` already set. Root retries hooks; a correct implementation creates no second customer. Compare the intercepted-calls list against the first fixture. |
| `afterPaymentCreated.json` | `afterPaymentCreated` | Payment against a policy that already has a provider customer. |
| `afterPolicyCancelled.json` | `afterPolicyCancelled` | Cancellation with a subscription to tear down. Remove `provider_subscription_id` and re-run to check the missing-ID guard. |
| `afterPolicyPaymentMethodAssigned.json` | `afterPolicyPaymentMethodAssigned` | Payment method attached to a policy. |
| `createPaymentMethod.json` | `createPaymentMethod` | Capture payload. No provider call should happen — the intercepted-calls list should stay empty. |

Policy and payment objects carry only the fields `code/lifecycle-hooks/` and
`docs/07-LIFECYCLE-HOOKS.md` actually read. They assert a shape rather than
observe one — add what your provider needs, and see the `notes` on each file.

## Related

- `docs/07-LIFECYCLE-HOOKS.md` — the hook catalogue, signatures, idempotency rules
- `scripts/simulate.js` — the simulator (`--help` for flags and exit codes)
