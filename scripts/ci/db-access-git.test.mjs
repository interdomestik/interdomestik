import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { runGit, selectSystemGit, validateGitExecutable } from './db-access-git.mjs';
import { authenticateSnapshot, digest } from './db-access-trust.mjs';
import { rootDir } from './db-access-guard-test-utils.mjs';

// Typed filesystem entries keep ordinary files/directories distinct from symlinks.
function tree(files, links = {}) {
  const entries = { '/': { kind: 'dir', uid: 0 } };
  for (const file of [...files, ...Object.keys(links)]) {
    for (let dir = path.posix.dirname(file); dir !== '/'; dir = path.posix.dirname(dir))
      entries[dir] ??= { kind: 'dir', uid: 0 };
    entries[file] = Object.hasOwn(links, file)
      ? { kind: 'link', target: links[file], uid: 0 }
      : { kind: 'file', uid: 0 };
  }
  return entries;
}
function fakeFs(entries, writableReal = []) {
  const fail = (code, file) => Object.assign(new Error(`${code} ${file}`), { code });
  const get = file => {
    if (!Object.hasOwn(entries, file)) throw fail('ENOENT', file);
    return entries[file];
  };
  const real = file => {
    let current = '/',
      pending = file.split('/').filter(Boolean),
      hops = 0;
    while (pending.length) {
      const part = pending.shift();
      if (part === '.') continue;
      if (part === '..') {
        current = path.posix.dirname(current);
        continue;
      }
      const next = path.posix.join(current, part),
        entry = get(next);
      if (entry.kind === 'link') {
        if (++hops > 40) throw fail('ELOOP', file);
        if (entry.target.startsWith('/')) current = '/';
        pending = [...entry.target.split('/').filter(Boolean), ...pending];
      } else {
        if (pending.length && entry.kind !== 'dir') throw fail('ENOTDIR', file);
        current = next;
      }
    }
    return current;
  };
  const stats = entry => ({
    uid: entry.uid,
    isFile: () => entry.kind === 'file',
    isSymbolicLink: () => entry.kind === 'link',
  });
  return {
    lstatSync: file => stats(get(file)),
    readlinkSync: file => get(file).target,
    realpathSync: real,
    statSync: file => stats(get(real(file))),
    accessSync: (file, mode) => {
      const target = real(file);
      if (mode & fs.constants.W_OK && !writableReal.includes(target)) throw fail('EACCES', file);
      if (mode & fs.constants.X_OK && get(target).kind !== 'file') throw fail('EACCES', file);
    },
  };
}
const linux = () => tree(['/usr/bin/git'], { '/bin': 'usr/bin' });
const pick = (entries, writableReal = [], forbidden = []) =>
  selectSystemGit({ platform: 'linux', fsApi: fakeFs(entries, writableReal), forbidden });

test('fixed system Git selection validates literal paths and every symlink hop', () => {
  assert.equal(pick(linux()), '/usr/bin/git');
  assert.equal(
    validateGitExecutable('/bin/git', { fsApi: fakeFs(linux()), forbidden: [] }),
    '/usr/bin/git'
  );
  const darwin = tree([
    '/Library/Developer/CommandLineTools/usr/bin/git',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/git',
  ]);
  assert.equal(
    selectSystemGit({ platform: 'darwin', fsApi: fakeFs(darwin), forbidden: [] }),
    '/Library/Developer/CommandLineTools/usr/bin/git'
  );
  for (const candidate of ['', 'git', './git', 'node_modules/.bin/git'])
    assert.throws(() => validateGitExecutable(candidate, { fsApi: fakeFs(linux()) }), /absolute/u);
});

