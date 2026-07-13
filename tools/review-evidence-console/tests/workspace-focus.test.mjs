import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceFocusTarget } from '../public/src/app/workspace-focus.mjs';

test('validation focus takes precedence over workspace render focus', () => {
  assert.equal(
    workspaceFocusTarget(
      { focusHeading: true, focusControlId: 'decision-item_a-change' },
      'response-ownerName'
    ),
    'response-ownerName'
  );
});

test('workspace render restores the exact control before falling back to the heading', () => {
  assert.equal(
    workspaceFocusTarget({ focusHeading: true, focusControlId: 'response-choice-1' }),
    'response-choice-1'
  );
  assert.equal(workspaceFocusTarget({ focusHeading: true }), 'item-heading');
  assert.equal(workspaceFocusTarget({ focusHeading: false }), null);
});
