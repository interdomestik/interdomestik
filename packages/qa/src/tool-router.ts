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
import { codeSearch, gitDiff, gitStatus, projectMap, readFiles } from './tools/repo.js';
import { checkHealth } from './tools/health.js';
import { runCoverage, runE2ETests, runUnitTests } from './tools/tests.js';
import { queryDb } from './tools/db.js';
import { getStripeResource } from './tools/stripe.js';

type Handler = (args: any) => Promise<any>;

const handlers: Record<string, Handler> = {
  project_map: args => projectMap(args),
  read_files: args => readFiles(args),
  git_status: () => gitStatus(),
  git_diff: args => gitDiff(args),
  code_search: args => codeSearch(args),
  audit_dependencies: () => auditDependencies(),
  audit_supabase: () => auditSupabase(),
  audit_accessibility: () => auditAccessibility(),
  audit_csp: () => auditCsp(),
  audit_performance: () => auditPerformance(),
  audit_navigation: () => auditNavigation(),
  audit_auth: () => auditAuth(),
  audit_env: () => auditEnv(),
  check_health: () => checkHealth(),
  run_unit_tests: () => runUnitTests(),
  run_coverage: () => runCoverage(),
  run_e2e_tests: () => runE2ETests(),
  query_db: args => queryDb(args),
  get_stripe_resource: args => getStripeResource(args),
};

export async function handleToolCall(name: string, args: any) {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Tool ${name} not found`);
  }
  return handler(args ?? {});
}
