// Contract tests of the screen-contract scanner's input handling (WP-05 code review r1: B3, B11):
// the file inventory, the pinned rule reconciliation, and the catalogue merge.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { ScanError } from './server-mutation/ast.mjs';
import { catalogueFor, messageText } from './screen-contract/catalogue.mjs';
import { CONFIG_PATH, SCANNER_ROOT, linted, ruleSets } from './screen-contract/lint.mjs';
import { ids, lint, tempDir, tree, writeTree } from './fixtures/screen-contract-check/harness.mjs';

const DB_IMPORT = "import { db } from '@interdomestik/database';\nexport default () => db;\n";

test('B3: a tracked route under a directory named coverage or dist is linted', async t => {
  const root = tree(t, {
    'apps/web/src/app/coverage/page.tsx': DB_IMPORT,
    'apps/web/src/app/dist/page.tsx': DB_IMPORT,
    'apps/web/src/app/.turbo/page.tsx': DB_IMPORT,
  });
  const files = linted(root);
  for (const rel of [
    'apps/web/src/app/coverage/page.tsx',
    'apps/web/src/app/dist/page.tsx',
    'apps/web/src/app/.turbo/page.tsx',
  ])
    assert.ok(files.includes(rel), `${rel} is in the inventory`);
  const found = ids(await lint(root), 'CHK-15c');
  assert.equal(found.filter(id => id.includes('/coverage/page.tsx|')).length, 1);
  assert.equal(found.filter(id => id.includes('/dist/page.tsx|')).length, 1);
});

// A config that re-exports the real one with its A11Y rule set changed.
function variantConfig(t, body) {
  const dir = tempDir(t, 'scc-config-');
  const real = pathToFileURL(path.join(SCANNER_ROOT, CONFIG_PATH)).href;
  const file = path.join(dir, 'config.mjs');
  fs.writeFileSync(
    file,
    `import config, * as real from ${JSON.stringify(real)};\n${body}\nexport default config;\n`
  );
  return file;
}

test('B3: a recommended jsx-a11y rule dropped from the config is a reconciliation error', async t => {
  const file = variantConfig(
    t,
    [
      'export const A11Y_EXCLUDED = real.A11Y_EXCLUDED;',
      'export const LOCAL_RULES = real.LOCAL_RULES;',
      "const { ['jsx-a11y/alt-text']: _dropped, ...rest } = real.A11Y_RULES;",
      'export const A11Y_RULES = rest;',
    ].join('\n')
  );
  await assert.rejects(ruleSets(file), error => {
    assert.ok(error instanceof ScanError);
    assert.match(error.message, /jsx-a11y\/alt-text/u);
    return true;
  });
});

test('B3: an exclusion the scanner does not pin is a reconciliation error', async t => {
  const file = variantConfig(
    t,
    [
      "export const A11Y_EXCLUDED = { ...real.A11Y_EXCLUDED, 'jsx-a11y/alt-text': 'no reason' };",
      'export const LOCAL_RULES = real.LOCAL_RULES;',
      "const { ['jsx-a11y/alt-text']: _dropped, ...rest } = real.A11Y_RULES;",
      'export const A11Y_RULES = rest;',
    ].join('\n')
  );
  await assert.rejects(ruleSets(file), /jsx-a11y\/alt-text/u);
});

test('B3: the real config reconciles against the pinned recommended set', async () => {
  const sets = await ruleSets();
  assert.ok(sets.A11Y.includes('jsx-a11y/alt-text'));
  assert.ok(!sets.A11Y.includes('jsx-a11y/label-has-associated-control'));
});

test('B11: catalogue keys named __proto__ or constructor do not reach shared object state', t => {
  const root = writeTree(tempDir(t), {
    'apps/web/src/messages/en/a.json': '{ "__proto__": { "polluted": "yes" }, "x": { "y": "1" } }',
    'apps/web/src/messages/en/b.json':
      '{ "constructor": { "prototype": { "polluted2": "yes" } }, "x": { "__proto__": { "polluted3": "yes" } } }',
  });
  const catalogue = catalogueFor(root);
  assert.equal({}.polluted, undefined);
  assert.equal({}.polluted2, undefined);
  assert.equal({}.polluted3, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(messageText(catalogue, 'x.y'), '1');
  assert.equal(messageText(catalogue, '__proto__.polluted'), 'yes');
  assert.equal(messageText(catalogue, 'toString'), null);
  assert.equal(messageText(catalogue, 'x.hasOwnProperty'), null);
});
