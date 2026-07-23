---
type: design-gate
status: accepted_by_orchestrator
project: interdomestik
gate: IDA-SEC-DG01
slice: IDA-SEC01
revision: R1
date: 2026-07-23
authority: root-orchestrator
---

# IDA-SEC-DG01 — Next.js 16.2.11 Security Prerequisite

## Decision

Promote exactly one security prerequisite slice: `IDA-SEC01`.

`IDA-SEC01` raises the repository's reachable Next.js 16.2 patch floor from
vulnerable 16.2.6/16.2.9 resolutions to 16.2.11. It is a narrow package,
peer-floor and lockfile correction plus one exact pre-existing NodeNext
test-import repair required by the unchanged repository build. It does not
authorize a framework migration, codemod, product change, protected architecture
change, database or provider contact, or deployment.

The four current high-severity advisories are real and non-waivable:

1. npm advisory `1124170` — Middleware/Proxy authorization bypass;
2. npm advisory `1124171` — Server Actions denial of service;
3. npm advisory `1124184` — Server Actions SSRF for custom servers;
4. npm advisory `1124192` — rewrites SSRF through an attacker-controlled
   hostname.

The current audit contract requires Next.js `>=16.2.11` for all four. The slice
must remove every reachable vulnerable Next.js resolution without adding an
allowlist or weakening the audit gate.

## Authority Base

- Repository: `/Users/arbenlila/development/interdomestik-crystal-home`
- Clean base: `0b85b20af3ce8cf2b28608a1c9e47a7499704291`
- Branch: `main`
- Upstream: `origin/main`
- Resolver before this gate: `blocked_requires_current_authority`
- Active slice before this gate: `null`
- AI OS observation:
  `2e02754445166304304ee394ac30ebeddd70429aacc48a0412694a53c7fe4d41`
- AI OS runtime state before this gate: `not_authorized`

Brain retrieval was attempted once with current-source and active-execution
requirements and failed closed because its snapshot is stale relative to the
canonical program/tracker state. Brain is advisory only; no usefulness or ROI
claim is made.

The broad, stale Dependabot PR `#1407` is not implementation authority for this
slice. Its unrelated dependency updates, behind-base state and failed evidence
must not be copied or treated as acceptance proof.

## Exact-Base Evidence

1. `apps/web/package.json` declares `next`, `@next/bundle-analyzer`,
   `@next/eslint-plugin-next` and `eslint-config-next` at `^16.2.9`.
2. `packages/database/package.json` declares the Next peer floor as
   `>=16.2.5`; pnpm currently auto-resolves that peer to Next 16.2.6.
3. `packages/domain-communications` reaches Next through `inngest`; its peer is
   currently resolved to Next 16.2.9.
4. `pnpm audit --prod --json` reports twelve high findings: the four advisory
   IDs above on each of the web, database-peer and Inngest-peer resolution
   paths. It also reports lower-severity Next advisories fixed by the same
   16.2.11 patch.
5. The repository's audit contract in `scripts/pnpm-audit-gate.mjs` fails on
   high or critical advisories. That failure is the deterministic pre-mutation
   RED proof; it is not waivable baseline noise.
6. Registry metadata confirms version 16.2.11 exists for `next`,
   `@next/bundle-analyzer`, `@next/eslint-plugin-next` and
   `eslint-config-next`.
7. Next.js 16.2.11 requires Node.js `>=20.9.0`; the repository's Node 24
   authority satisfies that engine floor. Its React peer accepts the
   repository's React 19 line.
8. No evidence requires a Next major/minor migration, React change, Inngest
   manifest change, codemod or application-source compatibility edit.
9. In the sole fresh-worktree child, the unchanged `pnpm build` command failed
   before a completed Next build at
   `packages/qa/src/tools/paddle.test.ts:4` with TypeScript `TS2835` because
   `./paddle` lacks the `.js` extension required by that package's existing
   NodeNext module resolution. The file, QA manifest and QA TypeScript config
   are byte-identical to the exact base; the import dates to commit
   `0318b7acd6521a012bf0f98802465e098578e47d`; TypeScript remains 5.9.3; and
   this is the sole extensionless relative import in that NodeNext package.
   Root `pnpm build` includes the QA package through `turbo build`, while the
   current PR/release workflows build only the filtered web app with `build:ci`
   and never invoke root `pnpm build`; therefore current main CI did not expose
   the existing QA error.
