import { appendFileSync, mkdtempSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkOwnedPath,
  checkedPackageExecutable,
  packageCommandRuntime,
} from '../package-command-runtime.mjs';

export function preparePrivateNodeCache(temp) {
  if (!temp || !isAbsolute(temp) || /[\r\n]/.test(temp)) throw new Error('invalid runner temp');
  const parent = realpathSync(temp);
  checkOwnedPath(parent);
  if (!statSync(parent).isDirectory()) throw new Error('runner temp is not a directory');
  // mkdtemp creates an owned 0700 root; GitHub empties runner.temp at job teardown.
  return mkdtempSync(join(parent, 'interdomestik-node-'));
}

export function validateInstalledNode(cache, executable) {
  const root = realpathSync(cache);
  const node = realpathSync(executable);
  const within = relative(root, node);
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within))
    throw new Error('Node executable is outside private cache');
  if (statSync(root).uid !== process.getuid() || (statSync(root).mode & 0o777) !== 0o700)
    throw new Error('private cache must remain owned and mode 0700');
  return checkedPackageExecutable(node);
}

function verifyPrivateNode(cache) {
  const node = validateInstalledNode(cache, process.execPath);
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const wanted = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  if (process.versions.node !== wanted && !process.versions.node.startsWith(`${wanted}.`))
    throw new Error('installed Node does not match .nvmrc');
  const runtime = packageCommandRuntime('pnpm');
  const options = { cwd: root, env: runtime.env, encoding: 'utf8', timeout: 30000 };
  const nested = spawnSync(runtime.executable, ['exec', 'node', '-p', 'process.execPath'], options);
  if (nested.status !== 0 || realpathSync(nested.stdout.trim()) !== node)
    throw new Error('nested pnpm Node does not match the private runtime');
  const help = spawnSync(node, ['scripts/database-command.mjs', 'generate', '--help'], options);
  if (help.status !== 0 || !help.stdout.includes('drizzle-kit generate'))
    throw new Error('real database generation help failed under private runtime');
  const disk = spawnSync('/usr/bin/du', ['-sk', cache], options);
  if (disk.status !== 0) throw new Error('cannot measure private runtime disk usage');
  console.log(
    JSON.stringify({
      node,
      version: process.version,
      pnpm: runtime.executable,
      diskKiB: Number(disk.stdout.trim().split(/\s/)[0]),
      setupElapsedMs: Date.now() - Number(process.env.NODE_SETUP_STARTED),
      nestedNode: 'pass',
      databaseHelp: 'pass',
      cleanup: 'runner.temp job teardown',
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted')
    throw new Error('private cache setup is only for disposable GitHub-hosted jobs');
  if (process.argv[2] === 'prepare') {
    const cache = preparePrivateNodeCache(process.env.RUNNER_TEMP);
    appendFileSync(process.env.GITHUB_OUTPUT, `path=${cache}\nstarted=${Date.now()}\n`);
  } else if (process.argv[2] === 'verify') {
    verifyPrivateNode(process.env.PRIVATE_NODE_CACHE);
  } else throw new Error('expected prepare or verify');
}
