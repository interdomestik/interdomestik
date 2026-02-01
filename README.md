# 🛡️ Interdomestik V2

The #1 Consumer Protection & Claims Management Platform in the Balkans.

## 📋 Overview

Interdomestik is a subscription-based consumer protection service that helps members resolve disputes with companies, landlords, insurance providers, employers, and other entities.

## 🛠️ Tech Stack

| Layer          | Technology                                     |
| -------------- | ---------------------------------------------- |
| **Monorepo**   | Turborepo                                      |
| **Frontend**   | Next.js 15 (App Router)                        |
| **UI**         | Custom Design System + Radix UI + Tailwind CSS |
| **Database**   | Supabase (PostgreSQL)                          |
| **Auth**       | Supabase Auth                                  |
| **Payments**   | Stripe                                         |
| **i18n**       | next-intl (Albanian/English)                   |
| **Deployment** | Vercel                                         |

## 📁 Project Structure

```
interdomestikv2/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/            # App Router pages
│       │   │   └── [locale]/   # i18n routing
│       │   ├── i18n/           # i18n configuration
│       │   ├── lib/            # Utilities (Stripe, etc.)
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
│   ├── database/               # Supabase types and clients
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
- npm 10+
- Supabase CLI (for local development)
- Stripe CLI (for webhook testing)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/interdomestikv2.git
   cd interdomestikv2
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

   Optional (but recommended) toggles:
   - `CRON_SECRET` protects `/api/cron/*` endpoints (cron caller must send `Authorization: Bearer $CRON_SECRET`)
   - Cron requests require `CRON_SECRET` even in development (no bypass flag supported)
   - `SHOW_I18N_STATS=1` to print i18n key-count stats during tests

4. **Start Supabase locally** (optional)

   ```bash
   npx supabase start
   ```

5. **Run the development server**

   ```bash
   pnpm dev
   # If you need to bind explicitly to loopback:
   pnpm -C apps/web dev:local
   # Avoid: pnpm -C apps/web dev -- --hostname ... (Next treats `--` as end-of-options and misreads args)
   ```

6. **Open** [http://localhost:3000](http://localhost:3000)

## 🌍 Internationalization

The app supports:

- 🇦🇱 **Albanian (sq)** - Default language
- 🇬🇧 **English (en)**

Translation files are located in `apps/web/src/messages/{locale}/`.

### Adding a new language

1. Create a locale folder: `apps/web/src/messages/{locale}/`
2. Copy namespace files from an existing locale (e.g. `en`) and translate
3. Add the locale to `apps/web/src/i18n/routing.ts`

## 💳 Stripe Setup

1. Create a [Stripe account](https://stripe.com)
2. Get your API keys from the Stripe Dashboard
3. Create subscription products:
   - Basic (€5/month)
   - Standard (€10/month)
   - Premium (€15/month)
   - Family (€20/month)
4. Set the price IDs in your environment variables

### Testing Webhooks

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## 🗄️ Database

### Local Development

```bash
# Start Supabase
npx supabase start

# Apply migrations
npx supabase db push

# Generate types
npm run db:generate

# Open Studio
npm run db:studio
```

### Schema

The database includes:

- **users** - User profiles with roles
- **subscriptions** - Stripe subscription data
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

| Script               | Description                   |
| -------------------- | ----------------------------- |
| `npm run dev`        | Start all apps in development |
| `npm run build`      | Build all apps                |
| `npm run lint`       | Lint all apps                 |
| `npm run type-check` | Type check all apps           |

### SonarQube (Local)

See [docs/SONAR.md](docs/SONAR.md) for the streamlined workflow:

- `pnpm sonar:start`
- `pnpm sonar:full:dotenv`
  | `npm run format` | Format code with Prettier |
  | `npm run db:generate` | Generate Supabase types |
  | `npm run db:push` | Push database migrations |
  | `npm run db:studio` | Open Supabase Studio |

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

## 📖 Documentation & Governance

- [Governance & Rules](AGENTS.md) - Strict project rules and agent behavior.
- [E2E Source of Truth](apps/web/e2e/README.md) - Technical specifications for tests and markers.
- [Database Schema](packages/database/README.md) - Database design and migrations.

### 🚦 What should I run?

- `pnpm boot:dev` - Full stack development (Supabase + Next).
- `pnpm boot:e2e` - Prepare environment for E2E tests.

## 📄 License

Proprietary - All rights reserved.

---

Built with ❤️ for the Balkans
