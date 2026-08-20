import { withRepoRoot } from './repo-root-schema.js';

const EMPTY_INPUT_SCHEMA = { type: 'object', properties: {} };
const REPO_INPUT_SCHEMA = withRepoRoot();

const TEST_SUITE_DESCRIPTION =
  'unit | e2e | smoke | pr_verify | security_guard | e2e_gate | build_ci | check_fast | ' +
  'e2e_state_setup | e2e_gate_pr_fast | pr_verify_hosts | full';

const TEST_ORCHESTRATOR_INPUT_SCHEMA = {
  ...withRepoRoot({
    suite: {
      type: 'string',
      description: TEST_SUITE_DESCRIPTION,
    },
    useHyperExecute: { type: 'boolean', description: 'Not supported; runs locally' },
  }),
};

const CHANGED_FILES_INPUT_SCHEMA = withRepoRoot({
  staged: { type: 'boolean', description: 'Show staged changes only' },
});

const CODE_SEARCH_INPUT_SCHEMA = withRepoRoot(
  {
    after: { type: 'number', description: 'Trailing context lines per match' },
    before: { type: 'number', description: 'Leading context lines per match' },
    filePattern: { type: 'string', description: 'Optional ripgrep glob pattern' },
    maxResults: { type: 'number', description: 'Maximum matches per searched file' },
    query: { type: 'string' },
  },
  ['query']
);

const READ_FILE_RANGE_INPUT_SCHEMA = withRepoRoot(
  {
    context: { type: 'number', description: 'Extra lines before and after the requested range' },
    endLine: { type: 'number', description: 'End line, 1-based' },
    file: { type: 'string', description: 'Repository-relative file path' },
    startLine: { type: 'number', description: 'Start line, 1-based' },
  },
  ['file']
);

const SCOPE_AUDIT_INPUT_SCHEMA = withRepoRoot({
  allowedPaths: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional repository-relative path prefixes that changed files must stay within',
  },
  forbiddenPaths: {
    type: 'array',
    items: { type: 'string' },
    description: 'Optional repository-relative path prefixes that must not be changed',
  },
});

function createNoArgTool(name: string, description: string) {
  return {
    name,
    description,
    inputSchema: EMPTY_INPUT_SCHEMA,
  };
}

function createRepoNoArgTool(name: string, description: string) {
  return { name, description, inputSchema: REPO_INPUT_SCHEMA };
}

const phaseCVerificationTools = [
  createRepoNoArgTool(
    'check_health',
    'Run the full Phase C verification contract (pr:verify, security:guard, e2e:gate)'
  ),
  createRepoNoArgTool('pr_verify', 'Run pnpm pr:verify for the repo verification contract'),
  createRepoNoArgTool('security_guard', 'Run pnpm security:guard for the repo security contract'),
  createRepoNoArgTool('e2e_gate', 'Run pnpm e2e:gate for the repo end-to-end gate contract'),
  createRepoNoArgTool(
    'build_ci',
    'Run the CI-grade web build command used by the repo verification flow'
  ),
  createRepoNoArgTool(
    'check_fast',
    'Run pnpm check:fast for the repo build and fast-gate verification path'
  ),
  createRepoNoArgTool('e2e_state_setup', 'Run the deterministic E2E auth state setup flow only'),
  createRepoNoArgTool(
    'e2e_gate_pr_fast',
    'Run the fast PR-oriented E2E gate without the full PR verify contract'
  ),
  createRepoNoArgTool(
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
  createRepoNoArgTool('run_unit_tests', 'Run unit tests for the web application using Vitest'),
  createRepoNoArgTool('run_coverage', 'Run unit tests with coverage for the web application'),
  createRepoNoArgTool('run_e2e_tests', 'Run E2E tests for the web application using Playwright'),
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
    inputSchema: withRepoRoot({
      maxDepth: { type: 'number', description: 'Max depth (default 3)' },
    }),
  },
  {
    name: 'read_files',
    description: 'Read contents of multiple files',
    inputSchema: withRepoRoot({ files: { type: 'array', items: { type: 'string' } } }, ['files']),
  },
  {
    name: 'read_file_range',
    description: 'Read a numbered repository file range with optional surrounding context',
    inputSchema: READ_FILE_RANGE_INPUT_SCHEMA,
  },
  {
    name: 'git_status',
    description: 'Get git status of the repository',
    inputSchema: REPO_INPUT_SCHEMA,
  },
  {
    name: 'git_status_compact',
    description: 'Get compact branch and changed-file status for the repository',
    inputSchema: REPO_INPUT_SCHEMA,
  },
  {
    name: 'git_branch_info',
    description: 'Get current branch, head SHA, upstream, ahead count, and behind count',
    inputSchema: REPO_INPUT_SCHEMA,
  },
  {
    name: 'git_diff',
    description: 'Get git diff of the repository',
    inputSchema: withRepoRoot({
      cached: { type: 'boolean', description: 'Show staged changes' },
    }),
  },
  {
    name: 'changed_files',
    description: 'List changed files from git status or staged diff using structured output',
    inputSchema: CHANGED_FILES_INPUT_SCHEMA,
  },
  {
    name: 'scope_audit',
    description: 'Audit changed files against allowed and forbidden repository path prefixes',
    inputSchema: SCOPE_AUDIT_INPUT_SCHEMA,
  },
  {
    name: 'code_search',
    description: 'Search code with ripgrep first and git-grep fallback',
    inputSchema: CODE_SEARCH_INPUT_SCHEMA,
  },
  {
    name: 'query_db',
    description: 'Execute read-only SQL query against local Postgres',
    inputSchema: withRepoRoot(
      {
        text: { type: 'string', description: 'SQL query text' },
        params: { type: 'array', items: { type: 'string' }, description: 'Query parameters' },
      },
      ['text']
    ),
  },
  {
    name: 'get_paddle_resource',
    description: 'Fetch a resource from Paddle (subscription, customer, etc)',
    inputSchema: withRepoRoot(
      {
        resource: { type: 'string', enum: ['subscriptions', 'customers', 'products', 'prices'] },
        id: { type: 'string', description: 'ID of the resource to fetch' },
      },
      ['resource', 'id']
    ),
  },
];
