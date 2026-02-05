# 🏗️ Interdomestik V3 Architecture (Phase C Pilot)

> **Status:** Phase C (Pilot Delivery)  
> **Enforcement:** Strict (CI/CD Gates active)  
> **Source of Truth:** This document describes the runtime architecture for the V3 Pilot.

---

## 1. High-Level Topology

Interdomestik V3 is a **Modular Monorepo** built on Turborepo. It adheres to strict **Domain-Driven Design (DDD)** principles, separating the consumer web application from core business domains.

```mermaid
graph TD
    User((User)) --> Proxy[("🛡️ Edge Proxy\n(apps/web/src/proxy.ts)")]

    subgraph "Application Layer (Next.js 15)"
        Proxy --> |"/member/*"| MemberPortal[Member Portal]
        Proxy --> |"/agent/*"| AgentPortal[Agent Portal]
        Proxy --> |"/staff/*"| StaffPortal[Staff Portal]
        Proxy --> |"/auth/*"| AuthFlow[Auth Flows]
    end

    subgraph "Domain Layer (Packages)"
        MemberPortal --> DomainMember[@interdomestik/domain-member]
        AgentPortal --> DomainUsers[@interdomestik/domain-users]
        StaffPortal --> DomainClaims[@interdomestik/domain-claims]
        AuthFlow --> SharedAuth[@interdomestik/shared-auth]
    end

    subgraph "Infrastructure & Persistence"
        DomainMember --> DB[(Supabase PostgreSQL)]
        DomainUsers --> DB
        DomainClaims --> DB
        SharedAuth --> SupabaseAuth[Supabase Auth Service]
        SharedAuth --> BetterAuth[Better-Auth Orchestrator]
    end
```

---

## 2. Core Architectural Pillars

### 2.1 Proxy-Based Routing (The "Iron Gate")

Route protection is decoupled from the UI.

- **Authority:** `apps/web/src/proxy.ts` is the absolute source of truth for routing.
- **Mechanism:** Intercepts requests at the edge; validates Session + Role + Tenant before Next.js rendering.
- **Legacy Middleware:** Middleware files may exist for compatibility but do **not** define security boundaries.

### 2.2 Hybrid Authentication

We use a **Split-Stack Auth** model for the V3 Pilot to ensure stability while modernizing:

1.  **Identity & Persistence:** **Supabase Auth** (User tables, JWTs, Password resets).
2.  **Orchestration:** **Better-Auth** (Session management, MFA flow coordination).
3.  **Boundary:** `@interdomestik/shared-auth` package wraps all auth logic. Consumer apps never import Supabase/Better-Auth clients directly.

### 2.3 Domain Isolation

Business logic resides **strictly** in `packages/domain-*`.

- **UI Components** (`apps/web`) are "dumb" consumers of Domain Services.
- **Data Access** is encapsulated. Domains define their own Zod schemas and Drizzle queries.
- **Cross-Domain Communication** happens via explicit service calls, not database joins across schemas.

---

## 3. Key Technology Decisions (V3 Standard)

| Component       | Standard                         | Rationale                                                                    |
| :-------------- | :------------------------------- | :--------------------------------------------------------------------------- |
| **Framework**   | **Next.js 15 (App Router)**      | Standard for current react ecosystem performance and layout composition.     |
| **Package Mgr** | **pnpm 10+**                     | Strict workspace isolation prevents phantom dependencies.                    |
| **ORM**         | **Drizzle ORM**                  | Type-safe SQL builder with zero runtime bloat (unlike Prisma, used in V2).   |
| **Payments**    | **Paddle**                       | Merchant of Record model simplifies multi-country tax compliance in Balkans. |
| **State**       | **Server Actions + React Query** | Minimize client-side bundle; server-first data handling.                     |

---

## 4. The "Guard" System (Quality Gates)

Architecture is enforced via automated tooling.

### 4.1 `pr:verify` (The Standard)

Runs on every PR to `main` or release branches.

- **Linting:** ESLint with strict architectural rules (no cross-domain imports).
- **Type-Check:** Full `tsc` compilation.
- **Smoke Tests:** `pnpm boot:e2e` followed by critical path validation.

### 4.2 Security Boundaries

- **Secrets:** Checked via `security:guard`. No `.env` secrets in git.
- **Canonical Routes:** E2E tests verify that `/member`, `/agent`, etc. are correctly gated.

---

## 5. Deployment Strategy

- **Environment:** Vercel (Frontend/Edge) + Supabase (Database).
- **CI/CD:** GitHub Actions.
- **Pilot Phase:** "Phase C" means manual promotion to production after automatic E2E gates pass.
