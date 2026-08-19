# IDA-T115-OD17-PROJECTION-CAPABILITY-RUNTIME-R1

Status: exact candidate; no runtime authority until Arben approves this exact artifact
together with IDA-DG51 and the ready admission receipt.

## Exact bindings

- Base protected main: `6cf5227fcdf7247b801d9aa4673eabb08bceab98`.
- Gate: `IDA-DG51-T115-OD17-PROJECTION-CAPABILITY-R1`, 14,638 UTF-8 bytes,
  SHA-256 `9a6b755cefb97debe25b87fd98d498de0177b824fe7f4b2638e709cc5ec2697d`.
- Admission: `IDA-T115-OD17-PROJECTION-CAPABILITY`, version 1, status `ready`,
  7,994 UTF-8 bytes, SHA-256
  `20bc2ada1cded00196307873eb57d8173a3d862387b359913cf2e5272f4ad4b3`.
- Terminal source: `IDA-T115-OD17-TERMINAL-PROJECTION-MISMATCH-R1`, 4,293
  bytes, SHA-256
  `7e415da8a3578e13057b215d72fbb640928e28273678b229ccd9fa339cae655a`.
- Preserved source head: `6ede23899a3b5b4c429f89739113073877f722d7`;
  historical implementation head/tree:
  `6e334da050d16929733a84b89fb06359a6952892` /
  `ce742a8a995bde75fb7550547410f013d86708a0`.
- Opus 5 design review: one process, 340.847 seconds, verdict `REVISE`; accepted
  and rejected findings are frozen in DG51. No second design-review loop.
- Writer host: one clean worktree only. The chat-bound worktree path must remain
  present and be returned to clean detached `origin/main` after cleanup.
- Mac remains a light control/writer plane: no dependency install, Docker,
  Supabase, full build, browser E2E, cache creation or heavy validation.

## Sole authorization

Create exactly one branch `codex/ida-t115-od17-projection-capability` from the bound
base in the chat-bound clean worktree. Materialize the exact approved gate, this receipt,
and a compact current-program/current-tracker reconciliation, then implement only the
twelve capability writers named by DG51 and the ready admission receipt.

Use the preserved PR #1597 objects as read-only reconstruction input. Reconcile every
path against current base; do not blindly cherry-pick consumed runtime/status bytes or
empty deployment-trigger commits. First add the RED sanitized replay test for GitHub
Deployment `5981435922` and status `17012107025`, then apply the exact fail-closed
projection predicates, real host/ref verifier correction, manifest compatibility, and
already-proven runner/workflow hardening.

Run only focused lightweight local proof possible with the existing runtime: Git diff,
format checks, focused Node suites, workflow contracts, modularity/parity and deterministic
size metadata. Missing local `node_modules` or package imports remain a non-blocking Mac
environment limitation; do not install them. Push one capability branch and open one PR.
Heavy proof is GitHub-hosted. Observe current-head review/comments/threads, Sonar, CodeQL,
Copilot/Codex availability and required checks once. At most one consolidated remediation
is allowed for an actual current-head code, CI or review defect; list the exact invalidated
proof before changing the head.

Merge only the exact reviewed head when all required current-head checks are green and
actionable/unresolved feedback is zero. Immediately cancel/contain automatic CD before
its jobs perform staging or production work, verify the squash result is exact main and
required main checks pass, then delete only the capability branch and its temporary writer
state. Do not delete the chat-bound worktree directory; detach it cleanly at origin/main.

## Explicit non-goals and terminal boundary

This receipt grants no Vercel/provider control, Preview, deployment, redeploy, canary,
audit rerun, finalizer rerun, production, OIDC measurement, Lighthouse, metric collection
or T-115 PASS claim. It grants no `repository_dispatch`, Vercel API/CLI/token, provider
attestation, TTFB method/threshold change, new workflow event/permission, dependency or
lockfile change, product/UI/auth/session/routing/proxy/tenant/schema/RLS/billing change,
local Docker/install/heavy test, AI OS action, or other T slice.

Stop unmerged for a thirteenth implementation writer, new provider primitive/secret,
workflow trust-boundary weakening, failure to reproduce the real projection offline,
unresolved actionable feedback, required-gate failure after the one remediation, or any
need to trigger provider runtime. After the exact capability merge, T-115 remains open
and provider runtime remains unauthorized until a new exact-main final-measurement receipt
is presented to and approved by Arben. DG51 permits that one receipt but no new strategic
gate, amendment, alternate design or hidden retry.
