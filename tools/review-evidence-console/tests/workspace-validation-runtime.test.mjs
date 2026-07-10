import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceRuntime } from '../public/src/app/workspace-runtime.mjs';
import { bundle } from './review-session-fixtures.mjs';

test('restored autosaved draft opens validation exactly once without another edit', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const firstRenders = [];
  const first = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_a',
    onRender: props => firstRenders.push(props),
    onNavigate() {},
  });
  firstRenders[0].onField('item_a', 'concreteAnswer', 'already saved');
  await new Promise(resolve => setTimeout(resolve, 500));
  first.dispose();

  const restoredRenders = [];
  let validations = 0;
  const restored = createWorkspaceRuntime({
    bundle,
    initialItemId: 'item_a',
    onRender: props => restoredRenders.push(props),
    onNavigate() {},
    onValidate: () => validations++,
  });
  restoredRenders[0].onValidate();
  assert.equal(validations, 1);
  restored.dispose();
});
