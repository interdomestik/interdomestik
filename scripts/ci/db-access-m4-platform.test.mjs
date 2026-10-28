import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { sha, databaseCA, writePrivate, readFixed } from './db-access-m4-platform-custody.mjs';
import { validateFourCaseReporter } from './db-access-m4-platform-browser.mjs';
import { validateKernelRows } from './db-access-m4-platform-controls.mjs';
import { nextProfile } from './db-access-m4-platform-next.mjs';
import { runOwned, launchOwned } from './db-access-m4-platform-process.mjs';
import {
  takeM4CompiledPlatformEvidence,
  m4CompiledBackendLaunch,
  runM4CompiledBrowser,
} from './db-access-m4-compiled-platform.mjs';

const titles = [
  'actual compiled legacy-admin action and cache',
  'actual compiled legacy-agent action and cache',
  'actual compiled staff action and cache',
  'missing cookie denies without cache invalidation',
];
const reporter = () => ({
  errors: [],
  stats: { expected: 4, unexpected: 0, skipped: 0, flaky: 0 },
  suites: [
    {
      specs: titles.map(title => ({
        title,
        tests: [
          {
            status: 'expected',
            expectedStatus: 'passed',
            results: [{ status: 'passed', retry: 0 }],
          },
        ],
      })),
    },
  ],
});
test('normal four exact independently collected browser cases pass pure comparison', () => {
  assert.equal(validateFourCaseReporter(reporter()).length, 4);
});
for (const [name, change] of [
  ['missing case', r => r.suites[0].specs.pop()],
  [
    'all passed Boolean without collection',
    r => {
      r.suites = [];
      r.complete = true;
    },
  ],
  ['wrong program', r => (r.suites[0].specs[0].title = 'unrelated')],
  ['duplicate program', r => (r.suites[0].specs[1].title = titles[0])],
  ['skipped', r => (r.suites[0].specs[0].tests[0].results[0].status = 'skipped')],
  ['cancelled', r => (r.suites[0].specs[0].tests[0].results[0].status = 'interrupted')],
  ['retry', r => (r.suites[0].specs[0].tests[0].results[0].retry = 1)],
  ['flaky', r => (r.stats.flaky = 1)],
  ['startup error', r => (r.errors = [{ message: 'import failed' }])],
])
  test('reporter refuses ' + name, () => {
    const row = reporter();
    change(row);
    assert.throws(() => validateFourCaseReporter(row));
  });

const targets = ['/code/a', '/code/b', '/code/c'],
  aliases = ['/data/a', '/data/b', '/data/c'];
const kernel = () => ({
  label: 'base',
  actuallyRan: true,
  nodePermissionFlags: false,
  privateRead: { denied: true },
  inheritedCodeFds: [],
  data: [true, true, true],
  rows: targets
    .flatMap(file =>
      ['write-open', 'write', 'rename', 'chmod', 'file-link', 'unlink'].map(operation => ({
        file,
        operation,
        denied: true,
      }))
    )
    .concat(
      aliases.map(file => ({
        file,
        operation: 'symlink-alias-write-open',
        denied: true,
      }))
    ),
});
test('exact21 kernel rows compare without minting platform evidence', () =>
  validateKernelRows(kernel(), 'base', targets, aliases));
for (const [name, change] of [
  ['startup failure', r => (r.actuallyRan = false)],
  ['Node permission substitute', r => (r.nodePermissionFlags = true)],
  ['missing target', r => (r.rows[0].setupFailure = 'missing')],
  ['unexpected write', r => (r.rows[0].unexpectedSuccess = true)],
  ['wrong target', r => (r.rows[0].file = '/other')],
  ['duplicate operation', r => (r.rows[1] = { ...r.rows[0] })],
  ['private read allowed', r => (r.privateRead.denied = false)],
  ['inherited code FD', r => (r.inheritedCodeFds = [{ fd: 4 }])],
  ['data positive failed', r => (r.data[0] = false)],
])
  test('kernel comparison refuses ' + name, () => {
    const row = kernel();
    change(row);
    assert.throws(() => validateKernelRows(row, 'base', targets, aliases));
  });

