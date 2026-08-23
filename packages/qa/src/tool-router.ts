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
import { resolveToolRepoRoot, unresolvedToolRepoContext } from './utils/tool-repo-root.js';

type Handler = (args: any) => Promise<any>;
type RepoAudit = (repoRoot: string) => Promise<any>;

async function runRepoAudit(args: any, audit: RepoAudit) {
  const context = resolveToolRepoRoot(args);
  const result = await audit(context.repoRoot);
  return {
    ...result,
    structuredContent: { ...(result.structuredContent ?? {}), ...context },
  };
}

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
  audit_dependencies: args => runRepoAudit(args, auditDependencies),
  dependency_audit: args => runRepoAudit(args, auditDependencies),
  audit_supabase: args => runRepoAudit(args, auditSupabase),
  audit_accessibility: args => runRepoAudit(args, auditAccessibility),
  audit_csp: args => runRepoAudit(args, auditCsp),
  audit_performance: args => runRepoAudit(args, auditPerformance),
  audit_navigation: args => runRepoAudit(args, auditNavigation),
  audit_auth: args => runRepoAudit(args, auditAuth),
  audit_env: args => runRepoAudit(args, auditEnv),
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
  let context:
    ReturnType<typeof resolveToolRepoRoot> | ReturnType<typeof unresolvedToolRepoContext> =
    unresolvedToolRepoContext();
  try {
    context = resolveToolRepoRoot(args ?? {});
    const handler = handlers[name];
    if (!handler) {
      throw new Error(`Tool ${name} not found`);
    }
    const result = await handler(args ?? {});
    const after = resolveToolRepoRoot(args ?? {});
    if (
      after.serverSourceHead !== context.serverSourceHead ||
      after.serverSourceRoot !== context.serverSourceRoot ||
      after.targetHead !== context.targetHead ||
      after.targetBranch !== context.targetBranch ||
      after.targetRepoRoot !== context.targetRepoRoot
    ) {
      throw new Error('MCP source or target identity changed during the tool call');
    }
    return {
      ...result,
      structuredContent: { ...(result.structuredContent ?? {}), ...context },
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: error?.message || 'Repo-bound tool failed' }],
      isError: true,
      structuredContent: { ...context, status: 'error', tool: name },
    };
  }
}
