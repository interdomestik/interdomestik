---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-05-31
adopted_as_canonical: 2026-05-31
tracker_path: docs/plans/architecture-finalization-tracker-2026-05-29.md
current_program_bridge: docs/plans/current-program.md
---

# Interdomestik / IDA — Architecture Finalization Program (Path to 10/10)

> Status: Canonical architecture-finalization input adopted by `docs/plans/current-program.md` and `docs/plans/current-tracker.md` on 2026-05-31. The `current-*` documents remain the formal source of truth under planning governance.

**Date:** 2026-05-29
**Inputs:** `architecture-audit-2026-05-28.md`, `architecture-audit-validation-2026-05-29.md`
**Constraint regime:** Phase C — Pilot Delivery (AGENTS.md). Additive migrations only; `proxy.ts`/`proxy-logic.ts` treated as gated; Paddle-only; no keyspace reshapes; dual-write before drop.
**Companion:** execution detail in `architecture-finalization-tracker-2026-05-29.md`.

---

## 0. What "10/10" means here

10/10 is **not** "perfect code." It is: _every structural conflation the business model forbids is impossible to express, enforced by type or schema, covered by a test that fails when someone tries._ Concretely, the platform reaches 10/10 when the day `ida.interdomestik.com` becomes the canonical login host, **zero** of the §2 conflations can produce an incident.

Each dimension below has an explicit **exit criterion** — a falsifiable statement a reviewer can check — not a vibe.

### Founding invariant: `ida.interdomestik.com` is the front door; host never implies tenant

`ida.interdomestik.com` is the **single canonical entry point** the whole tenant model is built on. `ks/mk/al/pilot` subdomains are **thin redirects/marketing aliases**, not entry points. **Host is only a default-selection hint for anonymous visitors; tenant is always a server-side bookkeeping decision derived from the session.** This is established as the foundation at **M1** (the host model is `ida.*`-first from then on, and no new per-country host logic is written), and enforced as an invariant at **M3** (`resolveTenantContext()`).

The one thing held back to **M5** is the _live public cutover_ — flipping `ida.*` to the sole login and redirecting country hosts to it — because the moment any user can book under any tenant with an incident in any country, the §2 conflations become incidents. So: **`ida.*` as architecture = now; `ida.*` as the live single sign-on = gated on the case/recovery split (M2) and single tenant-context (M3).**

> Today the code is the opposite: `tenant-hosts.ts` types `TenantId = 'tenant_mk'|'tenant_ks'|'tenant_al'|'pilot-mk'` and the host string _is_ the tenant selector. There is no `ida.*`. M1 reverses this.

### Pre-dashboard-design gate: stabilize the one-login-front-door model first

The dashboard design gate (member/admin/agent/staff surfaces, navigation, onboarding, role switching, and tenant controls) must assume the future entry model, not the current country-subdomain model. Therefore the **front-door/session-context stabilization slice is a prerequisite to final dashboard design implementation**:

- `ida.interdomestik.com` / `ida.localhost` exists as the primary neutral login entry.
- `ida.*` resolves to a real no-tenant public context and sets no tenant cookie.
- Logged-in app flows resolve tenant from server-side session/app context; host is telemetry/default-selection only.
- `ks/mk/al/pilot` hosts remain temporary aliases for compatibility, but they cannot be used as the design model for new dashboards.
- Playwright lanes stop relying on `ks.localhost` / `mk.localhost` as tenant identity shortcuts; setup state must set tenant/session context explicitly.

This slice does **not** require the full `legal_entities` split, billing rewrite, case/recovery package split, or entity migration. It only prevents the dashboard program from baking in the current host-first assumption.

**Rationale:** Dashboard design is not only visual composition; it encodes the product's entry model. If the dashboard gate designs around `ks.*`, `mk.*`, or `al.*` as identity-bearing hosts, the resulting navigation, onboarding, tenant controls, role-switching, test fixtures, and copy will all reinforce the architecture that the business is trying to retire. That creates avoidable rework and makes the later `ida.*` cutover look like a UX migration instead of a routing/context migration. The narrow front-door slice fixes the design premise first: one brand, one login, explicit session/app tenant context.

The full architecture should still remain phased because it solves deeper legal and domain problems that are not required to design the dashboards: `legal_entities`, billing-entity snapshots, case/recovery package boundaries, entity migration, and jurisdiction-aware recovery. Pulling those into the dashboard gate would turn a design-enablement step into a multi-month architecture program. The correct dependency is therefore: **front-door/session-context stabilization before dashboard design; full entity/recovery/billing architecture after, behind its own gates.**

### Second invariant: `legal_tenant_id` is the "entity-of-record" — a legal object, not a routing key

Per the operating-model research (`multi-country-operating-models-2026-05-29.md`): Interdomestik is **one brand, with a locally-registered company per country, each following its own legislation** — the Allianz Partners / Wise / Revolut shape. So `legal_tenant_id` is the **entity-of-record**: the company the member actually contracts with, which determines applicable law, terms, tax, and consumer rights. It is **resolved server-side from member residence + chosen plan, never from host**, and is **disclosed** to the member. This is law, not preference — EU choice-of-law splits a cross-border membership across three jurisdictions at once: **membership contract → Rome I (contracting entity / residence); recovery → Rome II (incident location); data rights → residence (GDPR).** The tenant decomposition therefore exists for legal correctness; collapsing it presents wrong terms/jurisdiction/tax to a member. _(Validate per-country with counsel — the Balkan entities are non-EU but EU-resident diaspora pull EU consumer/data law into scope.)_

