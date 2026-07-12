---
status: approved
owner: platform
reviewed: 2026-07-12
related:
  - docs/superpowers/specs/2026-07-12-rec-02-security-contract.md
  - docs/superpowers/specs/2026-07-12-rec-02-operations-verification.md
  - docs/plans/2026-07-12-rec-dg03-named-reviewer-access-current-authority.md
  - tools/review-evidence-console/
---

# REC-02 Named Role-Scoped Reviewer Access Design

## Decision

Replace the shared reviewer credential with named, administrator-managed accounts in
the standalone Review & Evidence Console. Keep identity, sessions, assignment access,
and receipt attestation inside `tools/review-evidence-console/`. Do not connect the
console to Interdomestik runtime identity, Supabase, product routes, or a database.

The initial role map is:

| Person           | Console responsibility                     |
| ---------------- | ------------------------------------------ |
| Gazmend Abazi    | Independent Business / Governance Reviewer |
| Sanja Jovanovska | MK Legal / Privacy Authority               |
| Fiona Abazi      | Executive / Business Owner                 |
| Arben Lila       | Platform Technical Guardian / Consulted    |

An authenticated person sees only assignments mapped to that person's reviewer fixture
and allowed role. A valid account with no active assignment sees a clear empty inbox.

## Selected Approach

Use a console-local login and signed session. Vercel environment variables hold the
named account registry, salted password hashes, session secret, and receipt private key.
The deployed client receives only the authenticated display name, role, reviewer fixture
ID, and session expiry.

This approach preserves the console's standalone boundary and adds no user store. It is
narrower than Supabase Auth and more attributable than a multi-user Basic Auth prompt.
Administrators rotate credentials through a dry-run-first console CLI. REC-02 adds no
self-service registration, invitation, password reset, email, or MFA flow.

## Component Boundaries

The server owns five boundaries:

1. login, live account binding, signed sessions, and logout;
2. role-scoped assignment and packet delivery from server-only fixtures;
3. server reconstruction and Ed25519 attestation of final receipts;
4. account administration, Vercel configuration, rate-limit, and key rotation tooling;
5. identity-safe operational events and preview evidence.

The browser owns the Albanian-first login, authorized inbox, review workspace, and
repo-safe local drafts. It never chooses reviewer identity, role, packet authority,
receipt envelope fields, signature metadata, or correction lineage.

The exact security rules are in
`docs/superpowers/specs/2026-07-12-rec-02-security-contract.md`. Configuration,
deployment, test, and proof requirements are in
`docs/superpowers/specs/2026-07-12-rec-02-operations-verification.md`. Both documents are
binding parts of this design.

## User Experience

Unauthenticated visitors see an Albanian-first login screen with username and password,
a concise privacy notice, an accessible error summary, and no browser Basic Auth dialog.
After login, the header shows the person's name and responsibility plus a visible logout
action. The inbox contains only authorized packets and preserves current default answers,
draft recovery, Part A-to-Part B continuation, receipt saving, mobile layout, and
screen-reader behavior.

An expired session preserves the account-scoped local draft, returns the person to
login, and resumes the same authorized assignment after reauthentication. It never
submits automatically. Logout or account switching clears all in-memory draft state.

## Deployment Boundary

Implementation may create one deployment-protected preview. Production alias
reassignment remains a separate operation after implementation merge, Vercel Firewall
rate-limit proof, identity/assignment isolation proof, receipt signature proof, alert
proof, and rollback capture.

## Exclusions

REC-02 excludes Interdomestik runtime auth, Supabase, database/schema/RLS changes,
customer data, uploads, server-side receipt storage, email, invitations, self-service
password management, MFA, SSO, external identity providers, production product routes,
`apps/web`, proxy, canonical routes, tenant architecture, billing, and every MOB runtime
slice.
