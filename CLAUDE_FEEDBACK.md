# Claude Code Feedback Report: Collection Module Template

> Based on the Adyen integration session (2026-04-10) on the `adyen-test` branch.
> Source: `AI_TRANSCRIPT_20260410.txt`, git diff `main..adyen-test`.

---

## Executive Summary

Claude Code successfully built a working Adyen provider integration using the `/build-from-spec` skill with minimal user intervention (3 inputs total). However, the session revealed **6 categories of friction** that caused wasted tool calls, unnecessary test-fix iterations, and avoidable confusion. Addressing these would make the template more provider-agnostic and reduce the cost/time of AI-assisted builds by an estimated 30-40%.

---

## 1. Pre-Flight Checklist Missing from SOP

**Problem:** Claude discovered `npm install` and `env.ts` setup reactively after test failures, not proactively before writing code.

- `jest: command not found` triggered 6 redundant `npm install` calls (parallel tool calls that all ran the same command).
- Missing `env.ts` caused TypeScript compilation errors on first test run.

**Recommendation for source branch:**

Add a "Step 0 - Environment Setup" section to `docs/14-BUILD-FROM-SPEC.md` and to the `/build-from-spec` skill prompt:

```markdown
## Step 0 -- Pre-flight setup (run before any code changes)

1. `cd collection_module && npm install`
2. `cp code/env.sample.ts code/env.ts`  (if it doesn't exist)
3. `npm test` -- confirm baseline tests pass before touching code
```

**Recommendation for Claude Code instructions (CLAUDE.md or skill prompt):**

Add to the `/build-from-spec` skill:
```
BEFORE writing any provider files:
1. Run `npm install` once in collection_module/
2. Ensure code/env.ts exists (copy from env.sample.ts if missing)
3. Run `npm test` to confirm a green baseline
Do NOT run npm install more than once unless it fails.
```

---

## 2. Scaffold Script Was Bypassed

**Problem:** Claude wrote all 7 provider files from scratch instead of using `npm run scaffold:provider`. The scaffold exists specifically to generate correct boilerplate, but Claude skipped it and wrote files manually based on the Stripe reference.

**Root cause:** The `/build-from-spec` skill prompt lists the scaffold command but doesn't enforce its use. Claude found it faster to write files directly after reading the reference.

**Recommendation for source branch:**

Make the scaffold output more valuable so skipping it is a worse choice:
- Generate provider-specific factory functions in `__tests__/helpers/` (not just source files)
- Generate lifecycle hook stubs with the correct async signatures and DI resolution boilerplate
- Generate the `env.sample.ts` additions and `ConfigurationService` field additions
- Output a checklist of "files you still need to edit manually" after scaffolding

**Recommendation for Claude Code instructions:**

Add to the skill prompt:
```
You MUST run the scaffold command before writing provider files manually.
The scaffold generates 7 files with correct imports, DI tokens, and TODO markers.
Only write files from scratch if the scaffold fails or produces incorrect output.
```

---

## 3. Stub Tests Become Obstacles, Not Guides

**Problem:** The template ships with lifecycle hook tests and webhook tests that assert stub/no-op behavior (e.g., "function logs and returns undefined"). When Claude replaced stubs with real Adyen logic, **all pre-existing tests broke**. Claude had to rewrite 4 test files entirely, which was the single largest source of test-fix iterations (10 failures on first run).

**Files affected:**
- `__tests__/lifecycle-hooks/policy.hooks.test.ts` (196 lines changed)
- `__tests__/lifecycle-hooks/payment.hooks.test.ts` (90 lines changed)
- `__tests__/lifecycle-hooks/payment-method.hooks.test.ts` (90 lines changed)
- `__tests__/webhook-hooks.test.ts` (163 lines changed)

**Recommendation for source branch:**

Option A (preferred): Ship lifecycle hook and webhook tests with `async` signatures and DI mock boilerplate already in place, even if the assertion bodies are `// TODO`. This way, replacing the stub implementation doesn't break the test structure.

Option B: Mark stub tests clearly with `// STUB-TEST: replace entirely when implementing provider` so Claude knows to delete-and-rewrite rather than trying to incrementally fix them.

Option C: Don't ship stub tests for hooks/webhooks at all. Let the scaffold generate provider-specific tests alongside the source files (see point #2 above).

---

## 4. `resetMocks: true` Jest Footgun

**Problem:** `jest.config.js` has `resetMocks: true`, which clears mock return values between tests. Claude set up mocks at the module/describe level, which got silently wiped before each test. This caused 3 diagnostic iterations:
1. "Tests look correct" (missed the config)
2. Discovered `resetMocks: true` in jest config
3. Moved mocks into `beforeEach`

**Recommendation for source branch:**

Add a warning to `docs/10-TESTING.md`:

```markdown
## Important: `resetMocks: true`

This project uses `resetMocks: true` in jest.config.js. This means:
- Mock return values set at the `describe` level are cleared before each test
- **Always set mock return values inside `beforeEach` or inside each `it` block**
- Module-level `mockReturnValue()` calls will silently stop working
```

Also add a comment in `jest.config.js` itself:
```javascript
resetMocks: true, // All mocks are reset between tests -- set return values in beforeEach, not describe
```

---

## 5. Provider-Specific Config Requires Touching Too Many Files

**Problem:** Adyen requires a `merchantAccount` on every API call. Adding this one config field required editing 4+ files:
- `code/env.sample.ts` (add env vars)
- `code/services/config.service.ts` (add to `EnvironmentConfig` interface)
- `__tests__/setup.ts` (add to env mock)
- `__tests__/test-helpers.ts` (add to mock config)

