# REC-02 Named Reviewer Access Implementation Plan

**Goal:** Replace shared Basic Auth with four named, role-scoped local console accounts,
server-only assignments, secure sessions, and server-attested Ed25519 receipts.

**Authority:** `REC-DG03` at merge `6caed6771151e5528ad73a7c7550e6b363015388`.
The approved design, security contract, and operations proof remain canonical:

- `docs/superpowers/specs/2026-07-12-rec-02-named-role-scoped-reviewer-access-design.md`
- `docs/superpowers/specs/2026-07-12-rec-02-security-contract.md`
- `docs/superpowers/specs/2026-07-12-rec-02-operations-verification.md`

Implementation is limited to `tools/review-evidence-console/`, the repo-size budget, and
canonical closeout evidence. It excludes `apps/web`, production routes, Supabase, databases,
schemas, uploads, customer data, and production-alias cutover.

## Completed implementation

- [x] Move reviewer fixtures outside `public/` and expose only authenticated assignments.
- [x] Validate normalized named-account registries and PBKDF2-SHA256 credentials.
- [x] Add live-registry-bound HMAC sessions with secure private/no-store cookies.
- [x] Implement Fetch-compatible login, session, logout, assignment, and receipt APIs.
- [x] Replace browser fixture imports with a same-origin authenticated API repository.
- [x] Add Albanian-first login, account role, session-expiry, and logout UX.
- [x] Isolate retained local drafts by account, fixture, assignment, and packet version.
- [x] Canonicalize and sign receipts with Ed25519 and a versioned trusted keyring.
- [x] Verify corrections against the complete prior receipt and derive immutable lineage.
- [x] Add dry-run-first pinned Vercel account administration that fails closed unless a true
      provider atomic-CAS adapter is available.
- [x] Add bounded identity-free security events, client leakage scans, desktop/mobile proof,
      and a protected-preview operations runbook.

## Required delivery proof

- [ ] Run package verification, modularity, repo-size, slice, security, PR, and E2E gates.
- [ ] Run bounded independent senior and diff-scoped security reviews; remediate findings.
- [ ] Compare matching desktop and mobile states with the existing portal.
- [ ] Open one REC-02 PR and require current-head CI, security, and review proof.
- [ ] Merge only when all required checks and review dispositions are green.
- [ ] Refresh AI OS, verify merged main, and publish canonical REC-02 closeout evidence.

## Operational invariants

- Browser submissions contain judgments only; the server owns attribution and signatures.
- Receipts are returned for local download and are never stored by the server.
- Passwords and private keys use protected stdin/environment input and never enter logs or Git.
- Administrator apply mode pins the immutable Vercel team/project/preview environment, rejects
  stale fingerprints, verifies the post-write fingerprint, and stops on partial failure.
- Preview stays behind deployment protection with a five-login-POSTs-per-minute Firewall rule.
- Production alias reassignment requires a separate current-authority decision after preview.

## Advisory context note

AI OS refresh/check passed with zero blocking contradictions. Its canonical-root adapter saw no
active slice because the user's primary worktree was stale and dirty; the clean execution
worktree resolver reported `REC-02` ready from the merged tracker. Repository authority governs.
