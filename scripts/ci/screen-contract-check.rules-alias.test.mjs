import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';

// Finding 7 (r3): an entry without `*` is a fixed-file fallback, as in TypeScript, tried in order.
// `"apps/web/src"` was an input error before; TypeScript maps every `@/` specifier to it, so it is
// valid here too (a corrected expectation, measured below against ts.resolveModuleName).
test('F7: an @/* entry without * is a fixed fallback for every @/ specifier, in order', async t => {
  const root = tree(t, {
    'tsconfig.json':
      '{\n  "compilerOptions": { "moduleResolution": "bundler", "baseUrl": ".", "paths": { "@/*": ["apps/web/src/*", "apps/web/src/fallback.ts"] } }\n}\n',
    'apps/web/tsconfig.json':
      '{\n  "compilerOptions": { "moduleResolution": "bundler", "paths": { "@/*": ["./src/*", "./src"] } },\n}\n',
    [`${W}/fallback.ts`]: "'use server';\nexport async function fb() {}\n",
    [`${W}/index.ts`]: 'export const ix = 1;\n',
    [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
    // No file under the first entry: the fixed file (layer 2) under a domain source.
    'packages/domain-claims/src/fb.ts': "import { fb } from '@/absent';\nexport const f = fb;\n",
    [`${W}/lib/util.ts`]: 'export const util = 1;\n',
    // The first entry names a file (support, no layer): the fallback is not reached.
    'packages/domain-claims/src/first.ts':
      "import { util } from '@/lib/util';\nexport const u = util;\n",
    // The web fallback `./src` has no extension: its directory index (a layer-1 screen file) under
    // a web action.
    [`${W}/actions/ix.ts`]:
      "'use server';\nimport { ix } from '@/absent';\nexport async function a() { return ix; }\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/fb.ts|@/absent');
  lacks(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/first.ts');
  has(result, 'CHK-15a', `CHK-15a|${W}/actions/ix.ts|@/absent`);
});

test('F7: @/x.js names x.ts before x.js, as TypeScript does (CHK-15a)', async t => {
  const root = tree(t, {
    [`${W}/lib/save.ts`]: "'use server';\nexport async function save() {}\n",
    [`${W}/lib/save.js`]: 'export async function save() {}\n',
    [`${W}/components/view.tsx`]: 'export const View = () => null;\n',
    'packages/domain-claims/src/save-edge.ts':
      "import { save } from '@/lib/save.js';\nexport const s = save;\n",
  });
  const result = await lint(root);
  has(result, 'CHK-15a', 'CHK-15a|packages/domain-claims/src/save-edge.ts|@/lib/save.js');
});

// The @/ alias against TypeScript's own resolver (5.9, moduleResolution Bundler, allowJs): for each
// specifier extension and each set of files beside it, and for ordered entries with a fixed-file
// fallback, the scanner resolves the file TypeScript resolves, or none where it resolves none.
// Not modelled (a recorded limit): `.d.json.ts`, `.d<ext>.ts` declaration files for other
// extensions, `typesVersions`, a directory's own package.json.
const ALIAS_FILES = ['save.ts', 'save.tsx', 'save.js', 'save.d.ts', 'save/index.ts'];
const ALIAS_SPECS = ['save.js', 'save', 'save.ts', 'save.jsx'];
const subsetsOf = list =>
  list.reduce((sets, item) => [...sets, ...sets.map(set => [...set, item])], [[]]).slice(1);
const COMPILER_OPTIONS = '"moduleResolution": "bundler", "module": "esnext", "allowJs": true';

function tsResolver(root, configRel) {
  const configPath = path.join(root, configRel);
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return (fromRel, specifier) => {
    const result = ts.resolveModuleName(specifier, path.join(root, fromRel), options, ts.sys);
    const file = result.resolvedModule?.resolvedFileName;
    return file ? path.relative(root, file).split(path.sep).join('/') : null;
  };
}

test(`F7: the @/ alias resolves TypeScript's file for four specifier spellings and every file set`, t => {
  const files = {
    [`${W}/index.ts`]: 'export const ix = 1;\n',
    [`${W}/fallback.ts`]: 'export const fb = 1;\n',
    [`${W}/lib/dual.js`]: 'export const d = 1;\n',
    [`${W}/dual.ts`]: 'export const d = 1;\n',
    'tsconfig.json': `{ "compilerOptions": { ${COMPILER_OPTIONS}, "baseUrl": ".", "paths": { "@/*": ["apps/web/src/lib/*", "apps/web/src/*", "apps/web/src/fallback.ts"] } } }\n`,
    // No fallback here (r4 hardening): an unresolved lookup must come back unresolved.
    'apps/web/tsconfig.json': `{ "compilerOptions": { ${COMPILER_OPTIONS}, "paths": { "@/*": ["./src/*"] } } }\n`,
  };
  const specifiers = ['@/dual', '@/absent'];
  subsetsOf(ALIAS_FILES).forEach((set, index) => {
    for (const file of set) files[`${W}/m${index}/${file}`] = 'export const x = 1;\n';
    for (const spec of ALIAS_SPECS) specifiers.push(`@/m${index}/${spec}`);
  });
  const root = fs.realpathSync(tree(t, files));
  const resolver = resolverFor(root);
  const callers = [
    { fromRel: `${W}/caller.ts`, oracle: tsResolver(root, 'apps/web/tsconfig.json') },
    { fromRel: 'packages/domain-claims/src/caller.ts', oracle: tsResolver(root, 'tsconfig.json') },
  ];
  let resolved = 0;
  for (const { fromRel, oracle } of callers) {
    for (const specifier of specifiers) {
      const expected = oracle(fromRel, specifier);
      if (expected) resolved += 1;
      assert.equal(resolver.resolveFile(fromRel, specifier), expected, `${fromRel} ${specifier}`);
    }
  }
  // The root caller's fixed-file fallback resolves every lookup; the web caller's has none.
  assert.ok(resolved > specifiers.length, String(resolved));
  assert.ok(resolved < callers.length * specifiers.length, String(resolved));
});
