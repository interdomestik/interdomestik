# MODULE — `packages/domain-membership-billing`

Module contract, adopted from the review of 2026-11-13 (run A). Paths that begin with `A/` or `inputs/` cite the review record, which is kept outside this repository. Written by a helper on Opus 5.5 from the R1 reports and the code at `ef1bd0ef5`; reviewed by the main session on Fable 5.2, which re-read: the provisioning lines that give a company-covered member a `subscriptions` row, and the status of the Paddle code and of the payment port. The table of invariants rests on R1's billing report and was not re-read line by line. Rules of `AGENTS.md` that bind this area: R-07, R-11, R-16, R-18. Line numbers into `docs/engineering/DIRECTION.md` are those of 2026-11-17, 01:00Z; the work-package numbers are the stable reference. **Corrected in R3 (2026-11-17)** after the independent review of R2b (comment R2b-C03): every statement of this file was checked against the pinned commit and the active finding records by a helper on Opus 5.5 (`A/raw/R3/modules/modcheck.md`), and the main session re-read the lines behind each correction it took. "Owned" means the package whose exported commands should write a table; `packages/database` declares every table and owns none (R-16).

## Responsibility

Holds memberships and subscriptions, the Paddle integration (**parked**), company sponsors and rosters, commissions and success fees, and the sponsor mail outbox. It is where entitlement is decided today, from a subscription row's status.

## Public API

`package.json:7-62` declares 54 subpath exports (recounted in R3). The ones other code uses for entitlement and coverage: `.` (`src/index.ts`), `./subscription`, `./sponsor-coverage`, `./annual-membership`, `./membership-hierarchy`, `./billing-snapshot`, the 16 `./sponsors/*` entries and the 12 entries that begin with `./paddle-webhooks`. The provider surface is exported directly (`./paddle`, `./paddle-server`, `./paddle-webhooks`), which is the opposite of a port: **no provider-neutral interface exists**, and billing-entity resolution is a table in code (`src/paddle-server.ts:59-68`, cited by `docs/engineering/DIRECTION.md:72`).

## Owned tables

`subscriptions`, `membership_plans`, `billing` (invoices and ledger), `sponsors`, `sponsor_roster`, `sponsor_handover`, `sponsor_mail_outbox`, the commission tables (`packages/database/src/schema/subscriptions.ts`, `membership-plans.ts`, `billing.ts`, `sponsors.ts`, `sponsor-roster.ts`, `sponsor-handover.ts`). Written from outside the owner: R1 measured 237 Drizzle call sites in the membership-billing stratum — 206 hand-scoped, 31 with no tenant token, 0 using the scoped helper (`A/modules/tenancy.md:90`); the count of those sites that live outside this package is `NOT MEASURED` here. `docs/engineering/DIRECTION.md:53` records that 124 of 348 write sites overall sit in the web app and 24 of 81 written tables have more than one writer (MAIN-07).

## Invariants

- One subscription row per member, one per provider subscription — database uniques (`packages/database/src/schema/subscriptions.ts:78-79`; `A/modules/data-layer.md:126`).
- Subscription status is one of six values — database enum (`schema/enums.ts:16-23`, `schema/subscriptions.ts:31`).
- A subscription refers to an existing plan — **partly**: `plan_key` has a nullable FK, `plan_id` is NOT NULL free text with no FK (`schema/subscriptions.ts:32-33`).
- Provider event order fields are both set or both null — database CHECK (`schema/subscriptions.ts:87-90`).
- A member has exactly one live membership — **NOT ENFORCED**: a second checkout by a paying member is not prevented (BIL-05, S1). WP-07 completion line 2 requires a database constraint (`docs/engineering/DIRECTION.md:226`).
- A membership ends by date — **NOT ENFORCED**: access is decided from the status only, and nothing ends a membership by date unless a provider event arrives (BIL-06, S1; `packages/domain-membership-billing/src/subscription/lifecycle-reporting.ts:52-83`, cited by `docs/engineering/DIRECTION.md:73`).
- An active membership rests on a verified payment — **NOT ENFORCED** for the company path: an approval may carry no invoice reference, and provisioning writes a `subscriptions` row with `status: 'active'` for a company-covered member without one (`src/sponsors/provisioning-effects.ts:71-91`, confirmed at those lines; `src/sponsors/decisions.ts:32-35,85-94`; `docs/engineering/DIRECTION.md:75`). WP-07 completion line 3 makes a negative test of it.
- An inbound provider event is applied exactly once and in order — **partly**: per-transaction uniqueness admits only the first `transaction.*` event (BIL-03), an interrupted handler leaves an unreclaimed lease for 5 of 7 handled types (BIL-02), and untyped failures are stored as terminal and never re-applied (BIL-01).
- Money is held in whole minor units — **NOT ENFORCED**: invoice and ledger tables are write-only and hold minor-unit strings in `decimal(12,2)` (BIL-09).
- The sponsor mail outbox is written once per (entry, kind) — enforced by an idempotency key with `onConflictDoNothing` (`src/sponsors/provisioning-effects.ts:60-68`). This is the delivery-record pattern the reuse catalogue points at.

