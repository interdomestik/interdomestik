## Plan: Evidence-Driven Network + State Probes

Add deterministic Playwright “truth probes” around the failing clicks to (a) prove whether the intended request fired, (b) capture its status + small JSON excerpt, and (c) validate post-action backend state via either an existing E2E read helper/route or the action response itself. Start broad (discover exact endpoints), then lock probes to exact `urlPart + method` pairs so the spec becomes stable without weakening intent.

### Steps

1. Add a reusable network probe helper in `apps/web/e2e/utils/truth-checks.ts` (`installNetworkTruthProbes`, `waitForActionResponse`).
2. Wire probes into the test lifecycle via `apps/web/e2e/fixtures/auth.fixture.ts` so every test captures `requestfailed` + filtered `response` logs.
3. In `apps/web/e2e/quarantine/regressions.spec.ts`, wrap the “Reject verification” click with `waitForActionResponse` and log `{method,url,status,excerpt}`.
4. Do the same for “Request Payment” and drawer “Submit” actions; capture the canonical ID (verificationId/leadId/paymentId) from response JSON when available.
5. Add a post-action state check: first try existing E2E API read helpers/routes; if absent, derive state from the action’s JSON response and/or add a minimal E2E-only read route guarded by secret (only if strictly necessary).

### Further Considerations

1. Endpoint discovery vs lock-down: start with broad `/api|/trpc` logging, then tighten to exact `urlPart + method` after first rerun.
2. State checks: prefer ID-based API reads; avoid UI-only “row disappears” as the sole truth.
3. Bucket classification rubric: success response + stale state (Bucket 1) vs state updated but UI lag/selector wrong (Bucket 2) vs request never fires/403 (Bucket 3/4).
