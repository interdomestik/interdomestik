import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opsRoot, command, observation } from './db-access-m4-mounted-relay.test-fixture.mjs';
import { relayIO, ownerConfiguration, tls } from './db-access-m4-mounted-relay-io.fixture.mjs';
test('private local transcript budget is aggregate2048 sticky, with no production reservation', async () => {
  const f = await relayIO(),
    api = await f.load(opsRoot + 'm4-assignment-owner.ts');
  const owners = [];
  try {
    for (let group = 0; group < 16; group++) {
      const owner = await api.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
      owners.push(owner);
      for (let index = 0; index < 128; index++)
        assert.equal(
          (await owner.executeLegacyAdmin('cookie', command(), observation)).status,
          'completed'
        );
      await owner.close();
      if (group)
        assert.equal(api.takeM4OwnedAssignmentOwnerContexts(owner).transport.rows.length, 128);
    }
    const overflow = await api.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
    owners.push(overflow);
    assert.equal(
      (await overflow.executeLegacyAdmin('cookie', command(), observation)).status,
      'indeterminate'
    );
    await overflow.close();
    assert.throws(() => api.takeM4OwnedAssignmentOwnerContexts(overflow), /owner/);
    assert.throws(() => api.takeM4OwnedAssignmentOwnerContexts(owners[0]), /owner/);
    const production = await api.startM4PrivateAssignmentOwner({
      ...ownerConfiguration,
      port: 43699,
    });
    owners.push(production);
    const client = await f.load(opsRoot + 'm4-assignment-relay-client.ts');
    assert.equal(
      (
        await client.relayM4AssignmentRequest(
          { origin: production.origin, ca: tls.cert, deadlineMs: 1000 },
          'legacy-admin',
          'cookie',
          command(),
          observation
        )
      ).status,
      'completed'
    );
  } finally {
    await Promise.all(owners.map(owner => owner.close().catch(() => {})));
    f.close();
  }
});