### Third invariant: `resolveTenantContext()` returns **four separate contexts** — and `access_tenant_id` ≠ `legal_tenant_id`

The single biggest conflation today is that one `tenantId` does **four** jobs at once. The aspirational model splits the output of `resolveTenantContext()` into four independent values, each with one job:

| Context             | One job                     | Drives                                                                           | Must **not** drive           |
| ------------------- | --------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| `host_id`           | where the request entered   | telemetry, default-selection hint                                                | tenant, billing, law, access |
| `booking_tenant_id` | commercial/attribution hint | offer, language, funnel, partner commission                                      | data access, legal entity    |
| `access_tenant_id`  | **data-isolation scope**    | Postgres tenant isolation / RLS / `withTenant` / `scopeFilter` / document access | billing, governing law       |
| `legal_tenant_id`   | **entity-of-record**        | contract, terms snapshot, governing law, Paddle invoice, tax                     | data-isolation scope         |

The critical new separation (beyond the second invariant) is **`access_tenant_id` vs `legal_tenant_id`**. Today a single `tenantId` is used both as the Postgres isolation key _and_ as the billing/legal identity. They diverge in real flows: when a KS member's case is **handed off** to MK staff for a German incident, MK staff need _access scope_ over that case while the membership's _legal entity_ stays KS; a `global_support`/`auditor` role has cross-tenant _access_ with no legal/billing meaning at all. So isolation keys off `access_tenant_id`; contract/billing keys off `legal_tenant_id`; the two are resolved separately and may differ. (Incident law is a **fifth, case-level** axis — `incident_country_code` → `recovery_law` — that belongs to the case/recovery aggregate, not to `resolveTenantContext()`.)

### Scorecard: where we are → what 10 requires

| Dimension               | Now | Exit criterion for 10/10                                                                                                                                                         |
| ----------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall architecture    | 6.5 | Case and Recovery are separate aggregates; tenant decomposed into 4 concepts; event stream is the timeline source.                                                               |
| Product-model alignment | 6.0 | Card = derived view (active+grace); incident-country first-class; commercial-offer vs proof-artifact typed; banned framings blocked in CI.                                       |
| Debuggability           | 7.0 | One append-only event log per case; named events for every state change; leak-detector is a generic harness; typed errors everywhere.                                            |
| Clear domain boundaries | 7   | `domain-claims` re-cut into `domain-case` + `domain-recovery`; `domain-ai` declares deps, no cross-reach.                                                                        |
| Separation of concerns  | 6   | `proxy-logic.ts` split into resolve/secure/gate; single `resolveTenantContext()`.                                                                                                |
| Explicit state machines | 5   | `canTransition()` is the only writer; case + recovery + membership + documents + attribution machines, each with invariant tests.                                                |
| Testable business rules | 8   | State-machine transition tests + brand-lint + posture test in CI gate.                                                                                                           |
| Observable workflows    | 5   | `domain_events` append-only table; member timeline is one query.                                                                                                                 |
| Secure tenant isolation | 8   | `resolveTenantContext()` is the single source of tenant truth; isolation/RLS keys off `access_tenant_id` (distinct from `legal_tenant_id`); leak harness wraps every list query. |
| Least privilege         | 6.5 | `admin`/`tenant_admin`/`super_admin` permission sets distinct; role exhaustiveness test.                                                                                         |
| Predictable routing     | 5   | 4 canonical portals, 4 layout groups; `legacy/` retired; one protected-route gate.                                                                                               |
| Low coupling            | 6   | billing↔claims success-fee edge bridged by event, not cross-package call.                                                                                                        |

---

## 1. Program shape: five workstreams, six milestones

The work decomposes into **five workstreams** that run mostly in parallel, gated by **six milestones**. Workstreams map 1:1 to the splits the validation confirmed are real.

**Workstreams**

