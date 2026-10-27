import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { opsRoot, operationId, source } from './db-access-m4-mounted-relay.test-fixture.mjs';
import { relayIO, ownerConfiguration, tls } from './db-access-m4-mounted-relay-io.fixture.mjs';
test('actual assignment adapters route bounded data without old ambient reads and retain exact cache semantics', async t => {
  const f = await relayIO(),
    owner = await f.load(opsRoot + 'm4-assignment-owner.ts'),
    h = await owner.startM4LocalQualificationAssignmentOwner(ownerConfiguration),
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-relay-unit-')));
  const envKeys = [
      'M4_ASSIGNMENT_OWNER_ORIGIN',
      'M4_ASSIGNMENT_OWNER_CA_FILE',
      'M4_ASSIGNMENT_RELAY_DEADLINE_MS',
    ],
    saved = envKeys.map(k => process.env[k]);
  fs.writeFileSync(path.join(tmp, 'ca.pem'), tls.cert);
  process.env.M4_ASSIGNMENT_OWNER_ORIGIN = h.origin;
  process.env.M4_ASSIGNMENT_OWNER_CA_FILE = path.join(tmp, 'ca.pem');
  process.env.M4_ASSIGNMENT_RELAY_DEADLINE_MS = '1000';
  try {
    const resultWire = await f.load(opsRoot + 'm4-assignment-relay.ts');
    assert.equal(
      Object.hasOwn(
        resultWire.assignmentRelayFailure(
          { status: 'denied', reason: 'UNAUTHORIZED' },
          'legacy-admin'
        ),
        'data'
      ),
      true
    );
    assert.equal(
      Object.hasOwn(
        resultWire.assignmentRelayFailure({ status: 'denied', reason: 'UNAUTHORIZED' }, 'staff'),
        'data'
      ),
      false
    );
    for (const [kind, method, count] of [
      ['admin', 'executeLegacyAdmin', 24],
      ['agent', 'executeLegacyAgent', 24],
      ['staff', 'executeStaff', 8],
    ])
      await t.test(kind + ' original profile/cache paths and no-op behavior', async () => {
        const api = await f.load('apps/web/src/actions/' + kind + '-claims/assign.core.ts'),
          requestHeaders = new Headers({
            cookie: 'opaque-original',
            'user-agent': 'unit',
            'x-forwarded-for': '203.0.113.7',
            'x-role': 'admin',
            'x-tenant-id': 'foreign',
          });
        f.state.changed = true;
        f.state.cacheCalls.length = 0;
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: 'staff-1',
              requestHeaders,
              operationId,
            })
          ).success,
          true
        );
        assert.equal(f.state.calls.at(-1).method, method);
        assert.equal(f.state.cacheCalls.length, count);
        assert.deepEqual(
          new Set(f.state.cacheCalls.map(x => x.split('/')[1])),
          new Set(['sq', 'en', 'sr', 'mk'])
        );
        const body = JSON.parse(f.state.requests.at(-1).body);
        assert.equal(body.observationAuthority, 'untrusted-request-metadata');
        assert.equal('session' in body, false);
        assert.equal(f.state.requests.at(-1).options.headers.cookie, 'opaque-original');
        assert.equal('x-role' in f.state.requests.at(-1).options.headers, false);
        f.state.changed = false;
        f.state.cacheCalls.length = 0;
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: null,
              requestHeaders,
              operationId,
            })
          ).success,
          true
        );
        assert.equal(f.state.cacheCalls.length, kind === 'admin' ? 0 : count);
        assert.equal(JSON.parse(JSON.parse(f.state.requests.at(-1).body).request).staffId, null);
        if (kind === 'staff') {
          await api.assignClaimCore({ claimId: 'claim-1', requestHeaders, operationId });
          assert.equal(
            Object.hasOwn(JSON.parse(JSON.parse(f.state.requests.at(-1).body).request), 'staffId'),
            false
          );
        }
        f.state.reply = { status: 'denied', reason: 'UNAUTHORIZED' };
        f.state.cacheCalls.length = 0;
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: null,
              requestHeaders,
              operationId,
            })
          ).error,
          'Unauthorized'
        );
        assert.equal(f.state.cacheCalls.length, 0);
        delete f.state.reply;
        f.state.mode = 'error';
        const before = f.state.requests.length;
        f.state.cacheCalls.length = 0;
        const uncertain = await api.assignClaimCore({
          claimId: 'claim-1',
          staffId: null,
          requestHeaders,
          operationId,
        });
        assert.equal(uncertain.success, false);
        assert.equal(uncertain.status, 'indeterminate');
        assert.equal(uncertain.operationId, operationId);
        assert.equal(f.state.requests.length, before + 1);
        assert.equal(f.state.cacheCalls.length, 0);
        f.state.mode = 'bridge';
      });
    await t.test(
      'runtime-untrusted nonprimitive action arguments deny before serialization or transport',
      async () => {
        const api = await f.load('apps/web/src/actions/admin-claims/assign.core.ts'),
          requestHeaders = new Headers({ cookie: 'original' }),
          cyclic = {};
        cyclic.self = cyclic;
        const before = f.state.requests.length;
        for (const claimId of [1n, cyclic, null])
          assert.equal(
            (await api.assignClaimCore({ claimId, staffId: null, requestHeaders, operationId }))
              .success,
            false
          );
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: cyclic,
              requestHeaders,
              operationId,
            })
          ).success,
          false
        );
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: null,
              requestHeaders,
              operationId: null,
            })
          ).success,
          false
        );
        assert.equal(f.state.requests.length, before);
      }
    );
    await t.test(
      'CA capture refuses symlink, writable or oversized startup files before HTTPS',
      async () => {
        const api = await f.load('apps/web/src/actions/admin-claims/assign.core.ts'),
          requestHeaders = new Headers({ cookie: 'original' }),
          bad = path.join(tmp, 'bad.pem'),
          link = path.join(tmp, 'link.pem');
        fs.symlinkSync(path.join(tmp, 'ca.pem'), link);
        for (const file of [link, bad]) {
          if (file === bad) fs.writeFileSync(bad, 'x'.repeat(65537));
          process.env.M4_ASSIGNMENT_OWNER_CA_FILE = file;
          const before = f.state.requests.length;
          assert.equal(
            (
              await api.assignClaimCore({
                claimId: 'claim-1',
                staffId: null,
                requestHeaders,
                operationId,
              })
            ).status,
            'indeterminate'
          );
          assert.equal(f.state.requests.length, before);
        }
        fs.writeFileSync(bad, tls.cert);
        fs.chmodSync(bad, 0o666);
        process.env.M4_ASSIGNMENT_OWNER_CA_FILE = bad;
        const before = f.state.requests.length;
        assert.equal(
          (
            await api.assignClaimCore({
              claimId: 'claim-1',
              staffId: null,
              requestHeaders,
              operationId,
            })
          ).status,
          'indeterminate'
        );
        assert.equal(f.state.requests.length, before);
        process.env.M4_ASSIGNMENT_OWNER_CA_FILE = path.join(tmp, 'ca.pem');
      }
    );
    await t.test(
      'only assignment mount switches to headers; status and shared contexts stay source-identical',
      () => {
        for (const kind of ['admin', 'agent', 'staff']) {
          const text = source('apps/web/src/actions/' + kind + '-claims.core.ts');
          assert.match(text, /const requestHeaders = await headers\(\)/);
          const assign = text.slice(
            text.indexOf('export async function assignClaim'),
            text.indexOf('export async function assignClaim') + 500
          );
          assert.equal(assign.includes('getActionContext()'), false);
          assert.match(text, /getActionContext\(\)/);
          const adapter = source('apps/web/src/actions/' + kind + '-claims/assign.core.ts');
          assert.equal(adapter.includes('getActionContext'), false);
          assert.equal(adapter.includes('@interdomestik/database'), false);
          assert.equal(adapter.includes('domain-claims'), false);
        }
      }
    );
  } finally {
    for (let i = 0; i < envKeys.length; i++)
      if (saved[i] === undefined) delete process.env[envKeys[i]];
      else process.env[envKeys[i]] = saved[i];
    await h.close();
    f.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
