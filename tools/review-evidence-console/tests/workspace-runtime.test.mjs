import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceRuntime } from '../public/src/app/workspace-runtime.mjs';
import { bundle } from './review-session-fixtures.mjs';

test('ordinary sequential edits autosave without rerendering or moving heading focus', () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const renders = [];
  const statuses = [];
  const runtime = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_a',
    onRender: props => renders.push(props),
    onNavigate() {},
    onStatus: status => statuses.push(status),
  });
  const controls = renders[0];
  controls.onField('item_a', 'concreteAnswer', 'a');
  controls.onField('item_a', 'concreteAnswer', 'ab');
  assert.equal(renders.length, 1);
  assert.equal(renders[0].focusHeading, true);
  assert.deepEqual(statuses, ['Saving', 'Saving']);
  controls.onDecision('item_a', 'approve');
  assert.equal(renders.at(-1).focusHeading, false);
  runtime.dispose();
});

test('edit then immediate item navigation restores value and active item after reload', () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const first = [];
  const runtime = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_a',
    onRender: props => first.push(props),
    onNavigate() {},
  });
  first[0].onField('item_a', 'concreteAnswer', 'ruaje këtë');
  first[0].onSelectItem('item_b');
  runtime.dispose();
  const restored = [];
  const next = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_b',
    onRender: props => restored.push(props),
    onNavigate() {},
  });
  assert.equal(restored[0].state.activeItem, 'item_b');
  assert.equal(restored[0].state.decisions.item_a.concreteAnswer, 'ruaje këtë');
  next.dispose();
});

test('acknowledgement saves the latest session snapshot and structural focus intent', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const renders = [];
  const runtime = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_a',
    onRender: props => renders.push(props),
    onNavigate() {},
  });
  renders[0].onField('item_a', 'concreteAnswer', 'latest edit');
  renders[0].onSafeEvidence(true);
  await new Promise(resolve => setTimeout(resolve, 500));
  const raw = [...values.values()][0];
  assert.match(raw, /latest edit/);
  assert.match(raw, /"safeEvidenceConfirmed":true/);
  renders[0].onDecision('item_a', 'change');
  assert.equal(renders.at(-1).focusControlId, 'decision-item_a-change');
  runtime.dispose();
});

test('dependent rerenders retain exact non-first option focus', () => {
  const typed = structuredClone(bundle);
  typed.packet.items[0].requiredResponses = [
    descriptor('choice', 'radio', ['no', 'yes']),
    { ...descriptor('detail', 'text', []), requiredWhen: { key: 'choice', equals: 'yes' } },
    descriptor('areas', 'checkbox_group', ['one', 'two']),
    { ...descriptor('areaDetail', 'text', []), requiredWhen: { key: 'areas', equals: 'two' } },
  ];
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const renders = [];
  const runtime = createWorkspaceRuntime({
    bundle: typed,
    initialItemId: 'item_a',
    onRender: props => renders.push(props),
    onNavigate() {},
  });
  renders[0].onResponse('item_a', 'choice', 'yes', 'response-choice-1');
  assert.equal(renders.at(-1).focusControlId, 'response-choice-1');
  renders.at(-1).onResponse('item_a', 'areas', ['two'], 'response-areas-1');
  assert.equal(renders.at(-1).focusControlId, 'response-areas-1');
  runtime.dispose();
});

function descriptor(key, type, options) {
  return { key, labelSq: key, type, required: true, maxLength: 80, options };
}
