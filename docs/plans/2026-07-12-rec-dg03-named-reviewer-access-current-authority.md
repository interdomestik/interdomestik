---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-12
related:
  - docs/plans/current-program.md
  - docs/plans/current-tracker.md
  - docs/superpowers/specs/2026-07-12-rec-02-named-role-scoped-reviewer-access-design.md
  - docs/superpowers/specs/2026-07-12-rec-02-security-contract.md
  - docs/superpowers/specs/2026-07-12-rec-02-operations-verification.md
  - docs/plans/2026-07-12-rec-dg03-review-evidence.md
---

# REC-DG03 Current Authority: Named Role-Scoped Reviewer Access

> Status: current-authority/design gate. This record promotes exactly one
> implementation slice: `REC-02`.

## Decision

The post-MOB-03a resolver returned `blocked_requires_current_authority` with
`activeSlice: null`. `MOB-DG04b` required named role-scoped access before future evidence
intake. The user approved the administrator-managed, console-local design on 2026-07-12.

This Tier 0 gate promotes one Tier 3 implementation slice:

`REC-02` — named role-scoped accounts, signed sessions, server-enforced assignment
isolation, and server-attested receipts in the standalone Review & Evidence Console.

## Accepted Role Model

| Person           | Bound responsibility                       |
| ---------------- | ------------------------------------------ |
| Gazmend Abazi    | Independent Business / Governance Reviewer |
| Sanja Jovanovska | MK Legal / Privacy Authority               |
| Fiona Abazi      | Executive / Business Owner                 |
| Arben Lila       | Platform Technical Guardian / Consulted    |

These roles grant no Interdomestik runtime permission. An account sees only assigned
repo-safe packets; no assignment yields an empty inbox.

## Promoted Scope

REC-02 may change only `tools/review-evidence-console/`, focused console tests, repo-size
budget data, and required tracker/closeout documents. It may:

- replace shared Basic Auth with administrator-managed named console accounts;
- add PBKDF2 login, live-bound secure sessions, targeted invalidation, and logout;
- move role-restricted fixtures to server-only custody and serve only session-matched
  assignments and continuation targets;
- reconstruct final normal/correction receipt envelopes on the server and attest them
  with versioned Ed25519 keys;
- preserve account-scoped repo-safe drafts, editable defaults, receipt directory/
  download, correction, and Part A-to-Part B behavior;
- add a safe dry-run-first credential/Vercel administration CLI;
- add Albanian-first accessible login, identity, empty-inbox, session-expiry, and logout
  UX;
- create one deployment-protected preview and gather firewall/alert/rollback evidence.

The approved design, security, and proof contracts are:

- `docs/superpowers/specs/2026-07-12-rec-02-named-role-scoped-reviewer-access-design.md`;
- `docs/superpowers/specs/2026-07-12-rec-02-security-contract.md`;
- `docs/superpowers/specs/2026-07-12-rec-02-operations-verification.md`.

All three are binding. `docs/plans/2026-07-12-rec-dg03-review-evidence.md` records the
clean post-remediation independent review.

## Failure And Deployment Boundary

Fail closed on malformed configuration, secrets, invalid/disabled accounts, duplicate
identity, live claim mismatch, expired/tampered cookies, origin mismatch, cross-role
access, public/client fixture leakage, receipt-envelope override, signature/key mismatch,
or correction-lineage mismatch. No secret, password, hash, private key, cookie, identity,
or review content may enter logs, browser bundles, screenshots, CI, or Git.

This gate authorizes implementation and one protected preview only. It does not
authorize reassignment of `reviewer-ecohub.vercel.app`. Production cutover requires a
separate explicit approval after preview identity, isolation, receipt, five-POST/minute
Vercel Firewall, alert, configuration, and rollback proof pass.

## Stop Conditions And Exclusions

Stop if implementation needs Supabase, a user database, schema/RLS/migrations, external
identity, Interdomestik runtime identity/session/tenant permission, customer data,
uploads, server receipt storage, `apps/web`, proxy, canonical routes, auth layering,
tenancy, billing, email, invitations, password reset, MFA, SSO, account-admin UI, or
production alias reassignment.

Full `MOB-03`, `MOB-05b`, Agreement Ceremony, POA/e-sign, medical/injury processing,
and every other product/runtime slice remain unpromoted.

## Resolver Effect

After this gate lands:

```text
status: ready
activeSlice: REC-02
```

No other implementation slice is active.
