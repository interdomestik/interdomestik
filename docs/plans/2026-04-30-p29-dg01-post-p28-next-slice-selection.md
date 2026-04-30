# P29-DG01 Post-P28 Next Slice Selection

## Metadata

- Date: 2026-04-30
- Slice: `P29-DG01`
- Status: Complete
- Owner: `platform + qa`
- Purpose: select the next bounded implementation slice after completed `P28` without widening into product redesign, routing, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work.

## Scope Boundary

This is a design-gate and tracker-promotion slice only. It does not authorize product-code changes in this PR. It does not authorize changes to `apps/web/src/proxy.ts`, canonical route renames, auth layering changes, tenancy architecture changes, database schema changes, Stripe reintroduction, broad CRM redesign, broad SaaS redesign, agent-workspace redesign, product analytics expansion, README, AGENTS, or architecture docs.

## Evidence Reviewed

| Evidence                                                                                | Finding                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/current-program.md` and `docs/plans/current-tracker.md`                     | `P28` is complete through `P28-DG01` and `P28-MEM01`; no post-P28 implementation slice is currently promoted. Further membership success, billing-test, CRM, agent-workspace, analytics, observability, route, auth, tenancy, schema, Stripe, README, AGENTS, or architecture-doc work requires a future bounded repo-canonical design gate. |
| `docs/plans/2026-04-30-p28-dg01-post-p27-next-slice-selection.md`                       | The prior gate promoted exactly one implementation slice, `P28-MEM01`, and ranked repo QA MCP tooling as execution support rather than product work.                                                                                                                                                                                         |
| Running `interdomestik_qa` MCP session in this Codex thread                             | The callable MCP tools were available, but `git_status` reported a stale detached checkout at `fe3054e5` with unrelated untracked files instead of the active clean `main` checkout at `55fc9ebf`. This forced shell fallback for branch-critical repo state despite the repo's MCP-first workflow.                                          |
| `.codex/config.toml`, `scripts/start-repo-qa.sh`, and `scripts/codex-mcp-preflight.mjs` | Repo-scoped MCP configuration and local preflight exist and pass when run from the active checkout, but the active Codex session can still expose an older or wrong-root `interdomestik_qa` server after repo movement or checkout drift.                                                                                                    |
| `packages/qa/src/tools/repo.ts` and `scripts/ci/qa-mcp-discovery-contracts.test.mjs`    | The newer repo QA MCP surface includes structured helpers such as `project_map`, `git_status_compact`, `git_branch_info`, `changed_files`, and `scope_audit`, but the git helpers do not yet make the resolved repo root prominent enough for agents to immediately detect an active-session root mismatch.                                  |
| Completed `P26`, `P27`, and `P28` product slices                                        | Recent product slices are complete and guarded by closeout language. No fresh repo-custodied product defect currently outranks the MCP-first execution blocker.                                                                                                                                                                              |

## Selection Judgment

The strongest next bounded implementation candidate is a platform/QA tooling slice, not another product surface. The repo now explicitly requires MCP-first inspection and browser validation, but the active `interdomestik_qa` session can be callable while still pointing at a stale checkout. That creates slow and error-prone execution because agents must discover the mismatch manually before falling back.

The implementation should make the repo QA MCP tools self-identifying and easier to validate from inside an active agent session: git/status helpers should expose the resolved repo root, root source, branch, head, upstream, and dirty-file count in both text and structured output, and the discovery contract should prove those fields. This stays inside repo QA tooling and tests, does not touch product code, and directly addresses the execution gap observed while starting this post-P28 slice.

## Candidate Ranking

| Rank | Candidate                                                   | Decision                                                                                                                                                                                                                          |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Repo QA MCP active-checkout guard                           | Promote as `P29-QA01`. It is a concrete MCP-first workflow blocker observed in the current execution path, has a narrow implementation surface, and improves speed by making wrong-root sessions obvious before code work begins. |
| 2    | Additional CRM productization                               | Do not promote now. `P26-CRM01` addressed the known lead-detail defects, and no fresh bounded CRM defect is recorded after `P26-DG02`, `P27-DG01`, or `P28-DG01`.                                                                 |
| 3    | Agent-workspace follow-up                                   | Do not promote now. `P27-AGENT01` closed the recorded query-selection close gap, and no new bounded workspace defect is repo-custodied.                                                                                           |
| 4    | Membership success or billing-test follow-up                | Do not promote now. `P28-MEM01` aligned the known UI/runtime guard mismatch, and no further membership success defect is recorded.                                                                                                |
| 5    | Product analytics expansion                                 | Do not promote. No repo-custodied measurement design artifact or immediate product question is specific enough for implementation.                                                                                                |
| 6    | Observability or monitoring console-noise cleanup           | Do not promote now. Prior gates treated the known `403` observation as console noise rather than a proven user-facing blocker.                                                                                                    |
| 7    | Broad SaaS redesign, broad CRM redesign, or portal redesign | Do not promote. The slice would be too wide and would risk route, auth, tenant, accessibility, localization, and existing E2E contracts without a stronger repo-custodied design artifact and bounded acceptance criteria.        |

## Decision

Promote exactly one bounded implementation slice:

`P29-QA01 Repo QA MCP Active Checkout Guard`

## P29-QA01 Draft Design Plan

### Scope

- Existing repo QA MCP implementation under `packages/qa`.
- Existing MCP discovery and contract tests under `scripts/ci`.
- Existing Codex MCP preflight and setup scripts if needed.
- Existing repo-scoped MCP configuration in `.codex/config.toml` only if the implementation needs to prove or document the active checkout contract.

### Acceptance Criteria

- Repo QA MCP git/status helpers expose the resolved repository root and root-source signal in structured output.
- Repo QA MCP branch/status helpers expose enough text output for an agent to detect wrong checkout, detached HEAD, stale head, missing upstream, and dirty tree quickly.
- MCP discovery or repo-helper contract tests prove the root/head/status fields for the spawned repo-local server.
- The implementation preserves existing MCP tool names and backwards-compatible text output.
- `pnpm mcp:preflight` remains green from the active repo checkout.
- No product code changes.
- Do not touch `apps/web/src/proxy.ts`.
- Do not rename or bypass canonical routes.
- Do not refactor routing, auth, tenancy architecture, billing provider architecture, schema, Stripe posture, CRM IA, broad agent workspace, product analytics, README, AGENTS, or architecture docs.

### Suggested Branch

`codex/p29-qa01-mcp-active-checkout-guard`

### Verification Standard

- Focused MCP/tooling tests for changed behavior.
- `pnpm mcp:preflight`
- `git diff --check`
- `pnpm verify-slice -- --static`
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
- Remote PR checks, SonarCloud, Copilot, and PR finalizer green before merge.

## Implementation Closeout

`P29-QA01` is implemented as a bounded repo QA MCP tooling slice. The existing `project_map`, `git_status`, `git_status_compact`, and `git_branch_info` helpers now expose resolved repo-root identity in structured output where applicable, and status/branch text output starts with `repoRoot` plus `repoRootSource` before branch, head, upstream, ahead/behind, or dirty-state details. PR verification also fixed the existing Pilot Gate Sonar decision path: the preflight waits longer for SonarCloud Automatic Analysis, uses the `continue-on-error` step outcome for fallback decisions, and skips invalid manual fallback when SonarCloud Automatic Analysis owns PR analysis.

Focused proof:

- `node --test scripts/ci/qa-mcp-discovery-contracts.test.mjs`
- `node --test scripts/ci/codex-contracts.test.mjs`
- `node --test scripts/ci/workflow-contracts.test.mjs`
- `pnpm --filter @interdomestik/qa build`
- `pnpm mcp:preflight`

The implementation preserves existing tool names and avoids product-code, proxy, route, auth, tenancy, schema, Stripe, CRM, workspace, analytics, README, AGENTS, and architecture-doc changes.
