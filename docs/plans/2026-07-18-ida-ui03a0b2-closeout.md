# IDA-UI03a0b2 closeout — protected neutral OTP hardening

## Outcome

`IDA-UI03a0b2` is complete. Neutral pricing OTP now accepts only the exact IDA
route/authority boundary, resolves the existing neutral tenant server-side,
hashes and rotates Better Auth email OTPs, separates send/verify IP and private
identity abuse budgets, and fails closed when the post-verification Better Auth
session cannot be freshly established for the neutral tenant.

Tenant-host pricing remains visible. Its anonymous self-serve continuation makes
one deliberate same-tab document navigation to canonical neutral IDA with only
an allowlisted `standard` or `family` presentation hint. IDA removes that hint
from history before pricing analytics; it never becomes tenant, classification,
entity, price, Paddle, session or identity authority.

## Authority and merge

- Parent design: `IDA-DG17`, SHA-256
  `ed9654ec78f1a2c246742bdb151a9dbf6d18d86a219049e346271918e8364f5c`.
- Material addendum: SHA-256
  `11665d3764661a64964658179070505e83691bf5e693d6cb1638b45541ae92a8`.
- Promotion merges: `ccf70dd8335641d4aefb8c767b3e46f2b86a616c` and
  addendum merge `b97a9b548585a864762bcd7335fc4ebc2abcefc8`.
