---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-06-07
targets:
  - docs/plans/architecture-finalization-tracker-2026-05-29.md
  - docs/plans/architecture-finalization-program-2026-05-29.md
---

# UI/UX & Dashboard Modernization — Integration Amendments (proposed Rev 18)

> Status: **non-authoritative proposal.** Ready-to-apply amendments that weave UI/UX modernization into the existing M0→M5 canonical tracker/program. **No separate UI/UX workstream.** Apply on confirmation as Rev 18. Does not touch `proxy.ts`, canonical routes, auth, tenancy, or Paddle.

## Principle & critical-path statement

UI/UX is woven as **gates and explicit nodes on existing tasks**, not a parallel rewrite. Three rules govern the integration:

1. **Inherit the existing modularity gate.** `T-007b` (150-line modularity, PR `#896`, already CI-enforced) is the modularity check for every new/modified component — no new modularity gate is invented.
2. **Off the critical path.** Every UI node hangs off M1 (`T-108/114`), M3 (`T-302b`), M4 (`T-401`), or M5 (`T-502`) — none of which is on the longest chain `T-001 → T-103 → T-201 → T-202 → T-503`. **Critical path unchanged.**
3. **Theme/branding resolves from session context, never host** — the same invariant as the four-context model (a UI corollary of `access_tenant_id` isolation).

**Legend amendment (line 32):** add dimension codes `UX` (frontend/UX quality), `PERF` (performance budget). No new workstream letter; UI tasks live under existing WS **D** (routing/layout) and **E** (product-model).

---

## 1. Existing node extensions (amend acceptance criteria in place)

### T-108 (M1, WS A) — define the `ida.*` front-door UI assumption

**Append to acceptance:** _"UI corollary: `{kind:'public'}` renders a **neutral, no-tenant-branding public shell** (login/landing) with a skeleton fallback; no tenant theme, logo, or chrome is assumed until a session resolves. A test asserts the `ida._`public route renders zero tenant-branded tokens."*
Dim:`ARCH, ISO` → **`ARCH, ISO, UX`\*\*.

### T-114 (M1, WS A,D) — make `ida.localhost` the canonical UI E2E lane

**Append to acceptance:** _"The `ida.localhost` Playwright lane is the **canonical UI smoke lane**: member/admin/agent/staff dashboard smoke specs render against the neutral public shell + session-resolved chrome, asserting no host-derived theming and no `legacy/` layout import."_
Dim: `TEST, ROUTE, ISO` → **`TEST, ROUTE, ISO, UX`**.

### T-206 (M2, WS C) — integrate presentation-layer streaming

**Append to acceptance:** _"Presentation layer: the single-query timeline feeds a **progressive/streamed render** (RSC streaming or incremental hydration) with skeleton fallbacks while events load; first contentful timeline row meets the perf budget (Open Decision #17); no client waterfall of per-event fetches."_
Dim: `OBS, DEBUG` → **`OBS, DEBUG, UX, PERF`**.

### T-502 (M5, WS D) — active deprecation + client-layout dedup

**Replace acceptance with:** _"Exactly 4 portal layouts; `legacy/` routes and the duplicate `legacy/agent` + `(dashboard)/agent` dirs **actively deleted** (not just unrouted); duplicate client layout components collapsed to the 4 canonical shells with **zero orphaned client layout** remaining (static check); one protected-route gate; no per-country host branch left; E2E smoke passes against the consolidated layouts on `ida.localhost`."_
Dim: `ROUTE` → **`ROUTE, UX`**.

---

## 2. New canonical tasks (insert into existing milestones)

```
| ID    | Task | WS | Acceptance criterion | Deps | Dim | Est | Owner | Status |
| ----- | ---- | -- | -------------------- | ---- | --- | --- | ----- | ------ |
| T-115 | M1 front-door public shell + skeleton baseline | D | `ida.*` `{kind:'public'}` serves a neutral public shell (login/landing) with a shared skeleton fallback; no tenant branding until session resolves; component(s) ≤150 lines (T-007b); E2E smoke on `ida.localhost`; meets public-shell perf budget (OD#17) | T-108, T-114 | ROUTE, UX, PERF | M | | TODO |
| T-310 | M3 dynamic theme/branding token resolution from session context | D | Design tokens/branding resolve from `resolveTenantContext()` (access/legal context), **never from host**; `{kind:'public'}` → neutral brand; switching session tenant re-themes with no host change; **no branding leaks across the `access_tenant_id` boundary** (test); ADR-20 | T-302, T-302b | ROUTE, ISO, UX | M | | TODO |
| T-410 | M4 optimistic UI hook for key member actions (`useOptimistic`) | E | `useOptimistic` on high-frequency reversible actions (status ack, doc upload, next-step advance, card actions) reconciled to the typed `ActionResult`, **rolls back on error** (no stale UI); **money/legal-gated actions stay pessimistic** (recovery activation, airline submission, settlement/payout — confirmed, never optimistic); test both paths | T-401, T-002 | PROD, UX, PERF | M | | TODO |
| T-411 | M4 shared Smart Next Step component library (SVC-DASH ⊕ FLIGHT-09 boundary) | E | One shared presentation library for service-catalog + "Smart Next Step" cards consumed by **both** `SVC-DASH` and `FLIGHT-09` (no duplication); each component ≤150 lines (T-007b); next-step states **typed/derived** from case/recovery lifecycle + `domain_events` (not hardcoded per surface); skeleton fallback; SQ/MK/EN; protective-disclaimer slot; E2E on `ida.localhost` | T-401, SVC-CORE, FLIGHT-03 | PROD, BND, UX | L | | TODO |
```

