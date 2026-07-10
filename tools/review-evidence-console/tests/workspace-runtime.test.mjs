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
