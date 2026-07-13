import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const governanceAccount = Object.freeze({
  id: 'acct_gazmend',
  fixtureId: 'reviewer_governance_mk',
  role: 'governance',
  displayName: 'Gazmend Abazi',
});

test('fixture service returns only assignments bound to the live account', async () => {
  assert.equal(typeof serverApp.createFixtureService, 'function');
  const service = serverApp.createFixtureService();

  const assignments = await service.listAssignments(governanceAccount);
  assert.equal(assignments.ok, true);
  assert.deepEqual(
    assignments.value.map(row => row.id),
    ['assign_mob03a_part_a', 'assign_mob03a_part_b']
  );

  const empty = await service.listAssignments({
    id: 'acct_sanja',
    fixtureId: 'reviewer_legal_mk',
    role: 'legal_privacy',
    displayName: 'Sanja Jovanovska',
  });
  assert.deepEqual(empty, { ok: true, value: [] });
  const bundle = await service.loadAssignment(
    { ...governanceAccount, password: { hash: 'must-not-leak' }, username: 'gazmend' },
    'assign_mob03a_part_a'
  );
  assert.equal(bundle.ok, true);
  assert.deepEqual(Object.keys(bundle.value.reviewer).sort(), [
    'displayName',
    'draftScope',
    'id',
    'repoSafe',
    'role',
  ]);
});

test('fixture service denies direct cross-account assignment access', async () => {
  assert.equal(typeof serverApp.createFixtureService, 'function');
  const service = serverApp.createFixtureService();
  const result = await service.loadAssignment(
    { ...governanceAccount, fixtureId: 'reviewer_legal_mk', role: 'legal_privacy' },
    'assign_mob03a_part_a'
  );

  assert.deepEqual(result, { ok: false, code: 'not_found', message: 'Detyra nuk u gjet.' });
});
