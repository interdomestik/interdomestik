import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compiledJsonFixture } from './db-access-m4-compiled-json-auth.fixture.mjs';

async function execute(fixture) {
  const loader = await import(
    pathToFileURL(path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-producer-loader.mjs'))
  );
  return { loader, value: await loader.executeM4CompiledRuntime(fixture.options) };
}
const marker = fixture => path.join(fixture.root, 'scripts/ci/import-marker');
test('authenticated real compiled-source imports its exact JSON contract through physical TS132', async () => {
  const fixture = compiledJsonFixture();
  try {
    const { loader, value } = await execute(fixture);
    assert.deepEqual(value, { fixtureOnly: true });
    assert.equal(fs.readFileSync(marker(fixture), 'utf8'), 'fixture-only');
    assert.equal(loader.isFreshM4CompiledRuntimeResult(value), false);
  } finally {
    fixture.cleanup();
  }
});
test('changed exact JSON bytes refuse before entry side effects', async () => {
  const fixture = compiledJsonFixture();
  try {
    fs.appendFileSync(
      path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-contract.json'),
      '\n'
    );
    await assert.rejects(execute(fixture), /authentication refused/);
    assert.equal(fs.existsSync(marker(fixture)), false);
  } finally {
    fixture.cleanup();
  }
});
test('undeclared exact JSON refuses before entry side effects', async () => {
  const fixture = compiledJsonFixture(({ policy }) => {
    delete policy.producerFiles['scripts/ci/db-access-m4-compiled-contract.json'];
  });
  try {
    await assert.rejects(execute(fixture), /protected producer admission/);
    assert.equal(fs.existsSync(marker(fixture)), false);
  } finally {
    fixture.cleanup();
  }
});
for (const [name, transform] of [
  [
    'foreign declared JSON',
    ({ put }) => {
      put('foreign.json', '{}');
      put(
        'db-access-m4-compiled-source.mjs',
        "import fixed from './foreign.json' with {type:'json'};\n"
      );
    },
  ],
  [
    'wrong JSON attribute format',
    ({ put }) => {
      put(
        'db-access-m4-compiled-source.mjs',
        "import fixed from './db-access-m4-compiled-contract.json' with {type:'javascript'};\n"
      );
    },
  ],
  [
    'missing JSON attribute',
    ({ put }) => {
      put(
        'db-access-m4-compiled-source.mjs',
        "import fixed from './db-access-m4-compiled-contract.json';\n"
      );
    },
  ],
  [
    'foreign importer of exact JSON',
    ({ fixture, put }) => {
      put(
        'db-access-m4-compiled-runtime.mjs',
        "import fixed from './db-access-m4-compiled-contract.json' with {type:'json'};\n" +
          fs.readFileSync(
            path.join(fixture.root, 'scripts/ci/db-access-m4-compiled-runtime.mjs'),
            'utf8'
          )
      );
    },
  ],
])
  test(name + ' refuses after genuine repinning before entry side effects', async () => {
    const fixture = compiledJsonFixture(transform);
    try {
      await assert.rejects(execute(fixture), /protected producer admission/);
      assert.equal(fs.existsSync(marker(fixture)), false);
    } finally {
      fixture.cleanup();
    }
  });
