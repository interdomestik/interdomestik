---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-06-05
superseded_by:
---

# Enterprise Readiness Register

> Status: Input document. This register summarizes enterprise-readiness evidence and gaps only.
> The active execution authority remains `docs/plans/current-program.md`,
> `docs/plans/current-tracker.md`, and the active architecture-finalization program/tracker.

## Posture

Interdomestik now has enterprise-grade repository governance for bounded Phase C delivery:
canonical program/tracker authority, protected routing constraints, required CI/security gates,
PR finalization, repo-size budgets, Copilot/Sonar disposition, and post-merge Notion sync.

That is not the same as full enterprise production readiness. The product/platform still needs
evidence for operational recovery, exercised incident handling, formal threat modeling,
supply-chain attestation, and performance/load gates before it should be described as fully
enterprise-ready.

## Evidence Already Present

| Lane                         | Current evidence                                                                                                                                         | Status                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Repo governance              | `docs/plans/current-program.md`, `docs/plans/current-tracker.md`, architecture-finalization program/tracker, PR finalizer, required checks               | Strong                    |
| Plugin/tool discipline       | `docs/plans/plugin-usage-playbook.md`                                                                                                                    | Strong                    |
| Incident procedure           | `docs/plans/2026-03-09-d06-incident-playbook-evidence.md`, `docs/INCIDENT_PLAYBOOK.md`, `docs/RUNBOOK.md`                                                | Documented                |
| Sentry alert foundation      | `docs/plans/2026-03-09-d07-sentry-burn-rate-alerts-evidence.md`, `pnpm sentry:alerts:check`, `pnpm sentry:seer:sweep:pre`, `pnpm sentry:seer:sweep:post` | Partial operational proof |
| Sensitive route ownership    | `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`                                                                                               | Documented                |
| Production go-live checklist | `docs/plans/2026-04-27-p22-go01-production-go-live-readiness.md`                                                                                         | Governed checklist        |
| Pilot operations evidence    | `docs/pilot/**` launch, daily, rollback, incident, KPI, and closeout records                                                                             | Bounded pilot evidence    |
| Security gates               | CodeQL, SonarCloud, gitleaks, pnpm-audit, `pnpm security:guard`, DB/RLS/access audits in PR gates                                                        | Strong for repo delivery  |
| Restore drill contract       | `docs/plans/ent-ops01-backup-restore-drill-evidence-contract.md`; `docs/plans/ent-ops02-first-staging-restore-drill-record-2026-06-05.md`                | Blocker recorded          |
| Supply-chain attestation     | `docs/plans/ent-sca01-supply-chain-attestation-evidence-contract.md`                                                                                     | Contract defined          |

## Open Enterprise Maturity Lanes

These lanes come from `docs/reviews/2026-04-25-production-professionalism-rereview.md` and remain
separate from the active architecture-finalization queue unless explicitly promoted.

| Lane                         | Current gap                                    | Enterprise requirement                                                                                        |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Backup/restore drill cadence | First attempt blocked by restore-access gap    | Recurring staging restore drill with measured RTO/RPO and owner sign-off                                      |
| Exercised incident readiness | Partial                                        | Quarterly drills for auth-secret rotation, Supabase failover, restore, and tenant-cookie recovery             |
| Threat model                 | Not yet scoped                                 | Written per-surface model for registration, uploads, documents, share packs, billing, AI review, and webhooks |
| Supply-chain attestation     | Contract defined; implementation proof pending | Release provenance, SBOM, artifact signing, and deployed-artifact verification                                |
| Alert routing proof          | Partial                                        | SLO alerts applied, routed, and exercised for auth, RLS, webhook, and protected-route failure modes           |
| Data lifecycle verification  | Partial                                        | Periodic proof that deleted users leave no tenant-scoped rows or storage objects                              |
| Performance regression gate  | Not yet scoped                                 | Representative route/storage performance budgets that can block releases                                      |

## Next Bounded Operational Slice

The next concrete enterprise-hardening step remains one real operational drill after the first
attempt recorded the current restore-access blocker:

`ENT-OPS02 First Staging Restore Drill Record`

Scope:

- Execute the `ENT-OPS01` contract against an isolated staging or non-production restore target.
- Record measured RTO/RPO, backup/recovery-point identity, validation commands, owner, date, and
  pass/fail decision.
- Record missing provider access or connector credentials as blockers instead of simulating
  success.
- Resolve the 2026-06-05 blocker by granting a named operator backup/recovery-point listing and
  isolated restore-target access before rerunning the drill.
- Do not run a production restore in a repo thread.
- Do not change runtime code, schema, auth, tenancy, routing, billing, product UI, proxy,
  README, AGENTS, or broad architecture docs.

Rationale:

- Backup/restore proof is the most foundational remaining enterprise lane because every
  higher-level incident or live-traffic recovery decision depends on recoverable tenant data.
- The evidence contract is now defined; the missing proof is an executed staging drill record.
- A drill record can be pursued without disturbing active `ARCH-M1` work.

## Next Repo-Owned Enterprise-Hardening Slice

While `ENT-OPS02` remains blocked on provider or CLI restore access, the next smallest repo-owned
enterprise-hardening slice is:

`ENT-SCA02 Supply Chain Attestation CI Proof`

Scope:

- Build on `ENT-SCA01` by generating a real SBOM for the release image or a staging-equivalent
  artifact.
- Capture the immutable image digest and bind it to the GitHub workflow run, ref, and commit SHA.
- Add signed provenance or artifact attestation from the trusted CI identity when registry and
  runner permissions allow it.
- Verify the SBOM, provenance, signature or attestation, and deployed digest before promotion, or
  record the exact provider or permission blocker.
- Do not change runtime code, schema, auth, tenancy, routing, billing, product UI, proxy,
  README, AGENTS, or broad architecture docs.

Rationale:

- The current CD lane already proves deployed commit SHA, but not artifact digest custody or signed
  supply-chain provenance.
- This lane is repo-owned and can make enterprise readiness more true while restore-drill access is
  blocked.
- The first slice is contract-only; the next slice should provide real CI/CD evidence or a recorded
  external capability blocker.

## Non-Goals

- This register does not promote `ENT-OPS02` into the canonical tracker.
- This register does not claim the platform is fully enterprise-ready.
- This register does not replace `P22-GO01` live go/no-go evidence.
- This register does not authorize production operations, credential changes, or data restores.