- Implementation PR: [#1372](https://github.com/interdomestik/interdomestik/pull/1372).
- Final implementation head: `0c39bb83ea736878041f2ab43ef00eee8c02602b`.
- Merge-main SHA: `486de47c3c9b3df8f181974875877736f18e6e10`.
- No replacement implementation slice is promoted. After this closeout the
  resolver must return `blocked_requires_current_authority` with
  `activeSlice=null`.

## Scope and preserved architecture

The final implementation diff contains 20 production/config files, 17
test/spec/support files, the separately governed `.env.example`, and only the
deterministically generated `scripts/repo-size-budget.json` metadata file. It
preserves exactly 32 authored focused cases, C01-C32, and the five-engineering-day
ceiling. The accepted Sol XHigh namespace amendment added only existing
`entityDisclosure` registration in `apps/web/src/i18n/messages.ts`; it did not
invent copy or broaden localization architecture. The separate C25/C26
evidence-equivalent refactor retained the complete behavioral inventory while
keeping the E2E file within the unchanged 150-line rule.

Supabase Auth remains the identity/session system of record, Better Auth 1.6.22
remains the active orchestrator, and `@interdomestik/shared-auth` remains the
provider-agnostic boundary. No `proxy.ts` or proxy-logic, schema/RLS/migration,
Supabase mutation, shared-auth public API, tenancy architecture, Paddle/payment
authority, provider resource, CORS/CSP/cookie bridge, rollout, deployment or
production alias changed.

## Security and behavior proof

- C01-C26 prove the exact neutral OTP path/host boundary, forwarded-host
  restrict-only behavior, neutral hint stripping, no pre-verification account
  lookup, split `3/IP/60s` send and `3/IP/10s` verify limits, private
  HMAC-keyed identity limits with `analytics:false`, and content-free opt-in
  logging.
- The frozen resolved Better Auth 1.6.22 contract proves hashed five-minute
  rotating OTPs, three attempts, raw sign-in response token, newly signed cookie
  conversion into the next Cookie header, exact new-row revocation, real Drizzle
  adapter registered/unregistered traces, no parallel Supabase session call,
  unconditional cookie stripping and `disableCookieCache` fresh-session proof.
- C27-C32 prove server-pinned tenant-pricing to neutral-IDA navigation,
  allowlisted presentation-only plan state, history cleanup before analytics,
  existing-session precedence, stale/tampered-plan neutrality and the full
  Chromium/Firefox/WebKit cross-host seam.
- GET remains idempotent and never auto-sends OTP, opens Paddle, creates checkout
  or mutates a session. Tenant cookies remain host-only and later M0-M5 explicit
  classification remains unchanged.

## Verification

- `pnpm pr:verify`: PASS on final head; 608 test files and 3,008 tests passed,
  web line coverage was 83.95%, repository line coverage was 85.24%, RLS proof
  covered 26/26 checks and 79/79 tables, PR E2E was 214/214, and smoke was
  13 passed with 9 contracted skips.
- `pnpm security:guard`: PASS. Repository size, modularity, i18n/purity, type,
  static, audit, build and the focused Better Auth real-adapter lane were green.
- The final focused hardening lane passed 31 tests across three files; the
  addendum lane passed 37 tests across seven files; the frozen real-adapter
  contract passed 4/4.
- Standalone local `pnpm e2e:gate` failed twice only on the pre-existing,
  out-of-scope CRM routing-rule reorder scenario. Both receipts are preserved;
  no third identical rerun or CRM edit was made. The current-head remote
  `e2e-gate`, full PR E2E 214/214 and Pilot Gate passed, so the accepted local
  determinism residual did not reproduce remotely or link to this diff.
- Post-merge `main@486de47c` passed CI run `29620366095`, Sonar Main Gate
  `29620366102`, CodeQL `29620364766` and Secret Scan `29620366109`.

## Visual, accessibility and review disposition

The independent Codex 5.6 Sol XHigh checkpoint returned PASS on final head. Its
hash-bound receipt SHA-256 is
`474a4f612948af05f5a36aff6d8c189bbe0ceb969c151f540441c6de44ec538e`.
Evidence covers SQ/EN/SR/MK, desktop/mobile, keyboard and visible focus, screen
reader semantics, 200% zoom, WCAG text spacing, reduced motion, forced colors,
localized disclosure, tamper/stale-plan handling and GET-only network behavior.
The only non-material visual observation was the existing local IDA favicon 404.

A bounded post-merge SQ standard smoke re-proved the tenant-to-IDA journey,
clean URL, focused OTP heading and absence of network mutation. Receipt SHA-256:
`7360923e7cfd791a508da2bb0b28e1a3e0709d64848f872094183b5261a71e17`.

Independent architecture and security passes found no final-head issue. The
current-head Codex review reported no major issue; Copilot reviewed all 40 files
with no new comment; all actionable threads were resolved. Sonar reported zero
new issues and zero hotspots. CodeQL, Semgrep, OSV, gitleaks, pnpm audit,
reviewdog and strict `pr:review-ready` were green. The official
`phase-c-no-touch-authorized` label was applied only after exact gate/file-map
verification; receipt SHA-256 is
`81cfe954fd657d954027ca9ebf6de10e2474ca8db74576a20122f81593f21a52`.

## Residuals, operations and Brain measurement

Arben accepted Option A for the bounded concurrent-email residual: concurrent
sends may rotate OTP1 to OTP2 while independent `after()` deliveries arrive out
of order, so the last email may contain stale OTP1. Exposure remains bounded by
`3/identity/60s` and newest-code recovery. No deterministic latest-email
delivery order is claimed and no queue, PII sink or resource was introduced.

Automatic CD run `29620366103` was cancelled immediately after merge. The
staging build stopped; staging/production deploy, production build/evidence and
verification jobs were cancelled without deployment. Vercel failed before
deployment because the private organization is on a Hobby plan. No deployment
or production alias change occurred.

The mandatory Brain measurement began mid-task in a dedicated session. Pass one
returned only current
`AGENTS.md` sections instead of current-program/tracker/resolver authority. Pass
two returned the prior DG16 gate/closeout rather than the exact DG17 source/test
seam. One narrow repository-authority recovery was used. Repo authority then
governed every architecture and runtime decision. The measurement cannot prove
full-task time/token savings and no savings claim is made. `humanUseful` remains
`unknown/not_confirmed` until Arben explicitly labels the Brain measurement.

Fresh AI OS observation
`d9092a3cd9d16c8dd7cc2b31c8c0572a67cb39f6302003d99d6f0dc0d2d819d2`
reported Interdomestik authority current and Brain current, while its advisory
`activeSlice=none` / `runtime=not_authorized` lifecycle view still lagged the
repo resolver. Unrelated NurseConnect, David and vault drift remains advisory.

## Closeout and next action

The canonical program and tracker consume the sole `IDA-UI03a0b2` promotion.
`IDA-UI03a1`, `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c` and every other follow-on
remain unpromoted. A fresh current-authority/design gate and a separate
thread/worktree are required before any follow-on implementation. Expected
resolver state is `blocked_requires_current_authority`, `activeSlice=null`.
