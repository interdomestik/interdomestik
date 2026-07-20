import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  CALLBACK_SOURCE_OPS,
  resolveCallbackSource,
  verifyMigrationCallbackSources,
} from '../src/migration-callback-source-verifier';
import { CALLBACK_SOURCE_MANIFEST } from '../src/migration-callback-plan-manifest';
import { callbackCode, sourceOps } from './migration-callback.support';

test('installed sources bind the three exact hashes and one package root', async () => {
  const binding = await verifyMigrationCallbackSources();
  assert.deepEqual(
    binding.hashes,
    CALLBACK_SOURCE_MANIFEST.map(item => item.sha256)
  );
  assert.equal(binding.urls.length, 3);
  assert.equal(typeof binding.reader, 'function');
  assert.ok(binding.urls.every(url => url.startsWith('file:') && url.endsWith('.js')));
  const linked = sourceOps({
    lstat: async path => ({ ...(await CALLBACK_SOURCE_OPS.lstat(path)), nlink: 2n }),
    open: async path => {
      const handle = await CALLBACK_SOURCE_OPS.open(path);
      return { ...handle, stat: async () => ({ ...(await handle.stat()), nlink: 2n }) };
    },
  });
  assert.equal(await callbackCode(() => verifyMigrationCallbackSources(linked)), 'NO_ERROR');
});

test('resolver prefers native semantics and bounds the tsx fallback', () => {
  let required = false;
  const native = resolveCallbackSource(
    'drizzle-orm/migrator',
    value => `file:///native/${value}`,
    () => {
      required = true;
      return '/unused.cjs';
    }
  );
  assert.equal(native, 'file:///native/drizzle-orm/migrator');
  assert.equal(required, false);
  const fallback = resolveCallbackSource(
    'drizzle-orm/migrator',
    undefined,
    () => '/store/drizzle-orm/migrator.cjs'
  );
  assert.equal(fallback, pathToFileURL('/store/drizzle-orm/migrator.js').href);
  assert.throws(() => resolveCallbackSource('drizzle-orm/other', undefined, () => '/other.cjs'));
});

test('path, bytes, identity, export and cleanup faults fail closed', async () => {
  const first = CALLBACK_SOURCE_MANIFEST[0].specifier;
  const missing = sourceOps({
    resolve: specifier =>
      specifier === first ? 'file:///missing/migrator.js' : CALLBACK_SOURCE_OPS.resolve(specifier),
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(missing)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  for (const target of CALLBACK_SOURCE_MANIFEST) {
    const collision = sourceOps({
      resolve: specifier =>
        specifier === target.specifier
          ? pathToFileURL(`/tmp/evil-drizzle-orm/${target.suffix}`).href
          : CALLBACK_SOURCE_OPS.resolve(specifier),
      realpath: async path => path,
    });
    assert.equal(
      await callbackCode(() => verifyMigrationCallbackSources(collision)),
      'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
    );
  }
  const symlinked = sourceOps({ realpath: async path => `${path}.elsewhere` });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(symlinked)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  const changed = sourceOps({
    open: async path => {
      const handle = await CALLBACK_SOURCE_OPS.open(path);
      return {
        ...handle,
        read: async (target, offset, length, position) => {
          const count = await handle.read(target, offset, length, position);
          if (position === 0 && count) target[0] ^= 1;
          return count;
        },
      };
    },
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(changed)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  let stats = 0;
  const replaced = sourceOps({
    lstat: async path => ({ ...(await CALLBACK_SOURCE_OPS.lstat(path)), ino: BigInt(++stats) }),
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(replaced)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  const oversized = sourceOps({
    lstat: async path => ({ ...(await CALLBACK_SOURCE_OPS.lstat(path)), size: 2_097_153n }),
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(oversized)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  const badExport = sourceOps({ importModule: async () => ({ readMigrationFiles: 1 }) });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(badExport)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  const extraExport = sourceOps({
    importModule: async () => ({
      readMigrationFiles: () => [],
      extra: true,
    }),
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(extraExport)),
    'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  );
  const badClose = sourceOps({
    open: async path => ({
      ...(await CALLBACK_SOURCE_OPS.open(path)),
      close: async () => {
        throw new Error('close');
      },
    }),
  });
  assert.equal(
    await callbackCode(() => verifyMigrationCallbackSources(badClose)),
    'MIGRATION_CALLBACK_CLEANUP_FAILED'
  );
});
