---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-program-authority-packet.md
  - docs/product/mobile-experience-blueprint.md
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
---

# MOB-DG01 — Design Gate Packet: MOB-01 Help Now + Trip Mode (PREPARED, NOT RUN)

> Status: **Prepared gate packet — the gate has not been run.** Repo state at preparation: `T-002b` complete; final `T-503` authority/evidence/destructive `claims.status` removal still blocking runtime UI/UX; tracker `activeSlice=null / blocked_requires_current_authority`. This document authorizes nothing. It exists so that, once M0→M5 closes and a fresh current-authority resolution occurs, `MOB-DG01` can be run same-day from a complete packet.

## 1. Decision Requested (when the gate runs)

Promote exactly one bounded runtime slice, `MOB-01` (Help Now / no-account free funnel, with Diaspora Trip Mode content folded in), into the active queue — or record a dated blocker. No other MOB-* slice is promoted by this gate.

## 2. OBR Eligibility Statement

Primary acceptance criteria map to two allowed OBR selection criteria:

1. **Public trust / pricing clarity** — clarity-marked, genuinely useful free guidance; honest free value before any payment conversation.
2. **Commercial KPI evidence** — instrumented free→account→member funnel per the `c06` instrumentation contract.

No structural/boundary/modularity argument is used or needed. Note: the OBR selection rule expires 2026-09-10; if the gate runs after that date, re-validate against whatever selection authority replaces it.

## 3. Scope

### In scope (all of it Phase-C-safe by construction)

1. **Country content packs** (new feature module): scene guides for car accident / injury / property, police-vs-EAS decision content, Green Card context, emergency numbers per country (machine codes: `XK`, `MK`, `AL` at launch; Kosovo may appear as `KS` only as a market label in reviewer-facing prose; transit corridors `DE`/`AT`/`HU`/`RS`/`HR`/`ME` for Trip Mode).
2. **Offline capability** for the above: service-worker caching of content packs; pre-departure "download for the road" action (Trip Mode). Cache holds public content only — a guard test proves no member-scoped or session-derived data is ever cached.
3. **Evidence coach**: camera-first guided shot lists with ghost overlays; photos + timestamps stored **locally on device** into an incident bundle; nothing uploaded, no account required. The local bundle may contain personal data (plates, faces, documents, time/location context), so MOB-01's privacy claim is **zero server-side PII / no upload / no account**, not absolute zero PII.
4. **Mobile-first presentation of the existing claim pack** (`t02` generator unchanged in capability; presentation/entry redesigned per blueprint §7.2 step 6, free fork only).
5. **Trip Mode**: seasonal preparedness variant — bilingual EAS content (de+sq / de+mk side-by-side), transit-country pack download, road-readiness checklist.
6. **Funnel instrumentation**: events per `c06` lineage for pack opens, guide completions, claim-pack generations, account-creation handoffs.
7. Locale additions: `de` message catalog for the surfaces above only.

### Out of scope (explicit exclusions)

- Account creation/auth changes of any kind; member surfaces; anything behind login.
- Any new disclaimer or promise language — contractual clarity markers (`c03`, `s10`) only.
- `apps/web/src/proxy.ts`; routing/auth/session/tenancy; canonical routes.
- Billing anything (Paddle surfaces untouched).
- VONESA/flight content (even free eligibility check — that is WS-F).
- Schema changes, new tables, RLS changes. (Local device storage only.)
- Push notifications.

## 4. Files / Modules Expected to Change

- `apps/web/src/features/help-now/**` (new): content-pack registry, scene-guide screens, evidence coach, Trip Mode.
- `apps/web/src/app/[locale]/(site)/**`: entry points on existing free-start surfaces.
- Service-worker/offline config (scoped to public content routes).
- `apps/web/src/messages/{sq,mk,en,de}.json`: new namespaced keys (see copy system doc).
- E2E: new golden specs for offline load, zero-server-PII/cache guard, clarity-marker presence, funnel events.

Explicitly untouched: `proxy.ts`, route groups, auth, `server/` writers, schema, billing, README/AGENTS/architecture docs.

## 5. Acceptance Criteria (slice closeout)

1. Cold start → first useful checklist in <30s on a mid-range Android over 3G, no account, no server-side PII collection, and no PII form field rendered anywhere pre-fork.
2. Car-accident guide fully functional in airplane mode after first visit; Trip Mode packs fully offline after explicit download.
3. Evidence coach produces a local-only incident bundle only after explicit user capture action; bundle copy says "stored on this device only"; the user can clear/delete the bundle; the bundle attaches to the claim-pack flow without any server round-trip until the user explicitly generates/shares.
4. Every guidance output renders the contractual clarity markers; zero new disclaimer strings (lint/marker check proves it).
5. Funnel events fire per the `c06` event contract; dashboard query demonstrates free→pack→account handoff visibility.
6. i18n integrity guardrail green across sq/mk/en/de for all new keys; no concatenated sentences.
7. Offline cache audit: proof (test) that the service worker cache contains only public content-pack assets and never contains incident bundles, photos, local metadata, member-scoped data, or session-derived data.
8. Standing DoD: modularity guard (≤150-line rule), tenant-leak harness, `pr:verify`, `security:guard`, `e2e:gate`, Pilot Gate, Sonar/CodeQL green.

## 6. Evidence Contract (what the closeout record must contain)

PR number + squash merge SHA; screenshot/recording of offline car-accident guide; zero-server-PII/cache guard test name; local-bundle clear/delete proof; clarity-marker test name; funnel-event proof query; i18n guardrail run; per-country content sign-off references (see legal templates doc — content sign-off must be recorded for each shipped country **before** public exposure of that country's pack; a country without sign-off ships dark).

## 7. Risks & Mitigations

| Risk                                                       | Mitigation                                                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wrong emergency numbers / police thresholds                | Country packs ship only with recorded sign-off (template L2); unsigned countries flag-off                                                        |
| Content drift after legal review                           | Content packs versioned; sign-off binds to pack version hash                                                                                     |
| Offline cache grows into member data later                 | Guard test in CI from day one; cache scope allowlist                                                                                             |
| Local evidence bundle is mistaken for server-collected PII | Copy states "stored on this device only"; no upload endpoint in MOB-01; clear/delete control required; bundle excluded from service-worker cache |
| Camera permissions denial breaks flow                      | Full guide usable without camera; shot list degrades to text checklist                                                                           |
| de-locale partial coverage leaks English                   | i18n guardrail treats de as required for `helpNow.*` namespace only                                                                              |
| August window missed                                       | Trip Mode content prep (translation, sign-off) starts now under template L2 — it is a legal/content task, not runtime work                       |

## 8. Rollback

Content packs are config-off per country; the whole feature is flag-off; no schema, no data migration, no rollback surface beyond static assets and flags.

## 9. Gate Preconditions Checklist (to verify the day MOB-DG01 runs)

- [ ] Final `T-503` closeout recorded in `current-program.md` / `current-tracker.md`.
- [ ] Fresh current-authority resolution run from `activeSlice=null`; `MOB-*` namespace registered.
- [ ] OBR selection rule still in force (or successor rule consulted).
- [ ] At least one country content pack (`XK` / Kosovo recommended) has recorded sign-off, so the slice can ship non-dark.
- [ ] This packet's scope re-read against `current-program.md` for new constraints since 2026-07-03.