10. No existing open PR owns the repair. A separate QA PR cannot merge first
    because it inherits the same non-waivable Next.js audit failure, while a
    build waiver would bypass this gate's acceptance contract. The root asked
    for approval to revise PR `#1411` to R1, add only
    `packages/qa/src/tools/paddle.test.ts`, authorize only
    `./paddle` to `./paddle.js`, issue a new hash/review and rebind the existing
    child. Arben replied exactly `Po` in root task
    `019f8dc2-a54d-76c2-b860-1167dace09a6`.
11. The exact first-build failure is preserved in the 2,645-byte external
    receipt at
    `/Users/arbenlila/Documents/Knowledge Manager and Systems Architect/Notes/decisions/2026-07-23-interdomestik-ida-sec01-wrapped-build-blocker-receipt.md`,
    SHA-256
    `bbedd503d94ed215c556b22d2d877dab78870d59536f4f76cda4b06703e223cb`.

## Goal And Outcome

Primary operator: security/platform maintainer.

Business outcome: the canonical dependency graph contains no reachable Next.js
version affected by advisory IDs `1124170`, `1124171`, `1124184` or `1124192`,
while current Phase C behavior and protected boundaries remain unchanged.

Exit state:

- the web app's four aligned Next packages declare `^16.2.11`;
- the database package's Next peer floor declares `>=16.2.11`;
- every reachable installed Next resolution, including the database and Inngest
  peer paths, is exactly 16.2.11 in the accepted lockfile;
- no `next@16.2.6` or `next@16.2.9` resolution remains reachable;
- the unchanged high/critical audit gate passes with the four advisory IDs
  absent;
- the QA package and repository build pass after the exact import-only NodeNext
  correction, with the test body and Paddle behavior unchanged;
- the existing application, route, proxy, auth, tenancy, schema, provider and
  deployment behavior remains unchanged.

## Exact Future Writer Map

Only these five repository paths may change:

1. `apps/web/package.json`
2. `packages/database/package.json`
3. `pnpm-lock.yaml`
4. `packages/qa/src/tools/paddle.test.ts` — exact import suffix only
5. `scripts/repo-size-budget.json` — deterministic sync only

Any sixth writer path stops the slice for a fresh exact disposition. In
particular, if compatibility evidence requires changing
`packages/domain-communications/package.json`, application source, any other
test line or file, configuration, workflows or an audit policy, the child must
stop without making that change.

## Required Manifest And Lockfile Behavior

### Web manifest

Change exactly these four declarations from `^16.2.9` to `^16.2.11`:

- `next`
- `@next/bundle-analyzer`
- `@next/eslint-plugin-next`
- `eslint-config-next`

Do not change React, React DOM, TypeScript, ESLint, any other dependency, scripts
or package metadata.

### Database manifest

Change only the `next` peer floor from `>=16.2.5` to `>=16.2.11`.

Do not add Next as a direct dependency, change database runtime code, alter
Drizzle/PostgreSQL dependencies, or change any other peer or package metadata.

### Lockfile

Regenerate the lockfile from the exact authorized manifests with the repository's
locked pnpm toolchain. The resulting diff may contain only entries causally
required by the Next 16.2.11 family and its peer-resolution identities.

The accepted graph must resolve all of these paths to Next 16.2.11:

1. `apps/web > next`;
2. `packages/database > next` auto-installed peer;
3. `packages/domain-communications > inngest > next` peer.

The lockfile must not introduce a Next override, ignored advisory, forced major
upgrade, unrelated package refresh or speculative deduplication. A broad
`pnpm update`, `pnpm audit fix --force`, lockfile-only hand edit or copied
Dependabot lockfile is prohibited.

