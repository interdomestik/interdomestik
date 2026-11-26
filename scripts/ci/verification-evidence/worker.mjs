// Installed by the owner as gate-m5-worker.mjs. This bridge uses only Node built-ins.
import { execFileSync, spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readdirSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

const WORKER = '_interdomestik_gate_worker';
const BASE_ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', NODE_V8_COVERAGE: undefined };
const VERIFIED_TOOLS = ['node', 'pnpm', 'bash'];
const sudo = ['-n', '-u', WORKER, '--'];
const [action, ticketId, root, toolPath, bashPath, ...rest] = process.argv.slice(2);

function requireThat(condition) {
  if (!condition) throw new Error('worker isolation');
}

function output(command, args, env = BASE_ENV) {
  return execFileSync(command, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  })
    .toString()
    .trim();
}

function noWorkerProcesses() {
  try {
    output('/usr/bin/pgrep', ['-U', workerUid]);
    return false;
  } catch (error) {
    requireThat(error.status === 1);
    return true;
  }
}

async function drain(attempt = 0) {
  if (attempt === 20) {
    requireThat(noWorkerProcesses());
    return;
  }
  if (noWorkerProcesses()) return;
  try {
    output('/usr/bin/sudo', [...sudo, '/usr/bin/pkill', '-KILL', '-U', workerUid]);
  } catch (error) {
    requireThat(error.status === 1);
  }
  await setTimeout(100);
  return drain(attempt + 1);
}

function workerEnvironment() {
  return [
    ...sudo,
    '/usr/bin/env',
    '-i',
    `PATH=${toolPath}`,
    'LANG=C',
    `HOME=${root}/tmp/m5-home`,
    `TMPDIR=${root}/tmp/m5-tmp`,
    `INTERDOMESTIK_M5_CHECKOUT=${root}`,
    `INTERDOMESTIK_M5_BASH=${bashPath}`,
    'GIT_CONFIG_COUNT=1',
    'GIT_CONFIG_KEY_0=safe.directory',
    `GIT_CONFIG_VALUE_0=${root}`,
    'GIT_CONFIG_NOSYSTEM=1',
    'GIT_CONFIG_GLOBAL=/dev/null',
    'GIT_OPTIONAL_LOCKS=0',
    'GIT_NO_REPLACE_OBJECTS=1',
  ];
}

function accessible(file, mode) {
  try {
    accessSync(file, mode);
    return true;
  } catch (error) {
    if (!['EACCES', 'EPERM', 'ENOENT'].includes(error.code)) throw error;
    return false;
  }
}

function protectedToolPath(file) {
  for (let current = file; ; current = path.dirname(current)) {
    if (accessible(current, constants.W_OK)) return false;
    if (current === path.dirname(current)) return true;
  }
}

function readOnlyTree(directory) {
  return (
    !accessible(directory, constants.W_OK) &&
    readdirSync(directory, {
      withFileTypes: true,
    }).every(entry => {
      const file = path.join(directory, entry.name);
      // Two QA contracts register temporary linked worktrees. Their private jobs can write only
      // this registry. HEAD, the index, objects, refs and configuration stay protected.
      if (file === path.join(root, '.git/worktrees')) {
        return entry.isDirectory() && readdirSync(file).length === 0;
      }
      return entry.isDirectory()
        ? readOnlyTree(file)
        : entry.isFile() && !accessible(file, constants.W_OK);
    })
  );
}

function checkReadOnlyCheckout() {
  const gitDir = path.join(root, '.git');
  requireThat(
    realpathSync(gitDir) === gitDir &&
      readOnlyTree(gitDir) &&
      !existsSync(path.join(gitDir, 'objects/info/alternates'))
  );
  const tracked = execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean);
  const protectedPaths = new Set([root]);
  for (const name of tracked) {
    for (let file = path.join(root, name); file !== root; file = path.dirname(file)) {
      if (protectedPaths.has(file)) break;
      protectedPaths.add(file);
    }
  }
  requireThat(
    tracked.length > 0 && [...protectedPaths].every(file => !accessible(file, constants.W_OK))
  );
}

