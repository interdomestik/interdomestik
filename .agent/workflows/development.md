---
description: Development workflow for the Interdomestik project
---

# Development Workflow

## Quick Start

// turbo

1. Install dependencies

```bash
npm install
```

// turbo 2. Start the development server

```bash
npm run dev
```

3. Open http://localhost:3000

## Available Scripts

| Script               | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`        | Start all apps in development mode |
| `npm run build`      | Build all apps                     |
| `npm run lint`       | Lint all apps                      |
| `npm run type-check` | Type check all apps                |
| `npm run format`     | Format code with Prettier          |

## Project Structure

- `apps/web` - Next.js 15 web application
- `packages/ui` - Shared UI component library
- `packages/database` - Supabase types and clients
- `packages/typescript-config` - Shared TypeScript configs
- `supabase/` - Database migrations and config

## i18n

- Default locale: Albanian (`sq`)
- Supported: Albanian (`sq`), English (`en`)
- Translations: `apps/web/src/messages/`

## Testing

// turbo
Run type check:

```bash
npm run type-check
```

// turbo
Run lint:

```bash
npm run lint
```
