# 🛡️ Interdomestik V2

The #1 Consumer Protection & Claims Management Platform in the Balkans.

### 🚦 What should I run?

- **Feature work**: `pnpm boot:dev`
- **E2E work / Fixes**: `pnpm boot:e2e` (Required after restart / DB reset / tenant weirdness)
- **Before commit**: `pnpm check:fast` (+ `pnpm check:golden` if UI changed)

## 📋 Overview

Interdomestik is a subscription-based consumer protection service that helps members resolve disputes with companies, landlords, insurance providers, employers, and other entities.

## 🛠️ Tech Stack

| Layer          | Technology                                         |
| -------------- | -------------------------------------------------- |
| **Monorepo**   | Turborepo                                          |
| **Frontend**   | Next.js 15 (App Router)                            |
| **UI**         | Custom Design System + Radix UI + Tailwind CSS     |
| **Database**   | Drizzle ORM (PostgreSQL via Supabase)              |
| **Auth**       | Better Auth (Primary)                              |
| **Payments**   | Paddle                                             |
| **i18n**       | next-intl (Albanian, English, Macedonian, Serbian) |
| **Deployment** | Vercel                                             |

## 📁 Project Structure

```
interdomestikv2/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   │   └── [locale]/   # i18n routing
│       │   ├── i18n/           # i18n configuration
│       │   ├── lib/            # Utilities (Auth, Paddle, etc.)
│       │   └── messages/       # Translation JSON files by locale/namespace
│       ├── next.config.mjs
│       ├── tailwind.config.js
│       └── package.json
├── packages/
│   ├── ui/                     # Shared UI component library
│   │   ├── src/
│   │   │   ├── components/     # Button, Card, Input, etc.
│   │   │   ├── lib/            # Utilities (cn, etc.)
│   │   │   └── globals.css     # Design system CSS
│   │   └── package.json
│   ├── database/               # Drizzle schema, migrations, DB client, seed scripts (Postgres via Supabase)
│   │   ├── src/
│   │   │   ├── types.ts        # Database types
│   │   │   ├── client.ts       # Browser client
│   │   │   └── server.ts       # Server client
│   │   └── package.json
│   └── typescript-config/      # Shared TypeScript configs
├── supabase/
│   ├── migrations/             # Database migrations
│   └── config.toml             # Local development config
├── turbo.json                  # Turborepo configuration
├── package.json                # Root package.json
└── .env.example                # Environment variables template
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- Supabase CLI (for local development)

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/interdomestikv2.git
    cd interdomestikv2
    ```

2.  **Install dependencies**

    ```bash
    pnpm install
    ```

3.  **Set up environment variables**

    ```bash
    cp .env.example .env.local
    # Edit .env.local with your credentials
    ```

    Optional (but recommended) toggles:
    - `CRON_SECRET` protects `/api/cron/*` endpoints (cron caller must send `Authorization: Bearer $CRON_SECRET`)
    - Cron requests require `CRON_SECRET` even in development (no bypass flag supported)
    - `SHOW_I18N_STATS=1` to print i18n key-count stats during tests

4.  **Start Supabase locally** (optional)

    ```bash
    npx supabase start
    ```

5.  **Run the development server**

    ```bash
    pnpm dev
    # If you need to bind explicitly to loopback:
    pnpm -C apps/web dev:local
    # Avoid: pnpm -C apps/web dev -- --hostname ... (Next treats `--` as end-of-options and misreads args)
    ```

