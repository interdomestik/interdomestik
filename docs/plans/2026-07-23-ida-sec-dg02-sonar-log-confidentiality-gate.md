---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG02
slice: IDA-SEC02
revision: R0
date: 2026-07-23
authority: root-orchestrator
---

# IDA-SEC-DG02 — Vercel Health Log Confidentiality

## Decision

Promote exactly one security prerequisite slice: `IDA-SEC02`.

`IDA-SEC02` removes confidential-data logging from the bounded Vercel health
poller while preserving its polling, success, timeout and hard-failure
semantics. This gate authorizes repository implementation only after a separate
exact runtime-authority receipt binds the then-current canonical `main`.

This gate does not run a health request, workflow or deployment. It does not
authorize provider contact, alias mutation, environment mutation, database
contact, production action or any successor slice.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `1be91a6814b00afb87424f7a67b877d87194c309`
- Base tree: `4007d7e791aadd08bee80dc0c715e07238b1a2e5`
- Branch before gate: `main`
- Upstream: `origin/main`
- Resolver before gate: `blocked_requires_current_authority`
- Resolver reason: `umbrella_without_concrete_promoted_slice`
- Active slice before gate: `null`
- AI OS observation:
  `13f33aaf46c58905daeb9a4b669c366360c64ebad87d05737b584a1abaac7197`
- AI OS runtime state before gate: `not_authorized`
- Active-execution registration:
  `interdomestik-ida-sec-dg02-sonar-log-confidentiality-gate`
- Active-execution authority: `advisory_only`

Brain current-source retrieval was attempted once at the preceding closeout
boundary and failed closed because its source snapshot is stale. It is not used
as authority, is not retried against the unchanged snapshot and supports no
usefulness or ROI claim.

## Trigger Evidence

1. Sonar Main run `30023345828` is non-pass for a newly surfaced critical issue
   `AZ-PjPUTEQjECzTb2IEc`, rule `jssecurity:S8689`, at
   `scripts/ci/wait-for-vercel-health.mjs:29`: “Change this code to prevent
   confidential data from leaking in logs.”
2. The affected file is byte-identical before and after both `IDA-CD01` and its
   closeout. Its blob is
   `c6d8e7d144de3adc1c47417a3406cb1e5682a19b`; the issue is not attributable
   to either completed slice and was outside their accepted writer maps.
3. The current poller logs the raw caller-supplied `healthUrl`, logs the raw
   `error.message` for every failed attempt, rethrows the final arbitrary error,
   and prints the successful response body from its CLI entry point.
4. `fetchVercelHealth()` currently normalizes allowed hosts and redacts selected
   response-body patterns, but `waitForVercelHealth()` accepts an injected
   `fetchImpl`. Therefore the poller cannot treat an arbitrary error message,
   URL query/userinfo or future response body as safe merely because the default
   fetcher performs partial sanitization.
5. Existing focused proof is
   `scripts/ci/wait-for-vercel-health.test.mjs`. Current workflow callers invoke
   the CLI for health/provenance gates but do not parse its stdout.
6. The separate historical workflow issue
   `AZ-ACoVO5G2i53uX0BTV` is not selected by this gate. Mixing it into this
   prerequisite would create an unrelated workflow mutation and a broader
   authority surface.

## Exact Security Contract

The future implementation must satisfy all of the following:

1. No log or terminal diagnostic from `wait-for-vercel-health.mjs` may contain:
   - the raw health URL;
   - URL userinfo, query values or fragments;
   - request or response headers;
   - a raw response body;
   - a raw provider or injected error message;
   - an error stack, cause or attached payload;
   - token, secret, password, key, cookie, authorization or database-URL
     material.
2. Attempt logs may contain only bounded allowlisted metadata:
   - current attempt number;
   - configured attempt ceiling;
   - a constant operation label.
3. Failure logs may contain only a bounded, deterministic classification owned
   by this helper. Arbitrary error text must not cross the logging boundary.
4. The terminal thrown error exposed by this helper/CLI must also be
   deterministic and confidential-data-safe. Keeping a raw error in memory for
   retry control does not authorize rethrowing or printing its message, stack,
   cause or payload.
5. CLI success output must be a constant success/provenance statement or no
   output. It must not print the raw health response body. Imported callers may
   continue receiving the successful body because current snapshot/provenance
   logic parses that return value in memory.
6. The implementation must not weaken `fetchVercelHealth()` URL allowlisting,
   HTTPS enforcement, `/api/health` path enforcement, redirect rejection,
   status handling, body sanitization or commit-provenance comparison.
7. The implementation must preserve:
   - attempt count and order;
   - sleep only between failed attempts;
   - immediate return on the first success;
   - final nonzero failure;
   - expected-commit verification;
   - existing environment defaults;
   - the exported function signature, except for a narrowly typed internal
     diagnostic helper if needed.

## RED → GREEN Proof

Before production mutation, the sole writer must add focused failing proof that
injects distinct canary secrets through every poller-owned output boundary:

