// Contract tests of CHK-09 and the A11Y labelled-control rule (WP-05 code review r1: H4, H5):
// direct format calls, display positions asserted one by one, and label targets by binding.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ids, lint, tree } from './fixtures/screen-contract-check/harness.mjs';

const W = 'apps/web/src';
const linesOf = (result, check, key) =>
  result[check].items
    .filter(item => item.id === key)
    .map(item => item.line)
    .sort((a, b) => a - b);

test('H4: direct date-fns and next-intl format calls are flagged', async t => {
  const file = `${W}/app/direct/page.tsx`;
  const root = tree(t, {
    [file]: [
      "import { useFormatter } from 'next-intl';",
      'export default async function P({ d, n }) {',
      "  const a = require('date-fns').format(d, 'P');",
      "  const b = require('date-fns/format')(d, 'P');",
      "  const c = (await import('date-fns')).lightFormat(d, 'P');",
      '  const e = useFormatter().number(n);',
      "  const ok = require('date-fns').formatISO(d);",
      '  return <p>{a}{b}{c}{e}{ok}</p>;',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, 'CHK-09', `CHK-09|${file}|date-fns.format`), [3, 4]);
  assert.deepEqual(linesOf(result, 'CHK-09', `CHK-09|${file}|date-fns.lightFormat`), [5]);
  assert.deepEqual(linesOf(result, 'CHK-09', `CHK-09|${file}|next-intl.number`), [6]);
  assert.equal(ids(result, 'CHK-09').length, 4);
});

test('H4: each display position of toFixed is flagged on its own line; payloads are not', async t => {
  const file = `${W}/app/positions/page.tsx`;
  const root = tree(t, {
    [file]: [
      "import { useTranslations } from 'next-intl';",
      'export default function P({ n, cond }) {',
      "  const tr = useTranslations('x');",
      '  const payload = `amount=${n.toFixed(2)}`;',
      '  const body = JSON.stringify({ amount: n.toFixed(2) });',
      '  return (<div',
      '    title={`${n.toFixed(2)} EUR`}',
      '    data-raw={n.toFixed(2)}>',
      '    <span>{"€ " + n.toFixed(2)}</span>',
      "    {cond ? n.toFixed(1) : '-'}",
      "    {tr('x', { v: n.toFixed(2) })}",
      '    <input defaultValue={n.toFixed(2)} aria-label="a" />',
      '    {payload}{body}',
      '  </div>);',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  // The title (7) and the data attribute (8) sit on lines of their own (code-r2): swapping which
  // of the two is a display position changes the asserted list.
  assert.deepEqual(linesOf(result, 'CHK-09', `CHK-09|${file}|toFixed`), [7, 9, 10, 11]);
});

// Finding 11 (r3): the rendered operand of `&&` is a display position; its left operand is only a
// condition. Both operands of `??` and `||` can render (r4 hardening: each side of each operator).
test('F11: the right operand of && and both operands of ?? and of || are display positions', async t => {
  const file = `${W}/app/logical/page.tsx`;
  const root = tree(t, {
    [file]: [
      'export default function P({ n, show, a, x }) {',
      '  return (<div',
      '    title={show && n.toFixed(2)}>',
      '    <span>{show && n.toFixed(2)}</span>',
      '    {n.toFixed(2) && x}',
      '    {a ?? n.toFixed(2)}',
      "    {n.toFixed(2) || '-'}",
      '    {n.toFixed(2) ?? a}',
      '    {x || n.toFixed(2)}',
      '  </div>);',
      '}',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(linesOf(result, 'CHK-09', `CHK-09|${file}|toFixed`), [3, 4, 6, 7, 8, 9]);
});

test('H5: a hidden input in braces is not a control', async t => {
  const file = `${W}/app/hidden/page.tsx`;
  const root = tree(t, {
    [file]:
      'export default () => <form><input type={"hidden"} name="x" /><input type={`hidden`} name="y" /></form>;\n',
  });
  const result = await lint(root);
  assert.deepEqual(
    ids(result, 'A11Y').filter(id => id.includes('labelled-control')),
    []
  );
});

test('code-r2: a hidden shared Input is not a control; a visible one still is', async t => {
  const file = `${W}/app/hidden-input/page.tsx`;
  const root = tree(t, {
    [file]: [
      "import { Input } from '@interdomestik/ui';",
      'export default () => (<form>',
      '  <Input type="hidden" name="x" />',
      '  <Input type="text" name="y" />',
      '</form>);',
    ].join('\n'),
  });
  const result = await lint(root);
  assert.deepEqual(
    linesOf(result, 'A11Y', `A11Y|${file}|screen-contract/labelled-control|Input`),
    [4]
  );
});

test('H5: a label in one component does not label a control in another by the same variable name', async t => {
  const file = `${W}/app/scoped/page.tsx`;
  const root = tree(t, {
    [file]: [
      "const A = () => { const fieldId = 'a'; return <label htmlFor={fieldId}>A</label>; };",
      "const B = () => { const fieldId = 'b'; return <input id={fieldId} />; };",
      "const C = () => { const fieldId = 'c'; return <><label htmlFor={fieldId}>C</label><input id={fieldId} /></>; };",
      'export default () => <><A /><B /><C /></>;',
    ].join('\n'),
  });
  const result = await lint(root);
  const key = `A11Y|${file}|screen-contract/labelled-control|input`;
  assert.deepEqual(linesOf(result, 'A11Y', key), [2]);
});
