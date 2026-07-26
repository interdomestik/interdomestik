# IDA-SEC08b closeout

## Outcome

`IDA-SEC08b` is complete. PR `#1450` merged exact reviewed head
`11860cc916c5db97a4a81f6228e1095d29d8604a` as main
`e35f00c28a3c0167ed0366ec79de7b91e166522b`, tree
`1b9d748883eaca15f9519d495425616628b0b0c1`.

The five mandatory PR workflows now invoke the shared `pr-gate-policy` action
from the canonical `IDA-SEC08a` merge SHA
`2a5d9fa14334766e0668c7b160ea065a0c25ec19`. The three existing pin contracts
require the same exact SHA. No trigger, permission, concurrency, job graph,
input, output, draft policy or deployment behavior changed.

The implementation changed exactly nine paths: five workflows, three contract
tests and deterministic Z620 workflow-parity metadata. The authorized
deterministic size-budget path was not needed and remained unchanged. The
runtime-authority receipt was amended before the parity edit to include
`scripts/ci/z620-parity.json`; its final external receipt is 6,839 bytes /
SHA-256
`e9cfc9a61fed60a3a7550bd4835dc993f853f2864378bbff00f119ada9c06d43`.

## Proof

- Test-first semantic RED reproduced five stale workflow pins.
- Focused workflow-pin and parity contracts passed `28/28`.
- Full CI contracts passed `445/445`.
- `pnpm security:guard`, `pnpm repo:size:check` and `git diff --check` passed.
- Exact-SHA Z620 FAST proof used clean candidate `11860cc9…`. Validation,
  static, unit and security passed in run
  `ida-sec08b-11860cc9-fast-r1`; its gate-results SHA-256 is
  `22d7bf0561064c25b72756ff7254ed16bbe5b58a4fff40ba2b6b38872aba34f3`.
- Audit's first attempt failed only because the task environment omitted four
  required non-secret CI variables. One audit-only correction passed without
  rerunning green lanes in `ida-sec08b-11860cc9-fast-audit-r2`; its
  gate-results SHA-256 is
  `3b670a71c5f91b38b793781b3c408edd6ee398673cc331caa1a462ae148435ee`.
- PR `#1450` reached `CLEAN` on exact head with every required current-head
  GitHub check green, including unit, PR E2E, Pilot, SonarCloud, CodeQL,
  pnpm-audit, Semgrep, OSV, Dependency Review, Secret Scan and
  `pr-finalizer`.
- Codex reviewed the exact head and reported no major issue. Copilot was
  unavailable and remains explicitly NON-PASS.
- Review-thread intake returned zero threads.

## CD containment and main health

Automatic CD run `30217214379` for exact merge
`e35f00c28a3c0167ed0366ec79de7b91e166522b` was cancelled immediately. The
only started step was cancelled GitHub `Set up job`; there was no checkout,
registry login, image build, provider call, alias/environment mutation,
deployment or production mutation. Every downstream job has `steps: []`.

Exact-main CI `30217214351`, Sonar Main `30217214333`, Secret Scan
`30217214339` and CodeQL `30217214028` / `30217214202` all passed. CI included
green validation, static, unit, audit, AI-eval and DB-backed E2E jobs.

## Authority disposition

`IDA-SEC-DG08B` and `IDA-SEC08b` are consumed. The CodeQL `#181`-`#183`
remediation chain is terminal: the source boundary is merged, all five
mandatory callers are pinned to its canonical merge SHA, and the associated
contracts and Z620 parity metadata agree.

No replacement implementation slice is promoted. Frozen `IDA-UI03a2`,
UI/product work and architecture successors remain separate and unpromoted.
The expected resolver result after this closeout is
`blocked_requires_current_authority`, `activeSlice=null`. The next valid
action is a fresh current-authority/design gate that selects exactly one
product or architecture slice from the canonical tracker/program; it is not
authority to implement that successor in this closeout.

## Learning

Workflow-pin gates must include deterministic workflow-parity metadata in the
writer map whenever a pinned workflow's digest changes. That requirement was
learned from the initial full-contract failure and was incorporated through an
explicit runtime-receipt amendment before editing. This is a workflow
governance recommendation only; no Brain retrieval, ranking, MCP, hook,
generated Wiki or memory-truth mutation is authorized or required.
