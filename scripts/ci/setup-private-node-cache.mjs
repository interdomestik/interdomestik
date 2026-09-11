import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendTrustedRunnerFile, readTrustedRunnerFile } from './trusted-runner-file.mjs';
import {
  checkOwnedPath,
  checkedPackageExecutable,
  packageCommandRuntime,
} from '../package-command-runtime.mjs';

function canonicalRunnerTemp(temp) {
  if (!temp || !isAbsolute(temp) || /[\r\n]/.test(temp)) throw new Error('invalid runner temp');
  const parent = realpathSync(`${resolve(temp)}${sep}.`);
  if (dirname(parent) === parent) throw new Error('invalid runner temp root');
  checkOwnedPath(parent);
  if (!statSync(parent).isDirectory()) throw new Error('runner temp is not a directory');
  return parent;
}

export function preparePrivateNodeCache(temp) {
  const parent = canonicalRunnerTemp(temp);
  // mkdtemp creates an owned 0700 root; GitHub empties runner.temp at job teardown.
  return mkdtempSync(join(parent, 'interdomestik-node-'));
}

export function validatedPrivateCache(candidate, temp, identity) {
  const parent = canonicalRunnerTemp(temp);
  const resolved = resolve(candidate || '.');
  if (!resolved.startsWith(`${parent}${sep}`) || dirname(resolved) !== parent)
    throw new Error('private cache must be a direct runner-temp child');
  const name = basename(resolved);
  if (!/^interdomestik-node-[A-Za-z0-9]{6}$/.test(name))
    throw new Error('private cache must be a generated child');
  const cache = join(parent, name);
  const info = lstatSync(cache);
  if (info.isSymbolicLink() || realpathSync(cache) !== cache)
    throw new Error('private cache symlink is forbidden');
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700)
    throw new Error('private cache must remain owned and mode 0700');
  if (identity !== `${info.dev}:${info.ino}`) throw new Error('private cache identity changed');
  return cache;
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

export function nodeRelease(version, platform, arch, wanted) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+(?:\.\d+){0,2}$/.test(wanted))
    throw new Error('invalid Node version');
  if (platform !== 'linux' || !['x64', 'arm64'].includes(arch))
    throw new Error('unsupported hosted Node platform');
  if (version !== wanted && !version.startsWith(`${wanted}.`))
    throw new Error('resolved Node does not match .nvmrc');
  const name = `node-v${version}-${platform}-${arch}`;
  return {
    archive: `${name}.tar.xz`,
    member: `${name}/bin/node`,
    base: `https://nodejs.org/dist/v${version}/`,
  };
}

export function verifyArchiveHash(bytes, manifest, archive) {
  const entries = manifest.split('\n').filter(line => line.slice(66) === archive);
  if (entries.length !== 1 || !/^[a-f0-9]{64}  /.test(entries[0]))
    throw new Error('invalid Node checksum manifest entry');
  if (createHash('sha256').update(bytes).digest('hex') !== entries[0].slice(0, 64))
    throw new Error('Node archive checksum mismatch');
}

const bootstrapOptions = {
  env: { PATH: '/usr/bin:/bin', LANG: 'C' },
  timeout: 180000,
  maxBuffer: 256 * 1024 * 1024,
};

function download(url, limit) {
  const result = spawnSync(
    '/usr/bin/curl',
    [
      '--disable',
      '--fail',
      '--silent',
      '--show-error',
      '--proto',
      '=https',
      '--tlsv1.2',
      '--connect-timeout',
      '15',
      '--max-time',
      '120',
      '--max-filesize',
      String(limit),
      '--write-out',
      '%{stderr}%{http_code}',
      url,
    ],
    { ...bootstrapOptions, maxBuffer: limit }
  );
  if (result.status !== 0 || result.stderr.toString() !== '200' || result.stdout.length > limit)
    throw new Error('official Node download failed');
  return result.stdout;
}

export function persistVerifiedArchive(bytes, manifest, archive) {
  verifyArchiveHash(bytes, manifest, basename(archive));
  writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 });
  return lstatSync(archive);
}

