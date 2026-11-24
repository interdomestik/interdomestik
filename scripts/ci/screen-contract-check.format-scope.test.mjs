// Contract tests of CHK-09's binding-scoped formatter lookup (WP-05 flip, L6): a formatter call is
// matched through the variable its callee is bound to, never by its spelling, so a parameter or a
// local that shadows an imported formatter is not that formatter. The bound formatter itself is
// still flagged in the same file.
import assert from 'node:assert/strict';
import test from 'node:test';

import { lint, tree } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const linesOf = (result, key) =>
  result['CHK-09'].items
    .filter(item => item.id === key)
    .map(item => item.line)
    .sort((a, b) => a - b);

test('L6: a parameter or local shadowing a date-fns function or namespace is not a formatter', async t => {
  const file = `${W}/components/dates.tsx`;
  const root = tree(t, {
    [file]: [
      "import { format, format as fmt } from 'date-fns';",
      "import * as dateFns from 'date-fns';",
      'export function A({ d }) { return <p>{format(d, "P")}{fmt(d, "P")}{dateFns.format(d, "P")}</p>; }',
      'export function B({ d, format }) { return <p>{format(d)}</p>; }',
      'export function C({ d, dateFns }) { return <p>{dateFns.format(d)}</p>; }',
      'export function D({ d }) {',
      '  const fmt = (x: unknown) => String(x);',
      '  return <p>{fmt(d)}</p>;',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|date-fns.format`), [3, 3, 3]);
  assert.equal(result['CHK-09'].items.length, 3);
});

test('L6: a parameter or local shadowing a next-intl formatter or its method is not a formatter', async t => {
  const file = `${W}/components/intl.tsx`;
  const root = tree(t, {
    [file]: [
      "import { useFormatter } from 'next-intl';",
      'export function A({ n, d }) {',
      '  const format2 = useFormatter();',
      '  const { relativeTime } = useFormatter();',
      '  return <p>{format2.number(n)}{relativeTime(d)}</p>;',
      '}',
      'export function B({ n, d, format2, relativeTime }) {',
      '  return <p>{format2.number(n)}{relativeTime(d)}</p>;',
      '}',
      'export function C({ n }) {',
      '  const useFormatter = () => ({ number: (x: number) => String(x) });',
      '  return <p>{useFormatter().number(n)}</p>;',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|next-intl.number`), [5]);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|next-intl.relativeTime`), [5]);
  assert.equal(result['CHK-09'].items.length, 2);
});

test('L6: the bound formatter is still found through nested scopes and a later declaration', async t => {
  const file = `${W}/components/nested.tsx`;
  const root = tree(t, {
    [file]: [
      "import { useFormatter } from 'next-intl';",
      "import { format } from 'date-fns';",
      'export function A({ items }) {',
      '  const f = useFormatter();',
      '  return items.map(i => <p key={i.id}>{f.dateTime(i.at)}{format(i.at, "P")}</p>);',
      '}',
      'export const late = (d: Date) => <p>{lateFormat(d, "P")}</p>;',
      "import { lightFormat as lateFormat } from 'date-fns';",
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|next-intl.dateTime`), [5]);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|date-fns.format`), [5]);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|date-fns.lightFormat`), [7]);
});

test('L6: a translator keeps matching by name, so a translator received as a prop still counts', async t => {
  const file = `${W}/components/tr.tsx`;
  const root = tree(t, {
    [file]: [
      "import { useTranslations } from 'next-intl';",
      'export function A({ n }) {',
      "  const tr = useTranslations('x');",
      "  return <p>{tr('x', { v: n.toFixed(2) })}</p>;",
      '}',
      "export function B({ n, tr, t }) { return <p>{tr('x', { v: n.toFixed(2) })}{t('y', { v: n.toFixed(1) })}</p>; }",
      "export function C({ n, t }) { return <p>{t.rich('x', { v: n.toFixed(2) })}{t.markup('y', { v: n.toFixed(1) })}</p>; }",
      "export function D({ n, t }) { return <p>{t.other('x', { v: n.toFixed(2) })}</p>; }",
    ].join('\n'),
  });
  const result = await lint(root);
  // `t.other` is no translator call: its argument is not a translation display position.
  assert.deepEqual(linesOf(result, `CHK-09|${file}|toFixed`), [4, 6, 6, 7, 7]);
});

test('r2-B9: a type alias or type parameter named like a formatter does not hide the imported value', async t => {
  const file = `${W}/components/types.tsx`;
  const root = tree(t, {
    [file]: [
      "import { format } from 'date-fns';",
      "import { useFormatter } from 'next-intl';",
      'export function A<format>({ d }: { d: Date }) { return <p>{format(d, "P")}</p>; }',
      'export function B({ d }: { d: Date }) {',
      '  type format = string;',
      '  const label: format = "x";',
      '  return <p>{format(d, "P")}{label}</p>;',
      '}',
      'export function C({ n }: { n: number }) {',
      '  interface useFormatter { x: 1 }',
      '  return <p>{useFormatter().number(n)}</p>;',
      '}',
      "import type { format as typeOnly } from 'date-fns';",
      'export function D({ d, typeOnly }) { return <p>{typeOnly(d)}</p>; }',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|date-fns.format`), [3, 7]);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|next-intl.number`), [11]);
  assert.equal(result['CHK-09'].items.length, 3);
});

test('r3-B8: an imported formatter called in a default parameter is found though the body shadows it', async t => {
  const file = `${W}/components/defaults.jsx`;
  const root = tree(t, {
    [file]: [
      "import { format } from 'date-fns';",
      "export function A({ d, label = format(d, 'P') }) {",
      '  const format = x => String(x);',
      '  return <p>{label}{format(d)}</p>;',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, `CHK-09|${file}|date-fns.format`), [2]);
  assert.equal(result['CHK-09'].items.length, 1);
});