- **WS-A — Tenant decomposition + entity-of-record (ida-first host model).** Establish `ida.interdomestik.com` as the canonical neutral host; demote `ks/mk/al/pilot` to redirects; split the single `tenantId` into the **four `resolveTenantContext()` contexts** — `host_id` (telemetry), `booking_tenant_id` (commercial hint), `access_tenant_id` (data-isolation/RLS scope), `legal_tenant_id` (**entity-of-record**: the locally-registered company that contracts the member, resolved from residence + plan, carrying `governing_law` + versioned terms) — keeping `access_tenant_id` distinct from `legal_tenant_id`; plus the case-level `incident_country_code` → `recovery_law`; and an **entity-migration** capability (Revolut pattern). See `multi-country-operating-models-2026-05-29.md`.
- **WS-B — Case/Recovery split + jurisdiction routing.** Two state machines, `canTransition()` as sole writer, `domain-case` + `domain-recovery`; recovery binds to `incident_country` (Rome II); the **home-entity → incident-location handoff** is a first-class flow (FIA auto-club pattern).
- **WS-C — Observability.** `domain_events` append-only stream; named events; member timeline from one query; generic leak harness.
- **WS-D — Authorization & routing.** Role de-collapse; `actor_role_on_session`; portal/layout consolidation; protected-route gate.
- **WS-E — Product-model + compliance guards.** Card as derived view (active+grace); commercial-offer vs proof-artifact types; CI brand-lint; AI posture guard; **entity disclosure** (member always sees which registered company + which governing law); **tax/invoicing bound to the contracting entity**.
- **WS-F — Passenger Rights / VONESA (Flight Delay, EC261).** New sub-domain `domain-assistance/passenger-rights` that **orchestrates** the shared aggregates: `domain-case` (dossier/docs/timeline), `domain-recovery` (assignment/cession default, POA fallback, airline submission, escalation, success fee), `domain-billing` (compensation ledger, direct-payment fallback, payout), `domain-ai` (consent-gated OCR), `domain_events` (flight._ outbox). Critical invariant **NO ASSIGNMENT / NO POA = NO AIRLINE SUBMISSION**. Rides on the spine behind its own feature flag; \*\*does not gate the Design Gate or the `ida._`Go-Live**. Full detail:`vonesa-architecture-integration-2026-05-30.md`. (Epics FLIGHT-00…FLIGHT-11.)
- **WS-G — Assistance Services Catalog (the 10 renewed services).** Rules-first modules under `domain-assistance` producing typed `AssistanceOutcome`, wired into `domain-case` (free/member) and `domain-recovery` (professional recovery), per `services_technical_alignment_pergjigje.md`. Services 1–6 = assistance + case (orientation only, never final opinion); Services 7–10 = recovery (authorization + agreement + fee). No service is a free instant calculator; sensitive ones force human review. Shares the spine and feature-flagging; **does not gate Design Gate or Go-Live**. (Tasks SVC-00…SVC-10.)

**Milestones (gates, not calendar dates — sequence is fixed, cadence is yours)**

```
M0  Guardrails        ── CI lints + canTransition wrapper + leak harness + role test;
                         E2E lane inventory so tests stop treating host as tenant    (no schema change)
M1  Foundation        ── ida.* neutral host + explicit session-context setup path;
                         country hosts as aliases; entity-of-record (legal_tenant_id +
                         governing_law + terms_version); incident_country_code; case/recovery cols;
                         domain_events                                                    (dual-write)
M2  Case/Recovery     ── two machines authoritative; admin door closed; recovery↔incident_country
                         (Rome II); home-entity→incident-location handoff
M3  Tenant context    ── single resolveTenantContext() (entity-of-record from residence); host≠tenant;
                         attribution read-only
M4  Product model     ── card derived view; offer/proof types; AI posture mandatory; entity disclosure;
                         tax/invoicing bound to contracting entity
M5  Live cutover      ── flip ida.* to SOLE login (flag); tenants→legal_entities + entity migration;
                         legacy enum/route/per-country host drop after 1 release
```

Dependency spine: **M0 → M1 → {M2, M3, M4} → M5.** The `ida.*` host _model_ lands at M1 (host stops implying tenant for new flows; country subdomains become aliases). The **dashboard design gate can start only after the M0 E2E lane inventory and M1 neutral-front-door contract are green**, so designs are not built around `ks/mk/al` as identity handles. M2/M3/M4 are parallelizable once M1's columns land. **M5 only flips the live switch** — making `ida.*` the sole login and redirecting country hosts — and is gated on M2 (case/recovery split) and M3 (single tenant-context), because that is the moment any-tenant/any-country traffic could hit an unresolved conflation.

---

## 2. Milestone detail

### M0 — Guardrails (Phase-C safe, zero schema change, highest leverage)

The point of M0 is to make every _future_ regression impossible to merge before any structural change ships. Nothing here touches the keyspace, `proxy-logic.ts`, or Paddle.