function checkWorkspaceDirectories(stage) {
  const workspaces = [
    root,
    ...['apps', 'packages'].flatMap(parent =>
      readdirSync(path.join(root, parent), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(root, parent, entry.name))
    ),
  ];
  const dependencyPaths = workspaces.map(dir => path.join(dir, 'node_modules'));
  const controlledTools = [...VERIFIED_TOOLS, 'git', 'docker', 'sh'];
  for (const dir of dependencyPaths) {
    if (!existsSync(dir)) continue;
    requireThat(realpathSync(dir) === dir);
    if (stage === 'start') requireThat(readdirSync(dir).length === 0);
    requireThat(controlledTools.every(tool => !existsSync(path.join(dir, '.bin', tool))));
  }
  if (stage === 'start') {
    requireThat(!existsSync(path.join(root, 'tmp/m5-pnpm-store')));
    for (const name of ['m5-home', 'm5-tmp']) {
      const dir = path.join(root, 'tmp', name);
      requireThat(
        realpathSync(dir) === dir &&
          readdirSync(dir).length === 0 &&
          accessible(dir, constants.W_OK)
      );
    }
  }
}

function inspectWorker(stage) {
  requireThat(os.userInfo().username === WORKER && process.env.PATH === toolPath);
  checkReadOnlyCheckout();
  checkWorkspaceDirectories(stage);
  const directories = toolPath.split(':');
  for (const directory of directories) {
    requireThat(
      path.isAbsolute(directory) &&
        protectedToolPath(directory) &&
        protectedToolPath(realpathSync(directory))
    );
  }
  const executables = Object.fromEntries(
    VERIFIED_TOOLS.map(name => {
      const binary = directories
        .map(dir => path.join(dir, name))
        .find(file => accessible(file, constants.X_OK));
      const resolved = realpathSync(binary);
      requireThat(protectedToolPath(resolved));
      return [name, resolved];
    })
  );
  requireThat(
    executables.bash === bashPath &&
      output('/usr/bin/git', ['rev-parse', '--show-toplevel'], process.env) === root &&
      output('/usr/bin/git', ['config', '--get-all', 'safe.directory'], process.env) === root &&
      ['true', 'undefined'].includes(
        output(executables.pnpm, ['config', 'get', 'bail'], process.env)
      ) &&
      !existsSync(path.join(root, 'node_modules/.hooks'))
  );
  return {
    isolated: true,
    processesDrained: true,
    gitReadOnly: true,
    trackedReadOnly: true,
    freshDependencies: stage === 'start',
    executables,
    node: output(executables.node, ['--version']),
    pnpm: output(executables.pnpm, ['--version'], process.env),
    bash: output(executables.bash, ['--noprofile', '--norc', '-c', 'printf "%s" "$BASH_VERSION"']),
  };
}

async function run(args) {
  requireThat(noWorkerProcesses() && args[0] === 'pnpm');
  // The repo's prepare hook configures Git hooks. The worker's protected Git config is immutable.
  const installEnv = args[1] === 'install' ? ['HUSKY=0'] : [];
  const child = spawn('/usr/bin/sudo', [...workerEnvironment(), ...installEnv, ...args], {
    cwd: root,
    env: BASE_ENV,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (const signal of ['SIGINT', 'SIGHUP', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
  } finally {
    await drain();
  }
}

let workerUid;
try {
  requireThat(/^[0-9a-f-]{36}$/u.test(ticketId ?? '') && realpathSync(root) === root);
  workerUid = output('/usr/bin/id', ['-u', WORKER]);
  requireThat(/^[1-9]\d*$/u.test(workerUid));
  if (action === 'run' && rest[0] === '--') {
    await run(rest.slice(1));
  } else if (action === 'drain' && rest.length === 0) {
    await drain();
  } else if (action === 'audit' && ['start', 'installed', 'finish'].includes(rest[0])) {
    requireThat(noWorkerProcesses());
    const argv = ['inspect', ticketId, root, toolPath, bashPath, rest[0]];
    const data = output('/usr/bin/sudo', [
      ...workerEnvironment(),
      process.execPath,
      process.argv[1],
      ...argv,
    ]);
    requireThat(noWorkerProcesses());
    console.log(data);
  } else if (action === 'inspect' && ['start', 'installed', 'finish'].includes(rest[0])) {
    console.log(JSON.stringify(inspectWorker(rest[0])));
  } else {
    throw new Error('worker action');
  }
} catch {
  console.error('M5 worker operation failed.');
  process.exitCode = 1;
}
