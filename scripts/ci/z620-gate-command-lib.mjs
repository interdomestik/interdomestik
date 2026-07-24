import { Z620_EXECUTABLES } from './managed-executables.mjs';

const command = (executable, args) =>
  Object.freeze({ command: executable, args: Object.freeze(args) });

const COMMANDS = new Map([
  [
    'validation-surface',
    command(Z620_EXECUTABLES.node, ['scripts/ci/z620-validation-surface.mjs']),
  ],
  ['repo-size-check', command(Z620_EXECUTABLES.pnpm, ['repo:size:check'])],
  ['check-env-ci', command(Z620_EXECUTABLES.node, ['scripts/check-env-ci.mjs'])],
  ['test-ci-contracts', command(Z620_EXECUTABLES.pnpm, ['test:ci:contracts'])],
  ['check-e2e-contracts-base', command(Z620_EXECUTABLES.pnpm, ['check:e2e-contracts:base'])],
  ['lint-production-warnings', command(Z620_EXECUTABLES.pnpm, ['lint:production-warnings'])],
  ['track-audit', command(Z620_EXECUTABLES.pnpm, ['track:audit'])],
  ['plan-audit', command(Z620_EXECUTABLES.pnpm, ['plan:audit'])],
  ['purity-audit', command(Z620_EXECUTABLES.pnpm, ['purity:audit'])],
  ['migration-journal-check', command(Z620_EXECUTABLES.pnpm, ['db:migrations:check-journal'])],
  ['e2e-quarantine-budget', command(Z620_EXECUTABLES.pnpm, ['check:e2e-quarantine-budget'])],
  ['workspace-lint', command(Z620_EXECUTABLES.pnpm, ['-w', 'lint'])],
  ['workspace-type-check', command(Z620_EXECUTABLES.pnpm, ['-w', 'type-check'])],
  ['workspace-entrypoints', command(Z620_EXECUTABLES.pnpm, ['-w', 'check:entrypoints:strict'])],
  ['workspace-i18n', command(Z620_EXECUTABLES.pnpm, ['-w', 'i18n:check'])],
  ['workspace-i18n-purity', command(Z620_EXECUTABLES.pnpm, ['-w', 'i18n:purity:check'])],
  ['coverage-gate', command(Z620_EXECUTABLES.pnpm, ['coverage:gate'])],
  ['release-gate-tests', command(Z620_EXECUTABLES.pnpm, ['test:release-gate'])],
  ['ai-eval', command(Z620_EXECUTABLES.pnpm, ['ai:eval'])],
  ['db-migrate', command(Z620_EXECUTABLES.pnpm, ['db:migrate'])],
  ['db-rls-required', command(Z620_EXECUTABLES.pnpm, ['db:rls:test:required'])],
  ['web-build', command(Z620_EXECUTABLES.pnpm, ['--filter', '@interdomestik/web', 'build'])],
  ['security-guard', command(Z620_EXECUTABLES.pnpm, ['security:guard'])],
  ['z620-security-audit', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-security-audit.mjs'])],
  ['e2e-gate-pr', command(Z620_EXECUTABLES.pnpm, ['e2e:gate:pr'])],
  ['e2e-gate', command(Z620_EXECUTABLES.pnpm, ['e2e:gate'])],
  ['pilot-run', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-pilot-run.mjs'])],
]);

export function resolveGateCommand(commandId) {
  const definition = COMMANDS.get(commandId);
  if (!definition) throw new Error(`Unknown gate command ${commandId}`);
  return definition;
}

export function validateGateCommandIds(gates) {
  const problems = [];
  for (const [lane, definition] of Object.entries(gates.lanes ?? {})) {
    for (const commandId of definition.commands ?? []) {
      if (typeof commandId !== 'string' || !COMMANDS.has(commandId)) {
        problems.push(`${lane}: unknown gate command ${JSON.stringify(commandId)}`);
      }
    }
  }
  return problems;
}
