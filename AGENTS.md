# Interdomestik AGENTS.md

This file contains guidelines and commands for agentic coding agents working on the Interdomestik monorepo.

## ⚠️ V3 / Phase C Execution Rules (MANDATORY)

This repository is currently operating in **Phase C – Pilot Delivery**.

The following rules are non-negotiable for all agents (human or AI):

- `apps/web/src/proxy.ts` is the **sole authority** for routing, access control, and tenant isolation (**READ-ONLY unless explicitly authorized**).
- Canonical routes (`/member`, `/agent`, `/staff`, `/admin`) MUST NOT be renamed or bypassed.
- Clarity markers (`*-page-ready`) are contractual and enforced by E2E gates.
- No architectural refactors (routing, auth, domains, tenancy) unless explicitly requested.
- Stripe is **not used** in V3 pilot flows.
- Do not update README, AGENTS.md, or architecture docs unless explicitly requested.
- All changes must pass:
  - `pnpm pr:verify`
  - `pnpm security:guard`
  - E2E Gate specs

## Project Overview

- **Type**: Next.js 15 monorepo with Turborepo
- **Language**: TypeScript with strict mode
- **Package Manager**: pnpm (workspace protocol)
- **Architecture**: Modular domain-driven design with separate packages
- **UI**: React 19 with Tailwind CSS and Radix UI components
- **Database**: Drizzle ORM with PostgreSQL
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Routing Authority**: `apps/web/src/proxy.ts` (canonical routes + access control)

## 🔐 Authentication (V3)

- **Supabase Auth** is the system of record for identities and sessions.
- **better-auth** is the active orchestrator.
- **`@interdomestik/shared-auth`** is the provider-agnostic boundary.
- This is an intentional transition; agents must not collapse or bypass this layering.

## Development Commands

### Root Level Commands

```bash
# Development
pnpm dev                  # Start development servers for all packages
pnpm build               # Build all packages and apps
pnpm clean               # Clean all build artifacts and node_modules

# Code Quality
pnpm lint                # Run ESLint across all packages
pnpm type-check          # Type check all packages
pnpm format              # Format code with Prettier
pnpm format:check        # Check code formatting
pnpm check:fast          # Quick checks (format, lint, type-check, test)
pnpm check               # Full checks including build

# Testing
pnpm test                # Run unit tests for web app
pnpm test:unit:domains   # Run unit tests for all domain packages
pnpm test:e2e            # Run Playwright e2e tests
pnpm qa                  # Run quality assurance checks

# Database
pnpm db:generate         # Generate database client
pnpm db:push:local       # Push schema changes to local database
pnpm db:studio           # Open Drizzle Studio
```

### Mandatory Verification

Before opening or merging a PR:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

PRs that fail either check are invalid.

### Single Test Commands

```bash
# Unit tests (Vitest)
pnpm --filter @interdomestik/web test:unit --run fileName.test.tsx
pnpm --filter @interdomestik/domain-users test:unit --run specific.test.ts

# E2E tests (Playwright)
pnpm --filter @interdomestik/web test:e2e -- --grep "test name"
pnpm --filter @interdomestik/web test:e2e -- --project=chromium --grep "specific test"
pnpm --filter @interdomestik/web test:e2e -- tests/auth/login.spec.ts
```

### Package-Specific Commands

```bash
# Web app
pnpm --filter @interdomestik/web dev
pnpm --filter @interdomestik/web build
pnpm --filter @interdomestik/web lint
pnpm --filter @interdomestik/web test:unit
pnpm --filter @interdomestik/web test:e2e

# Individual domain packages
pnpm --filter @interdomestik/domain-users test:unit
pnpm --filter @interdomestik/domain-claims test:unit
# ... etc for other domain packages
```

## Code Style Guidelines

### Formatting (Prettier)

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
```

### Import Organization

```typescript
// 1. React/Next.js imports
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Metadata } from 'next';

