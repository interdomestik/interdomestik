# Interdomestik QA Tools

MCP-based quality assurance tools for the Interdomestik V2 project.

## Quick Start

### Setup (First Time)

```bash
# From project root
pnpm mcp:setup
```

### Run All Audits

```bash
# From project root
pnpm mcp:audit

# Or from this directory
pnpm run-all-audits
```

## Available Tools

### Audit Tools

- `audit_auth` - Verify Better Auth configuration
- `audit_env` - Check environment variables
- `audit_navigation` - Validate routing and i18n
- `audit_dependencies` - Check package configuration
- `audit_supabase` - Verify Supabase setup
- `audit_accessibility` - Check a11y configuration
- `audit_csp` - Verify Content Security Policy
- `audit_performance` - Check performance config

### Testing Tools

- `check_health` - Run type-check and lint
- `run_unit_tests` - Execute Vitest tests
- `run_coverage` - Run tests with coverage
- `run_e2e_tests` - Execute Playwright tests

### Development Tools

- `project_map` - Generate project structure
- `read_files` - Read file contents
- `git_status` - Get git status
- `git_diff` - View git changes
- `code_search` - Search codebase

### Integration Tools

- `query_db` - Query local PostgreSQL database
- `get_stripe_resource` - Fetch Stripe resources

## Usage

### Via MCP (Recommended)

When using Gemini CLI, all tools are available automatically:

```
"Run all QA audits"
"Check the health of the project"
"Run unit tests with coverage"
```

### Via Command Line

```bash
# Build the package
pnpm build

# Run all audits
pnpm run-all-audits

# Test tools
pnpm check
```

## Development

### Project Structure

```
packages/qa/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── server.ts         # Server implementation
│   ├── tool-router.ts    # Tool routing logic
│   ├── tools/            # Tool implementations
│   │   ├── audits.ts     # Audit tools
│   │   ├── health.ts     # Health check tools
│   │   ├── tests.ts      # Testing tools
│   │   ├── repo.ts       # Repository tools
│   │   ├── db.ts         # Database tools
│   │   └── stripe.ts     # Stripe tools
│   └── utils/            # Utilities
│       ├── paths.ts      # Path resolution
│       └── exec.ts       # Command execution
├── dist/                 # Compiled output
├── run-all-audits.ts     # Audit runner script
└── test-tools.ts         # Tool testing script
```

### Adding New Tools

1. **Create tool implementation**:

```typescript
// src/tools/my-tool.ts
export async function myNewTool(args: { param: string }) {
  // Implementation
  return {
    content: [
      {
        type: 'text',
        text: 'Result of my tool',
      },
    ],
  };
}
```

2. **Add tool definition**:

```typescript
// src/tools/list-tools.ts
{
  name: 'my_new_tool',
  description: 'Description of what it does',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string' }
    },
    required: ['param']
  }
}
```

3. **Add handler**:

```typescript
// src/tool-router.ts
import { myNewTool } from './tools/my-tool.js';

const handlers: Record<string, Handler> = {
  // ... existing handlers
  my_new_tool: args => myNewTool(args),
};
```

4. **Rebuild**:

```bash
pnpm build
```

## Configuration

### Environment Variables

The QA tools use the project's `.env` file. Required variables:

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret key
- `NEXT_PUBLIC_APP_URL` - Application URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

### Path Resolution

The tools automatically resolve the project root by going up 4 levels from `packages/qa/src/utils/paths.ts`:

```
utils -> src -> qa -> packages -> ROOT
```

Override with environment variable:

```bash
MCP_REPO_ROOT=/path/to/project pnpm check
```

## Troubleshooting

### Tools Not Working

1. Rebuild the package: `pnpm build`
2. Check path resolution in `src/utils/paths.ts`
3. Verify `.env` file exists in project root

### MCP Server Not Responding

1. Check MCP configuration: `cat ~/.config/google/gemini/mcp.json`
2. Restart Gemini CLI
3. Verify server path points to `packages/qa/dist/index.js`

### Database Tools Failing

1. Ensure PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Verify database exists and is accessible

## Testing

### Run Tool Tests

```bash
pnpm check
```

### Test Specific Tool

```bash
tsx -e "import { auditAuth } from './src/tools/audits.js'; auditAuth().then(console.log)"
```

## CI/CD Integration

```yaml
# Example GitHub Actions
- name: Setup MCP Tools
  run: |
    cd packages/qa
    pnpm install
    pnpm build

- name: Run QA Audits
  run: pnpm mcp:audit

- name: Run Tests
  run: pnpm test
```

## License

Private - Interdomestik V2 Project