### Exact QA NodeNext repair

In `packages/qa/src/tools/paddle.test.ts`, change only:

```ts
import { getPaddleResource } from './paddle';
```

to:

```ts
import { getPaddleResource } from './paddle.js';
```

Do not change the test body, QA runtime source, package manifest, TypeScript
configuration, Paddle behavior or any other import. The 58-line test file
remains 58 lines.

### Deterministic size metadata

Run the repository's tracked-only deterministic size synchronization only after
the other four files are stable. No hand-authored budget increase is accepted.

## Test-First And Acceptance Evidence

The child must preserve the exact-base failing high/critical audit result as RED
evidence before mutation and the first wrapped `pnpm build` failure as separate
pre-existing build-baseline evidence. No new test file is authorized. The
smallest GREEN proof is the unchanged repository audit gate passing after the
manifest and lockfile correction plus the QA and repository builds passing
after the exact import-only repair.

Focused deterministic proof must include:

0. preservation of the exact-base audit RED receipt and the exact wrapped-build
   receipt above; neither baseline command is rerun after its evidence is bound;
1. exact manifest-value assertions for all five changed declarations;
2. `pnpm install --frozen-lockfile`;
3. `pnpm --filter @interdomestik/web why next`;
4. `pnpm --filter @interdomestik/database why next`;
5. `pnpm --filter @interdomestik/domain-communications why next`;
6. a lockfile search proving no `next@16.2.6` or `next@16.2.9` identity remains;
7. the unchanged `scripts/pnpm-audit-gate.mjs` receiving fresh
   `pnpm audit --prod --audit-level=high --json` output and exiting zero;
8. a structured assertion that advisory IDs `1124170`, `1124171`, `1124184`
   and `1124192` are absent from the fresh audit result;
9. an exact assertion that the sole authorized QA import is
   `from './paddle.js'` and no other QA line changed;
10. `pnpm --filter @interdomestik/qa build`;
11. `pnpm security:guard`;
12. `pnpm type-check`;
13. `pnpm lint`;
14. `pnpm build`;
15. `pnpm repo:size:check`;
16. `git diff --check`.

Before merge, the exact current head must also pass the repository's mandatory
Phase C gates:

- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`

Remote current-head CI, PR E2E, Pilot Gate, CodeQL, Sonar, secret scanning,
feedback intake and finalizer signals must be green or explicitly
evidence-classified. The root orchestrator must independently inspect the final
base-to-head file map and lockfile diff rather than accepting a child summary.

## Compatibility Stops

The child must stop and return evidence without expanding scope if any of the
following occurs:

- Next 16.2.11 cannot satisfy an existing package peer contract;
- the Inngest peer path cannot resolve to 16.2.11 without changing its manifest;
- type-check, lint, build, unit, E2E or security proof requires a source,
  configuration, workflow or test edit beyond the exact QA import suffix above;
- the lockfile changes an unrelated direct dependency or package family;
- a React, React DOM, Node, TypeScript, ESLint, Turborepo or pnpm change appears
  necessary;
- a protected routing, proxy, auth, session, tenancy, schema, RLS, database,
  provider or deployment surface appears necessary;
- a sixth repository writer path appears.

A stop produces a fresh gate amendment or separate slice. It does not authorize
the root or child to improvise a compatibility fix.

## Root/Child Execution Contract

This gate is governance-only and authorizes no implementation.

After the gate merges canonically, the root orchestrator must prove the exact
new `origin/main`, sole resolver selection of `IDA-SEC01`, AI OS runtime
`not_authorized`, and clean canonical/task-owned worktrees. The root must then
issue a separate exact runtime authority bound to that new main.

Only after that runtime authority exists may the root create exactly one fresh
worktree-backed child as the sole bounded writer. The child owns only the five
paths above, test-first execution, focused/full proof, commit and PR handback.
The root retains scope, milestones, heartbeat, reviews, current-head checks,
merge, exact automatic-CD containment, main-health proof, cleanup, AI OS/Brain
closeout and child archival. No overlapping writer or competing recovery child
is permitted.

## R1 Bootstrap Ordering Exception

The standard canonical-merge-first lifecycle above remains the default. This
gate's `runtime_authorized:false` flag is unchanged.

For this exact audit deadlock only, Arben separately authorized a hash-bound
bootstrap runtime receipt that may temporarily order the five-path
implementation before canonical gate merge. The receipt must bind the final R1
bytes, SHA-256, PR head, exact main base and the existing single child before the
QA import is changed. The superseded R0 artifact, review and receipt do not
authorize the fifth path.

The canonical external receipt path is
`/Users/arbenlila/Documents/Knowledge Manager and Systems Architect/Notes/decisions/2026-07-23-interdomestik-ida-sec01-bootstrap-runtime-authority-receipt.md`.
It is a Markdown receipt with YAML frontmatter naming type, project, gate, slice,
revision, authority, status and runtime/deployment/production/provider/database
booleans. Its body must bind the R1 byte count and SHA-256, PR `#1411` head,
exact main base, root task, child, worktree, five-path map, proof state, stop
conditions and expiry. Before the child resumes, the root must hash the receipt
and mirror that hash plus all binding identities in a PR `#1411` comment.

