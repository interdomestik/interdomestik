import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP,
  DB_PACKAGE,
  packageJson,
  refused,
  repositoryFixture,
  RUNTIME,
  TLS,
} from './tenant-guard-seed-tls-test-support.mjs';

for (const suffix of ['json', 'css', 'ts']) {
  test(`R2 package export asset spelling ${suffix} is refused at manifest and importer`, () => {
    const specifier = `@interdomestik/database/review-seed.${suffix}`;
    const result = repositoryFixture(
      {
        [DB_PACKAGE]: packageJson({
          exports: { [`./review-seed.${suffix}`]: './src/seed-target-tls.ts' },
        }),
        [APP]: `import { installSeedTlsClients } from '${specifier}'; installSeedTlsClients();`,
      },
      ({ seedTls }) => assert.deepEqual(seedTls.graph.resolveSpecifier(APP, specifier).files, [TLS])
    );
    refused(result, DB_PACKAGE);
    refused(result, APP);
  });
}
for (const [form, imports, specifier] of [
  ['exact', { '#review-seed': './src/seed-target-tls.ts' }, '#review-seed'],
  [
    'conditional',
    {
      '#review-seed.css': {
        node: { development: ['./src/ordinary.ts', './src/seed-target-tls.ts'] },
      },
    },
    '#review-seed.css',
  ],
  ['pattern', { '#review-*.json': { custom: ['./src/seed-target-*.ts'] } }, '#review-tls.json'],
  ['package target', { '#review-seed': '@interdomestik/database/seed-target-tls' }, '#review-seed'],
]) {
  test(`R2 package imports resolve ${form}`, () => {
    const result = repositoryFixture(
      {
        [DB_PACKAGE]: packageJson({ imports }),
        [RUNTIME]: `import '${specifier}';`,
      },
      ({ seedTls }) =>
        assert.ok(seedTls.graph.resolveSpecifier(RUNTIME, specifier).files.includes(TLS))
    );
    refused(result, DB_PACKAGE);
    refused(result, RUNTIME);
  });
}
for (const [form, extra] of [
  [
    'exports nested array',
    { exports: { './unused.css': { custom: { other: [null, './src/seed-target-tls.ts'] } } } },
  ],
  ['exports pattern', { exports: { './*.json': ['./src/*.ts'] } }],
  ['exports root array', { exports: [null, { custom: './src/seed-target-guard.ts' }] }],
  ['imports pattern', { imports: { '#*.css': { custom: ['./src/*.ts'] } } }],
]) {
  test(`R2 unused ${form} mapping is itself refused`, () => {
    refused(repositoryFixture({ [DB_PACKAGE]: packageJson(extra) }), DB_PACKAGE);
  });
}
test('R2 manifests outside workspace roots cannot expose the closure', () => {
  const file = 'tools/nested/aliases/package.json';
  refused(
    repositoryFixture({
      [file]: JSON.stringify({
        imports: { '#unused.css': '../../../packages/database/src/seed-target-tls.ts' },
      }),
    }),
    file
  );
});
test('R2 nearest package scope wins for hash imports, including non-workspace packages', () => {
  const bridge = 'scripts/nested/bridge.ts';
  const result = repositoryFixture({
    'package.json': JSON.stringify({ imports: { '#bridge': './scripts/nested/bridge.ts' } }),
    'scripts/nested/package.json': JSON.stringify({
      imports: { '#seed': '../../packages/database/src/seed-target-tls.ts' },
    }),
    [bridge]: "import '#seed';",
    [APP]: "import '#bridge';",
  });
  refused(result, APP);
});
test('R2 benign asset imports and unrelated mappings stay admitted', () => {
  assert.deepEqual(
    repositoryFixture({
      [DB_PACKAGE]: packageJson({
        exports: { './review.json': './src/ordinary.ts' },
        imports: { '#data': './data.json' },
      }),
      'packages/database/src/ordinary.ts': 'export const data = 1;',
      'packages/database/data.json': '{}',
      [APP]: "import '@interdomestik/database/review.json'; import './style.css';",
      [RUNTIME]: "import '#data';",
    }).violations,
    []
  );
});
test('R2 package import alias cycles terminate and retain reachable alternatives', () => {
  refused(
    repositoryFixture({
      [DB_PACKAGE]: packageJson({
        imports: { '#a': ['#b', './src/seed-target-tls.ts'], '#b': '#a' },
      }),
      [RUNTIME]: "import '#b';",
    }),
    RUNTIME
  );
});

test('R2 unused wildcard targets retain extension substitution and package alias chains', () => {
  const other = 'tools/aliases/package.json';
  const result = repositoryFixture({
    [DB_PACKAGE]: packageJson({ exports: { './*.css': './src/*.js' } }),
    [other]: JSON.stringify({ imports: { '#*.json': '@interdomestik/database/*.css' } }),
  });
  refused(result, DB_PACKAGE);
  refused(result, other);
});
test('R2 repeated target wildcard substitutions cannot hide an unused mapping', () => {
  // One capture "e" occurs twice in the target, producing seed-target-tls.ts.
  refused(
    repositoryFixture({
      [DB_PACKAGE]: packageJson({ exports: { './*.json': './src/s**d-target-tls.ts' } }),
    }),
    DB_PACKAGE
  );
});

for (const target of [
  '@interdomestik/database/seed-*',
  '@interdomestik/database/seed-*.js',
  '~/seed-*',
]) {
  test(`R2 unused wildcard through workspace or tsconfig alias: ${target}`, () => {
    refused(
      repositoryFixture(
        {
          [DB_PACKAGE]: packageJson({ imports: { '#seed-*': target } }),
        },
        ({ seedTls }) =>
          assert.ok(
            seedTls.graph.resolveSpecifier(RUNTIME, '#seed-target-tls').files.includes(TLS)
          ),
        {
          pathRules: [{ pattern: '~/*', targets: ['packages/database/src/*'] }],
          baseRoots: [],
        }
      ),
      DB_PACKAGE
    );
  });
}

test('R2 wildcard-to-constant tsconfig aliases preserve all possible captures', () => {
  refused(
    repositoryFixture(
      {
        [DB_PACKAGE]: packageJson({ imports: { '#seed-*': 'bridge-fixed-*' } }),
      },
      ({ seedTls }) =>
        assert.ok(seedTls.graph.resolveSpecifier(RUNTIME, '#seed-target-tls').files.includes(TLS)),
      {
        pathRules: [{ pattern: 'bridge-*', targets: [TLS] }],
        baseRoots: [],
      }
    ),
    DB_PACKAGE
  );
});
test('R2 wildcard-to-constant package aliases taint every overlapping mapping', () => {
  const other = 'tools/aliases/package.json';
  const result = repositoryFixture({
    [DB_PACKAGE]: packageJson({ exports: { './alias-*': './src/seed-target-tls.ts' } }),
    [other]: JSON.stringify({ imports: { '#seed-*': '@interdomestik/database/alias-fixed-*' } }),
  });
  refused(result, DB_PACKAGE);
  refused(result, other);
});
test('R2 disjoint wildcard mappings remain unrelated to a constant-target alias', () => {
  assert.deepEqual(
    repositoryFixture(
      {
        [DB_PACKAGE]: packageJson({ imports: { '#ordinary-*': 'other-*' } }),
      },
      () => {},
      { pathRules: [{ pattern: 'bridge-*', targets: [TLS] }], baseRoots: [] }
    ).violations,
    []
  );
});
