---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-05-31
adopted_as_canonical: 2026-05-31
program_path: docs/plans/architecture-finalization-program-2026-05-29.md
tracker_path: docs/plans/architecture-finalization-tracker-2026-05-29.md
---

# VONESA (IDA Passenger Rights) — Architecture Integration Analysis

> Status: Supporting architecture input for the adopted architecture-finalization program. The `current-*` documents remain the formal source of truth under planning governance.

**Date:** 2026-05-30
**Author:** Lead architect review
**Sources:** `interdomestik_vonesa_integrim_platforme.md`, `services_technical_alignment_pergjigje.md`, `multi-country-operating-models-2026-05-29.md`, the finalization program & tracker (Rev 3).
**Scope:** integrate VONESA (Flight Delay / EC261 passenger-rights compensation) as a first-class vertical of IDA, not a landing page.

**One-line verdict:** VONESA fits the target architecture _exactly_ — it is the cleanest possible exercise of the `domain-case` / `domain-recovery` split, the entity-of-record/jurisdiction model, and the `domain_events` outbox. It should be built as a new sub-domain `domain-assistance/passenger-rights` that **orchestrates** the shared aggregates, and it must **ride on the existing spine without becoming a prerequisite for the Design Gate or the `ida.*` Go-Live**. The whole vertical sits behind its own feature flag.

---

## 1. Sub-domain alignment — `domain-assistance/passenger-rights`

### 1.1 Where it lives and what it is

VONESA is a **rules-first sub-domain that orchestrates the shared aggregates** — it owns _flight-specific_ logic (EC261 eligibility, flight data, airline registry, ledger math) and delegates everything generic to the existing domains. It must not become a second monolith and must not re-implement case/recovery primitives.

```
packages/domain-assistance/src/passenger-rights/        ← NEW sub-domain (flight-specific only)
  eligibility/        EC261 rule engine (pure, versioned) → AssistanceOutcome
  flight-data/        FlightDataProviderPort + adapters (Cirium/FlightAware/…)
  intake/             multi-step input → normalized flight facts
  airline-registry/   airline_contacts (staff-maintained, versioned)
  ledger/             compensation math (gross → fees → net); pure functions
  mapping/            flight_claim ↔ domain-case / domain-recovery translation
```

Everything else is **borrowed, not rebuilt**:

| Need                                                           | Owner (existing)        | VONESA does NOT own this                   |
| -------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| Dossier, documents, status, timeline, member/staff view        | **`domain-case`**       | the case record + Document Vault           |
| Assignment/cession, POA, negotiation, ADR, court, success fee  | **`domain-recovery`**   | the recovery state machine + authorization |
| Invoice, fee collection, payout, Paddle, legal-entity binding  | **`domain-billing`**    | money movement                             |
| OCR/extraction from boarding pass / ID (consent-gated)         | **`domain-ai`**         | the AI posture/`AICallContext`             |
| Audit/timeline/replay, redacted payloads, transactional outbox | **`domain-events`**     | the event store                            |
| Eligibility output shape (`AssistanceOutcome`)                 | **`domain-assistance`** | the outcome contract                       |

This matches the source guidance ("Mos e fusni brenda `domain-claims` si status shtesë pa domain model"; "Use domain-case for case/document/timeline; use domain-recovery for assignment, POA, airline submission, escalation and success fee").

### 1.2 How it talks to `domain-case`

A `flight_claim` is **a specialization of a case**, not a parallel universe. When eligibility produces `eligible_candidate` and the user proceeds:

