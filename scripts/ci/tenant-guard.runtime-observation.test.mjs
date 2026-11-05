import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, run } from './tenant-guard-test-support.mjs';

// U2-e: the runtime-authority observer is the one file besides tenant.ts that may call the tenant
// client directly, and only as a direct member call. Every other file, and every value use, alias
// or re-export in the observer itself, stays refused.

const OBSERVER = 'packages/database/src/runtime-authority-observation.ts';
const OTHER = 'packages/database/src/other-observer.ts';
const DIRECT = [
  "import { dbRls } from './db';",
  'export const observe = () => dbRls.transaction(async (tx: any) => tx.select());',
].join('\n');
const NOT_AVAILABLE = /dbRls is not available to this file/u;

test('U2-e: the observer may call the tenant client directly as a member', () => {
  const result = run({ [OBSERVER]: DIRECT });
  assert.ok(
    !result.violations.some(violation => /dbRls/u.test(violation.detail)),
    JSON.stringify(result.violations)
  );
});

test('U2-e: any other database or app file calling the tenant client is still refused', () => {
  assertRefused(run({ [OTHER]: DIRECT }), 'R-a', NOT_AVAILABLE);
  const app = DIRECT.replace("'./db'", "'@interdomestik/database/db'");
  assertRefused(run({ 'apps/web/src/attack.ts': app }), 'R-a', NOT_AVAILABLE);
});

test('U2-e: the observer cannot hand out, alias or re-export the tenant client', () => {
  const forms = {
    value:
      "import { dbRls } from './db';\nexport const leak = (sink: (c: unknown) => void) => sink(dbRls);",
    alias:
      "import { dbRls } from './db';\nconst client = dbRls;\nexport const read = () => client.select();",
    reexport: "export { dbRls } from './db';",
  };
  for (const [name, source] of Object.entries(forms)) {
    const result = run({ [OBSERVER]: source });
    assert.ok(
      result.violations.some(violation => violation.rule === 'R-a'),
      `${name}: ${JSON.stringify(result.violations)}`
    );
  }
});