1. **`canTransition(from, to, actor, context)`** — a pure function over the existing 8-status array. **First produce a complete writer inventory** — there are at least _three_ status writers today, not two: `claims/status.ts` (`updateClaimStatusCore`, enum-only), `staff-claims/update-status.ts` (guarded), and **`admin-claims/update-status.ts` (writes `status` directly with zero recovery prerequisites — confirmed bypass)**, plus `agent-claims/update-status.ts`. Route **every** writer through `canTransition` and add a CI check/grep that fails if any `db.update(claims).set({ status })` exists outside the single guarded helper. It encodes today's reality _plus_ the missing rule: `→ negotiation` / `→ court` requires `paymentAuthorizationState === 'authorized'`. Closes the unlocked admin door (validation C3 / feedback #4) with no DB change.
2. **Generic tenant-leak harness** — extract the throwing check from `server/domains/claims/index.ts` (validation B2) into a reusable `assertNoTenantLeak(rows, tenantId)` wrapper; apply to every list query in `server/domains/*`.
3. **Role-exhaustiveness + no-raw-role-arrays lint** — assert `ROLE_PERMISSIONS[role]` is defined for every `ROLES.*`, and that `admin`/`tenant_admin` sets are _not identical_ to `super_admin` (this test fails today — it's the canary that drives M-D role work). **Add a lint that forbids raw role arrays (e.g. `['admin','staff']`) outside the shared authz helpers** (feedback #5) — today the repo gates on inline role lists scattered through app code, so de-collapsing `ROLE_PERMISSIONS` alone is not enough.
4. **Brand-discipline CI lint** — scan `apps/web/src/messages/**` + checkout/registration copy + email templates for banned framings from `product-guidelines.md` ("Get your digital card", "Buy the digital card", "compensation guaranteed", etc.). Fail CI on hit.
5. **Typed-error cleanup** — convert `claims/status.ts` stringly returns to the `ActionResult<T>` discriminated union its siblings already use (validation C4).
6. **Playwright tenant-lane inventory and guardrail** — enumerate every E2E project/fixture/server setup that uses `ks.localhost`, `mk.localhost`, or host-specific URLs as a tenant handle. Add a failing check for new dashboard/auth tests that depend on country host as tenant identity. This must land with the guardrails because otherwise the suite will keep proving the old host-first behavior while the product designs for one front door.

**Exit criterion:** A PR that (a) advances a claim to `negotiation` without an authorized agreement **via any writer including the admin path**, (b) introduces a banned marketing string, (c) makes `tenant_admin` permission-identical to `super_admin`, (d) adds a raw role array outside the authz helpers, or (e) adds a new dashboard/auth E2E path that relies on country host as tenant identity, **fails CI**. No migration shipped.

### M1 — Foundation: ida-first host model + additive schema (dual-write, nothing dropped)

Add columns; never reshape. All new columns nullable, written on new rows, backfilled lazily. **This is also where `ida.*` becomes the foundation** — without yet flipping the live login.

**ida-first host model (the part that answers "is `ida.*` the one entry point?"):**

1. Register `ida.interdomestik.com` (env `IDA_HOST`, plus `ida.localhost` for dev) as a recognized host that resolves to a **real no-tenant public context**. ⚠️ **This requires a type-model change, not just a new host string (feedback #2):** today `TenantResolutionResult` _always_ requires `tenantId: TenantId`, and `resolveDefaultPublicTenantId()` falls back to `'tenant_ks'` — so `default_public` silently _is_ `tenant_ks`. Change `TenantResolutionResult` to a discriminated union (`{ kind: 'tenant', tenantId } | { kind: 'public' }`), make `ida.*` resolve to `{ kind: 'public' }`, and **assert in a test that `ida.*` sets no tenant cookie** (today `proxy-logic.ts` sets the tenant cookie whenever a tenant resolves).
2. Keep `ks/mk/al/pilot` resolving to their tenants **for now** (nothing breaks), but reclassify them as _aliases_: on a member-facing login/booking flow they set a `default_booking_tenant_id` hint and the system treats tenant as a session decision, not a host fact. **Rule from M1 onward: no new per-country host branching is written** — new code routes through the neutral host + session.
3. Add an explicit test/setup path for Playwright and local development to establish tenant/session context without depending on `ks.localhost` / `mk.localhost`. Existing host lanes can remain during migration, but the canonical dashboard/auth lanes must exercise `ida.localhost` plus explicit session context.
4. Add the `host_id` concept (which host the request arrived on) as data distinct from the resolved tenant, so reporting/telemetry can see entry host without it being load-bearing for tenant.

**Additive schema:**

5. `claims.incident_country_code` (nullable, ISO-3166) + `incident_jurisdiction` (nullable). **Wire the writers, not just a JSON backfill (feedback #8):** map incident country from the diaspora/free-start/query-country inputs and the existing `domain-assistance` `incident_country` logic into the new column at case create/update; backfill from `claim-pack` JSON only where no live source exists. Add the index the reporting story needs.
6. `claims.case_lifecycle_state` + `claims.recovery_lifecycle_state` (nullable enums), **computed from `status`** during transition via `canTransition()`. `status` remains source of truth through M2.
7. **`domain_events` as a transactional outbox with a privacy contract — not just an append-only table (feedback #1, critique §1/§2).** The table `(id, tenant_id, actor_id, actor_role, entity_type, entity_id, event_name, event_version, correlation_id, payload jsonb, created_at)` is written **inside the same Postgres transaction** as the state change it records (today staff status-change commits the DB txn and logs audit _outside_ it — that desync is the bug to kill), with a background relay/CDC delivering to consumers (idempotent, replayable). The `payload` uses a **field allowlist + PII redaction** (today `audit.core.ts` merges arbitrary `metadata` plus raw IP/userAgent with no classification), stores **references not inline PII** where possible, and defines **retention + crypto-shredding** so a GDPR erasure request is satisfiable without breaking immutability. Begin emitting `case.*`, `recovery.*`, `membership.*`.
8. Finish the deferred backfills flagged in validation D6: populate `claims.claim_number` and `tenants.code`, then enable their unique indexes.

**Entity-of-record (legal layer — additive, the Allianz/Wise shape):**

9. Add `governing_law` (ISO country / jurisdiction) and `terms_version` to the `tenants` row (the future `legal_entities`), so each registered company carries the law it operates under and the contract version it issues. Backfill from current country. _(ADR-10.)_
10. **Target the real schema (feedback #6):** there is no `membership` table — the live tables are `subscriptions`, `membership_plans`, `membership_cards`. Add `legal_tenant_id` (entity-of-record) + `governing_law_snapshot` + `terms_version_accepted` + `billing_entity` to the **`subscriptions`** row (the contract record), captured at acceptance so the contract is reproducible even if the entity's terms later change. Decide explicitly in ADR-10 whether a new `memberships` aggregate is also introduced or `subscriptions` is the system of record; default existing rows to the current tenant.
11. Record `user.residence_country` (feedback #7) — today `user` (`auth.ts`) carries `tenantId` but **no residence** — as a distinct field from any tenant/host. It selects the entity-of-record and pulls GDPR/EU consumer law into scope.

**Exit criterion:** `ida.interdomestik.com` resolves with **no implied tenant** and is recognized as the canonical neutral host; canonical dashboard/auth E2E setup can run through `ida.localhost` with explicit session/tenant context instead of host identity; country hosts still work but are flagged aliases and no new per-country logic exists; new cases carry incident-country and both lifecycle states; **new memberships capture `legal_tenant_id` + the governing-law/terms snapshot they accepted**; `domain_events` receives a row for every status change; `claim_number`/`tenant.code` uniqueness is enforced. Old rows still readable; the live login has **not** changed.

### M2 — Case / Recovery become authoritative

1. Re-cut `domain-claims` into `domain-case` (report, docs, guidance, status) and `domain-recovery` (eligibility, authorization, agreement, negotiation, court, resolution, success fee). Keep the `claims` table; the split is at the package/aggregate boundary first.
2. Make `case_lifecycle_state` + `recovery_lifecycle_state` the **authoritative** fields readers consult; `status` becomes a derived/compat column.
3. Enforce the recovery invariants structurally: cannot leave `not_applicable` without an eligibility decision; cannot reach `authorized` without a signed agreement at `paymentAuthorizationState === 'authorized'`; `in_court` requires `legal_action_cap_percentage`; `resolved` requires a success-fee row or a documented `no_fee`.
4. Bridge the billing↔claims success-fee edge (validation D4) via a `recovery.success_fee_collected` event consumed by billing, not a direct cross-package call.
5. **Derive `recovery_law` from `incident_country_code` (Rome II)** — make `recovery_law` an explicit case-level value, distinct from the membership's `governing_law` and from `access_tenant_id`. Define the **out-of-network fallback (critique §5):** when an incident occurs in a country where Interdomestik has no entity, footprint, or partner, `recovery_law` cannot silently default to the home entity's law — route to a defined fallback (e.g. guidance-only + documented `no_network` decline reason). Surface a per-jurisdiction note that recovery/success-fee handling may be a regulated legal-services activity that differs by country (flag for review, do not hard-code a single regime). _(See operating-model §5.)_
6. **Home-entity → incident-location handoff as a first-class flow (FIA auto-club pattern).** Membership stays with the home `legal_tenant_id`; when a case is triaged to recovery in a different `incident_country`, the handoff to a local entity/partner is an explicit, audited transition (`recovery.handed_off_to_jurisdiction` event), not an implicit tenant switch.

**Exit criterion:** Every recovery transition is rejected unless its invariant holds, on **all** write paths; recovery resolves its applicable-law context from `incident_country`, distinct from the membership's `governing_law`; the home→incident handoff emits an audited event and never mutates the membership's entity-of-record; the success-fee collection is triggered by an event; transition tests cover every edge in §9 of the audit.

### M3 — Single tenant context; host ≠ tenant; attribution read-only

1. `resolveTenantContext(request, session)` returns a **discriminated union carrying the four contexts** (`host_id`, `booking_tenant_id`, `access_tenant_id`, `legal_tenant_id`) and is the **only** producer of tenant truth — the place the founding invariant is enforced: **host never implies tenant.** Collapse the cookie/header/host/query precedence (today a switch in `proxy-logic.ts`, with the tested `hasHostSessionTenantMismatch` helper) into this one function. Session-tenant wins over cookie; host (`ida.*` or any country alias) is a default only when no session exists. After M3, arriving on `ks.*` vs `ida.*` produces the _same_ resolution for a logged-in member.
2. **Key off `access_tenant_id` for isolation, not a generic `tenantId`.** Re-point Postgres isolation / RLS / `withTenant` / `scopeFilter` / document access to `access_tenant_id`; `legal_tenant_id` (billing/law) is resolved separately and may differ (cross-jurisdiction handoff, `global_support` cross-tenant read). A test asserts isolation uses `access_tenant_id` and never the legal/billing value.
3. Introduce `actor_role_on_session` distinct from `user.role` — scope is conferred by the role the session is _exercising_, not historical role. Closes the "broker logs in via `/agent`" class.
4. Add `host_id`, `booking_tenant_id` as concepts (columns/derivation) distinct from `access_tenant_id` and `legal_tenant_id`. Consolidate `domain-referrals` + `ownership-attribution` into a read-only attribution surface (validation D2) that **never** grants access.

**Exit criterion:** `resolveTenantContext()` returns all four contexts; isolation/RLS keys off `access_tenant_id` (test-proven, never the legal/billing value); a stale tenant cookie cannot override the session; a former agent logging into `/member` exercises member scope only; attribution flows to reports without conferring read scope. Test: "host vs session tenant disagreement" passes.

### M4 — Product model made structural

1. Card: lift the guard from page-level redirect to a `<MembershipCard subscription={...}/>` component with a required active|grace_period prop. Fix the `grace_period` lockout (validation D1).
2. Type the hierarchy: `membership_offer` (the only thing with `price`/`interval`/`tier`) vs `membership_proof` (card) vs `membership_workspace` (IDA app) — proof/workspace are derived views with no price field that could leak.
3. AI posture mandatory: introduce `AICallContext` (home: `domain-privacy/ai.ts`, validation D3) as a non-optional argument to every `domain-ai` entry point; `domain-ai/client.ts` rejects calls without a declared posture/purpose/retention/consent. Codemod existing call sites.
4. **Entity disclosure (Wise/Uber pattern).** The member always sees which registered company they are contracting with and under which governing law — at signup, on the membership page, and on every invoice/receipt. Render it from `legal_tenant_id` + `governing_law`; a missing disclosure is a build/test failure on those surfaces. _(ADR-11.)_
5. **Bind tax/invoicing to the contracting entity — via a per-subscription snapshot, not a hardcoded map (feedback #3).** Today `BILLING_ENTITY_BY_TENANT` hardcodes `tenant_ks→ks` etc. and subscription actions derive Paddle config from `ensureTenantId(session)` (`cancel.ts`). Instead, snapshot `legal_tenant_id` + `billing_entity` + `terms_version` onto the `subscriptions` row at creation, derive all Paddle invoicing/tax/currency from that snapshot, and **reconcile Paddle webhooks against the stored snapshot** (not the current session/host). One member → one contracting entity → one consistent invoice identity, stable even if session/host changes.

**Exit criterion:** A `grace_period` member sees their card; there is no code path that attaches a price to the card; a `domain-ai` call without an `AICallContext` is a type error and a runtime rejection; **every signup, membership view, and invoice shows the contracting entity + governing law**; invoices bind to `legal_tenant_id`, not host.

### M5 — Live cutover (flip the switch; the host model already exists)

The `ida.*` host _model_ shipped at M1 and the host≠tenant invariant was enforced at M3. M5 only flips externally-visible behavior — and is gated on M2 + M3 being green, because this is the moment any-tenant/any-country traffic goes live.

1. Flip `ida.interdomestik.com` to the **sole** canonical login behind a flag. Country hosts stop serving login and become pure redirects to `ida.*` (carrying their `default_booking_tenant_id` hint).
2. After one full release cycle of dual-write, drop the legacy `status` column in favor of the two state machines; retire `legacy/` routes and per-country host branching; consolidate to 4 layout groups.
3. Split `tenants` into `legal_entities` / `marketing_hosts` / `default_booking_links` (mechanical once M1/M3 columns exist).
4. **Entity-migration capability (Revolut pattern) — with an active-case guard and a defined trigger (feedback #7, critique §3/§4).** When a new country gets its own registered company, migrate diaspora members from the home/hub entity to the new local `legal_entity`: re-issue terms under the new `governing_law`, re-capture acceptance, preserve case/recovery history, emit `membership.entity_migrated`. **Hard safeguard: a migration cannot run while the member has an active case/recovery** (`recovery_lifecycle_state` not terminal) — either block until terminal or apply an explicit "legacy-entity run-off" rule for in-flight matters, so a mid-flight POA/assignment/success-fee is never invalidated. **Define the trigger** in ADR-12: does a member-initiated `residence_country` change prompt immediate re-acceptance + migration, or defer to next renewal? Tie this to a **DSR/residence-change flow** (today `user` has no residence field). Build it now so the next market launch is config + a migration run, not a re-platform.

**Exit criterion:** A diaspora member logs in at `ida.*`, is booked under any `legal_tenant_id`, with an incident in any `incident_country_code`, and **none** of the §2 conflations is expressible. The 8-status enum, `legacy/` routes, and per-country host branching are gone; country subdomains 301 to `ida.*`.

---

## 2b. Services + VONESA overlay (WS-F / WS-G)

This overlay maps the **10 renewed services + VONESA** onto the same M0–M5 spine. It is an **overlay, not a re-sequencing**: the services and VONESA are product verticals that _consume_ the spine (front-door/session context, case/recovery split, four-context tenant model, event outbox, entity-of-record billing). They add additive tables/modules and ride behind feature flags, so **WS-F and WS-G never gate the Design Gate or the `ida.*` Go-Live.**

### Canonical 6 domains (confirmed)

`domain-assistance` (rules-first pre-checks, country/service packs, passenger-rights) · `domain-case` (dossier, RLS-isolated Document Vault, timeline) · `domain-recovery` (authorization/POA, agreements, negotiation, court) · `domain-events` (append-only outbox, GDPR-redacted payloads) · `domain-billing` (Paddle, `legal_tenant_id` snapshots, discounts) · `domain-ai` (OCR/extraction, no final decisions).

> **Clarification — there is no 7th `domain-expert`.** "Expertise / expert network" (services 4, 5, 7) is a **module of `domain-recovery`** (`domain-recovery/expert-network`), because activating an expert is an authorized, cost-incurring professional action — the same class as POA/assignment. `domain-assistance` only does the rules-first pre-check half (e.g. `vehicle-damage` valuation-delta orientation); the professional expertise lives in recovery. This keeps the canonical count at 6.

### Service → domain map (audited)

| #   | Service                          | Domain(s)                                                             | Milestone                    | Hard limit / gate                                                        |
| --- | -------------------------------- | --------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | Legal-basis pre-check            | `domain-assistance/legal-basis` + `domain-case`                       | M2                           | Orientation only; never a final legal opinion                            |
| 2   | Procedure guide                  | `domain-assistance/procedure` + `domain-case`                         | M2                           | Steps only; no representation without authorization                      |
| 3   | Injury categorization            | `domain-assistance/injury` + `domain-case`                            | M2 (rules) → M4 (consent UI) | **Explicit medical-data consent**; hard-stops → human review             |
| 4   | Vehicle-damage alternative check | `domain-assistance/vehicle-damage` + `domain-recovery/expert-network` | M2                           | Valuation-delta orientation; pro valuation only w/ human/expert review   |
| 5   | Invalidity coefficient           | `domain-recovery/expert-network` + `domain-recovery`                  | M2                           | **Member-only + human-reviewed**; final coefficient never by AI          |
| 6   | **Help Now** (incident guide)    | `domain-assistance/incident-guide`                                    | **M2, Priority-1**           | Urgent, **no login / no PII**; EAS-vs-police hard-stops                  |
| 7   | Professional expertise           | `domain-recovery/expert-network`                                      | M2                           | Consent + cost-approval required                                         |
| 8   | Member discounts                 | `domain-billing` + `domain-recovery`                                  | M5                           | Transparent Discount Matrix; applied post-agreement                      |
| 9   | Court escalation                 | `domain-recovery/legal-escalation`                                    | M2                           | Court invariants: official rejection + cost approval + member approval   |
| 10  | Legal representation handoff     | `domain-recovery/legal-handoff`                                       | M2                           | Partner-lawyer agreement; **case-specific isolated access**              |
| +1  | **VONESA** (flight delay)        | `domain-assistance/passenger-rights` + `domain-recovery`              | M1–M5                        | Assignment default / POA fallback; **NO ASSIGNMENT/POA = NO SUBMISSION** |

### Milestone overlay (what WS-F/WS-G add at each gate)

- **M0** — Spec gates (`FLIGHT-00`, `SVC-00`/ASSIST-00) and the **compliance lint** (see below). No runtime build of assignment/submission/ledger until counsel signs the legal texts (open decision #6).
- **M1** — Additive tables: VONESA (`flight_claims`, `flight_eligibility_checks`, `flight_documents`, `claim_assignments`, `poa_documents`, `fee_agreements`, `airline_submissions`, `compensation_ledger`, `direct_payment_events`, `airline_contacts`) + assistance infra (versioned **rule-pack registry**, `consent_events`, `document_classification`). First `flight.*` and `assistance.*` events into the outbox.
- **M2** — EC261 rule engine + `FlightDataProviderPort` (+ manual-review fallback); the rules-first service modules (1,2,3,4,6) producing `AssistanceOutcome`; recovery modules (5,7,9,10) + assignment/POA engine; **the canTransition invariants below**.
- **M3** — `access_tenant_id` isolation extended to flight + **medical/travel/legal documents**; role-based document access (agents/promoters cannot see medical or legal-handoff docs).
- **M4** — Dashboard cards for all 10 services + the "Fluturim i vonuar" VONESA card; Smart Next Step; **SMS-OTP signing** of Assignment / POA / **Medical Consent**; transparent Discount Matrix display.
- **M5** — Compensation ledger + payout + **Paddle billing-entity snapshot** (`legal_tenant_id`); **Direct Payment Fallback** (declare → fee invoice → reminders → no clean close while fee open); delete superseded code.

### Compliance invariant (extends T-007 brand-lint)

CI must (a) block any banned framing across **all** services and locales — `kompensim i garantuar`, `fiton patjetër`, `ne garantojmë pagesën`, `100% kompensim`, `vlerësim final`, `kalkulator invaliditeti final`, `ne jemi sigurimi juaj` — and (b) **assert the mandatory protective message is present on every key page** (service cards, checkout, eligibility results, recovery activation):

> _Interdomestik IDA nuk garanton kompensim dhe nuk zëvendëson siguruesin, avokatin ose ekspertin. IDA ndihmon anëtarin të kuptojë situatën, të dokumentojë rastin, të ndjekë procedurën dhe, kur jep autorizim, të aktivizojë mbështetje profesionale për realizimin e të drejtave të tij._

The lint fails both on a banned phrase **and** on a key page missing the protective disclaimer (versioned).

### Code Modularity invariant & Boy Scout Refactoring (T-007b modularity guard)

To maintain strict modularity, prevent over-coupling, and eliminate monolith drift:

- All new files and newly modified files **must be kept under 300 lines of code** (excluding third-party or auto-generated assets).
- **Boy Scout Rule for Large Legacy Files:** If an active task modifies an existing legacy file that already exceeds 300 lines, you **must not make it larger**. Instead, proactively assess, extract, and split the modified logical paths into smaller, decoupled helpers or sub-components (under 300 lines each) to leave the file smaller and cleaner than it was found.
- The CI pipeline (T-007b modularity guard) automatically scans and blocks any Pull Request containing newly added or modified files that violate this limit, enforcing structural decomposition at the commit boundary.

### `canTransition` invariants added by this overlay

Both route through the single `canTransition()` writer (T-001/T-002), alongside the existing "no `negotiation` without an authorized agreement":

1. **Flight (VONESA):** `→ submitted_to_airline` is rejected unless `(assignment.status === 'signed' OR poa.status === 'signed')` **and** `fee_agreement.status === 'accepted'` **and** `privacy_consent === 'accepted'`. (`NO ASSIGNMENT/POA = NO AIRLINE SUBMISSION`.)
2. **Vehicle-damage case:** `→ negotiation` is rejected unless an **alternative valuation (valuation-delta) exists** **and** the member's **service agreement/consent is signed**. (No active negotiation with an insurer on an unvalidated, unauthorized basis.)
3. **Sensitive services (injury 3, invalidity 5):** cannot leave pre-check into any recovery/representation state without **explicit medical-data consent** on file and, for invalidity, **human review** (`final_coefficient_by_ai = false`).

---

## 3. ADRs to write (one per structural decision, authored at the milestone that needs it)

| ADR    | Title                                                                                                                                                                                                                        | Gate    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| ADR-01 | Tenant decomposition (`legal`/`host`/`booking`/`incident_country`)                                                                                                                                                           | M1      |
| ADR-02 | Case vs Recovery as separate aggregates; status enum split                                                                                                                                                                   | M2      |
| ADR-03 | Domain event stream — **transactional outbox** + projections; versioning; **PII allowlist/redaction + retention/crypto-shredding** (GDPR erasure vs immutability)                                                            | M1      |
| ADR-04 | `canTransition` as the sole status writer                                                                                                                                                                                    | M0      |
| ADR-05 | Attribution is read-only; never grants access                                                                                                                                                                                | M3      |
| ADR-06 | `ida.*` as canonical neutral host (model at M1) + live cutover & cookie/session precedence                                                                                                                                   | M1 → M5 |
| ADR-07 | IDA Card as derived view (active+grace); no price on proof                                                                                                                                                                   | M4      |
| ADR-08 | AI calls require a declared `AICallContext`                                                                                                                                                                                  | M4      |
| ADR-09 | Role separation: `admin` vs `tenant_admin` vs `super_admin`, **plus a `global_support`/`auditor` role for cross-tenant read without destructive/config privileges**; enforced beyond `ROLE_PERMISSIONS` (no raw role arrays) | M0→M3   |
| ADR-10 | Entity-of-record: `legal_tenant_id` resolved from residence; `governing_law` + terms snapshot; Rome I/II split                                                                                                               | M1      |
| ADR-11 | Entity disclosure + tax/invoicing bound to the contracting entity                                                                                                                                                            | M4      |
| ADR-12 | Entity migration between legal entities on new-market launch                                                                                                                                                                 | M5      |
| ADR-13 | Passenger Rights / VONESA: assignment-default + POA-fallback; `NO ASSIGNMENT/POA = NO AIRLINE SUBMISSION`; `FlightDataProviderPort` + manual-review fallback                                                                 | M2      |
| ADR-14 | Assistance services catalog: rules-first `AssistanceOutcome`, orientation-only limits, consent/human-review gates; expertise lives in `domain-recovery/expert-network` (no 7th domain)                                       | M2      |
| ADR-15 | Compensation ledger + Direct Payment Fallback; fee bound to `legal_tenant_id`; bridged to billing by event                                                                                                                   | M5      |

The repo has an `engineering:architecture` ADR skill available; use it so ADR format stays consistent.

---

## 4. Sequencing rationale (why this order)

- **M0 first, always.** Guardrails are Phase-C-safe (no schema, no proxy, no Paddle) and they _freeze the regression surface_ before any structural change. Cheapest, highest leverage — the audit's own "Now" list, validated and tightened.
- **M1 before dashboard design implementation — and `ida.*`-first lives here.** Additive columns + the event stream are the substrate M2/M3/M4 build on. Dual-write means readers never break. Critically, the `ida.*` host _model_ lands here too: from M1 on, host stops implying tenant for new flows and no new per-country logic is written — so the team stops investing in subdomain logic it is about to delete. This is the narrow architecture slice that should precede the dashboard design gate.
- **M2/M3/M4 in parallel.** Independent once M1 lands; different files; different teams can own them. (Tracker assigns owners.)
- **M5 = the live flip only, gated.** By M5 the `ida.*` model and the host≠tenant invariant already exist (M1 + M3). M5 just makes `ida.*` the sole live login and redirects country hosts. It is the only externally-visible change and the exact trigger the audit names — shipping the _live single sign-on_ before M2 (case/recovery) and M3 (single tenant-context) are done would convert smells into incidents, so it is gated on their exit criteria. This is why `ida.*` is "foundation now, cutover gated" rather than literally first.

## 5. Risk controls during the program

- **Every migration is additive until M5.** No `DROP`, no key reshape, per AGENTS.md.
- **Dual-write window ≥ one release** before any column is dropped.
- **`proxy.ts`/`proxy-logic.ts` stay gated** until M0 guardrails are merged and a clean before/after E2E baseline exists (`.e2e_baseline_count` is already tracked in-repo).
- **E2E host lanes are part of the guardrail.** Current Playwright projects use `ks.localhost` / `mk.localhost` as tenant handles. Before the dashboard design gate, canonical auth/dashboard lanes must prove `ida.localhost` + explicit session context; country-host lanes remain only as alias/regression coverage.
- **No billing abstraction layer.** Paddle stays direct; the success-fee event (M2) is a domain event, not a payments-provider abstraction.
- **Each milestone has a rollback:** M1 columns are nullable (ignore them); M2 keeps `status` authoritative until proven; M3 `resolveTenantContext` ships behind a parity assertion against the old switch; M5 is flag-gated.

## 6. Definition of done for the whole program

The program is complete when, in CI, **all** of these tests are green and required:
state-machine transition tests (case, recovery, membership, documents, attribution); `negotiation`-requires-authorized on every write path; tenant-leak harness across every list query; host-vs-session disagreement resolves to session; `ida.localhost` dashboard/auth lanes establish tenant context explicitly rather than through `ks/mk` hostnames; role-exhaustiveness + role-distinctness; `/member/membership/card` serves active **and** grace_period; banned-framing lint; `compensation guaranteed` absent in every locale; AI-posture-required type+runtime test; audit-event coverage snapshot for every state-changing function. At that point the scorecard in §0 reads 10 across the board and `ida.interdomestik.com` can ship without a conflation becoming an incident.
