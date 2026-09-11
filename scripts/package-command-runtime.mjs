import { accessSync, constants, lstatSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';

// Developer tools may be installed by this user or root, never by another account.
function checkOwnedPath(file) {
  for (let current = file; ; current = dirname(current)) {
    const info = statSync(current);
    const trustedOwner = info.uid === 0 || info.uid === process.getuid();
    // Homebrew is admin-group writable on macOS; administrators are already privileged.
    const adminGroup = process.platform === 'darwin' && info.gid === 80;
    const unsafeWrites = (info.mode & 0o002) !== 0 || ((info.mode & 0o020) !== 0 && !adminGroup);
    // A root-owned sticky temp ancestor cannot replace a separately checked owned child.
    const stickyRoot = info.isDirectory() && info.uid === 0 && (info.mode & 0o1000) !== 0;
    if (!trustedOwner || (unsafeWrites && !stickyRoot)) {
      throw new Error('refused an untrusted executable installation');
    }
    if (current === dirname(current)) return;
  }
}

export function packageCommandRuntime(name) {
  if (!['pnpm', 'lsof'].includes(name)) throw new Error('unsupported package command tool');
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
  // pnpm's env-node shebang must use the already-running, checked Node installation.
  const nodeExecutable = realpathSync(process.execPath);
  checkOwnedPath(nodeExecutable);
  for (const directory of safeDirectories) {
    const candidate = join(directory, name);
    try {
      lstatSync(candidate);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue;
      throw error;
    }
    // Check both the lookup directory and the resolved target; symlinks cannot bypass trust.
    checkOwnedPath(realpathSync(directory));
    const executable = realpathSync(candidate);
    checkOwnedPath(executable);
    if (!statSync(executable).isFile()) throw new Error('executable is not a regular file');
    accessSync(executable, constants.X_OK);
    return {
      executable,
      env: { ...process.env, PATH: [dirname(nodeExecutable), ...safeDirectories].join(delimiter) },
    };
  }
  throw new Error(
    `No safe ${name} executable found. Install it in an absolute PATH directory owned by you or root, without write access for unprivileged groups or other users.`
  );
}
