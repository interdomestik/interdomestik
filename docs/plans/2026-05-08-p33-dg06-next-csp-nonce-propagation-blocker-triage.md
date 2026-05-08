---
status: design-review
date: 2026-05-08
slice: P33-DG06
title: Next CSP Nonce Propagation Blocker Triage
owner: platform
phase: Phase C
---

# P33-DG06 Next CSP Nonce Propagation Blocker Triage

## Decision

`P33-DG06` promotes one bounded follow-up slice:

`P33-SEC05 Next CSP Nonce Propagation Triage`

The next slice must classify the SEC03 blocker before any renewed SEC03 implementation
attempt or CSP Phase 1 enforcement work. It must decide whether the observed Next framework
script nonce gap is:

1. an upstream Next.js bug,
2. a documented limitation or supported escape hatch not yet applied,
3. a repo wiring gap,
4. or a report-only architecture mismatch with the documented Next CSP nonce model.

Phase 1 enforcement remains blocked. `CSP_NONCE_MODE=enforce` remains guarded.

## Inputs

- `P33-SEC02` shipped report-only nonce observation and found first-party script-family
  reports.
- `P33-DG04` confirmed H1: first-party Next framework/static chunk and runtime inline
  scripts are the report-mode blocker.
- Parked SEC03 stop evidence is in local commit `c5947e2d` on
  `codex/p33-sec03-design-review`. That stop branch added classifier and focused browser
  proof, then reached the designed stop before merge.
- SEC03 focused landing smoke in report mode recorded `missingNonceCount=72` and
  `firstPartyScriptViolationCount=84`.
- Representative raw HTML confirmed the first unnonced script is Next-owned and same-origin:
  `<script src="/_next/static/chunks/3cb1597f-2eea7166c3a9ccf6.js" async="">`.
- Supported repo hooks were already green: proxy request-header nonce injection, response
  Report-Only nonce CSP, root-layout `connection()` plus `headers()` nonce read, and the
  `data-csp-nonce-probe` canary.

## Current Next.js Guidance

Context7 for Next.js `v16.2.2` confirms the documented nonce path:

- Generate a fresh nonce in proxy.
- Set `x-nonce` on cloned request headers.
- Set a nonce-bearing `Content-Security-Policy` request header.
- Return `NextResponse.next({ request: { headers } })`.
- Emit the same `Content-Security-Policy` response header.
- Read `x-nonce` from App Router Server Components with `headers()`.
- Use `connection()` or otherwise force dynamic rendering.

The same guidance says Next extracts the nonce during dynamic rendering and automatically
applies it to framework scripts, page JavaScript bundles, inline styles/scripts, and
`<Script>` components that use the `nonce` prop.

Important constraint: the documentation example uses `Content-Security-Policy`, not a
report-only-only response model. It also states nonce CSP requires dynamic rendering and
disables static optimization, ISR, and PPR for nonce-bearing pages.

## Triage Scope

`P33-SEC05` is a focused evidence slice, not a Phase 1 enforcement slice.

It may:

- Create a minimal local Next 16.2.x App Router repro outside product runtime surfaces, or
  use a temporary non-product harness under an evidence directory if repo policy allows it.
- Test the installed Next version and, if feasible, a patch-level Next probe matching DG04's
  16.2.6 check.
- Compare raw HTML, response headers, and DOM script nonce inventory across CSP modes.
- Inspect installed Next source only to explain observed behavior, not to monkey-patch it.
- File or prepare an upstream Next issue if the documented baseline fails in a minimal repro.
- Update CSP migration docs with the classification result.

It must not:

- Edit `apps/web/src/proxy.ts`.
- Promote `CSP_NONCE_MODE=enforce`.
- Change canonical routes, auth, tenancy, schema, Stripe, or product runtime behavior.
- HTML-rewrite Next output.
- Monkey-patch Next internals.
- Remove `'strict-dynamic'`, weaken report-only CSP, or narrow the report classifier to hide
  first-party reports.
- Claim SEC03 passed unless zero first-party script-family reports are proven after a
  supported fix.

## Required Matrix

The triage slice must test at least these cases with raw HTML and header artifacts:

| Case | Request header supplied to Next                                           | Response header emitted to browser                                     | Expected decision value                                                                      |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A    | nonce `Content-Security-Policy`                                           | same nonce `Content-Security-Policy`                                   | Documents baseline; if this fails in minimal repro, likely upstream bug.                     |
| B    | nonce `Content-Security-Policy`                                           | existing enforced CSP plus nonce `Content-Security-Policy-Report-Only` | Mirrors repo report mode; if A passes and B fails, likely report-only architecture mismatch. |
| C    | nonce `Content-Security-Policy-Report-Only` only, if technically possible | nonce `Content-Security-Policy-Report-Only`                            | Confirms whether report-only request extraction works, even though docs do not advertise it. |
| D    | no nonce request CSP                                                      | nonce response Report-Only CSP only                                    | Negative control; framework scripts should not be expected to get nonce.                     |

Each case must record:

- Next version.
- Route rendering mode and whether dynamic rendering was forced.
- Response `x-nonce`.
- CSP and Report-Only CSP headers.
- First-party script tag inventory, including inline scripts and `/_next/static/*`.
- Whether the `data-csp-nonce-probe` canary matches the response nonce.
- Browser `securitypolicyviolation` counts grouped by script-family directive.

## Decision Rules

- **Upstream bug:** Case A fails in a minimal app that follows the documented Next CSP nonce
  pattern.
- **Known limitation / report-only architecture mismatch:** Case A passes but Case B fails,
  and no supported report-only hook is documented.
- **Repo wiring gap:** Case A and Case B pass in the minimal repro, but the Interdomestik
  standalone app still fails with the same supported hooks.
- **Supported escape hatch:** Next docs, source, or issue history identifies an official hook
  not yet included in DG04/SEC03. In that case, reopen SEC03 only for that hook and preserve
  all existing enforcement guards.

## Acceptance Criteria

`P33-SEC05` passes only when it produces one of the four classifications above with
reproducible evidence. It does not need to make report-only CSP clean; that remains SEC03's
job only if a supported fix exists.

The deliverable must include:

- A short evidence report with the matrix results.
- Raw HTML/header excerpts sufficient to identify whether scripts are framework-owned.
- A linked upstream Next issue or issue-ready reproduction if the classification is upstream
  bug.
- A clear recommendation: reopen SEC03, wait for upstream, update architecture, or promote a
  new design gate.

## Verification Plan

DG06 is a design-gate slice. Required local verification:

- `git diff --check`
- `pnpm plan:status`
- `pnpm plan:audit`
- `pnpm track:audit`
- `pnpm docs:verify`
- `pnpm purity:audit`
- `pnpm verify-slice -- --static`

No browser validation is required for DG06 itself because it does not change product runtime
behavior. Browser validation is required in `P33-SEC05`.

## Phase C Constraint Check

- `apps/web/src/proxy.ts` remains untouched.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` remain unchanged.
- `*-page-ready` clarity markers remain unchanged.
- Auth, tenancy, routing, domain architecture, schema, and Stripe remain untouched.
- CSP Phase 1 enforcement is not promoted.
