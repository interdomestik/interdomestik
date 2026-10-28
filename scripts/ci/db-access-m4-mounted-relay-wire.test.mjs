import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mountedLoader,
  opsRoot,
  command,
  operationId,
  observation,
  envelope,
} from './db-access-m4-mounted-relay.test-fixture.mjs';
import { relayIO } from './db-access-m4-mounted-relay-io.fixture.mjs';
test('finite mounted assignment wire and HTTPS client refuse authority or transport drift', async t => {
  const load = mountedLoader(),
    wire = await load(opsRoot + 'm4-assignment-relay-wire.ts');
  await t.test(
    'exact envelope/profile and labelled observations contain no identity/SQL/callback authority',
    () => {
      const good = wire.parseM4RelayEnvelope(envelope(), 'legacy-admin');
      assert.equal(good.request.operationId, operationId);
      for (const extra of ['session', 'role', 'tenantId', 'database', 'callback']) {
        const row = JSON.parse(envelope());
        row[extra] = 'forged';
        assert.equal(wire.parseM4RelayEnvelope(JSON.stringify(row), 'legacy-admin'), null);
      }
      assert.equal(wire.parseM4RelayEnvelope(envelope(), 'staff'), null);
      assert.equal(
        wire.parseM4RelayEnvelope(
          envelope().replace('untrusted-request-metadata', 'authority'),
          'legacy-admin'
        ),
        null
      );
      assert.equal(wire.parseM4RelayEnvelope('x'.repeat(32769), 'legacy-admin'), null);
    }
  );
  await t.test(
    'missing staff target differs from explicit null and bad command never gains a route',
    () => {
      const missing = JSON.stringify({
        version: 1,
        command: 'm4.staff.assign-claim',
        operationId,
        claimId: 'claim-1',
      });
      const parsed = wire.parseM4RelayEnvelope(envelope(missing), 'staff');
      assert.equal(Object.hasOwn(parsed.request, 'staffId'), false);
      assert.equal(
        wire.parseM4RelayEnvelope(envelope(command('staff', null)), 'staff').request.staffId,
        null
      );
      assert.equal(wire.m4RelayProfile('/m4/assignment/staff?profile=ops'), undefined);
      assert.throws(() => wire.m4RelayPath('close'), /profile/);
    }
  );
  await t.test(
    'origin scheme, credentials, path, query, CA and explicit deadline remain startup-only strict',
    () => {
      for (const origin of [
        'http://owner.test',
        'https://u:p@owner.test',
        'https://owner.test/other',
        'https://owner.test/?x=1',
        'https://owner.test/#x',
      ])
        assert.throws(
          () => wire.captureM4RelayConfiguration({ origin, deadlineMs: 10 }),
          /configuration/
        );
      for (const deadlineMs of [0, -1, NaN, Infinity])
        assert.throws(
          () => wire.captureM4RelayConfiguration({ origin: 'https://owner.test', deadlineMs }),
          /configuration/
        );
    }
  );
  for (const mode of ['redirect', 'wrong-id', 'oversize', 'error', 'drip'])
    await t.test(mode + ' remains original-ID indeterminate without retry', async () => {
      const f = await relayIO();
      try {
        f.state.mode = mode;
        const client = await f.load(opsRoot + 'm4-assignment-relay-client.ts'),
          start = Date.now();
        const result = await client.relayM4AssignmentRequest(
          { origin: 'https://owner.test', deadlineMs: 25 },
          'legacy-admin',
          'cookie=opaque',
          command(),
          observation
        );
        assert.deepEqual(result, { status: 'indeterminate', operationId });
        assert.equal(f.state.requests.length, 1);
        assert(Date.now() - start < 1000);
        const req = f.state.requests[0];
        assert.equal(req.options.rejectUnauthorized, true);
        assert.equal(req.options.agent, false);
        assert.equal(req.options.headers.cookie, 'cookie=opaque');
        assert.equal(req.url, 'https://owner.test/m4/assignment/legacy-admin');
      } finally {
        f.close();
      }
    });
  await t.test('cookie and payload bounds refuse rather than truncate', async () => {
    const f = await relayIO();
    try {
      const client = await f.load(opsRoot + 'm4-assignment-relay-client.ts');
      assert.equal(
        (
          await client.relayM4AssignmentRequest(
            { origin: 'https://owner.test', deadlineMs: 10 },
            'legacy-admin',
            'x'.repeat(8193),
            command(),
            observation
          )
        ).status,
        'denied'
      );
      assert.equal(f.state.requests.length, 0);
      assert.equal(
        (
          await client.relayM4AssignmentRequest(
            { origin: 'https://owner.test', deadlineMs: 10 },
            'legacy-admin',
            'cookie',
            'x'.repeat(9000),
            observation
          )
        ).status,
        'denied'
      );
      assert.equal(f.state.requests.length, 0);
    } finally {
      f.close();
    }
  });
});