- a health URL with query/userinfo canaries;
- an error message containing token/password/database-URL/body canaries;
- a terminal final failure;
- a successful response body canary.

Before writing production code, the child must record that the confidentiality
boundary can be closed inside the poller and its existing focused test. If that
feasibility check requires a helper/caller/default-fetcher change, the child
stops without production mutation and returns to current authority.

The RED receipt must show that current code exposes at least the URL/error and
terminal/CLI output paths exercised by the test. No provider or network call is
permitted; all fetch behavior must be injected or the CLI must be exercised
against a deterministic local stub boundary.

GREEN must prove:

- no canary appears in attempt, failure, success, stderr or thrown-message
  output;
- the terminal error stack, cause and attached payload are absent or
  canary-free;
- only the allowlisted attempt/classification metadata appears;
- retry count/order and sleep placement remain exact;
- the first success still returns the original body to imported callers;
- final failure remains nonzero and deterministic;
- existing focused tests remain green.

## Future Writer Map

The future `IDA-SEC02` writer map is exactly three paths:

1. `scripts/ci/wait-for-vercel-health.mjs`
2. `scripts/ci/wait-for-vercel-health.test.mjs`
3. `scripts/repo-size-budget.json` — deterministic synchronization only

Any fourth path stops the slice and returns to current authority. In particular,
the future child must not edit:

- `scripts/ci/fetch-vercel-health.mjs` or its tests;
- `.github/workflows/cd.yml` or any GitHub workflow/action;
- `scripts/ci/vercel-staging-alias-state.mjs` or its tests;
- package manifests or `pnpm-lock.yaml`;
- proxy, routes, auth, tenancy, schema, RLS, migrations or product UI;
- README, AGENTS, architecture docs, Brain/AI OS tooling;
- frozen `IDA-UI03a2` state or preserved security/Z620 worktrees.

If focused RED proof demonstrates that the three-path map cannot close the
confidentiality boundary without changing a caller or the default fetcher, the
child stops. The root must revise and re-review this gate rather than infer a
fourth path.

## Execution and Review

`IDA-SEC02` is prospective Tier 3 because it changes a shared deployment-health
security boundary. After this gate is canonical and a separate exact
runtime-authority receipt exists:

- root creates exactly one fresh worktree-backed child as sole writer;
- no competing writer or overlapping implementation child may exist;
- the child owns only test-first implementation, focused/full proof, commit,
  push and ready-PR handback;
- root retains scope, AI OS/Brain lifecycle, milestone monitoring, feedback
  classification, independent review, current-head evidence, merge, exact CD
  containment, main health, cleanup and archival;
- the child model is `gpt-5.6-sol` with `xhigh` reasoning because the code
  surface is narrow but the log boundary is security- and CI-sensitive;
- idle or system-error recovery reuses durable worktree artifacts once and
  never spawns a competitor.

Required implementation proof:

1. exact three-path base-to-head diff and `git diff --check`;
2. focused Node test for `wait-for-vercel-health`;
3. `pnpm test:ci:contracts`;
4. `pnpm repo:size:check`;
5. `pnpm security:guard`;
6. `pnpm pr:verify`;
7. `pnpm e2e:gate`;
8. current-head Sonar, CodeQL, secret scan, audit, deterministic backstops,
   finalizer and all required repository checks;
9. exact-current Tier-3 Sonnet and Gemini review dispositions; Opus is used only
   if required routes are blocked, disagree or identify unresolved high-risk
   ambiguity;
10. zero unresolved actionable review threads before merge.

No unchanged heavy proof is repeated merely for monitoring. Failed proof is
classified against the exact head; remediation must stay inside the three-path
map.

## Merge and Containment

Root may merge only the exact reviewed current head after all required checks
and feedback are green or evidence-classified under repository policy.

Immediately after merge, root must identify and cancel only the exact automatic
CD run before checkout, registry login, image build, provider contact or deploy.
The cancellation is containment, not deployment authority. Root then proves:

- exact new `origin/main` head/tree;
- clean canonical main and every task-owned worktree;
- main CI, CodeQL, secret scan, audit and Sonar disposition;
- canonical resolver/AI OS state;
- consumed runtime authority and archived child.

If the exact CD run reaches any forbidden step before cancellation takes
effect, root records an incident-authority stop, performs no further provider or
deployment action and returns to current authority for explicit disposition.

## Explicit Non-Authority

This gate keeps:

```yaml
runtime_authorized: false
workflow_dispatch_authorized: false
provider_contact_authorized: false
alias_mutation_authorized: false
environment_mutation_authorized: false
deployment_authorized: false
production_authorized: false
database_authorized: false
```

It does not authorize the later UI/product slice, runtime AI, Eval v2, frozen
`IDA-UI03a2`, Z620 as a GitHub runner/CD target or any product/protected-surface
change. After `IDA-SEC02` closes, the next governed action is a fresh gate for
exactly one newly selected UI/product slice.
