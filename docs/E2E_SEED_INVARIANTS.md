# E2E Seed Invariants & CI Reliability

**Status:** Active  
**Source of Truth Code:** `packages/database/src/seed/e2e-users.ts` (or equivalent seed definition)

This document defines the **immutable data requirements** for the End-to-End (E2E) test suite. If these invariants are violated, the "Gate" and "Smoke" tests will fail with "User not found" or 404 errors.

---

## 1. The Seed Contract

### A. Tenants & Routing

The application is multi-tenant. Tests rely on **subdomain routing**.

| Tenant              | Code | Host Pattern (CI/Local)    | Currency | Locale  |
| :------------------ | :--- | :------------------------- | :------- | :------ |
| **Kosovo**          | `ks` | `ks.127.0.0.1.nip.io:3000` | EUR      | `sq-KS` |
| **North Macedonia** | `mk` | `mk.127.0.0.1.nip.io:3000` | MKD      | `mk-MK` |

### B. User Identities (The "Golden" Users)

These users must exist, be verified, and have a known password (e.g., `TestUser123!`).

| Email                            | Role     | Tenant      | Critical Flags                         |
| :------------------------------- | :------- | :---------- | :------------------------------------- |
| `member.ks.a1@interdomestik.com` | `MEMBER` | `tenant_ks` | `emailVerified: true`, `banned: false` |
| `member.mk.1@interdomestik.com`  | `MEMBER` | `tenant_mk` | `emailVerified: true`, `banned: false` |
| `admin.ks@interdomestik.com`     | `ADMIN`  | `tenant_ks` | `emailVerified: true`                  |

> **Invariant:** A user is NOT valid unless they exist in **BOTH** the Auth tables (Better Auth) and the Domain tables (`public.users`), linked by ID/Email.

### C. Branch & Data Isolation

To test isolation (ensure User A cannot see User B's data), the seed must provide:

1.  **MK Branch Structure:**
    - `MK-Branch-A` (Skopje Center)
    - `MK-Branch-B` (Bitola)
2.  **Isolation Claims:**
    - `claim_mk_A_01`: Associated with Branch A.
    - `claim_mk_B_01`: Associated with Branch B.
    - **Test:** An agent assigned strictly to Branch A **must not** see `claim_mk_B_01`.

---

## 2. CI Pipeline Order

To prevent flake, the CI pipeline **must** follow this strict order:

1.  **`db:migrate`**: Apply schema changes.
2.  **`db:seed:e2e`**: Insert the invariants defined above.
3.  **`verify-seed`**: (Optional but recommended) A quick script that asserts the Golden Users exist.
4.  **`playwright test`**: Only runs if steps 1-3 succeed.

> **Failure Mode:** If `verify-seed` fails, the pipeline should stop immediately. Do not waste compute on E2E tests.

---

## 3. Debugging: The "5 Queries"

When tests fail with **"User not found"** or **"Invalid credentials"**, run these queries in order:

### 1. Does the user exist in the Auth system?

```sql
SELECT id, email, "emailVerified", banned FROM "user"
WHERE email = 'member.ks.a1@interdomestik.com';
-- EXPECT: 1 row, emailVerified = true
```

### 2. Does the user exist in the Domain system?

```sql
SELECT id, email, "tenantId" FROM public.users
WHERE email = 'member.ks.a1@interdomestik.com';
-- EXPECT: 1 row, matches Auth ID
```

### 3. Is the Tenant linked correctly?

```sql
SELECT t.id, t.slug, m.role
FROM public.tenants t
JOIN public.members m ON m."tenantId" = t.id
JOIN public.users u ON m."userId" = u.id
WHERE u.email = 'member.ks.a1@interdomestik.com';
-- EXPECT: slug = 'ks', role = 'MEMBER'
```

### 4. (Better Auth) Are accounts/sessions valid?

```sql
SELECT * FROM account WHERE "userId" = (SELECT id FROM "user" WHERE email = 'member.ks.a1@interdomestik.com');
-- EXPECT: At least 1 row (provider = 'credential' or similar)
```

### 5. Are claims visible?

```sql
SELECT id, status, "tenantId" FROM public.claims
WHERE "tenantId" = (SELECT id FROM public.tenants WHERE slug = 'ks')
LIMIT 5;
-- EXPECT: Rows to exist for the dashboard to render
```

---

## 4. Checklist: Before Modifying the Seed

- [ ] **Idempotency:** Can I run the seed command twice without it crashing (Unique Constraint Error)?
- [ ] **Hard Coded IDs:** specific IDs (e.g., `user_ks_01`) are preferred over random UUIDs for snapshots and deterministic sorting.
- [ ] **Passwords:** Did I reset the password hash to the known test value?
- [ ] **Cleanup:** Does the seed script clean up _conflicting_ data (or do we rely on `db:reset`)?
