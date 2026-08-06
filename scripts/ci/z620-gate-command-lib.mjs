import path from 'node:path';
import { Z620_EXECUTABLES } from './managed-executables.mjs';

const TASK_DATABASE_ENV = {
  E2E_DATABASE_URL: '$TASK_DATABASE_URL',
  E2E_DATABASE_URL_RLS: '$TASK_DATABASE_URL',
};
const COVERAGE_ENV = {
  UPSTASH_REDIS_REST_TOKEN: 'dummy-token',
  UPSTASH_REDIS_REST_URL: 'http://localhost:8080',
};
const PR_GATE_ENV = { PW_EVIDENCE_LANE: 'pr-gate' };
const PR_SMOKE_ENV = { PW_EVIDENCE_LANE: 'pr-smoke' };

function frozenEnv(values = {}) {
  return Object.freeze({ ...values });
}

function command(executable, args, executionEnv = {}, normalizedEnvContract = executionEnv) {
  return Object.freeze({
    command: executable,
    args: Object.freeze([...args]),
    executionEnv: frozenEnv(executionEnv),
    normalizedEnvContract: frozenEnv(normalizedEnvContract),
  });
}

const EXACT_SUBSTITUTABLE_COMMANDS = new Set();
function exactCommand(id, executable, args, executionEnv, normalizedEnvContract) {
  EXACT_SUBSTITUTABLE_COMMANDS.add(id);
  return [id, command(executable, args, executionEnv, normalizedEnvContract)];
}

const COMMANDS = new Map([
  [
    'validation-surface',
    command(Z620_EXECUTABLES.node, ['scripts/ci/z620-validation-surface.mjs']),
  ],
  exactCommand('repo-size-check', Z620_EXECUTABLES.pnpm, ['repo:size:check']),
  ['check-env-ci', command(Z620_EXECUTABLES.node, ['scripts/check-env-ci.mjs'])],
  exactCommand('test-ci-contracts', Z620_EXECUTABLES.pnpm, ['test:ci:contracts']),
  exactCommand('check-e2e-contracts-base', Z620_EXECUTABLES.pnpm, ['check:e2e-contracts']),
  exactCommand('check-db-access', Z620_EXECUTABLES.pnpm, ['check:db-access']),
  exactCommand('check-architecture-boundaries', Z620_EXECUTABLES.pnpm, [
    'check:architecture-boundaries',
  ]),
  exactCommand('lint-production-warnings', Z620_EXECUTABLES.pnpm, ['lint:production-warnings']),
  ['track-audit', command(Z620_EXECUTABLES.pnpm, ['track:audit'])],
  ['plan-audit', command(Z620_EXECUTABLES.pnpm, ['plan:audit'])],
  ['purity-audit', command(Z620_EXECUTABLES.pnpm, ['purity:audit'])],
  exactCommand('migration-journal-check', Z620_EXECUTABLES.pnpm, ['db:migrations:check-journal']),
  exactCommand('e2e-quarantine-budget', Z620_EXECUTABLES.pnpm, ['check:e2e-quarantine-budget']),
  ['workspace-lint', command(Z620_EXECUTABLES.pnpm, ['-w', 'lint'])],
  ['workspace-type-check', command(Z620_EXECUTABLES.pnpm, ['-w', 'type-check'])],
  ['workspace-entrypoints', command(Z620_EXECUTABLES.pnpm, ['-w', 'check:entrypoints:strict'])],
  exactCommand('workspace-i18n', Z620_EXECUTABLES.pnpm, ['-w', 'i18n:check']),
  ['workspace-i18n-purity', command(Z620_EXECUTABLES.pnpm, ['-w', 'i18n:purity:check'])],
  exactCommand('coverage-gate', Z620_EXECUTABLES.pnpm, ['coverage:gate'], COVERAGE_ENV),
  exactCommand('release-gate-tests', Z620_EXECUTABLES.pnpm, ['test:release-gate']),
  ['ai-eval', command(Z620_EXECUTABLES.pnpm, ['ai:eval'])],
  ['db-migrate', command(Z620_EXECUTABLES.pnpm, ['db:migrate'])],
  ['db-rls-required', command(Z620_EXECUTABLES.pnpm, ['db:rls:test:required'])],
  ['web-build', command(Z620_EXECUTABLES.pnpm, ['--filter', '@interdomestik/web', 'build'])],
  exactCommand('security-guard', Z620_EXECUTABLES.pnpm, ['security:guard']),
  ['z620-security-audit', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-security-audit.mjs'])],
  exactCommand('e2e-gate-pr', Z620_EXECUTABLES.pnpm, ['e2e:gate:pr'], PR_GATE_ENV, {
    ...TASK_DATABASE_ENV,
    ...PR_GATE_ENV,
  }),
  exactCommand(
    'e2e-smoke',
    Z620_EXECUTABLES.pnpm,
    ['--filter', '@interdomestik/web', 'run', 'e2e:smoke'],
    PR_SMOKE_ENV,
    { ...TASK_DATABASE_ENV, ...PR_SMOKE_ENV }
  ),
  ['e2e-gate', command(Z620_EXECUTABLES.pnpm, ['e2e:gate'])],
  ['pilot-run', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-pilot-run.mjs'])],
]);

export function resolveGateCommand(commandId) {
  const definition = COMMANDS.get(commandId);
  if (!definition) throw new Error(`Unknown gate command ${commandId}`);
  return definition;
}

export const knownGateCommandIds = () => new Set(COMMANDS.keys());
export const exactSubstitutableGateCommandIds = () => new Set(EXACT_SUBSTITUTABLE_COMMANDS);
export const gateCommandEnvironment = (environment, commandId) => ({
  ...environment,
  ...resolveGateCommand(commandId).executionEnv,
});

export function expectedGateCommandRecord(commandId, metadata) {
  const definition = resolveGateCommand(commandId);
  const compare = (left, right) => left.localeCompare(right);
  return {
    commandId,
    argv: [path.basename(definition.command), ...definition.args],
    env: definition.normalizedEnvContract,
    projects: [...metadata.projects].sort(compare),
    specs: [...metadata.specs].sort(compare),
  };
}
