import { accessSync, constants, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node provenance belongs to the invoking runtime, including isolated CI toolcaches.
// These wrappers validate newly selected tools; they cannot re-attest their own running engine.
const nodeExecutable = realpathSync(process.execPath);
const root = fileURLToPath(new URL('..', import.meta.url));
// Equivalent execution-control exclusions to the QA boundary; retain application/DB values.
const blockedEnv = new Set([
  'ALL_PROXY',
  'BASH_ENV',
  'CDPATH',
  'ENV',
  'GIT_ASKPASS',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_ATTR_SOURCE',
  'GIT_CEILING_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_DIR',
  'GIT_DISCOVERY_ACROSS_FILESYSTEM',
  'GIT_EDITOR',
  'GIT_EXEC_PATH',
  'GIT_EXTERNAL_DIFF',
  'GIT_INDEX_FILE',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_PAGER',
  'GIT_PROXY_COMMAND',
  'GIT_REPLACE_REF_BASE',
  'GIT_SEQUENCE_EDITOR',
  'GIT_SHALLOW_FILE',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_TEMPLATE_DIR',
  'GIT_WORK_TREE',
  'GLOBIGNORE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'PS4',
  'SHELL',
  'SHELLOPTS',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'SSH_ASKPASS',
  'ZDOTDIR',
]);

// Developer tools may be installed by this user or root, never by another account.
function checkOwnedPath(file) {
  for (let current = file; ; current = dirname(current)) {
    const info = statSync(current);
    const trustedOwner = info.uid === 0 || info.uid === process.getuid();
    // Homebrew is admin-group writable on macOS; administrators are already privileged.
    const adminGroup = process.platform === 'darwin' && info.gid === 80;
    const unsafeWrites = (info.mode & 0o002) !== 0 || ((info.mode & 0o020) !== 0 && !adminGroup);
    // A root-owned sticky temp ancestor cannot replace a separately checked owned child.
    const stickyRoot =
      current !== file && info.isDirectory() && info.uid === 0 && (info.mode & 0o1000) !== 0;
    if (!trustedOwner || (unsafeWrites && !stickyRoot)) {
      throw new Error('refused an untrusted executable installation');
    }
    if (current === dirname(current)) return;
  }
}

export function checkedPackageExecutable(candidate) {
  checkOwnedPath(realpathSync(dirname(candidate)));
  const executable = realpathSync(candidate);
  checkOwnedPath(executable);
  if (!statSync(executable).isFile()) throw new Error('executable is not a regular file');
  accessSync(executable, constants.X_OK);
  return executable;
}

// Validate PATH and build the controlled child environment as a single boundary.
// pnpm's env-node shebang must use the already-running, checked Node installation.
function buildChildEnv() {
  // Trust in the loaded engine does not authorize siblings for future PATH lookups.
  checkOwnedPath(dirname(nodeExecutable));
  const directories = (process.env.PATH ?? '').split(delimiter);
  if (directories.some(directory => !isAbsolute(directory))) {
    throw new Error('refused relative or empty executable search directories');
  }
  // Validate the whole search path, including any interpreter used by a tool's shebang.
  const safeDirectories = directories.flatMap(directory => {
    try {
      const canonical = realpathSync(directory);
      checkOwnedPath(canonical);
      return [canonical];
    } catch {
      return [];
    }
  });
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => {
        const normalized = key.toUpperCase();
        return (
          !blockedEnv.has(normalized) &&
          !/^(COREPACK_|NPM_CONFIG_|PNPM_CONFIG_|GIT_CONFIG_|LD_|DYLD_|BASH_FUNC_)/.test(normalized)
        );
      })
    ),
    PATH: [dirname(nodeExecutable), ...safeDirectories].join(delimiter),
    COREPACK_ENABLE_PROJECT_SPEC: '1',
    COREPACK_ENABLE_STRICT: '1',
    COREPACK_ENABLE_NETWORK: '0',
    npm_config_manage_package_manager_versions: 'false',
  };
}

function matchesPinnedPnpm(executable, env, expected) {
  const version = spawnSync(executable, ['--version'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  return version.status === 0 && `pnpm@${version.stdout.trim()}` === expected;
}

export function packageCommandRuntime(name) {
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error(
      'Package command wrappers require macOS or Linux (POSIX); Windows is not supported.'
    );
  if (!['pnpm', 'lsof'].includes(name)) throw new Error('unsupported package command tool');
  const env = buildChildEnv();
  // Executable identity never comes from caller PATH. Support the pinned Node install,
  // Homebrew and system installations; PATH is only a filtered child environment.
  const candidates =
    name === 'pnpm'
      ? [
          join(dirname(process.execPath), 'pnpm'),
          '/opt/homebrew/bin/pnpm',
          '/usr/local/bin/pnpm',
          '/usr/bin/pnpm',
          join(userInfo().homedir, 'setup-pnpm/node_modules/.bin/pnpm'),
          join(userInfo().homedir, '.local/share/pnpm/pnpm'),
          join(userInfo().homedir, 'Library/pnpm/pnpm'),
        ]
      : ['/usr/sbin/lsof', '/usr/bin/lsof'];
  const expected = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ).packageManager;
  for (const candidate of candidates) {
    try {
      lstatSync(candidate);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
    let executable;
    try {
      executable = checkedPackageExecutable(candidate);
    } catch {
      continue;
    } // Exclude unsafe installations; never execute them as a fallback.
    if (name === 'pnpm' && !matchesPinnedPnpm(executable, env, expected)) continue;
    return {
      executable,
      env,
    };
  }
  throw new Error(
    `No safe ${name} executable found. This repository requires ${expected}. Install pnpm beside Node, in Homebrew/system bin, or the standard user pnpm/pnpm-action directory; install lsof in /usr/sbin or /usr/bin. Installations must be owned by you or root without unprivileged write access. No operational command was launched.`
  );
}
