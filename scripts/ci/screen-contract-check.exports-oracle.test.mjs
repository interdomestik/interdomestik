import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { byCodeUnit } from './server-mutation/ast.mjs';
import { checkEdge, environmentsFor } from './screen-contract/exports.mjs';
import {
  ALL_ENVS,
  NODE_VERSION,
  buildFixture,
  fileExistsIn,
  moduleVerdict,
  requireFromHere,
  subpathOf,
  typesOracle,
} from './fixtures/screen-contract-check/exports-fixtures.mjs';
import { CASES_A } from './fixtures/screen-contract-check/exports-oracle-cases-a.mjs';
import { CASES_B } from './fixtures/screen-contract-check/exports-oracle-cases-b.mjs';

const { ResolverFactory, CachedInputFileSystem } = requireFromHere('enhanced-resolve');

function childEnv() {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runChild(args, cwd) {
  const out = execFileSync(process.execPath, args, { cwd, env: childEnv(), encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

// Node ESM: import.meta.resolve names the file Node selects, but it masks the
// two errors the import itself raises for that file (ERR_MODULE_NOT_FOUND and
// ERR_UNSUPPORTED_DIR_IMPORT; Node's initializeImportMeta returns error.url for
// them). The import is therefore run too, and either code is a refusal. Any
// other import error (an unknown extension, type stripping under node_modules)
// comes after resolution and is not a resolution verdict.
function nodeImportOracle(fixture, specs) {
  const script = `
    const NOT_FOUND = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);
    const out = [];
    for (const spec of ${JSON.stringify(specs)}) {
      let file;
      try {
        file = new URL(import.meta.resolve(spec)).pathname;
      } catch (error) {
        out.push({ resolved: false, detail: String(error.code) });
        continue;
      }
      try {
        await import(spec);
        out.push({ resolved: true, file });
      } catch (error) {
        if (NOT_FOUND.has(error.code)) out.push({ resolved: false, detail: error.code, file });
        else out.push({ resolved: true, file, after: String(error.code) });
      }
    }
    console.log(JSON.stringify(out));
  `;
  return runChild(['--input-type=module', '-e', script], fixture.root);
}

// Node CJS: require.resolve applies the same exports algorithm, then checks the
// file; its MODULE_NOT_FOUND for a selected target that is absent is a refusal.
function nodeRequireOracle(fixture, specs) {
  const script = `
    const req = require('node:module').createRequire(${JSON.stringify(fixture.importer)});
    const out = [];
    for (const spec of ${JSON.stringify(specs)}) {
      try {
        out.push({ resolved: true, file: req.resolve(spec) });
      } catch (error) {
        out.push({ resolved: false, detail: String(error.code) });
      }
    }
    console.log(JSON.stringify(out));
  `;
  return runChild(['-e', script], fixture.root);
}

function bundlerBrowserOracle(fixture, specs) {
  const resolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    useSyncFileSystemCalls: true,
    conditionNames: ['browser', 'import', 'default'],
    exportsFields: ['exports'],
    mainFields: [],
    extensions: ['.js', '.ts', '.d.ts'],
  });
  return specs.map(spec => {
    try {
      const file = resolver.resolveSync({}, fixture.root, spec);
      return file ? { resolved: true, file } : { resolved: false, detail: 'false' };
    } catch (error) {
      return { resolved: false, detail: String(error.message).split('\n')[0] };
    }
  });
}

const ORACLES = {
  'node-import': nodeImportOracle,
  'node-require': nodeRequireOracle,
  'bundler-browser': bundlerBrowserOracle,
  types: typesOracle,
};

const CASES = [...CASES_A, ...CASES_B];

for (const testCase of CASES) {
  test(`oracle ${testCase.name} (node ${NODE_VERSION})`, t => {
    const fixture = buildFixture(t, testCase.exports, testCase.files);
    const specs = Object.keys(testCase.expect);
    const oracleEnvs = testCase.oracleEnvs ?? ALL_ENVS;

    for (const env of ALL_ENVS) {
      for (const spec of specs) {
        const expected = testCase.expect[spec][env];
        const verdict = moduleVerdict(fixture, spec, env);
        if (expected.startsWith('./')) {
          assert.deepEqual(verdict, { status: 'resolved', target: expected }, `${spec} ${env}`);
        } else {
          assert.deepEqual(verdict, { status: expected }, `${spec} ${env}`);
        }
      }
    }

    for (const env of oracleEnvs) {
      const results = ORACLES[env](fixture, specs);
      specs.forEach((spec, index) => {
        const oracle = results[index];
        const verdict = moduleVerdict(fixture, spec, env);
        const label = `${spec} under ${env}: oracle ${JSON.stringify(oracle)}, module ${JSON.stringify(verdict)}`;
        assert.equal(oracle.resolved, verdict.status === 'resolved', label);
        if (oracle.resolved) {
          const want = path.join(fixture.pkgDir, verdict.target.slice(2));
          assert.ok(oracle.file.endsWith(want), label);
        }
      });
    }

    for (const [spec, edges] of Object.entries(testCase.edges ?? {})) {
      for (const [edgeKind, ok] of Object.entries(edges)) {
        const result = checkEdge(
          fixture.pkg,
          subpathOf(spec),
          edgeKind,
          fileExistsIn(fixture.pkgDir)
        );
        assert.equal(result.ok, ok, `${spec} ${edgeKind}: ${JSON.stringify(result)}`);
        assert.deepEqual(
          Object.keys(result.environments).sort(byCodeUnit),
          environmentsFor(edgeKind).slice().sort(byCodeUnit)
        );
      }
    }
  });
}
