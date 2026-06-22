const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_WRAPPER_COMMANDS = new Set(['bash', 'node', 'pnpm', 'tsx']);
const EVAL_FLAGS_BY_COMMAND = new Map([
  ['bash', new Set(['-c', '--command'])],
  ['node', new Set(['-e', '--eval', '-p', '--print'])],
  ['tsx', new Set(['-e', '--eval'])],
]);

function trustedExecutableDirs(env = process.env) {
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    env.HOME && path.join(env.HOME, '.npm-global/bin'),
    env.HOME && path.join(env.HOME, 'Library/pnpm'),
  ].filter(Boolean);
}

function isPathInside(candidate, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveTrustedExecutable(candidates, options = {}) {
  const executableName = options.executableName;
  const trustedDirs = options.trustedDirs || trustedExecutableDirs(options.env);

  for (const rawCandidate of candidates.filter(Boolean)) {
    const candidate = path.resolve(String(rawCandidate));
    if (executableName && path.basename(candidate) !== executableName) continue;
    if (!trustedDirs.some(dir => isPathInside(candidate, dir))) continue;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore unusable candidate paths and continue.
    }
  }
  return null;
}

function assertSafeWrapperArgs(command, args = []) {
  const evalFlags = EVAL_FLAGS_BY_COMMAND.get(command);
  if (!evalFlags) return;

  for (const arg of args) {
    const value = String(arg || '');
    if (evalFlags.has(value)) {
      throw new Error(`Wrapper command ${command} cannot use shell/eval flag: ${value}`);
    }
  }
}

function resolveAllowedCommand(command, args = []) {
  const normalized = String(command || '').trim();
  if (!ALLOWED_WRAPPER_COMMANDS.has(normalized)) {
    throw new Error(`Unsupported wrapper command: ${normalized || '<empty>'}`);
  }
  if (normalized.includes('/') || normalized.includes('\\')) {
    throw new Error('Wrapper command must be a bare executable name');
  }
  assertSafeWrapperArgs(normalized, args);
  return normalized;
}

module.exports = {
  ALLOWED_WRAPPER_COMMANDS,
  assertSafeWrapperArgs,
  resolveAllowedCommand,
  resolveTrustedExecutable,
  trustedExecutableDirs,
};
