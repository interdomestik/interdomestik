# Security Tasks Tracker

**Owner:** TBD
**Last Updated:** 2026-01-03

## 1) Verification Checklist (Run & Record)

- [ ] Run `node scripts/abuse_test_rls.js` in staging
  - Result:
  - Evidence (log or screenshot path):
- [ ] Run `node scripts/abuse_test_rls.js` in production
  - Result:
  - Evidence (log or screenshot path):
- [ ] Verify RLS enabled for critical tables (prod + staging)
  - SQL:
    ```sql
    select relname, relrowsecurity
    from pg_class
    where relname in ('user', 'session', 'account', 'verification', 'subscriptions');
    ```
  - Result:
- [ ] Verify deny-all / access policies for critical tables
  - SQL:
    ```sql
    select schemaname, tablename, policyname, roles, qual
    from pg_policies
    where tablename in ('user', 'session', 'account', 'verification', 'subscriptions');
    ```
  - Result:
- [ ] Verify storage policies are private and service-role only
  - SQL:
    ```sql
    select policyname, roles, qual
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects';
    ```
  - Result:
- [x] Verify security headers & CSP are applied (local)
  - Command: `curl -I http://localhost:3000`
  - Evidence: `security/evidence/2026-01-03/security_headers_curl.txt`

## 2) Hardening Backlog

- [x] Expand `withTenant` coverage to all multi-tenant data access paths (Verified in Phase 5: DAL Rollout)
- [ ] Add CI check to fail on unscoped tenant queries (lint or test)
- [x] Confirm `subscriptions` RLS in each environment and document migration used (See `scripts/apply_hardening.js`)
- [x] Remove legacy Supabase Auth tables (None found in active schema)
- [ ] Review Data API exposure in Supabase dashboard
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` and update envs
- [ ] Document CSP allowlist ownership and review cadence

## 3) Operations

- [ ] Add a security changelog entry for this remediation
- [ ] Schedule quarterly security review (RLS + storage + webhook)
