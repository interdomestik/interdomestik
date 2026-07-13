import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceDraftStore } from '../public/src/app/workspace-draft-store.mjs';
import { composeDraftKey } from '../public/src/state/draft-store.mjs';
import { suggestionBundle } from './suggestion-state-fixtures.mjs';

test('unique account fixture scopes cannot address each other draft keys', () => {
  const fixture = suggestionBundle();
  const bundle = {
    ...fixture,
    reviewer: { ...fixture.reviewer, id: 'reviewer_governance_mk', role: 'governance', draftScope: 'draft_account_a' },
  };
  const gazmend = createWorkspaceDraftStore(bundle).key;
  const sanjaBundle = {
    ...bundle,
    reviewer: { ...bundle.reviewer, id: 'reviewer_governance_mk', role: 'governance', draftScope: 'draft_account_b' },
  };
  const sanja = createWorkspaceDraftStore(sanjaBundle).key;
  assert.notEqual(gazmend, sanja);
  assert.match(gazmend, /reviewer_governance_mk/);
  assert.match(sanja, /draft_account_b/);
});

test('assignment and packet version remain part of the account draft scope', () => {
  const base = {
    assignmentId: 'assign_mob03a_part_a',
    reviewerFixtureId: 'reviewer_governance_mk',
    draftScope: 'draft_account_a',
    packetVersion: '1',
  };
  const keys = [
    composeDraftKey(base),
    composeDraftKey({ ...base, assignmentId: 'assign_mob03a_part_b' }),
    composeDraftKey({ ...base, packetVersion: '2' }),
  ];
  assert.equal(new Set(keys).size, 3);
});
