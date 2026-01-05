# Security Folder

This folder tracks security audit status, evidence, and follow-up tasks.

## Files

- `security/SECURITY_AUDIT_REPORT.md` - current audit status, evidence links, and remediation guidance.
- `security/SECURITY_TASKS.md` - execution checklist and ongoing backlog.
- `security/HARDENING_CHECKLIST.md` - module-by-module hardening template.
- `security/hardening/` - per-module hardening progress and notes.
- `security/hardening/INDEX.md` - master index of hardened modules and status.

## How to Use

1. Run the verification steps in `security/SECURITY_TASKS.md`.
2. Record outputs and evidence paths in the checklist.
3. Update `security/SECURITY_AUDIT_REPORT.md` once verification is complete.
4. Add new follow-up items to the backlog as needed.

## Evidence Logging

Store artifacts under a dated subfolder when possible, e.g.:

- `security/evidence/2026-01-03/abuse_test_staging.log`
- `security/evidence/2026-01-03/rls_policies_prod.txt`

## Ownership

Assign an owner and update date in `security/SECURITY_TASKS.md` after each review.

## New Feature Hardening Policy

All new features must follow the Hardened Module Standard in
`security/HARDENING_CHECKLIST.md`, add/update a module doc under
`security/hardening/`, and record verification evidence.
