import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { materializeCrmRuntime } from './db-access-crm-runtime-materialize.mjs';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-shard-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const producerRoot = path.join(root, 'producer');
  const outputRoot = path.join(root, 'output');
  fs.mkdirSync(path.join(producerRoot, 'scripts/ci'), { recursive: true });
  fs.mkdirSync(outputRoot);
  const write = (file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    fs.writeFileSync(path.join(producerRoot, file), bytes);
    return { sha256: hash(bytes), bytes: bytes.length, mode: '100644' };
  };
  const packageFiles = Object.fromEntries(
    [1, 2, 3].map(n => {
      const file = `scripts/ci/db-access-crm-runtime-packages-${n}.json`;
      return [file, write(file, { [`slot-${n}`]: { version: '1' } })];
    })
  );
  const execute = lock => {
    const file = 'scripts/ci/db-access-crm-runtime-lock.json';
    const policy = {
      producerFiles: { [file]: write(file, lock) },
      crmProof: {
        runtime: {
          configuration: {
            compilerVersion: '0.28.2',
            platform: 'node',
            format: 'cjs',
            target: 'node24',
          },
        },
      },
    };
    return materializeCrmRuntime({
      sourceRoot: root,
      producerRoot,
      outputRoot,
      tarballRoot: root,
      policy,
    });
  };
  return { producerRoot, packageFiles, write, execute };
}

test('missing package shard is refused before package installation', t => {
  const f = fixture(t);
  delete f.packageFiles['scripts/ci/db-access-crm-runtime-packages-3.json'];
  assert.throws(() => f.execute({ packageFiles: f.packageFiles }), /lock package shards/);
});

test('foreign package shard path is refused', t => {
  const f = fixture(t);
  const records = Object.values(f.packageFiles);
  assert.throws(
    () =>
      f.execute({
        packageFiles: {
          'scripts/ci/foreign.json': records[0],
          'scripts/ci/db-access-crm-runtime-packages-2.json': records[1],
          'scripts/ci/db-access-crm-runtime-packages-3.json': records[2],
        },
      }),
    /lock shard path/
  );
});

test('changed package shard bytes are refused', t => {
  const f = fixture(t);
  f.write('scripts/ci/db-access-crm-runtime-packages-2.json', { altered: true });
  assert.throws(() => f.execute({ packageFiles: f.packageFiles }), /input identity/);
});

test('duplicate package slot across authenticated shards is refused', t => {
  const f = fixture(t);
  const file = 'scripts/ci/db-access-crm-runtime-packages-2.json';
  f.packageFiles[file] = f.write(file, { 'slot-1': { version: '1' } });
  assert.throws(() => f.execute({ packageFiles: f.packageFiles }), /duplicate package slot/);
});

test('symlink package shard is refused even when bytes match', t => {
  const f = fixture(t);
  const full = path.join(f.producerRoot, 'scripts/ci/db-access-crm-runtime-packages-1.json');
  fs.renameSync(full, full + '.original');
  fs.symlinkSync(full + '.original', full);
  assert.throws(() => f.execute({ packageFiles: f.packageFiles }), /symlink input/);
});
