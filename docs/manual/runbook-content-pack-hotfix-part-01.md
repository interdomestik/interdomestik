---
plan_role: input
status: draft
source_of_truth: false
owner: platform
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-05-mk-help-now-signature-package/05-operational-release-hold.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/ent-alert15-help-now-public-surface-alert-coverage-2026-07-05.md
---

# Help Now Content-Pack Hotfix Runbook - Part 1

Back to index: [runbook-content-pack-hotfix.md](./runbook-content-pack-hotfix.md)

# Help Now Content-Pack Hotfix Runbook

> Status: B6 runbook draft. This document defines the operator path for
> emergency content-pack corrections. It does not authorize runtime exposure,
> country-pack flag changes, provider mutations, or production hotfix execution.

## Scope

This runbook covers public Help Now country content packs, including the MK pack
prepared in PR `#1301`. It applies to:

- emergency numbers and routing instructions;
- police-vs-EAS decision content;
- Green Card, border-insurance, or foreign-plate guidance;
- roadside do/don't copy;
- content-pack manifest/hash mismatch; and
- service-worker or browser-cache behavior that keeps stale public content.

Out of scope: member data, authenticated surfaces, claim writers, billing,
schema/RLS, routing/proxy, auth/session, and any non-dark launch decision.

## Severity

| Severity | Trigger                                                        | First action                    | Target       |
| -------- | -------------------------------------------------------------- | ------------------------------- | ------------ |
| Sev1     | Wrong emergency number or dangerous roadside instruction       | re-darken pack, then fix        | immediate    |
| Sev1     | Signed pack hash differs from deployed pack hash               | re-darken pack                  | immediate    |
| Sev2     | Green Card / insurance status changes or source is disputed    | re-darken affected guidance     | same day     |
| Sev2     | Service worker serves stale signed content after manifest bump | re-darken if user impact exists | same day     |
| Sev3     | Typo or wording issue that cannot mislead a roadside user      | schedule correction             | next release |

Sev1 corrections deploy before routine review, but the corrected row must be
re-signed or explicitly re-held within 48 hours.

## Owners

| Role                | Named owner | Required before B6 done |
| ------------------- | ----------- | ----------------------- |
| Incident commander  | Arben Lila  | yes                     |
| Content fact owner  | TBD         | yes                     |
| Deployment operator | TBD         | yes                     |
| L2 reviewer/counsel | TBD         | yes                     |
| Support comms owner | TBD         | before exposure         |

## Procedure

1. Open an incident or hotfix record with country, pack version/hash, trigger,
   severity, source of report, and decision owner.
2. If Sev1, re-darken the affected country pack before editing public content.
   Confirm the public route shows the dark/placeholder state.
3. Patch the pack source using the same country-pack mechanism shipped by
   `MOB-01`; do not change auth, proxy, billing, schema, or member surfaces.
4. Update `apps/web/public/help-now-packs/content-packs.v1.json` only through a
   reviewed docs/config PR or the later authorized MOB-01b flow.
5. Recompute and record the pack hash. The hash must match the signed or
   hotfix-authorized pack before any non-dark exposure.
6. Verify the staging Help Now route for the affected locale/country.
7. Verify service-worker behavior:
   - manifest version is changed;
   - stale content revalidates;
   - dark and non-dark states can both be observed on staging;
   - no member-scoped or session-derived data is cached.
8. Record propagation time from deploy complete to verified updated content.
9. If the pack was re-darkened, leave it dark until L2/counsel signs the hotfix
   annex or the release owner records a hold.
10. Link the record from `05-operational-release-hold.md` for the affected
    country package.

## Verification Checklist

| Check                                  | Required evidence |
| -------------------------------------- | ----------------- |
| Deployed staging SHA                   | URL/SHA           |
| Pack manifest version before/after     | version/hash      |
| Public Help Now route checked          | URL + result      |
| Service-worker revalidation checked    | output/link       |
| Dark/re-darken path checked            | screenshot/link   |
| No member/session data in SW cache     | test output/link  |
| Propagation time measured              | minutes/seconds   |
| L2/counsel hotfix disposition recorded | signature/hold    |
| Support/comms follow-up needed         | yes/no + owner    |

## Staging Exercise Record

Copy this section into a dated append-only record after the first exercise.

```md
# Content-Pack Hotfix Exercise Record - YYYY-MM-DD

- Country:
- Pack version/hash before:
- Pack version/hash after:
- Environment:
- Staging deployment SHA:
- Executed by:
- Decision owner:
- Reviewer/counsel:

## Scenario

- Trigger simulated:
- Severity:
- Production traffic affected: no
- Customer data accessed: no
```
