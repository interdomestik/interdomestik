---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG08B
slice: IDA-SEC08b
revision: R0
date: 2026-07-26
authority: arben-and-root-orchestrator
---

# IDA-SEC-DG08B — canonical workflow pin activation

## Decision

Promote exactly one implementation slice: `IDA-SEC08b`.

`IDA-SEC08b` must replace the existing
`interdomestik/interdomestik/.github/actions/pr-gate-policy@...` reference in
the five mandatory PR workflows with the canonical `IDA-SEC08a` squash-merge
SHA:

`2a5d9fa14334766e0668c7b160ea065a0c25ec19`

It must update the three existing pin-contract test files to require the same
SHA. No workflow behavior, trigger, permissions, job graph, inputs, outputs or
policy semantics may change.

This docs-only gate authorizes no implementation. Repository implementation
may begin only after this gate is canonical and a separate exact
runtime-authority receipt binds then-current `main`.

## Classification

- Gate class: current-authority/design-gate promotion.
- Gate risk: Tier 0; only plan/tracker evidence and deterministic size metadata
  change.
- Prospective implementation class: workflow trust-anchor activation.
- Prospective implementation risk: Tier 3 because five mandatory PR workflows
  change their pinned action commit.
- Product, routing, auth, tenancy, schema, RLS, billing and database behavior:
  unchanged.
- Workflow dispatch/rerun, provider, alias/environment, deployment,
  production and release authority: false.
- Pre-push profile: `FAST`; the exact change is a workflow pin plus contracts,
  with no product runtime, dependency graph, database, build or browser
  behavior.

## Authority base

- Repository:
  `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean `main` and `origin/main`:
  `2a5d9fa14334766e0668c7b160ea065a0c25ec19`
- Main tree:
  `82c10d0a702f9c01b3927f2275e11a39237dfe56`
- Gate branch:
  `codex/ida-sec-dg08b-workflow-pin-activation`
- Resolver before gate: stale `IDA-SEC08a` selection from Rev 170.
- Repository evidence: `IDA-SEC08a` is already terminal through PR `#1448`.
- AI OS observation:
  `9ed28ed4590d5c331b31469edbefa7ee67d59af149cbc2079550aac95d4d08c4`
- AI OS authority: current.
- AI OS runtime: not authorized.
- Brain: stale advisory context, failed closed.
- Session integrity: drift advisory only; it grants no runtime authority.

Obsidian/Wiki was used only for orientation. Repository source, tests,
canonical program/tracker, PR evidence and exact-main health remain authority.

## Exact writer map

The future `IDA-SEC08b` writer map is exactly nine paths:

1. `.github/workflows/ci.yml`
2. `.github/workflows/e2e-pr.yml`
3. `.github/workflows/pilot-gate.yml`
4. `.github/workflows/pr-deterministic-backstops.yml`
5. `.github/workflows/pr-finalizer.yml`
6. `scripts/ci/pr-gate-pin-contracts.test.mjs`
7. `scripts/ci/workflow-contracts.test.mjs`
8. `scripts/ci/draft-gate-workflow-contracts.test.mjs`
9. `scripts/repo-size-budget.json` — deterministic synchronization only

Any tenth path stops the slice and returns to current authority.

## RED → GREEN contract

RED is the exact current-main state in which the five workflows and existing
pin contracts still name the pre-`IDA-SEC08a` action SHA.

GREEN must prove:

1. all five workflows reference exactly
   `2a5d9fa14334766e0668c7b160ea065a0c25ec19`;
2. all three contract suites require that exact SHA;
3. no other external or local action pin changes;
4. workflow triggers, permissions, concurrency, job graphs, conditions,
   inputs, outputs and policy semantics are byte-identical except for the
   target pin;
5. repository-size metadata is synchronized rather than guessed;
6. focused pin contracts, all CI contracts, security guard and diff checks
   pass;
7. an exact-head Z620 `FAST` proof passes without database/browser resources;
8. current-head GitHub CI, E2E, Pilot, Sonar, CodeQL, security and finalizer
   signals pass;
9. Codex reviews the exact current head and every actionable thread is
   resolved;
10. Copilot is recorded as NON-PASS while unavailable, never inferred green.

## Stop conditions

Stop immediately for:

- any tenth path;
- any workflow edit beyond the five exact action-pin replacements;
- any action-pin target other than the canonical `IDA-SEC08a` merge;
- any policy, trigger, permission, concurrency, job, input or output change;
- any workflow dispatch/rerun;
- any database, browser, product, UI, provider, alias/environment,
  deployment, production or release expansion;
- any suppression, audit allowlist, CodeQL dismissal or review bypass;
- base drift before runtime authority.

## PR, merge and containment

The implementation uses exactly one fresh worktree/branch and one PR. Root
owns current-head review, checks, merge, automatic-CD containment, exact-main
health, tracker closeout and cleanup.

Merge is allowed only for the exact approved head after all required signals
are green or explicitly classified. Immediately after merge, root must cancel
only the exact automatic CD run before checkout/registry/image/provider/deploy
and then prove exact-main CI, Sonar, CodeQL and Secret Scan health.

`IDA-SEC08b` promotes no product successor. After its canonical closeout the
resolver must make a fresh decision from the then-current tracker/program.
