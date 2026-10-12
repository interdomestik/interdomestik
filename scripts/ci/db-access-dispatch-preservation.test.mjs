import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createTempRepo,
  sealFixture,
  writeFixture,
  runGuard,
  readReport,
  scan,
} from './db-access-guard-test-utils.mjs';

test('covered source-local calls retain named, inline and contained callback remounts', () => {
  for (const argument of ['old', '()=>old()', '{ run: old }']) {
    const root = createTempRepo();
    writeFixture(root, 'apps/web/src/legacy.ts', [
      'import {db} from "@interdomestik/database";',
      'export function old(){return db.select();}',
    ]);
    sealFixture(root);
    writeFixture(root, 'apps/web/src/app/page.tsx', [
      'import {old} from "../legacy";',
      'function local(callback:any){return 1;}',
      `export default function Page(){return local(${argument});}`,
    ]);
    assert.equal(runGuard(root).status, 1, argument);
    const report = readReport(root);
    assert.ok(
      report.failingNewEntries.some(entry => entry.file.endsWith('legacy.ts')),
      JSON.stringify(report)
    );
  }
});

test('covered source-local dispatch never exempts a dynamic loader name', () => {
  for (const name of ['eval', 'Function', 'require', 'createRequire']) {
    const { result, report } = scan(`function ${name}(){return 1;} ${name}();`);
    assert.equal(result.status, 1, name);
    assert.ok(
      report.incomplete.some(item => item.reason === 'unsupported dynamic code/module loader'),
      JSON.stringify(report)
    );
  }
});
