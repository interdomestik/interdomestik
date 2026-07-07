---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/reviews/2026-07-05-nine-step-enterprise-sequence.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
  - docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md
  - docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md
  - docs/reviews/2026-07-07-human-dispatch-email-record.md
  - docs/reviews/2026-07-07-human-reply-processing-playbook.md
  - docs/reviews/2026-07-07-human-follow-up-and-escalation-packet.md
  - docs/reviews/2026-07-07-human-follow-up-draft-record.md
  - docs/reviews/2026-07-07-same-day-human-evidence-checkpoint.md
  - docs/reviews/2026-07-07-preparation-only-workstream.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md
  - docs/reviews/2026-07-07-reviewer-portal-mock-test.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
  - docs/reviews/2026-07-07-waiting-for-gazmend-execution-plan.md
  - docs/reviews/2026-07-07-gazmend-return-control-room.md
  - docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md
  - docs/reviews/2026-07-07-parallel-agent-dispatch-reviewer-portal.md
  - docs/reviews/2026-07-07-five-agent-reviewer-portal-findings.md
  - docs/reviews/2026-07-05-week1-human-action-packet.md
  - docs/product/2026-07-06-mk-reviewer-appointment-intake.md
  - docs/product/2026-07-06-mk-reviewer-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/plans/2026-07-06-b6-b7-ops-return-packet-albanian.md
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-mob-dg01b-mk-help-now-non-dark-gate-draft.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
---

# Nine-Step Evidence Intake Register - Part 1

Back to index: [2026-07-06-nine-step-evidence-intake-register.md](./2026-07-06-nine-step-evidence-intake-register.md)

# Nine-Step Evidence Intake Register

> Status: central intake index only. This register records where evidence is
> expected, returned, accepted, corrected, or blocked. It does not sign any
> document, approve launch, promote `MOB-01b`, change runtime state, or replace
> current-program/current-tracker authority.

## Classification

Classified as `documentation/external-tracker-only` because this file links
existing human review, signature, ops, and gate-prep evidence for the active
nine-step enterprise-readiness goal. It does not change product behavior, code,
routes, auth, tenancy, schema, RLS, billing, provider configuration, or public
Help Now exposure.

## Authority Rule

Use this register as the control desk for incoming evidence. Repo authority
still remains, in order:

1. `AGENTS.md`
2. `docs/plans/current-program.md`
3. `docs/plans/current-tracker.md`
4. merged gate/current-authority records
5. resolver state

If this register conflicts with any authority source above, the authority source
wins and this register must be corrected.

The active dispatch queue for 2026-07-07 is
`docs/reviews/2026-07-07-human-dispatch-and-acceptance-packet.md`.
The copy-ready outbound messages are in
`docs/reviews/2026-07-07-human-dispatch-message-pack-albanian.md`.
The outbound email dispatch record is
`docs/reviews/2026-07-07-human-dispatch-email-record.md`.
Replies must be processed through
`docs/reviews/2026-07-07-human-reply-processing-playbook.md` before this
register is updated.
Follow-up timing and non-response classification are defined in
`docs/reviews/2026-07-07-human-follow-up-and-escalation-packet.md`.
The unsent reminder draft is recorded in
`docs/reviews/2026-07-07-human-follow-up-draft-record.md`.
The same-day waiting-state checkpoint is
`docs/reviews/2026-07-07-same-day-human-evidence-checkpoint.md`.
While human evidence is pending, preparation-only work is tracked in
`docs/reviews/2026-07-07-preparation-only-workstream.md`.
Returned portal/email evidence must be classified through
`docs/reviews/2026-07-07-evidence-intake-processor.md` before this register is
updated. Reviewer portal readiness is tracked in
`docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md`; local mock proof
is recorded in `docs/reviews/2026-07-07-reviewer-portal-mock-test.md`; live
deployment is recorded in
`docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md`. The
parallel five-agent review and integrated hardening decision are recorded in
`docs/reviews/2026-07-07-five-agent-reviewer-portal-findings.md`.

While Gazmend is preparing the MK review, allowed waiting-lane work is defined
in `docs/reviews/2026-07-07-waiting-for-gazmend-execution-plan.md`.
The first post-submission response is defined in
`docs/reviews/2026-07-07-gazmend-return-control-room.md`.
If `ENT-A04`, `ENT-A05`, and `ENT-A06` are all accepted, the later
current-authority request can be completed from
`docs/reviews/2026-07-07-mob-dg01b-current-authority-request-skeleton.md`.

## Storage Rule

| Evidence type                                    | Store in repo?                          | Store outside repo?            | Rule                                                 |
| ------------------------------------------------ | --------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Public-safe signed PDFs                          | Yes, if no PII/secrets/private channels | Optional archive               | Link path and hash when available                    |
| Reviewer names, roles, dates, decisions          | Yes                                     | Optional archive               | Record exactly; do not invent missing qualifications |
| Source citations and retrieval dates             | Yes                                     | Optional archive               | Required for MK factual/legal rows                   |
| Staging SHA, CI/CD job URL, public route path    | Yes                                     | Optional archive               | Required for B6/B7 proof                             |
| Provider/project slug and safe rule id/name      | Yes                                     | Optional archive               | Allowed only when non-secret                         |
| DSN, API token, cookies, private channel URLs    | No                                      | Secure credential system only  | Never paste into repo                                |
| Emails, phone numbers, raw URLs with identifiers | No                                      | Evidence center only if needed | Replace repo value with safe reference               |
| Member, tenant, claim, document, payment IDs     | No                                      | Evidence center only if needed | Repo may record count/type only                      |
| Uploaded files or free-text incident details     | No                                      | Evidence center only if needed | Repo may record custody reference                    |

When evidence cannot be safely stored in repo, record only a safe reference such
as `evidence-center:{date}:{owner}:{artifact-type}` and keep the sensitive
content outside the repository.

## Correction Rule

Never overwrite an accepted evidence row when a later correction arrives.

For every correction:

1. Create a new dated record or append a new dated row.
2. State which prior row/artifact it replaces.
3. State why it changed.
4. Re-record the reviewer/operator/signer, date, and evidence reference.
5. Re-open any gate or launch blocker whose acceptance depended on the old row.

For MK country content, any content-pack change after signature invalidates the
affected signed rows until they are re-signed and re-hashed.
