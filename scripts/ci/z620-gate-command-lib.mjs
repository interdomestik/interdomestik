import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Z620_EXECUTABLES } from './managed-executables.mjs';

const command = (executable, args) =>
  Object.freeze({ command: executable, args: Object.freeze(args) });
const compare = (left, right) => left.localeCompare(right);
export const sortedGateStrings = values => [...values].sort(compare);
export const isGateRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const sortedUniqueGateStrings = values =>
  Array.isArray(values) &&
  values.every(value => typeof value === 'string') &&
  isDeepStrictEqual(values, sortedGateStrings(new Set(values)));
const safeSpec = value =>
  typeof value === 'string' &&
  value.startsWith('e2e/') &&
  !value.includes('\\') &&
  !path.posix.isAbsolute(value) &&
  path.posix.normalize(value) === value;
const EXACT_SUBSTITUTABLE_COMMANDS = new Set();
const exactCommand = (id, executable, args) => {
  EXACT_SUBSTITUTABLE_COMMANDS.add(id);
  return [id, command(executable, args)];
};

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
  exactCommand('coverage-gate', Z620_EXECUTABLES.pnpm, ['coverage:gate']),
  exactCommand('release-gate-tests', Z620_EXECUTABLES.pnpm, ['test:release-gate']),
  ['ai-eval', command(Z620_EXECUTABLES.pnpm, ['ai:eval'])],
  ['db-migrate', command(Z620_EXECUTABLES.pnpm, ['db:migrate'])],
  ['db-rls-required', command(Z620_EXECUTABLES.pnpm, ['db:rls:test:required'])],
  ['web-build', command(Z620_EXECUTABLES.pnpm, ['--filter', '@interdomestik/web', 'build'])],
  exactCommand('security-guard', Z620_EXECUTABLES.pnpm, ['security:guard']),
  ['z620-security-audit', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-security-audit.mjs'])],
  exactCommand('e2e-gate-pr', Z620_EXECUTABLES.pnpm, ['e2e:gate:pr']),
  exactCommand('e2e-smoke', Z620_EXECUTABLES.pnpm, [
    '--filter',
    '@interdomestik/web',
    'run',
    'e2e:smoke',
  ]),
  ['e2e-gate', command(Z620_EXECUTABLES.pnpm, ['e2e:gate'])],
  ['pilot-run', command(Z620_EXECUTABLES.node, ['scripts/ci/z620-pilot-run.mjs'])],
]);
export function resolveGateCommand(commandId) {
  const definition = COMMANDS.get(commandId);
  if (!definition) throw new Error(`Unknown gate command ${commandId}`);
  return definition;
}
export function knownGateCommandIds() {
  return new Set(COMMANDS.keys());
}
export function exactSubstitutableGateCommandIds() {
  return new Set(EXACT_SUBSTITUTABLE_COMMANDS);
}
export function validateGateCommandMetadata(commandId, metadata, label = 'metadata') {
  if (!isGateRecord(metadata)) return [`${commandId}: ${label} must be an object`];
  const problems = [];
  const allowed =
    label === 'metadata'
      ? ['env', 'projects', 'specs']
      : ['argv', 'commandId', 'env', 'projects', 'specs'];
  for (const key of Object.keys(metadata)) {
    if (!allowed.includes(key)) problems.push(`${commandId}: unknown ${label} key ${key}`);
  }
  if (!isGateRecord(metadata.env)) problems.push(`${commandId}: env must be an object`);
  else if (!Object.values(metadata.env).every(value => typeof value === 'string')) {
    problems.push(`${commandId}: env values must be strings`);
  }
  for (const key of ['projects', 'specs']) {
    if (!Array.isArray(metadata[key])) problems.push(`${commandId}: ${key} must be an array`);
    else if (!sortedUniqueGateStrings(metadata[key])) {
      problems.push(`${commandId}: ${key} must be sorted and unique`);
    }
  }
  if (Array.isArray(metadata.specs)) {
    for (const spec of metadata.specs) {
      if (!safeSpec(spec)) problems.push(`${commandId}: unsafe spec ${JSON.stringify(spec)}`);
    }
  }
  return problems;
}

export function expectedGateCommandRecord(commandId, metadata) {
  const definition = resolveGateCommand(commandId);
  return {
    commandId,
    argv: [path.basename(definition.command), ...definition.args],
    env: metadata.env,
    projects: sortedGateStrings(metadata.projects),
    specs: sortedGateStrings(metadata.specs),
  };
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

export function validateLaneCoverage(required, gates) {
  const covered = sortedGateStrings(Object.keys(gates.jobCoverage ?? {}));
  const problems = [];
  for (const key of required)
    if (!covered.includes(key)) problems.push(`${key}: missing local gate coverage`);
  for (const key of covered) {
    if (!required.includes(key)) problems.push(`${key}: unknown or excluded job coverage`);
    const lanes = gates.jobCoverage[key];
    if (!Array.isArray(lanes) || lanes.length === 0)
      problems.push(`${key}: local gate coverage must name a lane`);
    else
      for (const lane of lanes)
        if (!gates.lanes?.[lane]) problems.push(`${key}: unknown lane ${lane}`);
  }
  for (const [lane, definition] of Object.entries(gates.lanes ?? {})) {
    if (!Array.isArray(definition.commands) || definition.commands.length === 0)
      problems.push(`${lane}: lane has no commands`);
  }
  return problems;
}
