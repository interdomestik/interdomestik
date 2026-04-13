const EMPTY_INPUT_SCHEMA = { type: 'object', properties: {} };

const TEST_SUITE_DESCRIPTION =
  'unit | e2e | smoke | pr_verify | security_guard | e2e_gate | build_ci | check_fast | ' +
  'e2e_state_setup | e2e_gate_pr_fast | pr_verify_hosts | full';

const TEST_ORCHESTRATOR_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    suite: {
      type: 'string',
      description: TEST_SUITE_DESCRIPTION,
    },
    useHyperExecute: { type: 'boolean', description: 'Not supported; runs locally' },
  },
};

function createNoArgTool(name: string, description: string) {
  return {
    name,
    description,
    inputSchema: EMPTY_INPUT_SCHEMA,
  };
}

const phaseCVerificationTools = [
  createNoArgTool(
    'check_health',
    'Run the full Phase C verification contract (pr:verify, security:guard, e2e:gate)'
  ),
  createNoArgTool('pr_verify', 'Run pnpm pr:verify for the repo verification contract'),
  createNoArgTool('security_guard', 'Run pnpm security:guard for the repo security contract'),
  createNoArgTool('e2e_gate', 'Run pnpm e2e:gate for the repo end-to-end gate contract'),
  createNoArgTool(
    'build_ci',
    'Run the CI-grade web build command used by the repo verification flow'
  ),
  createNoArgTool(
    'check_fast',
    'Run pnpm check:fast for the repo build and fast-gate verification path'
  ),
  createNoArgTool('e2e_state_setup', 'Run the deterministic E2E auth state setup flow only'),
  createNoArgTool(
    'e2e_gate_pr_fast',
    'Run the fast PR-oriented E2E gate without the full PR verify contract'
  ),
  createNoArgTool(
    'pr_verify_hosts',
    'Run the host-routed PR verification variant for deterministic local verification'
  ),
];

export const tools = [
  createNoArgTool('audit_auth', 'Verify Better Auth configuration (files, env, proxy)'),
  createNoArgTool('audit_env', 'Verify Environment Variables for Interdomestik'),
  createNoArgTool('audit_navigation', 'Verify Navigation & Layout Structure (i18n, layouts)'),
  createNoArgTool('audit_dependencies', 'Verify Critical Dependencies & Package Configuration'),
  createNoArgTool('dependency_audit', 'Alias for audit_dependencies'),
  createNoArgTool('audit_supabase', 'Verify Supabase Environment & Connectivity (env vars only)'),
  createNoArgTool('run_unit_tests', 'Run unit tests for the web application using Vitest'),
  createNoArgTool('run_coverage', 'Run unit tests with coverage for the web application'),
  createNoArgTool('run_e2e_tests', 'Run E2E tests for the web application using Playwright'),
  {
    name: 'tests_orchestrator',
    description:
      'Run project verification suites (unit/e2e/smoke/pr_verify/security_guard/e2e_gate/build_ci/check_fast/e2e_state_setup/e2e_gate_pr_fast/pr_verify_hosts/full)',
    inputSchema: TEST_ORCHESTRATOR_INPUT_SCHEMA,
  },
  {
    name: 'test_runner',
    description: 'Alias for tests_orchestrator',
    inputSchema: TEST_ORCHESTRATOR_INPUT_SCHEMA,
  },
  createNoArgTool('audit_accessibility', 'Verify Accessibility Testing Setup'),
  createNoArgTool('audit_csp', 'Verify Content Security Policy'),
  createNoArgTool('audit_performance', 'Verify Performance Optimization Config'),
  ...phaseCVerificationTools,
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
