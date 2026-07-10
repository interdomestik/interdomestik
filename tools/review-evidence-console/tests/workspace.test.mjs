import assert from 'node:assert/strict';
import test from 'node:test';

import { setDocument } from '../public/src/components/dom.mjs';
import { renderWorkspace } from '../public/src/views/workspace.mjs';
import { byId, copy, fakeDocument, walk } from './fake-dom.mjs';
import { bundle } from './review-session-fixtures.mjs';

setDocument(fakeDocument);
test('workspace renders three labelled regions, scope guard, and ordered text statuses', () => {
  const view = renderWorkspace({ bundle, state: initialState(), safeEvidenceConfirmed: false });
  assert.match(view.attributes.class, /workspace/);
  assert.deepEqual(
    walk(view)
      .filter(node => node.tagName === 'ASIDE')
      .map(node => node.attributes['aria-label']),
    ['Hapat e paketës', 'Evidenca e rishikimit']
  );
  assert.match(copy(view), /Repo-safe fixture scope/);
  assert.match(copy(view), /Të dhënat mjekësore nuk lejohen/);
  assert.match(copy(view), /Pa filluar/);
  assert.match(copy(view), /Në rishikim/);
});

test('workspace exposes prompt, separate guidance, native unselected decisions, and metadata fields', () => {
  const view = renderWorkspace({ bundle, state: initialState(), safeEvidenceConfirmed: false });
  assert.match(copy(view), /item_a.*Who owns the fixture decision/s);
  assert.match(copy(view), /Udhëzim i sistemit/);
  const radios = walk(view).filter(node => node.attributes.type === 'radio');
  assert.deepEqual(
    radios.map(node => node.value),
    ['approve', 'change', 'block']
  );
  assert.ok(radios.every(node => node.checked === false));
  assert.ok(byId(view, 'response-ownerRole'));
  assert.ok(byId(view, 'evidenceRef'));
  assert.ok(byId(view, 'safe-evidence-confirmed'));
});

test('guidance callback changes editable prose only and item navigation is delegated', () => {
  const actions = [];
  const view = renderWorkspace({
    bundle,
    state: initialState(),
    safeEvidenceConfirmed: false,
    onUseGuidance: itemId => actions.push(['guidance', itemId]),
    onSelectItem: itemId => actions.push(['select', itemId]),
  });
  walk(view)
    .find(node => node.tagName === 'BUTTON' && copy(node).includes('Përdor si pikënisje'))
    .listeners.click();
  walk(view)
    .find(node => node.attributes['data-item-id'] === 'item_b')
    .listeners.click();
  assert.deepEqual(actions, [
    ['guidance', 'item_a'],
    ['select', 'item_b'],
  ]);
});

test('conflict recovery offers reload and export without a destructive action', () => {
  const view = renderWorkspace({
    bundle,
    state: initialState(),
    safeEvidenceConfirmed: false,
    recovery: { code: 'conflict', reload() {}, exportLocal() {}, deleteDraft() {} },
  });
  const rendered = copy(view);
  assert.match(rendered, /Ruajtja automatike u ndal/);
  assert.match(rendered, /Ringarko draftin më të ri/);
  assert.match(rendered, /Eksporto kopjen lokale/);
  assert.doesNotMatch(rendered, /Fshi draftin lokal/);
});

test('structured response controls follow descriptor types instead of hard-coded rows', () => {
  const typedBundle = structuredClone(bundle);
  typedBundle.packet.items[0].requiredResponses = [
    {
      key: 'scope',
      labelSq: 'Fusha',
      type: 'radio',
      required: true,
      options: ['allowed', 'excluded'],
    },
    {
      key: 'areas',
      labelSq: 'Zonat',
      type: 'checkbox_group',
      required: true,
      options: ['auth', 'privacy'],
    },
    {
      key: 'refs',
      labelSq: 'Referencat',
      type: 'multi_select',
      required: true,
      options: ['one', 'two'],
    },
    {
      key: 'notes',
      labelSq: 'Shënime',
      type: 'textarea',
      required: true,
      maxLength: 80,
      options: [],
    },
  ];
  const view = renderWorkspace({
    bundle: typedBundle,
    state: initialState(),
    safeEvidenceConfirmed: false,
  });
  const nodes = walk(view);
  assert.equal(nodes.filter(node => node.attributes.name === 'response-scope').length, 2);
  assert.equal(nodes.filter(node => node.attributes.name === 'response-areas').length, 2);
  assert.equal(nodes.filter(node => node.attributes.name === 'response-refs').length, 2);
  assert.ok(
    nodes.some(node => node.tagName === 'TEXTAREA' && node.attributes.id === 'response-notes')
  );
});

function initialState() {
  return {
    activeItem: 'item_a',
    decisions: {
      item_a: {
        decision: null,
        concreteAnswer: '',
        reason: '',
        evidenceRef: '',
        verifiedAt: '',
        riskCategory: '',
        severity: '',
        requestedChange: '',
        responses: {},
      },
      item_b: {
        decision: null,
        concreteAnswer: '',
        reason: '',
        evidenceRef: '',
        verifiedAt: '',
        riskCategory: '',
        severity: '',
        requestedChange: '',
        responses: {},
      },
    },
  };
}