6.  **Open** [http://localhost:3000](http://localhost:3000)

## 🌍 Internationalization

The app supports:

- 🇦🇱 **Albanian (sq)** - Default language
- 🇬🇧 **English (en)**
- 🇲🇰 **Macedonian (mk)**
- 🇷🇸 **Serbian (sr)**

Translation files are located in `apps/web/src/messages/{locale}/`.

### Adding a new language

1.  Create a locale folder: `apps/web/src/messages/{locale}/`
2.  Copy namespace files from an existing locale (e.g. `en`) and translate
3.  Add the locale to `apps/web/src/i18n/routing.ts`

## 💳 Payments (Paddle)

We use **Paddle** for billing and subscriptions.

- Products and prices are managed in the Paddle Dashboard.
- Webhooks are handled at `/api/webhooks/paddle`.

## 🧪 Testing & E2E (Strict Contract)

We enforce strict E2E guidelines to ensure stability in our multi-tenant, multi-locale environment.

- **E2E Spec Source of Truth**: [apps/web/e2e/README.md](apps/web/e2e/README.md)
- **Workflow & Enforcement**: [AGENTS.md](AGENTS.md)

### 🚨 Mandatory Commands (Critical Path)

1.  **Fast Gate (Must Pass)**:

    ```bash
    pnpm --filter @interdomestik/web e2e:gate:fast
    ```

2.  **Phase 5 (Functional Flows)**:

    ```bash
    pnpm --filter @interdomestik/web test:e2e:phase5
    ```

3.  **Seed / Resume Contract**:

    ```bash
    pnpm --filter @interdomestik/database seed:e2e
    pnpm --filter @interdomestik/web test:e2e -- apps/web/e2e/gate/seed-contract.spec.ts --project gate-ks-sq --project gate-mk-mk
    ```

4.  **Full Suite (Optional)**:
    ```bash
    PW_REUSE_SERVER=1 pnpm --filter @interdomestik/web test:e2e -- --max-failures=20 --trace=retain-on-failure --reporter=line
    ```

## 🏠 Local Multi-Tenant Hosts

We use `nip.io` to simulate multi-tenancy locally without editing `/etc/hosts`.

- **Kosovo**: `http://ks.127.0.0.1.nip.io:3000`
- **Macedonia**: `http://mk.127.0.0.1.nip.io:3000`

The logic is handled by a neutral host chooser in `middleware.ts`.

## 🗄️ Database

### Local Development

```bash
# Start Supabase
npx supabase start

# Apply migrations
npx supabase db push

# Generate types
pnpm db:generate

# Open Studio
pnpm db:studio
```

### Schema

The database includes:

- **users** - User profiles with roles
- **subscriptions** - Paddle subscription data
- **claims** - Consumer protection claims
- **claim_documents** - Uploaded evidence/documents
- **claim_messages** - Communication threads
- **claim_timeline** - Activity log

## 🛡️ Admin Panel

The **Admin Panel** ("Cockpit") is a P0 critical feature for managing claims efficiently.

### Features

- **Role-Based Access**: Restricted to `admin` and `agent` roles.
- **Cockpit Interface**: A 3-pane layout for processing claims without switching tabs.
- **Live Dashboard**: Real-time stats on new and resolved claims.
- **Claim Management**:
  - Filter/Sort claims.
  - View claimant details.
  - Review evidence/documents.
  - Send messages (internal/external).
  - Update claim status.

### Access

Navigate to `/admin` (requires login as Admin/Agent).

## 📦 Available Scripts

| Script            | Description                   |
| ----------------- | ----------------------------- |
| `pnpm dev`        | Start all apps in development |
| `pnpm build`      | Build all apps                |
| `pnpm lint`       | Lint all apps                 |
| `pnpm type-check` | Type check all apps           |

### SonarQube (Local)

See [docs/SONAR.md](docs/SONAR.md) for the streamlined workflow:

- `pnpm sonar:start`
- `pnpm sonar:full:dotenv`
  | `pnpm format` | Format code with Prettier |
  | `pnpm db:generate` | Generate Supabase types |
  | `pnpm db:push` | Push database migrations |
  | `pnpm db:studio` | Open Supabase Studio |

## 🎨 Design System

The UI package (`packages/ui`) provides:

### Components

- `Button` - Primary, secondary, outline, ghost variants
- `Card` - Container with header, content, footer
- `Input` - Form input with error state
- `Label` - Form labels
- `Badge` - Status indicators
- `Avatar` - User avatars
- `Progress` - Progress bars
- `Skeleton` - Loading placeholders

### Design Tokens

- **Colors**: Professional blue/teal palette
- **Typography**: Inter (body) + Space Grotesk (headings)
- **Radius**: 0.75rem default
- **Animations**: Fade, slide, lift effects

## 📄 License

Proprietary - All rights reserved.

---

Built with ❤️ for the Balkans