1. `passenger-rights` calls `domain-case` to **open a case** (`case.opened`) and obtain the canonical case id; `flight_claims.case_id` references it.
2. All documents (boarding pass, ticket, PNR, airline email, ID, bank details) go into the **shared Document Vault** via `domain-case`/`domain-documents` — `flight_documents` is a typed projection/classification over the vault, never a separate silo.
3. The **timeline** is the shared `domain_events` stream filtered by `case_id`; VONESA emits `flight.*` events into the same outbox, so "everything that happened to this flight claim" is one query (the audit's §10 goal), and the member/staff timeline is unified across all IDA services.

So the member sees flight claims in the _same_ dashboard, Document Vault, and timeline as their accident/Green Card cases — the explicit business requirement ("një vend ku sheh: aksidentet, dokumentet, Green Card, dëmet materiale, recovery dhe fluturimet e vonuara").

### 1.3 How it talks to `domain-recovery`

VONESA's "Recovery" phase **is** `domain-recovery`, specialized for airlines instead of insurers:

- `claim_assignments` (cession — default) and `poa_documents` (fallback) are the passenger-rights flavour of the recovery **authorization** layer; they map onto `domain-recovery`'s existing authorization concept (the `paymentAuthorizationState`/escalation-agreement pattern in `staff-claims`).
- `fee_agreements` map onto the recovery success-fee concept; `airline_submissions` are the recovery "submission/negotiation" step; ADR/legal-partner handoff reuses `domain-recovery/legal-escalation` + `legal-handoff` (services-alignment §5.9–5.10).
- The recovery state machine (M2) gains a passenger-rights _profile_ of its lifecycle — `eligible → assignment/poa_signed → submitted → airline_response → escalation → resolved/declined` — expressed through the **same** `canTransition()` and `recovery_lifecycle_state`, not a private enum.

**Key boundary rule:** `passenger-rights` decides _flight-specific eligibility and math_; `domain-recovery` decides _whether recovery is authorized and may proceed_. The airline submission gate (§2) lives in `domain-recovery`, because it is the same class of invariant as "no `negotiation` without an authorized agreement."

### 1.4 Flight Data Provider Adapter — `FlightDataProviderPort`

A hexagonal port keeps the domain free of any vendor:

```ts
interface FlightDataProviderPort {
  getFlightStatus(flightNumber: string, date: IsoDate): Promise<FlightStatus>;
  getScheduledArrival(flightNumber: string, date: IsoDate): Promise<IsoDateTime | null>;
  getActualArrival(flightNumber: string, date: IsoDate): Promise<IsoDateTime | null>;
  getRoute(flightNumber: string, date: IsoDate): Promise<Route | null>;
  getAirline(flightNumber: string, date: IsoDate): Promise<AirlineRef | null>;
  getDisruptionReason(flightNumber: string, date: IsoDate): Promise<DisruptionReason | null>;
}
```

- Adapters (`CiriumAdapter`, `FlightAwareAdapter`, `AviationStackAdapter`, …) implement the port; the EC261 engine and intake depend only on the **port**, so swapping or multi-sourcing providers is a config change.
- **Failure behaviour is a first-class outcome, not an exception that blocks the user.** On timeout, error, rate-limit, or missing data the provider returns a typed `unavailable` result and the eligibility outcome becomes **`manual_review_required`** (never a hard fail, never a false "not eligible"). This is enforced by a test: "API down ⇒ outcome = `manual_review_required`, case still creatable."
- Every provider call is recorded in `flight_eligibility_checks` with `api_provider`, `rule_version`, and a **redacted** `api_response_redacted` (no raw PII), feeding the outbox.
- Provider responses are **advisory inputs to a versioned rule**, never the eligibility decision themselves — the decision is the pure EC261 engine over `(provider data + user input + rule_version)`, so results are reproducible and auditable.

---

## 2. The critical legal invariant — `NO ASSIGNMENT / NO POA = NO AIRLINE SUBMISSION`

This is the VONESA equivalent of the audit's "no `negotiation` without an authorized agreement," and it is enforced **in the same place, the same way**: structurally in the recovery aggregate, not in the UI.

### 2.1 State-machine enforcement (primary)

`submitToAirline` is modeled as a recovery transition `ready_for_submission → submitted_to_airline`. It is routed through the single `canTransition(from, to, actor, context)` writer (tracker T-001/T-002) with a passenger-rights guard:

```
canTransition(*, 'submitted_to_airline', actor, ctx) ⇒ REJECT unless
   (claim_assignment.status === 'signed')  OR  (poa.status === 'signed')
   AND fee_agreement.status === 'accepted'
   AND privacy_consent.status === 'accepted'
```

Because `canTransition` is the **sole** status writer (the audit closed the admin/agent bypass doors), there is no path — member action, staff action, admin action, or background job — that can reach `submitted_to_airline` without a signed authorization. A signed assignment **or** POA is necessary; the fee agreement and privacy consent are also required (source §4.3, §6).

### 2.2 Server-action enforcement (defence in depth)

The serverless action `submitFlightClaimToAirline()`:

1. loads the claim under `access_tenant_id` scope (tenant isolation, M3);
2. re-checks `assignment|poa signed + fee accepted + consent` **at the action boundary** (not trusting the client) and returns a typed `ActionResult` error (`assignment_or_poa_required`) on failure — never a stringly error;
3. only then calls the recovery transition, which re-checks the same invariant (so the rule holds even if a new caller is added later).

### 2.3 Test (must exist before submission ships)

"For every code path that can call airline submission, assert it is rejected when neither assignment nor POA is `signed`." This is the passenger-rights member of the audit's transition-test suite (§11), and it gates the FLIGHT-06 task.

---

## 3. Payment flow + `compensation_ledger` automation

### 3.1 Ledger ↔ `domain-billing` ↔ Paddle, via events (not direct calls)

The `compensation_ledger` is the financial record of a flight claim; `domain-billing` owns money movement; they are bridged by **domain events**, mirroring the audit's billing↔claims rule ("bridged by event, not cross-package call," T-204):

```
recovery: compensation_received ─▶ domain_events(recovery.compensation_received)
   ▶ billing consumes ▶ computes success_fee / legal_fee / bank_costs
   ▶ writes compensation_ledger (gross, fees, net_to_passenger)
   ▶ emits recovery.fee_calculated ▶ payout to passenger ▶ recovery.net_payout_sent
```

- **Fee/tax/invoice bind to `legal_tenant_id` (entity-of-record), not host/tenant** (the Rev-2 billing rule, T-408). A diaspora passenger whose membership is contracted under the KS entity gets a KS-entity invoice even if the incident airport is in MK — exactly the cross-jurisdiction case in `multi-country-operating-models`.
- `recovery_law` for the claim derives from the **incident/flight jurisdiction** (Rome II), distinct from the membership's `governing_law` (Rome I). Success-fee _enforceability_ is per the contract (legal entity); the _claim_ is per EC261 / route jurisdiction.
- Ledger math (`gross → success_fee → legal_action_fee → bank_costs → net`) lives in `passenger-rights/ledger` as **pure functions** (unit-tested for the 250/400/600 tiers), but the **collection** is `domain-billing`'s job through Paddle.

### 3.2 Direct Payment Fallback (the airline pays the passenger directly)

This is the revenue-protection case and the source doc's hardest requirement (§14). Modeled as an explicit branch with `direct_payment_events`:

```
airline → pays passenger directly
  recovery state: paid_to_passenger_directly
  1. passenger declares the received amount (+ optional proof) → direct_payment_events
  2. ledger computes fee_due_amount from the declared amount + fee_agreement
  3. domain-billing issues a success-fee invoice (Paddle) bound to legal_tenant_id
  4. automatic reminder schedule starts (scheduled events)
  5. case CANNOT close (case_closed_*) while fee_invoice_status ∈ {pending, overdue}
     unless dispute_status set → escalation
```

- **Contractual rule encoded:** the success fee remains due if the payment relates to a claim **submitted or pursued by Interdomestik** (source §14.3) — the fee agreement captures this, and the ledger enforces "no clean close with an unpaid, undisputed fee."
- Reminders are **scheduled tasks** emitting events; dunning state lives on `direct_payment_events.fee_invoice_status` (`pending → overdue → collected | disputed | written_off`).
- This branch is precisely why a flight claim's _recovery_ lifecycle can be `resolved` while its _billing_ obligation is still open — the case/recovery/billing separation pays off here.

### 3.3 No-guarantee posture preserved in money language

The ledger and all member-facing payment copy must keep the brand line: no "compensation guaranteed," no "you will be paid." The brand-lint (M0) is extended with the VONESA banned phrases (`kompensim i garantuar`, `fiton patjetër`, `ne garantojmë pagesën`, `100% kompensim`) and the allowed set (`mund të kualifikohet`, `no win - no fee`, `nëse kompensimi realizohet`). "no win – no fee" describes the fee model, not a guarantee — that distinction is the lint's job to police.

---

## 4. Data, isolation, consent, events (cross-cutting)

- **Tenant context on every flight table.** `flight_claims` carries `tenant_context_id`, `legal_tenant_id`, `access_tenant_id` — consistent with the four-context model (Rev 3). **Isolation/RLS keys off `access_tenant_id`** (T-302b); billing/law off `legal_tenant_id`. Flight documents (boarding pass, ID, bank details) are isolated by `access_tenant_id` and **not visible to agent/promoter roles** (source §15, services-alignment §6.2) — enforced by the same `assertNoTenantLeak` harness + document-access roles.
- **Consent-gated AI.** OCR/extraction from boarding pass/ID runs through `domain-ai` **only with an `AICallContext`** declaring purpose/retention/consent (the Rev-1 AI-posture invariant, T-404). No consent ⇒ no extraction; the call won't compile/run without the context.
- **Redacted events.** `flight.*` events carry references and classifications, never inline medical/ID/bank PII — the same PII-allowlist + crypto-shredding contract as `domain_events` (T-104c/d). E.g. `flight.document_uploaded {type: 'boarding_pass'}`, never the document contents.
- **Airline registry is data, not code.** `airline_contacts` is staff-maintained and versioned (source §12) — no hardcoded airline routing.

---

## 5. Sequencing principle — VONESA must not block the Design Gate or Go-Live

This is the load-bearing constraint of the integration:

- **VONESA is a product vertical, not foundational plumbing.** The Design Gate (front-door/session-context stabilization) and the `ida.*` Go-Live (host cutover) are about _who enters, who they are, which entity, which scope_ — none of which VONESA defines. VONESA **consumes** that stabilized context; it does not produce it.
- Therefore VONESA's only M1 footprint is **additive tables + `flight.*` events** (nothing else depends on them), and its dashboard/intake work (M4) sits **after** the Design Gate by construction. The Design-Gate dependency arrow points _into_ VONESA, never out of it.
- **VONESA ships behind its own feature flag**, and its go-live is **decoupled from the host cutover** — you can launch Flight Delay on the current hosts during the pilot, or hold it until after the `ida.*` cutover, without either gating the other. The flag is the seam.
- The one real cross-dependency: VONESA's recovery profile needs the **`domain-case`/`domain-recovery` split (M2)** and the **four-context resolver (M3)** to exist before its recovery and document-isolation pieces are correct. That's a dependency on the spine's exit criteria, not a new critical-path item — WS-F runs as a parallel team behind those gates.

**Net:** WS-F lengthens no existing critical chain. Its own internal chain (schema → rule engine + adapter → assignment/POA invariant → submission → docs isolation → dashboard/OTP → ledger/payout) parallels M1→M5 and is owned by a dedicated team.

---

## 6. Open business inputs that gate WS-F (from VONESA §24)

These are decisions only the business/counsel can make; they gate specific FLIGHT tasks (see tracker open-decisions):

1. Final Assignment/Cession, POA-fallback, and Success-Fee agreement texts (SQ/MK/EN) + version.
2. Success-fee %, legal-action-fee %, minimum fee (if any), and whether IDA members get a reduced fee.
3. First flight-data provider + commercial terms.
4. Initial airline list + claims contacts (seed for `airline_contacts`).
5. Payout rules + net-payout deadlines to the passenger.
6. Privacy/consent text for documents + bank details; document retention policy.
7. Which cases escalate to partner lawyers, per jurisdiction.

Until 1–2 and 6 are signed off by counsel, WS-F has a **green light for Spec/Design Gate (FLIGHT-00) only** — the same rule the services-alignment doc applied to ASSIST-00. Runtime build of assignment/submission/ledger waits on the legal texts and the entity-of-record/billing separation, exactly as the program already gates M2/M4 on counsel sign-off (open decision #6).
