// D-1 of the WP-05 flip: the oracle tests. The extension list is the installed Next's, and webpack's
// pick is always among the targets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import { tree } from './fixtures/screen-contract-check/harness.mjs';
import { W, FROM, X } from './fixtures/screen-contract-check/resolution-fixtures.mjs';
import { WEBPACK_EXTENSIONS } from './screen-contract/resolution.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';

// The extension list D-1 models is the installed Next's: a Next upgrade that changes it fails here
// (the lead's note: 16.3.8 → 16.4.x). Read from the build's source text, `resolveConfig.extensions`.
test('D-1: WEBPACK_EXTENSIONS equals the installed Next build’s resolve.extensions', () => {
  const web = createRequire(path.resolve('apps/web/package.json'));
  const file = path.join(
    path.dirname(web.resolve('next/package.json')),
    'dist/build/webpack-config.js'
  );
  const text = fs.readFileSync(file, 'utf8');
  const block = /const resolveConfig = \{[\s\S]*?extensions: \[([^\]]*)\]/u.exec(text);
  assert.ok(block, 'resolveConfig.extensions not found in Next’s webpack-config.js');
  const installed = [...block[1].matchAll(/'([^']+)'/gu)].map(m => m[1]);
  assert.deepEqual([...WEBPACK_EXTENSIONS], installed);
  assert.doesNotMatch(text.slice(block.index, block.index + 2000), /mainFiles:/u);
});

// An oracle written apart from the resolver: webpack's order as Next 16 configures `next build
// --webpack` (the exact request, then each extension, then the directory index). Its pick is always
// among the targets, and every target is its pick or TypeScript's.
function oraclePick(exists, base) {
  for (const candidate of [base, ...WEBPACK_EXTENSIONS.map(e => base + e)])
    if (exists(candidate)) return candidate;
  for (const e of WEBPACK_EXTENSIONS) if (exists(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

test('D-1: webpack’s pick is among at most two targets for every file set and spelling', t => {
  const NAMES = [
    'save.ts',
    'save.tsx',
    'save.js',
    'save.mjs',
    'save.d.ts',
    'save/index.ts',
    'save/index.js',
  ];
  const SPECS = ['save', 'save.js', 'save.mjs', 'save.ts', 'save.jsx'];
  const files = {};
  const sets = NAMES.reduce((acc, n) => [...acc, ...acc.map(s => [...s, n])], [[]]).slice(1);
  sets.forEach((set, i) => {
    for (const name of set) files[`${W}/m${i}/${name}`] = X;
  });
  const root = fs.realpathSync(tree(t, files));
  const resolver = resolverFor(root);
  const exists = rel => fs.existsSync(`${root}/${rel}`) && fs.statSync(`${root}/${rel}`).isFile();
  let checked = 0;
  sets.forEach((_, i) => {
    for (const spec of SPECS) {
      const targets = resolver.resolveTargets(FROM, `@/m${i}/${spec}`);
      assert.ok(targets.length <= 2, `${i} ${spec} ${targets}`);
      const pick = oraclePick(exists, `${W}/m${i}/${spec}`);
      if (!pick) continue;
      checked += 1;
      assert.ok(targets.includes(pick), `${i} ${spec} ${pick}`);
    }
  });
  assert.ok(checked > 200, String(checked));
});
