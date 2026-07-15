---
title: IDA-DG14 Premium Free Start Result Design Gate
date: 2026-07-15
status: complete
authority: current_authority
runtime_authorized: true
promoted_slice: IDA-UI02b
risk_tier: 2
owner: platform + product + design + accessibility + qa
---

# IDA-DG14 Premium Free Start Result Design Gate

## Promotion decision

Promote exactly one Tier 2 slice: `IDA-UI02b`, a presentation, localization and
accessibility correction for the already-generated Free Start claim-pack result.
Arben explicitly approved `IDA-DG14` exactly as presented and the sole promotion
of `IDA-UI02b` on 2026-07-15.

Runtime work may start only when the worktree-scoped resolver returns exactly
`IDA-UI02b`. `IDA-UI01b` remains frozen and is not resumed, reset or reused.

## Verified problem and outcome

The premium organizer introduced by `IDA-UI02a` is coherent through category,
details and preview. After successful pack generation, the current result falls
back to a narrow dark dashboard with hard-coded English headings, controls,
confidence factors, evidence, timeline, recommendation and disclaimer. The
generated letter body is already locale-aware; the seam is in presentation.

An anonymous SQ/EN/SR/MK visitor should instead receive one calm, full-width,
commercially clear result document that explains what was prepared, what to
gather, how to use the draft letter, what may happen next, and that nothing was
saved or opened as a case.

## Exact experience contract

When the existing `claimPack` becomes available:

1. Replace the completed two-column preview/sidebar arrangement with one
   full-width result composition.
2. Continue the approved warm-ivory, midnight and restrained-teal help-first
   language, with editorial sections and dividers rather than dashboard cards.
3. Present completion/no-save/no-case trust copy, a preparation indicator,
   localized next step, evidence checklist, draft letter, planning timeline and
   information-only disclaimer in that order.
4. Keep the existing score and level but frame them as a visually de-emphasized
   preparation indicator based only on entered information. State that the
   indicator neither decides eligibility nor predicts success.
5. Stop rendering raw confidence-factor and recommended-next-step prose. Their
   unchanged payload remains internal to the existing result object.
6. Translate evidence and timeline presentation through typed mappings over the
   existing stable IDs. Unknown IDs use safe localized generic wording and must
   never leak raw English.
7. Preserve the existing letter subject/body, fixed placeholder tokens, copied
   content, downloaded content and filename contract. Explain bracketed
   placeholders in each locale.
8. Preserve the existing pack-generation failure fallback. Add no retry, new
   request, persistence or changed escalation behavior.
9. Do not move focus when the asynchronous result arrives. Announce readiness
   politely; copy success is a polite status and copy failure is an alert.

No illustration, gradients, glassmorphism, cyan glow, dark SaaS cards, trauma
imagery, fake proof, urgency pressure, eligibility promise or guaranteed outcome
is authorized.

## Localization and plain-language contract

- Add complete result-stage message parity for SQ/EN/SR/MK.
- Public Albanian result copy must contain no `triazh`, `triage` or `intake`.
- No raw domain English may appear in a non-English result outside the fixed
  letter placeholder tokens.
- All four locales must communicate equivalent no-save, no-case,
  no-eligibility-decision and no-outcome-prediction boundaries.
- German remains separately unauthorized.

## Functional preservation

Preserve unchanged:

- domain claim-pack payloads and generators;
- Free Start server actions, validation, rate limiting and idempotency;
- analytics calls and event names;
- claim categories, answers and generated letter content;
- continuation hrefs and precedence;
- temporary, no-save and no-case semantics;
- direct fragment behavior and ordinary category fallback;
- pack-generation failure behavior.

The successful result may stop displaying raw confidence-factor and raw
recommended-next-step prose only as the explicit presentation correction above.

## Frontend and modularity boundary

Expected files are limited to:

- `apps/web/src/app/[locale]/components/home/claim-pack-result.tsx`;
- focused files under `apps/web/src/app/[locale]/components/home/claim-pack-result/**`;
- `apps/web/src/app/[locale]/components/home/free-start-intake-shell/index.tsx`;
- `apps/web/src/app/[locale]/components/home/free-start-intake-shell/sidebar.tsx`;
- `apps/web/src/messages/{sq,en,sr,mk}/freeStart.json`;
- focused unit, localization-contract and public Free Start E2E tests.

The 338-line result component must be decomposed. New or substantially
refactored production files remain at or below 150 lines. The grandfathered
Free Start integration test must become smaller through focused extraction if it
is touched; it must not grow.