test('six-function platform accepts no caller token/Boolean/serialized proof', async () => {
  for (const value of [
    {},
    Object.freeze({ checksPassed: true }),
    { phase: 'closed', executed: true },
  ]) {
    assert.throws(() => takeM4CompiledPlatformEvidence(value), /Foreign/);
    assert.throws(() => m4CompiledBackendLaunch(value), /Foreign/);
    await assert.rejects(runM4CompiledBrowser(value), /Foreign/);
  }
});
test('Seatbelt grants only separate writable data and explicitly denies native data mappings', () => {
  const config = {
    code: '/owned/code',
    cache: '/owned/cache',
    output: '/owned/logs',
    tmp: '/owned/tmp',
    preload: '/trusted/preload.mjs',
    readFiles: ['/owned/next-inputs/key.pem'],
    nextPort: 43333,
    ownerPort: 43334,
  };
  const text = nextProfile(config);
  assert.match(text, /\(deny default\)/);
  assert.match(text, /\(deny file-map-executable \(subpath "\/owned\/cache"\)/);
  assert(!text.includes('process-fork'));
  assert(!text.includes('/owned/driver-evidence'));
  assert.throws(() => nextProfile({ ...config, cache: '/owned/code/cache' }));
  assert.throws(() => nextProfile({ ...config, readFiles: ['/owned/logs/injected.js'] }));
});
test('fresh private output excludes symlink/hardlink reuse and never overwrites', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-platform-custody-')));
  try {
    const file = writePrivate(root, 'input.json', '{}');
    assert.equal(readFixed(file).toString(), '{}');
    assert.throws(() => writePrivate(root, 'input.json', 'changed'));
    fs.linkSync(file, path.join(root, 'alias'));
    assert.throws(() => readFixed(file), /custody/);
    fs.unlinkSync(path.join(root, 'alias'));
    fs.symlinkSync(file, path.join(root, 'symlink'));
    assert.throws(() => readFixed(path.join(root, 'symlink')), /Physical/);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test('fixed public database CA requires exact single current CA PEM/hash, never key or extra trust', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-platform-ca-')));
  try {
    const cert = path.join(root, 'ca.pem'),
      key = path.join(root, 'ca.key');
    const config = path.join(root, 'openssl.cnf');
    fs.writeFileSync(
      config,
      '[req]\ndistinguished_name=dn\nx509_extensions=ca\n[dn]\n[ca]\nbasicConstraints=critical,CA:true\nkeyUsage=critical,keyCertSign,cRLSign\n'
    );
    const child = spawnSync(
      '/usr/bin/openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=M4 pure test CA',
        '-config',
        config,
      ],
      { encoding: 'utf8', timeout: 10000 }
    );
    assert.equal(child.status, 0);
    const caPem = fs.readFileSync(cert, 'utf8'),
      row = { caPem, caSha256: sha(caPem) };
    assert.equal(databaseCA(row), caPem);
    for (const bad of [
      { ...row, caSha256: '0'.repeat(64) },
      { ...row, override: true },
      { caPem: caPem + caPem, caSha256: sha(caPem + caPem) },
      {
        caPem: fs.readFileSync(key, 'utf8'),
        caSha256: sha(fs.readFileSync(key)),
      },
    ])
      assert.throws(() => databaseCA(bad));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
test('owned actual child must exit zero and drain; nonzero/startup failure is never a negative pass', async () => {
  const command = source => ({
    argv: [process.execPath, '--disable-sigusr1', '--input-type=module', '--eval', source],
    cwd: os.tmpdir(),
    env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
  });
  assert.equal(
    (await runOwned(command('console.log("actual")'), performance.now() + 5000)).stdout.trim(),
    'actual'
  );
  await assert.rejects(runOwned(command('throw Error("startup")'), performance.now() + 5000));
});
test('join capability consumes exact lexical binding once; clones/wrong tuple cannot consume it', () => {
  const source = fs.readFileSync(
    new URL('./db-access-m4-compiled-runtime.mjs', import.meta.url),
    'utf8'
  );
  const from = source.indexOf('export const isFreshM4CompiledRuntimeResult');
  const to = source.indexOf('// No result, proof object');
  const body = source.slice(from, to).replaceAll('export ', '');
  // Model-only VM executes the exact production functions; no production enrollment API is exported.
  const model =
    vm.runInNewContext(`(()=>{const fresh=new WeakMap(),digest=x=>JSON.stringify(x),fail=x=>{throw Error(x)};
    ${body}
    const value=Object.freeze({}),context={event:'fixture'},policy='pin',imageRecords=Object.freeze([]);
    fresh.set(value,{contextSha256:digest(context),policySha256:policy,imageRecords});
    return {value,context,policy,takeM4CompiledRuntimeForJoin,hasM4CompiledRuntimeBinding};
  })()`);
  assert.throws(() => model.takeM4CompiledRuntimeForJoin({}, model.context, model.policy));
  assert.throws(() =>
    model.takeM4CompiledRuntimeForJoin(model.value, { event: 'foreign' }, model.policy)
  );
  assert.throws(() => model.takeM4CompiledRuntimeForJoin(model.value, model.context, 'wrong'));
  const taken = model.takeM4CompiledRuntimeForJoin(model.value, model.context, model.policy);
  assert.equal(taken.result, model.value);
  assert(Object.isFrozen(taken));
  assert.throws(() => model.takeM4CompiledRuntimeForJoin(model.value, model.context, model.policy));
});
test('owned stop requires graceful zero exit; forced kill is not clean drain', async () => {
  const command = ignore => ({
    argv: [
      process.execPath,
      '--disable-sigusr1',
      '--eval',
      'process.on("SIGTERM",()=>{' +
        (ignore ? '' : 'process.exit(0);') +
        '});console.log("READY");setInterval(()=>{},100);',
    ],
    cwd: os.tmpdir(),
    env: { PATH: '/usr/bin:/bin', LANG: 'C', TZ: 'UTC' },
  });
  for (const ignore of [false, true]) {
    const child = launchOwned(command(ignore), performance.now() + 5000);
    const until = performance.now() + 2000;
    while (!child.output().includes('READY') && performance.now() < until)
      await new Promise(resolve => setTimeout(resolve, 10));
    assert(child.output().includes('READY'));
    if (ignore) await assert.rejects(child.stop(), /failed/);
    else assert.equal((await child.stop()).code, 0);
  }
});
