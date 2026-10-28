import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  makeCompiledAuthFixture,
  addRepinnedUnboundFixtureDependency,
} from './db-access-m4-compiled-auth.fixture.mjs';

test('real local Git source + pinned physical TS132 closure authenticates before fixed fixture entry import', async () => {
  const fixture = makeCompiledAuthFixture();
  try {
    const loader = await import(
      pathToFileURL(path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-producer-loader.mjs'))
    );
    const marker = path.join(fixture.root, 'scripts/ci/import-marker');
    assert.equal(fs.existsSync(marker), false);
    const result = await loader.executeM4CompiledRuntime(fixture.options);
    assert.deepEqual(result, { fixtureOnly: true });
    assert.equal(fs.readFileSync(marker, 'utf8'), 'fixture-only');
    assert.equal(loader.isFreshM4CompiledRuntimeResult(result), false);
    const entry = await import(
      pathToFileURL(path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-runtime.mjs'))
    );
    assert.throws(
      () => entry.runM4CompiledRuntime(fixture.options, { authenticated: true }),
      /protected producer admission/
    );
    fs.unlinkSync(marker);
    const runtime = path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-runtime.mjs');
    fs.appendFileSync(runtime, '\nthrow Error("modified before import");\n');
    await assert.rejects(
      loader.executeM4CompiledRuntime(fixture.options),
      /authentication refused/
    );
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fixture.cleanup();
  }
});

test('fresh Git/policy repinning cannot add an undeclared executable side-effect dependency', async () => {
  const fixture = makeCompiledAuthFixture();
  try {
    addRepinnedUnboundFixtureDependency(fixture);
    const loader = await import(
      pathToFileURL(path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-producer-loader.mjs'))
    );
    await assert.rejects(
      loader.executeM4CompiledRuntime(fixture.options),
      /protected producer admission/
    );
    assert.equal(fs.existsSync(path.join(fixture.root, 'scripts/ci/unbound-marker')), false);
    assert.equal(fs.existsSync(path.join(fixture.root, 'scripts/ci/import-marker')), false);
  } finally {
    fixture.cleanup();
  }
});
test('wrong protected event and changed compiler bytes refuse before entry side effect', async () => {
  const fixture = makeCompiledAuthFixture();
  try {
    const loader = await import(
      pathToFileURL(path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-producer-loader.mjs'))
    );
    const marker = path.join(fixture.root, 'scripts/ci/import-marker');
    const wrong = structuredClone(fixture.options);
    wrong.context.candidateTree = '0'.repeat(40);
    await assert.rejects(loader.executeM4CompiledRuntime(wrong));
    assert.equal(fs.existsSync(marker), false);
    fs.appendFileSync(
      path.join(fixture.root, 'node_modules/typescript/lib/typescript.js'),
      '\n// changed\n'
    );
    await assert.rejects(
      loader.executeM4CompiledRuntime(fixture.options),
      /authentication refused/
    );
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fixture.cleanup();
  }
});
