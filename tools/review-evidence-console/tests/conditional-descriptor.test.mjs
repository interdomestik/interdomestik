import assert from 'node:assert/strict';
import test from 'node:test';
import medical from '../public/data/items/m03a-medical-boundary.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { renderDecision } from '../public/src/components/decision.mjs';
import { byId, fakeDocument } from './fake-dom.mjs';

setDocument(fakeDocument);
const base = { decision: null, concreteAnswer: '', reason: '', requestedChange: '', responses: {} };

test('medical conditional fields are mutually applicable and required', () => {
  const excluded = renderDecision({
    item: medical,
    decision: { ...base, responses: { medicalBoundary: 'excluded' } },
  });
  assert.ok(byId(excluded, 'response-disabledScope'));
  assert.equal(byId(excluded, 'response-dpiaRef'), undefined);
  assert.equal(byId(excluded, 'response-disabledScope').attributes.required, 'required');
  const allowed = renderDecision({
    item: medical,
    decision: { ...base, responses: { medicalBoundary: 'allowed' } },
  });
  assert.ok(byId(allowed, 'response-dpiaRef'));
  assert.equal(byId(allowed, 'response-disabledScope'), undefined);
});

test('required option groups expose native and group required semantics', () => {
  const item = {
    ...medical,
    requiredResponses: [
      { key: 'choice', labelSq: 'Zgjedhja', type: 'radio', required: true, options: ['yes', 'no'] },
    ],
  };
  const view = renderDecision({ item, decision: base });
  const input = byId(view, 'response-choice-0');
  assert.equal(input.attributes.required, 'required');
  assert.equal(input.attributes.name, 'response-choice');
});

test('option groups report the exact activated radio and checkbox control IDs', () => {
  const events = [];
  const item = {
    ...medical,
    requiredResponses: [
      { key: 'choice', labelSq: 'Zgjedhja', type: 'radio', required: true, options: ['no', 'yes'] },
      {
        key: 'areas',
        labelSq: 'Zonat',
        type: 'checkbox_group',
        required: true,
        options: ['one', 'two'],
      },
    ],
  };
  const view = renderDecision({ item, decision: base, onResponse: (...args) => events.push(args) });
  byId(view, 'response-choice-1').listeners.change({ target: { checked: true } });
  byId(view, 'response-areas-1').listeners.change({ target: { checked: true } });
  assert.deepEqual(
    events.map(event => event[2]),
    ['response-choice-1', 'response-areas-1']
  );
});
