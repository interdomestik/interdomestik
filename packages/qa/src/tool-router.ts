import {
  auditAccessibility,
  auditAuth,
  auditCsp,
  auditDependencies,
  auditEnv,
  auditNavigation,
  auditPerformance,
  auditSupabase,
} from './tools/audits.js';
import {
  changedFiles,
  codeSearch,
  gitBranchInfo,
  gitDiff,
  gitStatus,
  gitStatusCompact,
  projectMap,
  readFileRange,
  readFiles,
  scopeAudit,
} from './tools/repo.js';
import { checkHealth } from './tools/health.js';
import {
  runBuildCi,
  runCoverage,
  runE2EGate,
  runE2EGatePrFast,
  runE2EStateSetup,
  runE2ETests,
  runCheckFast,
  runPrVerify,
  runPrVerifyHosts,
  runSecurityGuard,
  runTestsOrchestrator,
  runUnitTests,
} from './tools/tests.js';
import { queryDb } from './tools/db.js';
import { getPaddleResource } from './tools/paddle.js';
import { resolveToolRepoRoot } from './utils/tool-repo-root.js';

type Handler = (args: any) => Promise<any>;

const handlers: Record<string, Handler> = {
  project_map: args => projectMap(args),
  read_files: args => readFiles(args),
  read_file_range: args => readFileRange(args),
  git_status: args => gitStatus(args),
  git_status_compact: args => gitStatusCompact(args),
  git_branch_info: args => gitBranchInfo(args),
  git_diff: args => gitDiff(args),
  changed_files: args => changedFiles(args),
  scope_audit: args => scopeAudit(args),
  code_search: args => codeSearch(args),
  audit_dependencies: () => auditDependencies(),
  dependency_audit: () => auditDependencies(),
  audit_supabase: () => auditSupabase(),
  audit_accessibility: () => auditAccessibility(),
  audit_csp: () => auditCsp(),
  audit_performance: () => auditPerformance(),
  audit_navigation: () => auditNavigation(),
  audit_auth: () => auditAuth(),
  audit_env: () => auditEnv(),
  check_health: args => checkHealth(args),
  pr_verify: args => runPrVerify(args),
  security_guard: args => runSecurityGuard(args),
  e2e_gate: args => runE2EGate(args),
  build_ci: args => runBuildCi(args),
  check_fast: args => runCheckFast(args),
  e2e_state_setup: args => runE2EStateSetup(args),
  e2e_gate_pr_fast: args => runE2EGatePrFast(args),
  pr_verify_hosts: args => runPrVerifyHosts(args),
  run_unit_tests: args => runUnitTests(args),
  run_coverage: args => runCoverage(args),
  run_e2e_tests: args => runE2ETests(args),
  tests_orchestrator: args => runTestsOrchestrator(args),
  test_runner: args => runTestsOrchestrator(args),
  query_db: args => queryDb(args),
  get_paddle_resource: args => getPaddleResource(args),
};

export async function handleToolCall(name: string, args: any) {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Tool ${name} not found`);
  }
  try {
    return await handler(args ?? {});
  } catch (error: any) {
    let context = {};
    try {
      context = resolveToolRepoRoot(args ?? {});
    } catch {
      // Invalid or absent roots cannot be attested in the error result.
    }
    return {
      content: [{ type: 'text', text: error?.message || 'Repo-bound tool failed' }],
      isError: true,
      structuredContent: { ...context, status: 'error', tool: name },
    };
  }
}
