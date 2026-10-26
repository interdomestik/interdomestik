import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { p2SourceFence, P2_SOURCE, partitionOrdinarySources } from '../../p2/source-fence.mjs';
const root = path.resolve(import.meta.dirname, '../../../..');
const absolute = path.join(root, P2_SOURCE),
  fence = p2SourceFence(root);
for (const id of [
  absolute,
  absolute + '?direct',
  absolute + '#x',
  '/@fs/' + absolute,
  pathToFileURL(absolute).href,
  '@/actions/admin-claims/assign.wrapper.test.ts',
])
  test('unconditional load refusal ' + id, () =>
    assert.throws(() => fence.load(id), /P2_AMBIENT_SOURCE_LOAD_REFUSED/)
  );
test('relative source resolution refused', () =>
  assert.throws(
    () =>
      fence.resolveId(
        './assign.wrapper.test.ts',
        path.join(root, 'apps/web/src/actions/admin-claims/other.ts')
      ),
    /P2_AMBIENT_SOURCE_LOAD_REFUSED/
  ));
test('serialized receipt/env do not authorize source', () => {
  process.env.P2_PROOF = '{"passed":true}';
  try {
    assert.throws(() => fence.load(absolute), /P2_AMBIENT/);
  } finally {
    delete process.env.P2_PROOF;
  }
});
test('other source unaffected', () =>
  assert.equal(
    fence.load(path.join(root, 'apps/web/src/actions/admin-claims/assign.core.ts')),
    null
  ));
test('partition conserves all actual source identities', () => {
  const files = ['other.test.ts', P2_SOURCE, 'third.test.ts'];
  const partition = partitionOrdinarySources(files);
  assert.deepEqual([...partition.ambient, ...partition.capsule].sort(), files.sort());
  assert.deepEqual(partition.capsule, [P2_SOURCE]);
});
test('no generic exclusion on missing source', () =>
  assert.throws(() => partitionOrdinarySources(['other.test.ts']), /missing/));
test('duplicate discovery refused', () =>
  assert.throws(() => partitionOrdinarySources([P2_SOURCE, P2_SOURCE]), /Duplicate/));
test('actual Vite server refuses direct and symlink source before evaluation', async () => {
  const req = createRequire(root + '/apps/web/package.json');
  const { createServer } = await import(
    pathToFileURL(createRequire(req.resolve('vitest/package.json')).resolve('vite')).href
  );
  const alias = path.join(import.meta.dirname, 'target-symlink.ts');
  fs.symlinkSync(absolute, alias);
  const server = await createServer({
    configFile: false,
    root,
    plugins: [fence],
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    for (const id of [absolute, absolute + '?direct', alias])
      await assert.rejects(server.transformRequest(id), /P2_AMBIENT_SOURCE_LOAD_REFUSED/);
  } finally {
    await server.close();
    fs.unlinkSync(alias);
  }
});
