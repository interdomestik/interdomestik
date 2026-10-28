// Execute the exact browser suite's registered afterAll with finite test doubles.
// This is not a browser run or private runtime authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
const sourceFile = new URL(
  './m4-compiled-fixture/project/tests/compiled-entry.spec.mjs',
  import.meta.url
);
const outputModule = new URL('./m4-compiled-fixture/project/browser-output.mjs', import.meta.url);
const original = fs.readFileSync(sourceFile, 'utf8');
const imported =
  "import { assertOwnedBrowserOutput, browserRowsComplete } from '../browser-output.mjs';";
const makeRow = (profile, index) => ({
  profile,
  operationId: 'operation-' + index,
  frameworkActionId: 'action-' + index,
});
async function run(source, rows, denial) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-afterall-')));
  const priorOutput = process.env.M4_COMPILED_BROWSER_OUTPUT;
  try {
    fs.mkdirSync(path.join(root, 'tests'));
    fs.mkdirSync(path.join(root, 'app'));
    const out = path.join(root, 'out');
    fs.mkdirSync(out, { mode: 0o700 });
    process.env.M4_COMPILED_BROWSER_OUTPUT = out;
    fs.copyFileSync(outputModule, path.join(root, 'browser-output.mjs'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
    fs.writeFileSync(
      path.join(root, 'tests/strict-firefox.fixture.mjs'),
      `export function test(){}; test.describe={configure(){}}; test.afterAll=callback=>globalThis.__m4AfterAll=callback; export const expect=()=>{};\n`
    );
    fs.writeFileSync(
      path.join(root, 'image-custody.mjs'),
      `export function readOwned(){return JSON.stringify({version:1,cases:['legacy-admin','legacy-agent','staff'].map(profile=>({profile,cookies:[{name:'test',value:'synthetic'}]}))})}; export function readPinned(){return {actionMap:{exports:{}}}};\n`
    );
    fs.writeFileSync(
      path.join(root, 'app/fixture-plan.js'),
      `export function readPlan(){return {scenarios:['legacy-admin','legacy-agent','staff'].map(profile=>({profile}))}};\n`
    );
    const tail = '\nexport function setTestOnlyRows(r,d){results.push(...r);denial=d;}\n';
    const suite = path.join(root, 'tests/compiled-entry.spec.mjs');
    fs.writeFileSync(suite, source + tail);
    const loaded = await import(pathToFileURL(suite).href + '?case=' + randomUUID());
    loaded.setTestOnlyRows(rows, denial);
    assert.equal(typeof globalThis.__m4AfterAll, 'function');
    await globalThis.__m4AfterAll();
    const output = path.join(out, 'observed-actions.json');
    const data = JSON.parse(fs.readFileSync(output));
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    await assert.rejects(globalThis.__m4AfterAll(), /EEXIST/);
    return data;
  } finally {
    delete globalThis.__m4AfterAll;
    if (priorOutput === undefined) delete process.env.M4_COMPILED_BROWSER_OUTPUT;
    else process.env.M4_COMPILED_BROWSER_OUTPUT = priorOutput;
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('actual suite afterAll writes complete four-operation data and refuses replacement', async () => {
  const rows = ['legacy-admin', 'legacy-agent', 'staff'].map(makeRow),
    denial = makeRow('legacy-admin', 3);
  const value = await run(original, rows, denial);
  assert.equal(value.complete, true);
  assert.deepEqual(value.rows, rows);
  assert.deepEqual(value.denial, denial);
  assert.equal(value.nativeAdmission, false);
  assert.equal(value.productionCCredit, 0);
});
test('actual suite afterAll marks partial evidence incomplete', async () => {
  const rows = ['legacy-admin', 'legacy-agent'].map(makeRow);
  const value = await run(original, rows, null);
  assert.equal(value.complete, false);
  assert.deepEqual(value.rows, rows);
});
test('the V1 missing-import regression fails at the actual afterAll callback', async () => {
  assert.equal(original.split(imported).length, 2);
  const mutant = original.replace(
    imported,
    "import { assertOwnedBrowserOutput } from '../browser-output.mjs';"
  );
  await assert.rejects(
    run(mutant, ['legacy-admin', 'legacy-agent', 'staff'].map(makeRow), makeRow('legacy-admin', 3)),
    /browserRowsComplete is not defined/
  );
});
test('existing ESLint no-undef catches missing harness bindings', () => {
  const root = new URL('../../', import.meta.url);
  const require = createRequire(new URL('./apps/web/package.json', root));
  const { Linter } = require('eslint');
  const lint = source =>
    new Linter().verify(source, {
      languageOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        globals: {
          process: 'readonly',
          Buffer: 'readonly',
          URL: 'readonly',
          setTimeout: 'readonly',
          clearTimeout: 'readonly',
        },
      },
      rules: { 'no-undef': 'error' },
    });
  for (const relative of [
    './m4-compiled-fixture/project/browser-output.mjs',
    './m4-compiled-fixture/project/image-custody.mjs',
    './m4-compiled-fixture/project/playwright.config.mjs',
    './m4-compiled-fixture/project/tests/compiled-entry.spec.mjs',
    './m4-compiled-fixture/project/tests/strict-firefox.fixture.mjs',
    './m4-compiled-fixture/project/tests/browser-trust.spec.mjs',
    './m4-compiled-fixture/seal-build.mjs',
  ]) {
    const issues = lint(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
    assert.deepEqual(issues, [], relative);
  }
  const missingImport = original.replace(
    imported,
    "import { assertOwnedBrowserOutput } from '../browser-output.mjs';"
  );
  assert.ok(
    lint(missingImport).some(
      issue => issue.ruleId === 'no-undef' && issue.message.includes('browserRowsComplete')
    )
  );
  assert.ok(
    lint(
      'function close(){if(closePromise)return closePromise;closePromise=Promise.resolve();} close();'
    ).some(issue => issue.ruleId === 'no-undef' && issue.message.includes('closePromise'))
  );
});