test('unsupported platforms and unavailable or non-executable system Git fail incomplete', () => {
  for (const platform of ['win32', 'freebsd', 'toString', '__proto__'])
    assert.throws(() => selectSystemGit({ platform, fsApi: fakeFs(linux()) }), /unsupported/u);
  assert.throws(() => pick(tree(['/usr/bin/other'])), /no trustworthy system git/u);
  const directory = linux();
  directory['/usr/bin/git'].kind = 'dir';
  assert.throws(() => pick(directory), /no trustworthy system git/u);
  const api = fakeFs(linux()),
    access = api.accessSync;
  api.accessSync = (file, mode) => {
    if (mode === fs.constants.X_OK) throw new Error('no execute');
    return access(file, mode);
  };
  assert.throws(
    () => selectSystemGit({ platform: 'linux', fsApi: api, forbidden: [] }),
    /stable executable file/u
  );
});

test('writable and effective-user-owned binaries, ancestors and intermediate hops reject', () => {
  for (const writable of ['/usr/bin/git', '/usr/bin', '/usr', '/'])
    assert.throws(() => pick(linux(), [writable]), /writable git path/u);
  for (const owned of ['/usr/bin/git', '/usr/bin', '/usr', '/']) {
    const entries = linux();
    entries[owned].uid = process.geteuid();
    assert.throws(() => pick(entries), /effective-user-owned/u);
  }
  const alternatives = tree(['/opt/git'], {
    '/usr/bin/git': '/etc/alternatives/git',
    '/etc/alternatives/git': '/opt/git',
  });
  assert.equal(pick(alternatives), '/opt/git');
  assert.throws(() => pick(alternatives, ['/etc/alternatives']), /writable git path/u);
  assert.throws(() => pick(alternatives, ['/opt']), /writable git path/u);
  const darwin = tree(['/Applications/Xcode.app/Contents/Developer/usr/bin/git']);
  assert.throws(
    () =>
      selectSystemGit({
        platform: 'darwin',
        fsApi: fakeFs(darwin, ['/Applications']),
        forbidden: [],
      }),
    /no trustworthy system git/u
  );
});

test('untrusted locations, failed exclusion roots, unknown access and unstable resolution fail closed', () => {
  const project = tree(['/work/repo/node_modules/.bin/git'], {
    '/usr/bin/git': '/work/repo/node_modules/.bin/git',
  });
  assert.throws(() => pick(project, [], ['/work/repo']), /untrusted location/u);
  assert.throws(
    () => validateGitExecutable('/usr/bin/git', { fsApi: fakeFs(linux()) }),
    /cannot authenticate git exclusion root/u
  );
  const api = fakeFs(linux());
  api.accessSync = () => {
    throw Object.assign(new Error('unknown'), { code: 'EIO' });
  };
  assert.throws(
    () => selectSystemGit({ platform: 'linux', fsApi: api, forbidden: [] }),
    /writable git path/u
  );
  const unstable = fakeFs(linux());
  unstable.realpathSync = () => '/different/git';
  assert.throws(
    () => selectSystemGit({ platform: 'linux', fsApi: unstable, forbidden: [] }),
    /stable executable file/u
  );
  const cyclic = tree([], { '/usr/bin/git': '/usr/bin/git' });
  assert.throws(() => pick(cyclic), /symlink depth/u);
});

test('known write denials do not mask unknown metadata and executable errors', () => {
  for (const code of ['EACCES', 'EPERM', 'EROFS']) {
    const api = fakeFs(linux()),
      access = api.accessSync;
    api.accessSync = (file, mode) => {
      if (mode === fs.constants.W_OK) throw Object.assign(new Error('denied'), { code });
      return access(file, mode);
    };
    assert.equal(selectSystemGit({ platform: 'linux', fsApi: api, forbidden: [] }), '/usr/bin/git');
  }
  const entries = linux();
  delete entries['/usr/bin'].uid;
  assert.throws(() => pick(entries), /unknown git path/u);
});

test('actual supported host supplies a working validated system Git', () => {
  const selected = selectSystemGit();
  assert.ok(path.isAbsolute(selected));
  assert.equal(fs.realpathSync(selected), selected);
  assert.match(runGit(['--version'], { encoding: 'utf8' }), /^git version /u);
});

