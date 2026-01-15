export const tools = [
  {
    name: 'audit_auth',
    description: 'Verify Better Auth configuration (files, env, proxy)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_env',
    description: 'Verify Environment Variables for Interdomestik',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_navigation',
    description: 'Verify Navigation & Layout Structure (i18n, layouts)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_dependencies',
    description: 'Verify Critical Dependencies & Package Configuration',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'dependency_audit',
    description: 'Alias for audit_dependencies',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_supabase',
    description: 'Verify Supabase Environment & Connectivity (env vars only)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_unit_tests',
    description: 'Run unit tests for the web application using Vitest',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_coverage',
    description: 'Run unit tests with coverage for the web application',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_e2e_tests',
    description: 'Run E2E tests for the web application using Playwright',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tests_orchestrator',
    description: 'Run project test suites (unit/e2e/smoke)',
    inputSchema: {
      type: 'object',
      properties: {
        suite: { type: 'string', description: 'unit | e2e | smoke | full' },
        useHyperExecute: { type: 'boolean', description: 'Not supported; runs locally' },
      },
    },
  },
  {
    name: 'test_runner',
    description: 'Alias for tests_orchestrator',
    inputSchema: {
      type: 'object',
      properties: {
        suite: { type: 'string', description: 'unit | e2e | smoke | full' },
        useHyperExecute: { type: 'boolean', description: 'Not supported; runs locally' },
      },
    },
  },
  {
    name: 'audit_accessibility',
    description: 'Verify Accessibility Testing Setup',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_csp',
    description: 'Verify Content Security Policy',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'audit_performance',
    description: 'Verify Performance Optimization Config',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'check_health',
    description: 'Run type-check and lint across workspace',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_map',
    description: 'Generate a map of the project structure',
    inputSchema: {
      type: 'object',
      properties: { maxDepth: { type: 'number', description: 'Max depth (default 3)' } },
    },
  },
  {
    name: 'read_files',
    description: 'Read contents of multiple files',
    inputSchema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string' } } },
      required: ['files'],
    },
  },
  {
    name: 'git_status',
    description: 'Get git status of the repository',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'git_diff',
    description: 'Get git diff of the repository',
    inputSchema: {
      type: 'object',
      properties: { cached: { type: 'boolean', description: 'Show staged changes' } },
    },
  },
  {
    name: 'code_search',
    description: 'Search for text in code files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        filePattern: { type: 'string', description: 'Optional glob pattern' },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_db',
    description: 'Execute read-only SQL query against local Postgres',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'SQL query text' },
        params: { type: 'array', items: { type: 'string' }, description: 'Query parameters' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_paddle_resource',
    description: 'Fetch a resource from Paddle (subscription, customer, etc)',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', enum: ['subscriptions', 'customers', 'products', 'prices'] },
        id: { type: 'string', description: 'ID of the resource to fetch' },
      },
      required: ['resource', 'id'],
    },
  },
];
