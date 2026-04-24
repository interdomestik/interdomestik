# 🛡️ Interdomestik V3

The #1 Consumer Protection & Claims Management Platform in the Balkans.

## 📋 Overview

Interdomestik is a subscription-based consumer protection service that helps members resolve disputes with companies, landlords, insurance providers, employers, and other entities. **Version 3 (V3)** represents our latest architectural evolution, featuring specific domain isolation, proxy-based routing, and enhanced multi-tenant security.

## 🛠️ Tech Stack

| Layer            | Technology                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Monorepo**     | Turborepo + pnpm (Workspaces)                                                                                   |
| **Frontend**     | Next.js 15 (App Router)                                                                                         |
| **Architecture** | Domain-Driven Design (DDD)                                                                                      |
| **Routing**      | **Proxy-based** (Middleware may exist but is not authoritative; `proxy.ts` is the source of truth)              |
| **UI**           | Custom Design System + Radix UI + Tailwind CSS                                                                  |
| **Database**     | Supabase (PostgreSQL) + Drizzle ORM                                                                             |
| **Auth**         | Supabase Auth (identity & persistence) + Better Auth via `@interdomestik/shared-auth` (orchestration, policies) |
| **Payments**     | **Paddle (V3 only)** — Stripe references exist only in legacy code and are not part of the V3 runtime           |
| **i18n**         | next-intl (SQ, EN, MK, SR, DE, HR)                                                                              |

## 📁 Project Structure

```
interdomestik/
├── apps/
│   └── web/                    # Next.js 15 web application
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   ├── proxy.ts        # Primary routing & security logic
│       │   └── messages/       # Translation JSON files
│       └── e2e/                # Playwright tests & canonical routes
├── packages/
│   ├── domain-*/               # DDD Packages (claims, users, member, etc.)
│   ├── ui/                     # Shared UI component library
│   ├── database/               # Drizzle schema & Supabase clients
│   └── shared-auth/            # Unified authentication logic
├── scripts/                    # Automation & Security Guards
├── supabase/                   # Migrations & Config
└── turbo.json                  # Turborepo configuration
```

## 🔐 Authentication Architecture (V3)

Authentication in Interdomestik V3 is **intentionally abstracted and in transition**.

- **Supabase Auth** remains the system of record for identities and sessions.
- **better-auth** is used as the active authentication orchestrator.
- **`@interdomestik/shared-auth`** provides a provider-agnostic boundary layer, allowing the system to evolve without coupling business logic to a single auth vendor.

This design is deliberate and supports future authentication flexibility without disrupting the V3 pilot.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- **pnpm** 10+ (Required)
- Supabase CLI (for local DB)
- Docker (optional, for SonarQube/local services)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/interdomestik/interdomestik.git
   cd interdomestik
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   # Populate .env.local with Supabase, Better Auth, Paddle, Sentry, and tenant host values.
   # V3 pilot billing uses Paddle only; do not add Stripe runtime credentials.
   ```

### Development Boot

We use **Boot Scripts** to standardize startup:

```bash
#  🚀 Start Full Stack (Database + Next.js)
pnpm boot:dev

#  🧪 Prepare for E2E (Seeds database + setup)
pnpm boot:e2e
```

## 📍 Canonical Routes & Portals

V3 uses strict **Canonical Routes**. All access is governed by `apps/web/src/proxy.ts`.

| Role       | Canonical Path    | Description                 |
| :--------- | :---------------- | :-------------------------- |
| **Member** | `/member`         | Dashboard, Claims, Settings |
| **Agent**  | `/agent/members`  | Agent Portal & Member Mgmt  |
| **Staff**  | `/staff/claims`   | Staff Operations Queue      |
| **Admin**  | `/admin/overview` | Executive Cockpit           |

> **Note:** Legacy middleware is no longer the primary routing authority. All canonical routing, access control, and tenant isolation are enforced in `src/proxy.ts`.

## ✅ Pilot Readiness & Quality Gates

> **V3 Pilot Scope**
> This repository is currently in Phase C (Pilot Delivery).
> Architecture, routing, clarity markers, and security guards are locked.
> Feature completeness is being finalized through explicit pilot workflows.

We enforce strict quality standards ("The Guard") for the V3 Pilot.

### Verification (The Standard)

Before pushing _any_ code, run the verifier:

```bash
pnpm pr:verify
```

_Runs: memory precheck, release-gate unit coverage, E2E contract checks, production lint-warning baseline, DB/RLS checks, i18n checks, coverage gate, fast checks, and Web Smoke Tests._

For pilot-launch release proof, also run:

```bash
pnpm check:e2e-contracts
pnpm lint:production-warnings
pnpm security:guard
pnpm e2e:gate
```

### Security

We use an automated security guard to prevent sensitive leaks and unsafe patterns:

```bash
pnpm security:guard
```

### Testing (Playwright + Vitest)

- **Unit Tests**: `pnpm test` (Web) or `pnpm test:unit:domains` (Domains)
- **E2E Gate**: `pnpm e2e:gate` (Strict quality gate)
- **Clarity Markers**: used in E2E tests to verify V3 surface readiness.

## 🚢 Release Readiness

The GitHub CD workflow builds separate staging and production Docker artifacts with explicit Supabase environment separation. Promotion is fail-closed: staging and production deploy jobs require environment-scoped deploy webhook secrets, then run health checks and release-gate evidence capture before production verification artifacts are retained.

## 🌍 Internationalization

Supported Locales:

- 🇦🇱 **SQ** (Albanian) - Primary
- 🇬🇧 **EN** (English)
- 🇲🇰 **MK** (Macedonian)
- 🇷🇸 **SR** (Serbian)
- 🇩🇪 **DE** (German)
- 🇭🇷 **HR** (Croatian)

Updates to translations should be made in `apps/web/src/messages/{locale}/`.

## 📦 Database & Drizzle

We use **Drizzle ORM** for type-safe database interactions.

```bash
# Push schema changes (Local)
pnpm db:push:local

# Open Drizzle Studio
pnpm db:studio
```

## 📄 License

Proprietary - All rights reserved. Interdomestik.

---

**Built for the Balkans.** 🛡️