const fingerprint = sources =>
  digest(JSON.stringify([...sources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
test(
  'candidate-local hostile PATH never executes during real fixtures, trust or production CLI',
  { timeout: 180000 },
  () => {
    const owned = fs.mkdtempSync(path.join(rootDir, 'tmp', 'git-sentinel-'));
    const bin = path.join(owned, 'node_modules', '.bin'),
      sentinel = path.join(owned, 'invoked');
    fs.mkdirSync(bin, { recursive: true });
    try {
      fs.writeFileSync(
        path.join(bin, 'git'),
        '#!/bin/sh\nprintf hit > "$DB_GUARD_SENTINEL_FILE"\nexit 97\n'
      );
      fs.chmodSync(path.join(bin, 'git'), 0o755);
      const env = {
        ...process.env,
        PATH: bin,
        DB_GUARD_SENTINEL_FILE: sentinel,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'guard.injected',
        GIT_CONFIG_VALUE_0: 'yes',
        GIT_DIR: '/nonexistent/guard-test-dir',
      };
      const control = spawnSync('/bin/sh', ['-c', 'git --version'], { env, encoding: 'utf8' });
      assert.equal(control.status, 97);
      assert.ok(fs.existsSync(sentinel));
      fs.rmSync(sentinel);
      const moduleUrl = file => pathToFileURL(path.join(rootDir, 'scripts/ci', file)).href;
      const script = `
      import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
      import {authenticateSnapshot,digest} from ${JSON.stringify(moduleUrl('db-access-trust.mjs'))};
      import {runGit,selectSystemGit} from ${JSON.stringify(moduleUrl('db-access-git.mjs'))};
      import {createTempRepo,readReport,rootDir,runGuard,writeFixture} from ${JSON.stringify(moduleUrl('db-access-guard-test-utils.mjs'))};
      const fingerprint=${fingerprint.toString()};const snapshot=fingerprint(authenticateSnapshot(rootDir));
      const clean=createTempRepo();writeFixture(clean,'apps/web/src/example.ts','export const value=1;');
      const mismatch=createTempRepo();const adoption=JSON.parse(fs.readFileSync(path.join(mismatch,'.fixture-adoption.json'),'utf8'));
      writeFixture(mismatch,'.fixture-adoption.json',JSON.stringify({...adoption,tree:'0'.repeat(40)}));
      const critical=createTempRepo();writeFixture(critical,'packages/database/src/tenant.ts','export const withTenantContext=1;');
      const baseline=createTempRepo();writeFixture(baseline,'scripts/ci/db-access-baseline.json',JSON.stringify({version:2,entries:[{file:'x'}]}));
      const statuses=[clean,mismatch,critical,baseline].map(root=>runGuard(root).status);
      let configIsolated=false;try{runGit(['config','--get','guard.injected']);}catch(error){configIsolated=error.status===1;}
      const production=spawnSync(process.execPath,['scripts/check-db-access-guard.mjs',${JSON.stringify('--report=' + path.relative(rootDir, path.join(owned, 'production-report.json')))}],{cwd:rootDir,encoding:'utf8',timeout:90000});
      console.log(JSON.stringify({snapshot,statuses,configIsolated,production:production.status,productionError:production.stderr,selected:selectSystemGit(),mismatch:readReport(mismatch).incomplete}));
    `;
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: rootDir,
        env,
        encoding: 'utf8',
        timeout: 120000,
      });
      assert.equal(child.status, 0, child.stderr);
      const outcome = JSON.parse(child.stdout);
      assert.equal(outcome.snapshot, fingerprint(authenticateSnapshot(rootDir)));
      assert.deepEqual(outcome.statuses, [0, 1, 1, 1]);
      assert.equal(outcome.configIsolated, true);
      assert.equal(outcome.production, 0, outcome.productionError);
      assert.ok(path.isAbsolute(outcome.selected));
      assert.match(JSON.stringify(outcome.mismatch), /trusted tree mismatch/u);
      assert.equal(fs.existsSync(sentinel), false, 'candidate PATH Git executed');
    } finally {
      fs.rmSync(owned, { recursive: true, force: true });
    }
  }
);
