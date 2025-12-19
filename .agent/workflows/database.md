---
description: Database setup and migration workflow
---

# Database Workflow

## Local Development Setup

// turbo

1. Install Supabase CLI (if not already installed)

```bash
npm install -g supabase
```

2. Start Supabase locally

```bash
npx supabase start
```

3. Get local credentials

```bash
npx supabase status
```

4. Copy credentials to `.env.local`

## Migrations

// turbo
Apply migrations to local database:

```bash
npx supabase db push
```

// turbo
Generate TypeScript types from database:

```bash
npm run db:generate
```

// turbo
Open Supabase Studio:

```bash
npm run db:studio
```

## Creating New Migrations

1. Create a new migration file in `supabase/migrations/`
2. Name format: `00002_description.sql`
3. Write SQL for both up and down migrations
4. Apply with `npx supabase db push`

## RLS Policies

All tables have Row Level Security enabled:

- `users` - Users can read/update own profile
- `subscriptions` - Users can view own subscription
- `claims` - Members can CRUD own claims, agents can view/update assigned
- `claim_documents` - Users can view/upload to own claims
- `claim_messages` - Users can view non-internal messages

## Schema Overview

```
users → subscriptions (1:1)
users → claims (1:N)
claims → claim_documents (1:N)
claims → claim_messages (1:N)
claims → claim_timeline (1:N)
```