The exception authorizes no merge bypass: the implementation PR must make
`pnpm-audit` and `pr-finalizer` green on its exact current head before merge.
After that implementation merge is contained and exact-main health passes,
PR `#1411` must be updated onto the new main and merge only on its own green
current-head evidence.

Any compatibility stop after receipt issuance immediately voids that receipt.
The implementation branch and PR, if already open, must be held without merge;
any amended gate requires a new exact-artifact review and a newly hashed receipt
before the same child may resume.

## Merge And Deployment Containment

The gate PR and later implementation PR are separate lifecycle events.

For each accepted merge, the root must identify the exact automatic CD run for
the merged `main` SHA and cancel it before registry login, image build, staging
alias movement or deployment. Cancellation is containment evidence, not runtime
acceptance. No provider or deployment call is authorized.

If the exact run cannot be identified, cancellation cannot be proved before the
unsafe boundary, or another writer changes the accepted head, the lifecycle
stops for incident classification.

No deployment-skip label or workflow bypass is claimed: no repository-enforced
mechanism for that exists in this authority, and introducing one would be an
unauthorized sixth path. Exact-run cancellation remains mandatory; inability to
contain it is a stop, never implicit deployment authority.

## Explicit Exclusions

This gate does not authorize:

- any path outside the five-path future writer map;
- `apps/web/src/proxy.ts` or canonical route changes;
- auth, session, OTP, shared-auth or tenant-isolation changes;
- application, Server Action, API route, middleware or rewrite source changes;
- schema, migration, RLS, SQL or database contact;
- Inngest manifest/runtime behavior changes;
- React, React DOM, Node, pnpm, Turborepo, TypeScript or broad ESLint upgrades;
- audit allowlists, overrides, suppressions or severity reclassification;
- a Next major/minor upgrade or codemod;
- provider contact, registry login, image build, staging or production deploy;
- IDA-CD01, any UI/product slice, runtime AI, Eval v2 or frozen
  `IDA-UI03a2` work;
- use of the Z620 as a GitHub runner or CD target.

## Promotion Boundary

Canonical promotion of this exact gate selects only `IDA-SEC01` and keeps:

- `runtime_authorized:false`
- `deployment_authorized:false`
- `production_authorized:false`

The gate becomes implementation authority only after:

1. exact-artifact senior security/architecture review passes;
2. the docs-only promotion PR passes current-head checks and review intake;
3. the gate is merged to canonical `main`;
4. its exact automatic CD run is contained before registry/image/deploy;
5. exact new-main health, resolver and clean-worktree proof passes; and
6. a separate exact runtime authority bound to that new main is accepted.

Until all six conditions hold, no manifest, lockfile or test mutation is
authorized by this gate alone. The separately accepted, exact-hash R1 bootstrap
receipt is the sole ordering exception and cannot expand the five-path map.
