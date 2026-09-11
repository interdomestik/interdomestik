import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

test('cleanup preserves primary errors, combines dual failures, and never deletes a replaced archive', async t => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.finishPrivateDownload, 'function');
  const cache = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-error-test-')));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const archive = path.join(cache, 'archive');
  const prepared = fs.lstatSync(cache);
  const primary = new Error('provisioning failed');
  assert.throws(
    () => runtime.finishPrivateDownload(cache, archive, prepared, undefined, primary),
    error => error === primary
  );
  fs.writeFileSync(archive, 'original');
  const created = fs.lstatSync(archive);
  fs.renameSync(archive, path.join(cache, 'original'));
  fs.writeFileSync(archive, 'replacement');
  assert.throws(
    () => runtime.finishPrivateDownload(cache, archive, prepared, created),
    /identity changed/
  );
  assert.throws(
    () => runtime.finishPrivateDownload(cache, archive, prepared, created, primary),
    error =>
      error instanceof AggregateError &&
      error.errors[0] === primary &&
      /identity changed/.test(error.errors[1].message)
  );
  assert.equal(fs.readFileSync(archive, 'utf8'), 'replacement');
  runtime.finishPrivateDownload(cache, archive, prepared, fs.lstatSync(archive));
  assert.equal(fs.existsSync(archive), false);
  fs.writeFileSync(archive, 'owned');
  const owned = fs.lstatSync(archive);
  assert.throws(
    () => runtime.finishPrivateDownload(cache, archive, prepared, owned, primary),
    error => error === primary
  );
  assert.equal(fs.existsSync(archive), false, 'primary failure still cleans its own archive');
});

test('downloads retry transient failures with fresh buffers but stop on success, integrity and deadline', async t => {
  const runtime = await import('./setup-private-node-cache.mjs');
  assert.equal(typeof runtime.download, 'function');
  const success = { status: 0, stdout: Buffer.from('abc'), stderr: Buffer.from('200') };
  const partial = { status: 18, stdout: Buffer.from('partial'), stderr: Buffer.from('200') };
  let sequence = [success],
    calls = 0,
    now = 0;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', callback => {
    callback();
    return 0;
  });
  t.mock.method(childProcess, 'spawnSync', (file, args, options) => {
    assert.equal(file, '/usr/bin/curl');
    assert.equal(args[args.indexOf('--proto') + 1], '=https');
    assert.ok(options.timeout <= 120000);
    assert.equal(options.maxBuffer, 100);
    calls++;
    return sequence.shift() ?? partial;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  assert.equal((await runtime.download('https://nodejs.org/fixture', 100)).toString(), 'abc');
  assert.equal(calls, 1);
  sequence = [partial, success];
  calls = 0;
  assert.equal((await runtime.download('https://nodejs.org/fixture', 100)).toString(), 'abc');
  assert.equal(calls, 2, 'partial bytes must not prefix the successful retry');
  calls = 0;
  sequence = [
    { status: 22, stdout: Buffer.alloc(0), stderr: Buffer.from('curl: HTTP error\n503') },
    success,
  ];
  assert.equal((await runtime.download('https://nodejs.org/fixture', 100)).toString(), 'abc');
  assert.equal(calls, 2);
  calls = 0;
  sequence = [{ status: 22, stdout: Buffer.alloc(0), stderr: Buffer.from('404') }];
  await assert.rejects(runtime.download('https://nodejs.org/fixture', 100), /download failed/);
  assert.equal(calls, 1, 'permanent HTTP failure must not retry');
  calls = 0;
  sequence = [];
  await assert.rejects(runtime.download('https://nodejs.org/fixture', 100), /download failed/);
  assert.equal(calls, 3);
  calls = 0;
  sequence = [{ status: 60, stdout: Buffer.alloc(0), stderr: Buffer.from('000') }];
  await assert.rejects(runtime.download('https://nodejs.org/fixture', 100), /download failed/);
  assert.equal(calls, 1, 'certificate failures must not retry');
  calls = 0;
  sequence = [success];
  const bytes = await runtime.download('https://nodejs.org/fixture', 100);
  assert.throws(
    () => runtime.verifyArchiveHash(bytes, `${'0'.repeat(64)}  node.tar.xz\n`, 'node.tar.xz'),
    /checksum/
  );
  assert.equal(calls, 1, 'hash failures do not restart downloads');
  calls = 0;
  sequence = [
    {
      get status() {
        now = 120001;
        return 28;
      },
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('000'),
    },
  ];
  await assert.rejects(runtime.download('https://nodejs.org/fixture', 100), /download failed/);
  assert.equal(calls, 1, 'total deadline ends retries');
});