export function extractNodeBinary(archive, member, cache) {
  // Read only the exact regular-file member to stdout: archive paths never reach the filesystem.
  const listing = spawnSync('/usr/bin/tar', ['-tJvf', archive, member], bootstrapOptions);
  const lines = listing.stdout.toString().trim().split('\n');
  if (
    listing.status !== 0 ||
    lines.length !== 1 ||
    !lines[0].startsWith('-') ||
    !lines[0].endsWith(` ${member}`)
  )
    throw new Error('invalid Node archive member');
  const extracted = spawnSync('/usr/bin/tar', ['-xOJf', archive, member], bootstrapOptions);
  if (extracted.status !== 0 || !extracted.stdout.length)
    throw new Error('Node archive extraction failed');
  const bin = join(cache, 'bin');
  mkdirSync(bin, { mode: 0o755 });
  const node = join(bin, 'node');
  writeFileSync(node, extracted.stdout, { mode: 0o755, flag: 'wx' });
  return validateInstalledNode(cache, node);
}

function provisionPrivateNode(cache) {
  const started = Date.now();
  const prepared = lstatSync(cache);
  if (readdirSync(cache).length !== 0)
    throw new Error('private cache must be empty before provisioning');
  const wanted = readFileSync(new URL('../../.nvmrc', import.meta.url), 'utf8').trim();
  const release = nodeRelease(process.versions.node, process.platform, process.arch, wanted);
  const archive = join(cache, release.archive);
  let created;
  try {
    const manifest = download(`${release.base}SHASUMS256.txt`, 1024 * 1024).toString('utf8');
    const bytes = download(`${release.base}${release.archive}`, 100 * 1024 * 1024);
    // Same-origin HTTPS manifest integrity, not independent signature authentication.
    created = persistVerifiedArchive(bytes, manifest, archive);
    const node = extractNodeBinary(archive, release.member, cache);
    const version = spawnSync(node, ['--version'], bootstrapOptions);
    if (version.status !== 0 || version.stdout.toString().trim() !== process.version)
      throw new Error('private Node version differs from setup-node selection');
    appendTrustedRunnerFile(process.env.GITHUB_PATH, `${join(cache, 'bin')}\n`);
    console.log(
      JSON.stringify({ provisionElapsedMs: Date.now() - started, node, version: process.version })
    );
  } finally {
    if (created) {
      const current = lstatSync(cache);
      const file = lstatSync(archive);
      if (
        current.isSymbolicLink() ||
        current.dev !== prepared.dev ||
        current.ino !== prepared.ino ||
        file.dev !== created.dev ||
        file.ino !== created.ino
      )
        throw new Error('private download identity changed; refusing cleanup');
      unlinkSync(archive);
    }
  }
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
    const info = statSync(cache);
    const state = { cache, identity: `${info.dev}:${info.ino}` };
    writeFileSync(
      join(canonicalRunnerTemp(process.env.RUNNER_TEMP), 'interdomestik-node-cache.json'),
      JSON.stringify(state),
      { flag: 'wx', mode: 0o600 }
    );
    appendTrustedRunnerFile(process.env.GITHUB_OUTPUT, `path=${cache}\nstarted=${Date.now()}\n`);
  } else {
    const state = JSON.parse(
      readTrustedRunnerFile(
        join(canonicalRunnerTemp(process.env.RUNNER_TEMP), 'interdomestik-node-cache.json')
      )
    );
    if (process.env.PRIVATE_NODE_CACHE !== state.cache)
      throw new Error('private cache differs from prepared identity');
    const cache = validatedPrivateCache(
      process.env.PRIVATE_NODE_CACHE,
      process.env.RUNNER_TEMP,
      state.identity
    );
    if (process.argv[2] === 'verify') verifyPrivateNode(cache);
    else if (process.argv[2] === 'provision') provisionPrivateNode(cache);
    else throw new Error('expected prepare, provision or verify');
  }
}
