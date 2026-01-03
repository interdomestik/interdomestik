# Pre-Production Security Audit Report

**Date:** 2026-01-03
**Auditor:** Staff Engineer (Agent)
**Status:** 🔴 **NO-GO** (Critical Security Gaps Found)

## A) Executive Summary

Failures in basic security controls (RLS, Middleware) prevent a safe launch. The repository state contradicts previous audit claims (missing migrations, missing files).

**Recommendation:** **BLOCK RELEASE** until P0s are resolved.

## B) Automated Checks

- **Lint:** ⚠️ 17 Warnings (mostly `any` types in tests/actions). No errors.
- **Typecheck:** ✅ Passed.
- **Tests:** ✅ 50/50 Passed.
- **Build:** ✅ Passed (Note: Cached build may mask missing file issues).

## C) Critical Findings (Prioritized)

### 1. [P0] RLS Disabled on Auth Tables ("Ghost Data Breach" Risk)

- **Problem:** THe `user`, `session`, `account` tables created in `00003_better_auth_schema.sql` do **NOT** have Row Level Security enabled.
- **Evidence:**
  - `packages/database/src/schema/auth.ts`: No RLS definition.
  - `supabase/migrations/00003_better_auth_schema.sql`: `CREATE TABLE` statements lack `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
  - **Missing File:** The previous report referenced `0016_harden_better_auth.sql` as the fix. This file **does not exist** in `supabase/migrations` (only `00001` to `00007` exist).
- **Risk:** Complete database compromise. A hijacked or anon session could potentially read all users/sessions if a connection is made.
- **Fix:**
  1. Create migration `0008_enable_auth_rls.sql`.
  2. Run:
     ```sql
     ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
     ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
     -- Add policies (e.g. Users read own, Admins read all)
     ```

### 2. [INFO] Proxy Configuration (Next.js 16)

- **Status:** ✅ **VERIFIED**
- **Finding:** Project correctly uses `apps/web/src/proxy.ts`, aligned with Next.js 16 conventions.
- **Note:** Previous "Missing Middleware" finding was a false positive based on deprecated `middleware.ts` conventions.
- **Evidence:** Build output confirms `ƒ Proxy` is active. Edge headers and i18n are enforced.

### 3. [P1] Permissive Permissions-Policy

- **Problem:** Camera and Microphone access is allowed for all origins (`*`).
- **Evidence:** `apps/web/src/proxy.ts`: `response.headers.set('Permissions-Policy', 'camera=*, microphone=*, geolocation=()')`.
- **Risk:** unauthorized access to device sensors if XSS occurs.
- **Fix:** Update `apps/web/src/proxy.ts`:
  ```ts
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  ```

### 4. [P2] Discrepancy in Audit History

- **Problem:** The repository state does not match the documentation in `SECURITY_AUDIT_REPORT.md` (which claimed `0016` applied and headers fixed).
- **Risk:** False sense of security.
- **Fix:** Reset audit baseline (this report).

## D) Other Findings

- **Webhooks:** ✅ Signature verification in `apps/web/src/app/api/webhooks/paddle/_core.ts` looks robust (fails closed).
- **IDOR:** ✅ Document download route `apps/web/src/app/api/documents/[id]/download/_core.ts` enforces session checks.
- **RBAC:** ✅ Admin actions delegate to core logic with proper checks (verified `admin-users`).

## E) "Punch List" for Launch

1.  [x] **IMMEDIATE:** Create/Restore migration for Auth RLS (Created `00008`).
2.  [x] **IMMEDIATE:** Verify Proxy Configuration (Confirmed `proxy.ts` is active).
3.  [x] Update Permissions Policy (Fixed in `next.config.mjs`).
4.  [ ] Resolve 17 lint warnings (low priority but good hygiene).
5.  [ ] Verify `pnpm build` on a clean CI environment to ensure no cache pollution.
