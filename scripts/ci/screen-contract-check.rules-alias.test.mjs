import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

import {
  lint,
  rootTsconfig,
  tree,
  webTsconfig,
} from './fixtures/screen-contract-check/harness.mjs';
import { resolverFor } from './screen-contract/specifiers.mjs';
import { W } from './fixtures/screen-contract-check/cli-fixtures.mjs';
import { has, lacks } from './fixtures/screen-contract-check/rules-fixtures.mjs';

// Finding 7 (r3) modelled a fixed-file fallback entry and ordered entries. Under the fixed
// configuration (the WP-05 flip, D-1 option B) neither is modelled: both are refused.
test('F7: an @/* entry without *, or a second entry, is refused (fixed configuration)', async t => {
  await assert.rejects(
    lint(
      tree(t, {
        'apps/web/tsconfig.json':
          '{\n  "compilerOptions": { "moduleResolution": "bundler", "paths": { "@/*": ["./src/*", "./src"] } },\n}\n',
      })
    ),
    /apps\/web\/tsconfig\.json has an @\/\* mapping other than the fixed.*scanner PR first/u
  );
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
// specifier extension and each set of files beside it, under the fixed configuration's mappings,
// the scanner resolves the file TypeScript resolves, or none where it resolves none.
// Not modelled (a recorded limit): `.d.json.ts`, `.d<ext>.ts` declaration files for other
// extensions, `typesVersions`, a directory's own package.json.
const ALIAS_FILES = ['save.ts', 'save.tsx', 'save.js', 'save.d.ts', 'save/index.ts'];
const ALIAS_SPECS = ['save.js', 'save', 'save.ts', 'save.jsx'];
const subsetsOf = list =>
  list.reduce((sets, item) => [...sets, ...sets.map(set => [...set, item])], [[]]).slice(1);
const COMPILER_OPTIONS = { module: 'esnext', allowJs: true };

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
    [`${W}/lib/dual.js`]: 'export const d = 1;\n',
    [`${W}/dual.ts`]: 'export const d = 1;\n',
    'tsconfig.json': rootTsconfig(COMPILER_OPTIONS),
    'apps/web/tsconfig.json': webTsconfig(COMPILER_OPTIONS),
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
  // Some lookups resolve and some (`@/absent`, empty file sets for a spelling) do not.
  assert.ok(resolved > 0, String(resolved));
  assert.ok(resolved < callers.length * specifiers.length, String(resolved));
});
