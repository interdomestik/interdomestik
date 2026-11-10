import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DB_PACKAGE,
  packageJson,
  refused,
  repositoryFixture,
  RUNTIME,
  TLS,
} from './tenant-guard-seed-tls-test-support.mjs';

for (const file of [DB_PACKAGE, 'package.json', 'tools/nested/package.json']) {
  for (const field of ['imports', 'exports']) {
    for (const target of [
      './src/seed%2Dtarget-tls.ts',
      './src/ordinary%2Dtarget.ts',
      './src/ordinary.ts?query',
      './src/ordinary.ts#fragment',
      './src/%E0%A4%A.ts',
    ]) {
      test(`R3 ${file} ${field} refuses raw/decoded target ${target}`, () => {
        const key = field === 'imports' ? '#unused' : './unused';
        const mapping = { [key]: { custom: [null, { other: [target] }] } };
        refused(repositoryFixture({ [file]: packageJson({ [field]: mapping }) }), file);
      });
    }
  }
}

for (const field of ['imports', 'exports']) {
  for (const target of [
    './src/seed%2Dtarget-tls.ts',
    './src/seed-target-tls.ts?query',
    './src/seed-target-tls.ts#fragment',
    './src/seed-target-\ttls.ts',
    './src\\seed-target-tls.ts',
  ]) {
    test(`R3 ${field} normalizes URL target before resolution and inverse matching: ${target}`, () => {
      const key = field === 'imports' ? '#unused' : './unused';
      const specifier = field === 'imports' ? key : '@interdomestik/database/unused';
      const result = repositoryFixture(
        { [DB_PACKAGE]: packageJson({ [field]: { [key]: target } }) },
        ({ seedTls }) =>
          assert.ok(seedTls.graph.resolveSpecifier(RUNTIME, specifier).files.includes(TLS))
      );
      refused(result, DB_PACKAGE);
    });
  }
}

test('R3 hash-prefixed imports keys with ordinary literal targets stay admitted', () => {
  assert.deepEqual(
    repositoryFixture({
      [DB_PACKAGE]: packageJson({ imports: { '#ordinary': './src/ordinary.ts' } }),
      'packages/database/src/ordinary.ts': 'export const value = 1;',
      [RUNTIME]: "import '#ordinary';",
    }).violations,
    []
  );
});