## Tenant boundary

Every write takes a `TenantTransaction` opened by `withTenantAuthority` and carries `tenantId` explicitly (`src/sponsors/provisioning-effects.ts:62,74`). Paddle webhooks resolve the tenant before any work and R1 ruled that resolution out as a bypass; **the handlers themselves are UNVERIFIED** (`A/modules/tenancy.md:168`). The seat cap has two parts. The seats of one term revision are bounded by a database check, 1 to 500 (`packages/database/src/schema/sponsors.ts:166`). The count over all uploads of a contract year against the approved number is application code only (`src/sponsors/roster-upload.ts:110-128,137-163`); nothing in the database counts over a year.

## Live and not live

**Not on the pilot path: the whole Paddle integration (123 files) — park it, repair nothing** (`docs/engineering/DIRECTION.md:72`). The pilot's payments go through a **provider-neutral payment port that does not exist yet**; WP-07 builds it, with the sale, the payment, the receipt, the ledger, the reconciliation and the membership period (`docs/engineering/DIRECTION.md:217-226`, `526-537`). Also not live: refunds are not handled and renewal commissions have 0 callers (BIL-08); the Paddle charging chain of the success fee has no caller outside the package (`paddle-success-fee-charge.ts`, `paddle-success-fee-request.ts`, `recovery-success-fee-billing.ts`, `recovery-success-fee-snapshot.ts`; the unit's search), while its policy module **is** live: `packages/domain-claims/src/staff-claims/save-success-fee-collection.ts:22` imports `success-fees/policy` on the rendered staff panel; the dunning reminder route is scheduled by nothing in the repository (MAIN-11; BIL-12 is another name of the same record); the legacy shared-secret webhook route is live but unordered and cannot post invoices (BIL-11). Live and kept: the company roster skeleton — term, revision, seat cap, termination command, audit rows, a per-tenant switch closed by default, no stored file (`docs/engineering/DIRECTION.md:75`).

## Tests to run

`pnpm --filter @interdomestik/domain-membership-billing test:unit` (the package has no `test` script: `packages/domain-membership-billing/package.json:63-67`; corrected in the closing pass, review comment R3-C05; vitest; 144 test files under `src/`, 13 of them at its top level; recounted in R3). It runs in CI inside the coverage step: `.github/workflows/ci.yml:138` (`pnpm coverage:gate`, whose `test:coverage` runs the web suite, `shared-auth` and every `domain-*` package, `package.json:86-87`; the step is skipped when coverage is reused, `ci.yml:137`). R1 MEASURED 55 test titles in the route folder, 152 in the billing webhook and receipt tests, and 5 e2e specs (`A/modules/billing-payment-to-entitlement.md:112`). Seven failure paths have **no** protecting test and handler fixtures use a payload shape the route does not produce (BIL-14, `A/modules/billing-payment-to-entitlement.md:150`); untested paths named at `:117-124` include the redelivery after a terminal error, an open lease on a non-`created` event, and refunds.

## Do not reach into

`./paddle`, `./paddle-server` and `./paddle-webhooks/*` from anywhere outside the adapter path — WP-07 completion line 5 makes today's importing files the baseline of check CHK-18 (`docs/engineering/DIRECTION.md:226`). `src/sponsors/provisioning-effects.ts` from outside the sponsor decision path: it writes the entitlement row.

## Decided for this module (owner, 2026-11-17; decisions, not verified properties of today's code)

- A company sees no claim, document, message or usage of its employees (answer 27 a).
- When a company ends its agreement, or an employee leaves its list, the employee's paid membership runs to its paid-through date; today's code ends it on the effective date, and WP-09 changes that with an acceptance test (answer 22).
- A membership ends by date from the first day of the pilot: BIL-06 is a pilot blocker (answer 24). The twelve Paddle findings are in the pilot only if Paddle is chosen.

## Open findings

BIL-01 to BIL-14 without BIL-12, which is recorded as MAIN-11 (`A/modules/billing-payment-to-entitlement.md:139-152`), MAIN-07, MAIN-20. Work packages: WP-07 (the port and the ledger), WP-08 (the exchange rate), WP-09 (the company agreement and the yearly cap).