The SOP (Step 4d) only mentions `env.sample.ts`. The other 3 files were discovered through test failures.

**Recommendation for source branch:**

1. Add a `providerExtraConfig` map (or similar) to `EnvironmentConfig` so providers can add custom config without modifying the interface:
   ```typescript
   providerExtraConfig?: Record<string, string>;
   ```
2. If keeping a closed interface, update `docs/14-BUILD-FROM-SPEC.md` Step 4d to list ALL files that need updating when adding config:
   ```markdown
   ### 4d. Config (4 files to update)
   - `code/env.sample.ts` -- add env var placeholders
   - `code/services/config.service.ts` -- add to EnvironmentConfig interface
   - `__tests__/setup.ts` -- add to process.env mock
   - `__tests__/test-helpers.ts` -- add to createMockConfigService return value
   ```

---

## 6. Webhook Handler Assumes Flat Event Structure

**Problem:** The template's webhook stub and the Stripe reference assume a flat `{ type, data: { object } }` event payload. Adyen uses a completely different structure: `{ notificationItems: [{ NotificationRequestItem: { eventCode, ... } }] }`. Claude had to redesign the entire webhook handler flow, including:
- Iterating over batched notification items
- Different field access patterns (`eventCode` vs `type`)
- Different response format (`[accepted]` string vs `{ received: true }`)
- Manual HMAC signature computation (vs SDK method)

**Recommendation for source branch:**

1. Add a `WebhookParser` interface or pattern to the template that normalizes provider-specific payloads:
   ```typescript
   interface WebhookParser {
     verifyAndParse(headers: Record<string, string>, body: string): ParsedWebhookEvent[];
   }
   
   interface ParsedWebhookEvent {
     eventType: string;
     reference: string;
     data: Record<string, unknown>;
   }
   ```
2. Move webhook verification + parsing into the provider client (where it belongs), keeping `webhook-hooks.ts` as a thin router over normalized events.
3. Document the Adyen batched-notification pattern as a second reference in `docs/09-WEBHOOKS.md` to show that not all providers use Stripe's flat structure.

---

## 7. Factory Shapes Are Not Provider-Agnostic

**Problem:** `__tests__/helpers/factories.ts` shipped with generic shapes (`{ id, status, amount }`) that matched neither Stripe's nor Adyen's actual data structures. Claude had to rewrite every factory function.

**Recommendation for source branch:**

- Make factories return the **Root Platform** canonical shapes (which are provider-agnostic), not provider-specific shapes.
- Add a separate `createMockProviderResponse()` factory that the scaffold generates per-provider with the correct nested structure (e.g., Adyen's `{ pspReference, resultCode, amount: { value, currency } }`).

---

## 8. Lifecycle Hooks Import Provider Classes Directly

**Problem:** After implementation, `policy.hooks.ts` contains `import { AdyenService } from ...` and `import { AdyenToRootAdapter } from ...`. This couples the hook to a specific provider by name, defeating the DI pattern the template establishes elsewhere.

**Recommendation for source branch:**

- Hooks should resolve services via DI tokens only (`container.resolve(ServiceToken.PROVIDER_SERVICE)`), never by direct class import.
- Add a `PaymentProviderService` interface that all provider services implement, and resolve against that interface.
- Add this as a rule in `docs/08-LIFECYCLE-HOOKS.md`:
  ```
  NEVER import provider classes directly in hooks. 
  Use container.resolve(ServiceToken.PROVIDER_SERVICE) and cast to the provider interface.
  ```

---

## 9. Redundant File Reads After Agent Exploration

**Problem:** Claude spawned an `Explore` agent that read 15+ files, then re-read many of the same files (container.setup.ts, webhook-hooks.ts, lifecycle hooks) in the main context. This doubled the token cost for exploration.

**Recommendation for Claude Code instructions:**

Add to the skill prompt:
```
When you use an Agent to explore the codebase, trust the agent's output.
Do NOT re-read files that the agent already returned contents for.
Only re-read a file if you need to see it in your own context for editing.
```

---

## 10. Missing `afterPolicyCancelled` in SOP

**Problem:** The lifecycle hooks table in `docs/14-BUILD-FROM-SPEC.md` Step 4c lists 3 hooks (`afterPolicyIssued`, `afterPolicyPaymentMethodAssigned`, `afterPaymentCreated`) but omits `afterPolicyCancelled`. Claude implemented it anyway (correctly), but only because it read the source file and saw the stub.

**Recommendation for source branch:**

Add to Step 4c:
```markdown
| `afterPolicyCancelled` | `providerService.cancelSubscription(...)` |
```

---

## Summary of Recommendations

| # | Category | Effort | Impact |
|---|---|---|---|
| 1 | Pre-flight checklist in SOP + skill | Low | High -- eliminates first-run failures |
| 2 | Enforce scaffold usage | Medium | High -- consistent boilerplate |
| 3 | Fix stub tests to be async-ready | Medium | High -- eliminates bulk test rewrites |
| 4 | Document `resetMocks: true` | Low | Medium -- prevents diagnostic loops |
| 5 | Document all config touchpoints | Low | Medium -- fewer surprise failures |
| 6 | Webhook parser abstraction | High | High -- supports non-Stripe patterns |
| 7 | Provider-agnostic factories | Medium | Medium -- less factory rewriting |
| 8 | Enforce DI-only in hooks | Low | Medium -- better provider swappability |
| 9 | Skill prompt: trust agent output | Low | Low -- saves tokens |
| 10 | Add missing hook to SOP | Low | Low -- completeness |