// 2. External packages (alphabetical)
import { zodResolver } from '@hookform/resolvers';
import { Button } from '@interdomestik/ui';
import { ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';

// 3. Internal packages (workspace dependencies)
import { db, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { requireTenantSession } from '@interdomestik/shared-auth';

// 4. Local imports (relative)
import { UserAvatar } from './components/user-avatar';
import { useUserPermissions } from './hooks/use-user-permissions';
import type { UserSettings } from './types';
```

### TypeScript Patterns

```typescript
// Use strict typing with interfaces/types
interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

// Prefer explicit return types for functions
async function getUserById(id: string): Promise<UserProfile | null> {
  // Implementation
}

// Use utility types appropriately
type PartialUserProfile = Partial<UserProfile>;
type UserUpdatePayload = Omit<UserProfile, 'id' | 'createdAt'>;

// Use discriminated unions for result types
type ApiResult<T> = { success: true; data: T } | { success: false; error: string };
```

### Component Patterns

```typescript
// Use forwardRef for DOM components
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);

// Use proper prop interfaces
interface LoginFormProps {
  onSubmit?: (data: LoginFormData) => void;
  loading?: boolean;
  error?: string | null;
}

// Default exports for components
export function LoginForm({ onSubmit, loading, error }: LoginFormProps) {
  // Component implementation
}
```

### Error Handling

```typescript
// Use try-catch with proper error typing
async function sendMessage(params: SendMessageParams): Promise<ApiResult<Message>> {
  try {
    const message = await db.insert(messageTable).values(params).returning();
    return { success: true, data: message[0] };
  } catch (error) {
    console.error('Failed to send message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

// Use Result patterns for domain logic
type DomainResult<T, E = string> = { success: true; data: T } | { success: false; error: E };

function validateEmail(email: string): DomainResult<Email> {
  if (!email.includes('@')) {
    return { success: false, error: 'Invalid email format' };
  }
  return { success: true, data: email.toLowerCase() };
}
```

### Naming Conventions

- **Files**: kebab-case (`user-profile.tsx`, `send-message.ts`)
- **Components**: PascalCase (`UserProfile`, `SendMessageButton`)
- **Functions**: camelCase (`getUserById`, `sendMessageDbCore`)
- **Variables**: camelCase (`userName`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (`API_BASE_URL`, `MAX_RETRIES`)
- **Types**: PascalCase (`UserProfile`, `ApiResult`)

### Testing Patterns

```typescript
// Test file naming: *.test.tsx or *.test.ts
// Use descriptive test descriptions
describe('LoginForm', () => {
  it('should render login form with all fields', () => {
    // Test implementation
  });

  it('should show validation error for invalid email', async () => {
    // Test implementation
  });

  it('should call onSubmit with form data when valid', async () => {
    // Test implementation
  });
});

// Use custom render with providers
import { renderWithProviders } from '@/test/test-utils';

const { getByLabelText, getByRole } = renderWithProviders(
  <LoginForm onSubmit={mockOnSubmit} />
);
```

### Database Patterns

```typescript
// Always use withTenant for tenant-scoped queries
const users = await db.query.user.findMany({
  where: (t, { eq }) => withTenant(tenantId, t.tenantId, eq(t.isActive, true)),
  with: {
    agent: true,
  },
});

// Use transactions for complex operations
await db.transaction(async tx => {
  await tx.insert(messageTable).values(message);
  await tx.update(claimTable).set({ updatedAt: new Date() });
});
```

### Security Patterns

```typescript
// Always validate sessions
const session = await requireTenantSession(request);
if (!session) {
  return { success: false, error: 'Unauthorized' };
}

// Use tenant scoping
const tenantId = ensureTenantId(session);

// Sanitize user inputs
const sanitizedContent = content.trim().slice(0, 1000);
```

## Architecture Guidelines

### Domain Packages Structure

```
packages/domain-{name}/src/
├── index.ts              # Public API exports
├── types.ts               # Domain types
├── schema.ts              # Zod schemas
├── admin/                 # Admin-only functions
├── agent/                 # Agent-only functions
├── staff/                 # Staff-only functions
└── {feature}/             # Feature-specific modules
```

### Component Organization

```
src/components/
├── ui/                    # Reusable UI components
├── {feature}/             # Feature components
│   ├── {component}.tsx
│   └── {component}.test.tsx
└── layout/                # Layout components
```

## Performance Guidelines

- Use React.memo() for expensive components
- Implement proper loading states with skeleton screens
- Use Next.js dynamic imports for heavy components
- Optimize database queries with proper indexes
- Use React Query for data fetching and caching

## Commit Message Style

Use conventional commits:

- `feat: add new user registration flow`
- `fix: resolve login validation issue`
- `refactor: extract domain logic to packages`
- `test: add unit tests for claim service`
- `docs: update API documentation`

## Security Development Guidelines

### Environment Security

```bash
# Generate secure development environment
./scripts/security-setup.sh generate

# Validate security setup
./scripts/security-setup.sh check

# Generate new secrets
openssl rand -base64 32  # Auth secrets
openssl rand -base64 24  # Shorter secrets
openssl rand -hex 16     # Hex secrets
```

### Local Service Security

- All Supabase services bind to `127.0.0.1` only
- Database uses strong passwords and SSL in production
- Authentication never bypasses, even in development
- Rate limiting: GET=10/min, POST=5/min for auth endpoints

### Secret Management

- `.env.local` contains development-only secrets (gitignored)
- Never commit production API keys to any environment file
- Use development-specific API keys for all external services
- Rotate authentication secrets every 30-90 days

## Quick Reference (Phase C)

Before opening or merging a PR:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

For single test debugging:

```bash
# Unit test
pnpm --filter @interdomestik/web test:unit --run src/components/auth/login-form.test.tsx

# E2E test
pnpm --filter @interdomestik/web test:e2e:chromium -- --grep "login form"
```
