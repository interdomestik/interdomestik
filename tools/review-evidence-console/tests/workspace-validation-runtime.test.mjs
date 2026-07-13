import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceRuntime } from '../public/src/app/workspace-runtime.mjs';
import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { composeDraftKey } from '../public/src/state/draft-store.mjs';
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
test('restored completed Part A invokes validation from the Access item', async () => {
  const loaded = await createFixtureRepository().loadAssignmentBundle('assign_mob03a_part_a');
  assert.equal(loaded.ok, true);
  const actual = loaded.value;
  const key = composeDraftKey({
    assignmentId: actual.assignment.id,
    reviewerFixtureId: actual.reviewer.id,
    draftScope: actual.reviewer.draftScope,
    packetVersion: actual.packet.version,
  });
  const decisions = Object.fromEntries(
    actual.packet.items.map(item => [item.id, completeItem(item)])
  );
  const values = new Map([
    [
      key,
      JSON.stringify({
        assignmentId: actual.assignment.id,
        packetId: actual.packet.id,
        reviewerFixtureId: actual.reviewer.id,
        draftScope: actual.reviewer.draftScope,
        packetVersion: actual.packet.version,
        activeItem: 'M03A-ACCESS-ROLES',
        itemDecisions: decisions,
        safeEvidenceConfirmed: true,
        schemaVersion: 1,
        editorId: 'prior-tab',
        updatedAt: '2026-07-10T10:00:00.000Z',
      }),
    ],
  ]);
  globalThis.localStorage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: name => values.delete(name),
  };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  const renders = [];
  const validations = [];
  const runtime = createWorkspaceRuntime({
    bundle: actual,
    initialItemId: 'M03A-ACCESS-ROLES',
    onRender: props => renders.push(props),
    onNavigate() {},
    onValidate: result => validations.push(result),
  });
  renders[0].onValidate();
  assert.equal(validations.length, 1);
  assert.equal(validations[0].valid, true);
  runtime.dispose();
});
function completeItem(item) {
  const responses = Object.fromEntries(
    item.requiredResponses
      .filter(field => !field.requiredWhen || field.requiredWhen.equals === 'excluded')
      .map(field => [field.key, responseValue(field)])
  );
  return {
    decision: 'approve',
    concreteAnswer: 'Approved inside the fixture boundary.',
    reason: 'Repo-safe evidence supports this fixture decision.',
    evidenceRef: 'docs/product/packet.md#L21',
    verifiedAt: '2026-07-10',
    riskCategory: item.allowedRiskCategories[0],
    severity: 'high',
    requestedChange: '',
    responses,
  };
}
function responseValue(field) {
  if (field.type === 'date') return '2026-07-10';
  if (field.type === 'evidenceRef') return 'docs/product/packet.md#L21';
  if (field.type === 'multi_select') return [field.options[0]];
  if (field.options.length) return field.options[0];
  return 'Repo-safe fixture response';
}

test('restored route item is persisted before validation navigation', async () => {
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
    initialItemId: 'item_b',
    onRender: props => restoredRenders.push(props),
    onNavigate() {},
    onValidate: () => validations++,
  });
  restoredRenders[0].onValidate();
  assert.equal(validations, 1);
  assert.equal(JSON.parse([...values.values()][0]).activeItem, 'item_b');
  restored.dispose();
});
