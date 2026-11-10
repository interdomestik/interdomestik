import assert from 'node:assert/strict';
import path from 'node:path/posix';
import test from 'node:test';
import {
  APP,
  refused,
  repositoryFixture,
  RUNTIME,
  TLS,
} from './tenant-guard-seed-tls-test-support.mjs';
const edge = (from, to) => {
  const specifier = path.relative(path.dirname(from), to);
  return `import '${specifier.startsWith('.') ? specifier : './' + specifier}';`;
};
const bridges = [
  'scripts/r2-review-bridge.ts',
  'apps/web/e2e/r2-review-bridge.ts',
  'apps/web/instrumentation.ts',
  'apps/web/middleware.ts',
  'tools/anywhere/bridge.mjs',
];
for (const bridge of bridges) {
  test(`R2 on-demand reachability through ${bridge}`, () => {
    const result = repositoryFixture(
      { [bridge]: edge(bridge, TLS), [RUNTIME]: edge(RUNTIME, bridge) },
      ({ sources }) => assert.ok(!sources.has(bridge))
    );
    refused(result, RUNTIME);
  });
}
test('R2 app side-effect import through scripts is refused at the collected importer', () => {
  const bridge = bridges[0];
  refused(repositoryFixture({ [bridge]: edge(bridge, TLS), [APP]: edge(APP, bridge) }), APP);
});
for (const entry of [
  'middleware.ts',
  'instrumentation.ts',
  'runtime.ts',
  'runtime.tsx',
  'runtime.mjs',
  'runtime.js',
  'vitest.config.ts',
]) {
  test(`R2 independently loaded web root ${entry} is checked`, () => {
    const file = `apps/web/${entry}`;
    refused(repositoryFixture({ [file]: edge(file, TLS) }), file);
  });
}
test('R2 root tests and byte-compared Next config are not standalone runtime entries', () => {
  assert.deepEqual(
    repositoryFixture({
      'apps/web/helper.test.ts': edge('apps/web/helper.test.ts', TLS),
      'apps/web/next.config.mjs': edge('apps/web/next.config.mjs', TLS),
    }).violations,
    []
  );
});
test('R2 importing Next config still follows its edges', () => {
  const config = 'apps/web/next.config.mjs';
  refused(repositoryFixture({ [config]: edge(config, TLS), [APP]: edge(APP, config) }), APP);
});
test('R2 uncollected chains and cycles retain seed reachability', () => {
  const a = 'scripts/a.ts',
    b = 'scripts/b.ts',
    c = 'tools/c.ts';
  refused(
    repositoryFixture({
      [a]: edge(a, b),
      [b]: `${edge(b, a)} ${edge(b, c)}`,
      [c]: edge(c, TLS),
      [APP]: edge(APP, a),
    }),
    APP
  );
});
test('R2 benign uncollected cycles terminate without a violation', () => {
  assert.deepEqual(
    repositoryFixture({
      'scripts/a.ts': "import './b';",
      'scripts/b.ts': "import './a';",
      [APP]: "import '../../../scripts/a';",
    }).violations,
    []
  );
});
test('R2 extension substitution and tsconfig aliases follow uncollected sources', () => {
  const bridge = 'scripts/bridge.ts';
  refused(
    repositoryFixture({ [bridge]: edge(bridge, TLS), [APP]: "import 'bridge.json';" }, () => {}, {
      pathRules: [{ pattern: 'bridge.json', targets: ['scripts/bridge.js'] }],
      baseRoots: [],
    }),
    APP
  );
});
test('R2 external tests taint through further uncollected helper modules', () => {
  refused(
    repositoryFixture({
      'scripts/bridge.test.ts': "export * from './helper';",
      'scripts/helper.ts': 'export const run = () => eval(code);',
      [APP]: "export * from '../../../scripts/bridge.test';",
    }),
    APP
  );
});
test('R2 repository path escapes fail closed', () => {
  assert.throws(
    () => repositoryFixture({ [APP]: "import '../../../../escaped';" }),
    /seed path escape/u
  );
});