**Placement & boundary notes:**

- **T-115** → M1 table, after T-114. The UI counterpart of the host-model foundation.
- **T-310** → M3 table, after T-302b. Branding is an `access_tenant_id` corollary; isolation test included so a tenant's brand never bleeds across the access boundary.
- **T-410** → M4 table, after T-401. Architectural caveat baked into the acceptance: optimistic UI is **forbidden** on gated/irreversible money/legal actions (the same actions guarded by `canTransition`/recovery invariants).
- **T-411** → M4 table, after T-402. Defines the **SVC-DASH/FLIGHT-09 UI boundary**: T-411 owns the shared presentation components; `SVC-DASH` and `FLIGHT-09` remain thin consumers that wire domain data (lifecycle state + events) into the library. Updates `SVC-DASH` and `FLIGHT-09` deps to include `T-411`.

---

## 3. Exit criteria & gates (falsifiable)

| Gate                   | Definition                                                                                                                                                                            | Enforcement                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Modularity**         | Every new/modified UI component ≤ **150 lines**                                                                                                                                       | Existing `T-007b` CI guard (no new check) — already the M0 gate |
| **Performance budget** | Public `ida.*` shell TTFB and member-dashboard route **client JS bundle (gzipped)** ≤ the budget set in Open Decision #17; a CI **bundle-size check** fails the PR on regression      | New CI lane (bundle-size + budget assertion); numbers per OD#17 |
| **E2E smoke**          | Playwright member/admin/agent/staff dashboard smoke specs pass against the **consolidated layouts on `ida.localhost`**; assert no `legacy/` layout import and no host-derived theming | Extends `T-114` lane; required on `e2e:gate`                    |
| **Theme isolation**    | Branding tokens never derive from host and never cross the `access_tenant_id` boundary                                                                                                | `T-310` test                                                    |
| **Optimistic safety**  | No optimistic state on money/legal-gated actions                                                                                                                                      | `T-410` test                                                    |

These reuse existing lanes (`T-007b`, `e2e:gate`, `T-114`) plus one additive bundle-size check — no new gate framework.

---

## 4. New open decisions (append to tracker § for "Open decisions")

```
| 15 | **Design-token strategy** for dynamic theme resolution (T-310): CSS custom properties vs Tailwind theme config vs CSS-in-JS; how tokens bind to `resolveTenantContext()` and default to neutral on `{kind:'public'}` | M3 (T-310) |
| 16 | **Skeleton/loading library + streaming strategy** (T-115/T-206/T-411): adopt a skeleton lib vs custom; RSC streaming vs client incremental hydration for timeline/dashboards | M1/M2/M4 (T-115/206/411) |
| 17 | **Client caching + frontend performance budget numbers** (T-410/gates): RSC + `revalidate` vs React Query/SWR; and the exact TTFB / gzipped-bundle / Lighthouse thresholds the CI bundle-size gate enforces | M4 (T-410, perf gate) |
```

---

## 5. Program-file amendments (`architecture-finalization-program-2026-05-29.md`)

- **M1 milestone prose:** add a bullet — _"Front-door UI shell: `{kind:'public'}` renders a neutral, no-tenant-branding shell with skeleton fallback; `ida.localhost` is the canonical UI E2E lane (T-115)."_
- **M3 milestone prose:** add a bullet — _"Theme/branding tokens resolve from session context (access/legal), never host; neutral on public; no cross-`access_tenant_id` brand leak (T-310, ADR-20)."_
- **M4 milestone prose:** add a bullet — _"Optimistic UI on reversible member actions only (gated money/legal actions stay pessimistic, T-410); a shared Smart Next Step component library backs both SVC-DASH and FLIGHT-09 (T-411)."_
- **M5 milestone prose:** strengthen the layout line — _"4 layout shells; `legacy/` actively deleted and client layouts de-duplicated; consolidated-layout E2E on `ida.localhost` (T-502)."_
- **ADR table:** add **ADR-20 — Dynamic theme/branding token resolution from session context (not host); neutral public default; no cross-access-tenant brand leak** | M3.
- **Score-impact map (tracker §):** amend rows —
  - `Predictable routing (5→10)` → append `T-115/T-502 (front-door shell + layout consolidation)`.
  - `Tenant isolation (8→10)` → append `T-310 (theme tokens never cross access_tenant)`.
  - Add new row: `Frontend / UX quality + performance (new dimension)` → `T-115, T-206 (streaming), T-310, T-410, T-411, T-502; gated by T-007b modularity + bundle-size budget (OD#17)`.

---

## 6. Critical-path confirmation

Longest chain unchanged: `T-001 → T-103 → T-201 → T-202 → T-503`. New nodes depend only on off-path anchors: `T-115`(→T-108/114, M1), `T-310`(→T-302b, M3), `T-410`(→T-401, M4), `T-411`(→T-401/SVC-CORE/FLIGHT-03, M4). None extends the longest chain; all are parallelizable behind their milestone gate. VONESA `WS-F` and the OMG program are unaffected.

## 7. Apply

On confirmation I will fold these into the tracker (extend T-108/114/206/502 acceptance + Dim; insert T-115/310/410/411; append OD #15–17; amend legend + score map) and the program (M1/M3/M4/M5 prose + ADR-20) as **Rev 18**, leaving `current-program.md`/`current-tracker.md` (SoT) and the active `ARCH-M1-09` slice untouched.
