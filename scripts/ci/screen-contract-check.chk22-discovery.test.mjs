import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { lint, tempDir, tree, writeTree } from './fixtures/screen-contract-check/harness.mjs';
import { originIn, originOf } from './screen-contract/origins.mjs';
import {
  PAGE,
  REG,
  W,
  base,
  chk22,
  registry,
} from './fixtures/screen-contract-check/chk22-fixtures.mjs';

test('CHK-22 discovery: attribute, handler, label key and catalogue text (B3)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        'export function D({ setAgreed }) {',
        "  const t = useTranslations('signup');",
        '  return (<div>',
        '    <input type="checkbox" name="terms" />',
        '    <Checkbox id="box" onCheckedChange={setAgreed} />',
        '    <label><input type="checkbox" id="n1" />{t("terms")}</label>',
        '    <Checkbox id="n2" /><label htmlFor="n2">{t("sneaky")}</label>',
        '    <Checkbox id="n3" /><label htmlFor="n3">{t("neutral")}</label>',
        '    <input type="text" name="terms" />',
        '  </div>);',
        '}',
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [
    `CHK-22|${file}|unregistered|Checkbox:box`,
    `CHK-22|${file}|unregistered|Checkbox:n2`,
    `CHK-22|${file}|unregistered|input:n1`,
    `CHK-22|${file}|unregistered|input:terms`,
  ]);
});

test('CHK-22: a label key missing from the catalogue is a scanner error', async t => {
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [PAGE]:
        "import { useTranslations } from 'next-intl';\nexport default function P() { const t = useTranslations('signup'); return <label><input type=\"checkbox\" />{t('gone')}</label>; }\n",
    })
  );
  await assert.rejects(lint(root), /signup\.gone is not in the English catalogue/u);
});

test('CHK-22 discovery: a dynamic data-consent and each aria-labelledby id count (H2)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        'export function D({ kind }) {',
        "  const t = useTranslations('signup');",
        '  return (<div>',
        '    <Checkbox id="box1" data-consent={kind} />',
        '    <Checkbox id="n4" aria-labelledby="h1 h2" />',
        '    <span id="h1">{t("neutral")}</span><span id="h2">{t("sneaky")}</span>',
        '  </div>);',
        '}',
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [
    `CHK-22|${file}|unregistered|Checkbox:box1`,
    `CHK-22|${file}|unregistered|Checkbox:n4`,
  ]);
});

test('CHK-22 discovery: a translator resolves in the label scope, not by its name (code-r2 H)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [`${W}/messages/en/app.json`]: JSON.stringify({
        signup: { sneaky: 'I accept the terms' },
        other: { sneaky: 'Box two' },
      }),
      [file]: [
        "import { useTranslations } from 'next-intl';",
        "import { Checkbox } from '@interdomestik/ui';",
        "export function A() { const t = useTranslations('signup'); return <label><Checkbox id=\"a1\" />{t('sneaky')}</label>; }",
        "export function B() { const t = useTranslations('other'); return <label><Checkbox id=\"b1\" />{t('sneaky')}</label>; }",
      ].join('\n'),
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${file}|unregistered|Checkbox:a1`]);
});

test('CHK-22 discovery: the shared Input with a choice type is a control (r3 F6)', async t => {
  const file = `${W}/components/d.tsx`;
  const root = tree(
    t,
    base({
      [REG]: registry([]),
      [file]:
        'import { Input } from \'@interdomestik/ui\';\nexport function D() { return <div><Input type="checkbox" name="terms" /><Input type="text" name="termsText" /></div>; }\n',
    })
  );
  assert.deepEqual(await chk22(root), [`CHK-22|${file}|unregistered|Input:terms`]);
});

// A relative-only resolver, so the origin tests do not depend on the workspace resolver.
const relativeResolver = root => ({
  root,
  resolveFile(fromRel, specifier) {
    if (!specifier.startsWith('.')) return null;
    const stem = path.posix.join(path.posix.dirname(fromRel), specifier);
    return (
      ['.ts', '.tsx'].map(ext => stem + ext).find(rel => fs.existsSync(path.join(root, rel))) ??
      null
    );
  },
});

test('CHK-22 origins: export * searches every star; none is unresolved, two are ambiguous (B6)', t => {
  const root = writeTree(tempDir(t), {
    'm/none.ts': 'export const Other = 1;\n',
    'm/has.ts': 'export const X = 1;\n',
    'm/also.ts': 'export const X = 2;\n',
    'm/via.ts': "export * from './has';\n",
    'm/later.ts': "export * from './none';\nexport * from './has';\n",
    'm/missing.ts': "export * from './none';\n",
    'm/twice.ts': "export * from './has';\nexport * from './also';\n",
    'm/diamond.ts': "export * from './has';\nexport * from './via';\n",
    'm/renamed.ts': 'const Local = 1;\nexport { Local as Public };\n',
    'm/barrel.ts': "export * from './none';\nexport { Public as Again } from './renamed';\n",
  });
  const resolver = relativeResolver(root);
  assert.deepEqual(originOf(resolver, 'x.ts', './m/later', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
  assert.deepEqual(originOf(resolver, 'x.ts', './m/diamond', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
  const renamed = { file: 'm/renamed.ts', name: 'Public', local: 'Local' };
  assert.deepEqual(originOf(resolver, 'x.ts', './m/renamed', 'Public'), renamed);
  assert.deepEqual(originOf(resolver, 'x.ts', './m/barrel', 'Again'), renamed);
  const missing = originOf(resolver, 'x.ts', './m/missing', 'X');
  assert.equal(missing.unresolved, true);
  assert.equal(missing.ambiguous, undefined);
  const twice = originOf(resolver, 'x.ts', './m/twice', 'X');
  assert.equal(twice.unresolved, true);
  assert.equal(twice.ambiguous, true);
});

test('CHK-22 origins: a path leaving the tree, an absolute path or a link is refused; a missing file is not an empty one (r3 F1)', t => {
  const outer = tempDir(t);
  const root = writeTree(path.join(outer, 'tree'), {
    'm/empty.ts': '',
    'm/has.ts': 'export const X = 1;\n',
  });
  writeTree(outer, { 'outside.ts': 'export const X = 1;\n' });
  fs.symlinkSync(path.join(outer, 'outside.ts'), path.join(root, 'm/link.ts'));
  const resolver = relativeResolver(root);
  assert.throws(
    () => originIn(resolver, '../outside.ts', 'X'),
    /not a plain path inside the tree/u
  );
  assert.throws(
    () => originIn(resolver, path.join(outer, 'outside.ts'), 'X'),
    /not a plain path inside the tree/u
  );
  assert.throws(
    () => originIn(resolver, 'm/link.ts', 'X'),
    /m\/link\.ts: link\.ts is a symbolic link/u
  );
  assert.deepEqual(originIn(resolver, 'm/gone.ts', 'X'), {
    file: 'm/gone.ts',
    name: 'X',
    unresolved: true,
    missing: true,
  });
  assert.equal(originIn(resolver, 'm/empty.ts', 'X'), null);
  assert.deepEqual(originIn(resolver, 'm/has.ts', 'X'), {
    file: 'm/has.ts',
    name: 'X',
    local: 'X',
  });
});
