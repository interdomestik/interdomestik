# IDA-SEC08a closeout — runner file-boundary foundation

## Outcome

`IDA-SEC08a` is complete through PR
[#1448](https://github.com/interdomestik/interdomestik/pull/1448).
The merged source foundation now treats runner-controlled files as capabilities
bounded to the canonical `RUNNER_TEMP` root. It rejects traversal, prefix
collisions, symlink escapes, hard-link aliases, non-regular files and
ancestor-swap races before reading or appending.

CodeQL alerts `#181`, `#182` and `#183` transitioned to `fixed` at
`2026-07-26T17:44:46Z`. No alert was dismissed, suppressed or allowlisted.

## Authority and exact scope

- Gate `IDA-SEC-DG08` R1: 17,059 UTF-8 bytes, SHA-256
  `a343c4c1c2e578bb7998a1eb951a5ea1de736f7f969582507e59a8e3e32e6c13`.
- Runtime-authority receipt:
  `Notes/decisions/2026-07-26-interdomestik-ida-sec08a-runtime-authority-receipt.md`,
  8,691 UTF-8 bytes, SHA-256
  `a959a2b0070ab4c2d64bd8fb652ab740d5ef49899bbcc4332b18f35df9874da7`.
- Final implementation base:
  `12e669de6022288182505073fff9148c7c3f963d`.
- Final implementation head:
  `caa712b75920fe026324b65c1ef2176da2481790`.
- Squash-merge main SHA:
  `2a5d9fa14334766e0668c7b160ea065a0c25ec19`.
- Main tree:
  `82c10d0a702f9c01b3927f2275e11a39237dfe56`.

The implementation changed exactly the seventeen paths authorized by
`IDA-SEC-DG08`. It changed no workflow, routing, auth, tenancy, product,
database, provider, deployment or release surface.

The external receipt binds the exact implementation base above, gate PR
`#1447`, final gate head `94bc35fe12a462486ab7d940a8ffb46660820969`,
gate merge `12e669de6022288182505073fff9148c7c3f963d`, the complete seventeen-path
writer map and task-isolated Z620 FAST authority. It explicitly keeps workflow
dispatch/rerun, provider, alias/environment, deployment, production, release,
product-database mutation and `IDA-SEC08b` authority false. The receipt is
consumed by this closeout.

## Verification and review

- Focused boundary/caller proof: 29/29 PASS.
- CI contracts: 445/445 PASS.
- Repository size, security guard and diff checks: PASS.
- Exact-head Z620 FAST proof: PASS from a clean candidate with zero retained
  task resources.
- Exact-head GitHub checks: 29 PASS, zero failure or pending.
- Sonar, CodeQL, Semgrep, OSV, audit, Secret Scan, E2E, Pilot and finalizer:
  PASS.
- Codex exact-head review: no actionable finding.
- Copilot was unavailable until 2026-08-01 and remains explicit NON-PASS.
- Unresolved actionable review threads: zero.

The exact Z620 source bundle was
`/home/arben/ci/interdomestik/candidates/caa712b75920fe026324b65c1ef2176da2481790-ida-sec08a.bundle`,
50,537,660 bytes, SHA-256
`d92998861f42cbbbd84b5f245c4ffb776ac046f413b243caf9e3942375455cb3`.
The FAST evidence run was
`/home/arben/ci/interdomestik/runs/ida-sec08a-caa712b7-fast-r1`, with
`gate-results.json` SHA-256
`a72b1009a7e3f391d55e2cfc42b50169e86bd1ea27bc4605791c916d1b8a82cc`
and evidence-tree SHA-256
`47dab0301817b0bba9f0d6ce7e3c1021bdddb8dc5bdc5cb50a7a4ceeb6c57c93`.

## CD containment and exact-main health

Automatic CD run `30213106659` is terminal `cancelled`. Its sole setup step
was cancelled and every downstream job has `steps: []`; no checkout, registry
login, metadata, image build, provider call, alias/environment mutation,
deployment or production mutation occurred.

Exact-main CI `30213106664`, Sonar Main `30213106674`, CodeQL
`30213106486` / `30213106341` and Secret Scan `30213106695` passed.
Local `main` and `origin/main` are synchronized at `2a5d9fa14334766e…`.

## Mandatory successor

The complete operational remediation is not terminal until the five mandatory
workflow callers pin the composite action to the canonical merge above.
`IDA-SEC08b` is therefore the only valid successor, but it requires a fresh
current-authority gate and then a separate exact runtime-authority receipt.

No product/UI/architecture slice is promoted by this closeout. The
`IDA-SEC08a` authority is consumed.

## Learning recommendation

No product-memory update is needed. The warranted workflow lesson is to split
a self-referential source fix from its exact workflow-pin activation, so
mandatory workflows never trust a transient intermediate commit. This is an
operational recommendation only and authorizes no Brain, Wiki, hook, provider
or deployment mutation.