## Test-first acceptance

Each behavior starts with an observed failing test that fails for the intended
missing contract. Tests must prove:

1. SQ/EN/SR/MK result localization and message-key parity;
2. no raw English leakage in non-English successful results;
3. no forbidden public Albanian jargon;
4. complete evidence/timeline ID coverage and safe unknown-ID fallback;
5. a full-width completed result without the duplicate frozen preview;
6. unchanged pack-generation failure fallback;
7. exact letter content through copy and download;
8. copy success/error announcements and keyboard operation;
9. unchanged continuation href and one primary next action;
10. vehicle, injury and property result fixtures plus all confidence levels.

Unit/contract proof demonstrates deterministic presentation behavior. Browser
proof demonstrates layout, interaction and accessibility. Neither substitutes
for the other.

## Accessibility and responsive contract

- Use semantic headings and sections with a deterministic reading order.
- Preserve visible focus in normal and forced-colors modes.
- Meet WCAG AA text and non-text contrast.
- Use 44×44 CSS-pixel controls and at least 16px interactive text.
- Avoid nested scrolling in the letter result.
- Keep the completion heading focus contract and announce result readiness
  without a second focus jump.
- Prove keyboard and screen-reader names/status/error behavior.
- Prove no overflow at 320, 360, 375, 390 and 430px, plus landscape and desktop.
- Prove 200% zoom, expanded text spacing, reduced motion and forced colors.
- Run Chromium across SQ/EN/SR/MK and proportionate Firefox/WebKit success
  smokes.
- JavaScript-on proof covers the generated result. JavaScript-off proof covers
  preservation of the existing category fallback because a generated result
  cannot exist without client interaction.

## Operations, evidence and rollback

This slice adds no durable store, event, audit row, external provider state,
telemetry, alert or support/admin surface. Acceptance evidence consists of
tests, locale-contract output, browser accessibility snapshots, screenshots and
traces. The degraded mode remains the existing localized completion fallback.

No feature flag or migration is required. Rollback is a revert of the single
implementation PR. Automatic CD must be cancelled before deployment after
merge. Vercel deployment and production-alias changes require separate explicit
authority.

## Explicit exclusions

- `apps/web/src/proxy.ts`, routes, auth/session, tenancy and providers;
- database, schema, RLS, migrations, durable drafts or case creation;
- server-action, analytics, idempotency or claim-pack contract changes;
- uploads, identity/contact capture or health-data expansion;
- billing, Paddle, pricing, fees or membership entitlement changes;
- flight commercial activation;
- German, channel landing pages, dashboards and deployment architecture;
- resumption, overwrite or reuse of `IDA-UI01b`;
- any second implementation slice.

## Reviewer and verification contract

Tier 2 does not require a pre-code external design review; Arben's exact approval
is the authoritative disposition. Before merge, obtain one bounded current-head
senior review and focused product/accessibility/localization critique, then
disposition Codex Security, Sonar, Copilot and all review threads.

Required local evidence includes focused tests, i18n checks, modularity guard,
browser proof, `pnpm pr:verify`, `pnpm security:guard` and `pnpm e2e:gate`.

## Authority and stop conditions

AI OS refresh/state observation
`fa71dbb7d4a3485d737871c37f253e1662e931247232aeff28cfc3f4d1399f17`
reported Interdomestik authority current, `activeSlice=none` and runtime not
authorized before promotion. Brain was current; vault integrity drift remained
advisory and did not conflict with repository authority. The targeted Brain
query did not recover the relevant tracker/source evidence and produced no
demonstrated time or token saving.

The canonical repo and delegated worktree were clean and synced at
`7ac09c1eac5f23097e9baf371842a1d0aa59ad7a`. Before this promotion, the
worktree-scoped resolver returned `blocked_requires_current_authority` and
`activeSlice=null`, as expected.

After promotion, the same resolver returned `IDA-UI02b` alone with status
`ready`. Its generic keyword heuristic reported Tier 3 because the active row's
explicit exclusions mention auth, billing and gates. The approved gate and
actual allowed surface remain Tier 2; no protected surface is authorized. The
mandatory Phase C gate contract still applies in full.

Stop and return to current authority if implementation requires an excluded
surface, new payload field, domain-generator change, persistence, new network
request, changed continuation, analytics change, or a second slice. Stop on
resolver drift, unexplained protected-file changes, failing privacy/security
gates or a browser regression that cannot be corrected inside this boundary.
