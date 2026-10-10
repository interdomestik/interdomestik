import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fixed system Git only; PATH, environment and candidate configuration never select the binary.
// macOS /usr/bin/git is an xcrun shim steered by DEVELOPER_DIR/TOOLCHAINS, so name Apple's binaries.
const SYSTEM_GIT = new Map([
  ['linux', ['/usr/bin/git', '/bin/git']],
  [
    'darwin',
    [
      '/Library/Developer/CommandLineTools/usr/bin/git',
      '/Applications/Xcode.app/Contents/Developer/usr/bin/git',
    ],
  ],
]);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function forbiddenRoots(fsApi) {
  return [os.tmpdir(), repoRoot].flatMap(root => {
    try {
      const real = fsApi.realpathSync(root);
      if (typeof real !== 'string' || !path.posix.isAbsolute(real) || real === '/')
        throw new Error('invalid root');
      return [real];
    } catch {
      throw new Error('incomplete: cannot authenticate git exclusion root');
    }
  });
}

function writable(fsApi, file) {
  try {
    fsApi.accessSync(file, fs.constants.W_OK);
    return true;
  } catch (error) {
    return !['EACCES', 'EPERM', 'EROFS'].includes(error?.code);
  }
}

// Follow every symlink hop so intermediate link directories are validated, not only the realpath.
function resolutionChain(fsApi, candidate) {
  const visited = ['/'];
  let current = '/';
  let pending = candidate.split('/').filter(Boolean);
  for (let hops = 0; pending.length;) {
    const part = pending.shift();
    if (part === '.') continue;
    if (part === '..') {
      current = path.posix.dirname(current);
      continue;
    }
    const next = path.posix.join(current, part);
    visited.push(next);
    if (!fsApi.lstatSync(next).isSymbolicLink()) {
      current = next;
      continue;
    }
    if (++hops > 40) throw new Error('incomplete: git symlink depth exceeded');
    const target = fsApi.readlinkSync(next);
    if (target.startsWith('/')) current = '/';
    pending = [...target.split('/').filter(Boolean), ...pending];
  }
  return { real: current, visited };
}

// Exported for disposable-double tests; production selects only from SYSTEM_GIT.
export function validateGitExecutable(candidate, { fsApi = fs, forbidden } = {}) {
  if (typeof candidate !== 'string' || !path.posix.isAbsolute(candidate))
    throw new Error('incomplete: git executable must be absolute');
  let chain;
  try {
    chain = resolutionChain(fsApi, candidate);
  } catch (error) {
    if (String(error?.message).startsWith('incomplete:')) throw error;
    throw new Error(`incomplete: git executable unavailable ${candidate}`);
  }
  const { real, visited } = chain;
  const roots = forbidden ?? forbiddenRoots(fsApi);
  const uid = process.geteuid?.();
  if (!Number.isInteger(uid)) throw new Error('incomplete: effective user unavailable');
  for (const entry of visited) {
    if (roots.some(root => entry === root || entry.startsWith(root + '/')))
      throw new Error(`incomplete: git executable in untrusted location ${entry}`);
    let metadata;
    try {
      metadata = fsApi.lstatSync(entry);
    } catch {
      throw new Error('incomplete: cannot authenticate git path ownership');
    }
    if (!Number.isInteger(metadata.uid) || metadata.uid === uid)
      throw new Error(`incomplete: effective-user-owned or unknown git path ${entry}`);
    if (writable(fsApi, entry)) throw new Error(`incomplete: writable git path ${entry}`);
  }
  try {
    if (fsApi.realpathSync(candidate) !== real) throw new Error('changed');
    if (!fsApi.statSync(real).isFile()) throw new Error('not file');
    fsApi.accessSync(real, fs.constants.X_OK);
  } catch {
    throw new Error(`incomplete: git executable not a stable executable file ${candidate}`);
  }
  return real;
}

export function selectSystemGit({ platform = process.platform, fsApi = fs, forbidden } = {}) {
  const candidates = SYSTEM_GIT.get(platform);
  if (!candidates) throw new Error(`incomplete: unsupported platform for trusted git ${platform}`);
  const rejected = [];
  for (const candidate of candidates) {
    try {
      return validateGitExecutable(candidate, { fsApi, forbidden });
    } catch (error) {
      rejected.push(error.message);
    }
  }
  throw new Error(`incomplete: no trustworthy system git (${rejected.join('; ')})`);
}

let trustedGit;
export function runGit(args, { input, encoding } = {}) {
  trustedGit ??= selectSystemGit();
  return execFileSync(trustedGit, args, {
    input,
    ...(encoding && { encoding }),
    maxBuffer: 96 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      PATH: '/usr/bin:/bin',
    },
  });
}
