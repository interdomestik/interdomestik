// Trusted parent control; all authentication executes in the unchanged restricted child.
import assert from 'node:assert/strict';
import { invalidM4Signature } from './db-access-m4-invalid-signature.mjs';

async function readSession(admin, id) {
  // Text preserves PostgreSQL timestamp precision for exact parent restoration.
  return Array.from(
    await admin`select id,token,"userId","expiresAt"::text as expires_at,
    "createdAt"::text as created_at,"updatedAt"::text as updated_at,"ipAddress","userAgent"
    from session where id=${id}`
  );
}

async function restoreSession(admin, saved, sentinelId) {
  await admin.begin(async tx => {
    await tx`set local statement_timeout='2000ms'`;
    await tx`set local lock_timeout='1000ms'`;
    await tx`delete from session where id=${sentinelId}`;
    await tx`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt","ipAddress","userAgent")
      values(${saved.id},${saved.token},${saved.userId},${saved.expires_at}::timestamp,
        ${saved.created_at}::timestamp,${saved.updated_at}::timestamp,${saved.ipAddress},${saved.userAgent})
      on conflict(id) do update set token=excluded.token,"userId"=excluded."userId",
        "expiresAt"=excluded."expiresAt","createdAt"=excluded."createdAt",
        "updatedAt"=excluded."updatedAt","ipAddress"=excluded."ipAddress","userAgent"=excluded."userAgent"`;
  });
}

export async function runCurrentStoreNegativeCase(f) {
  const {
    admin,
    run,
    sessionId,
    token,
    actor,
    suffix,
    cookie,
    invoke,
    request,
    seedClaim,
    state,
    noOwnedSessions,
    sessions,
    identityRole,
    home,
  } = f;
  await run(
    'invalid signature and expired current-store session deny without business effects',
    async () => {
      await noOwnedSessions();
      const claimId = 'current_store_negative_' + suffix;
      const sentinelId = 'current_store_live_' + suffix;
      await seedClaim(claimId);
      const operation = request(claimId);
      const before = await state(claimId);
      const noticesBefore = Array.from(
        await admin`select * from notifications where tenant_id=${home} order by id`
      );
      const saved = await readSession(admin, sessionId);
      assert.equal(saved.length, 1, 'Original genuine-cookie session exists');
      assert.equal(saved[0].token, token, 'Original store token matches genuine signed cookie');
      const purpose =
        await admin`select has_table_privilege(${identityRole},'public.session','DELETE') as can_delete`;
      assert.equal(
        purpose[0].can_delete,
        true,
        'Existing identity purpose has session DELETE grant'
      );
      try {
        const active =
          await admin`select "expiresAt">now() as active from session where id=${sessionId}`;
        assert.equal(
          active[0].active,
          true,
          'Invalid-signature control starts with a live store session'
        );
        const invalidCookie = invalidM4Signature(cookie, token);
        assert.equal(invalidCookie === cookie, false, 'Control changes the real cookie signature');
        const decoded = decodeURIComponent(invalidCookie.slice(invalidCookie.indexOf('=') + 1));
        assert.equal(
          decoded.slice(0, decoded.lastIndexOf('.')),
          token,
          'Invalid signature retains exact store token'
        );
        assert.equal(
          /^[A-Za-z0-9+/]{43}=$/.test(decoded.slice(decoded.lastIndexOf('.') + 1)),
          true,
          'Invalid signature retains provider accepted base64 shape'
        );
        assert.deepEqual(
          await invoke(operation, invalidCookie),
          { status: 'denied', reason: 'UNAUTHORIZED' },
          'Actual verifier denies a well-formed wrong signature'
        );
        await noOwnedSessions();
        assert.deepEqual(
          await readSession(admin, sessionId),
          saved,
          'Signature denial leaves original session unchanged'
        );
        assert.deepEqual(
          await state(claimId),
          before,
          'Signature denial leaves claim audit and result unchanged'
        );
        assert.deepEqual(
          Array.from(await admin`select * from notifications where tenant_id=${home} order by id`),
          noticesBefore,
          'Signature denial leaves owned notifications unchanged'
        );
        await admin`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt")
        values(${sentinelId},${'current_store_live_token_' + suffix},${actor},now()+interval '1 hour',now(),now())`;
        const sentinel = await readSession(admin, sentinelId);
        assert.equal(sentinel.length, 1, 'One separate live session guards cleanup scope');
        const sentinelActive =
          await admin`select "expiresAt">now() as active from session where id=${sentinelId}`;
        assert.equal(sentinelActive[0].active, true, 'Cleanup sentinel is unexpired');
        await admin`update session set "expiresAt"=now()-interval '1 minute' where id=${sessionId}`;
        const expired =
          await admin`select "expiresAt"<now() as expired,token from session where id=${sessionId}`;
        assert.deepEqual(
          Array.from(expired),
          [{ expired: true, token }],
          'Server confirms exact genuine-cookie session expired'
        );
        assert.deepEqual(
          await invoke(operation, cookie),
          { status: 'denied', reason: 'UNAUTHORIZED' },
          'Actual verifier denies original signed cookie after store expiry'
        );
        await noOwnedSessions();
        assert.deepEqual(
          await readSession(admin, sessionId),
          [],
          'Actual expired-session cleanup deletes the matching session'
        );
        assert.deepEqual(
          await readSession(admin, sentinelId),
          sentinel,
          'Expired cleanup preserves every live sentinel column'
        );
        assert.deepEqual(
          await state(claimId),
          before,
          'Expiry denial leaves claim audit and result unchanged'
        );
        assert.deepEqual(
          Array.from(await admin`select * from notifications where tenant_id=${home} order by id`),
          noticesBefore,
          'Expiry denial leaves owned notifications unchanged'
        );
        assert.equal(
          (await sessions()).length,
          0,
          'Both negative operations drain existing purpose sessions'
        );
      } finally {
        await restoreSession(admin, saved[0], sentinelId);
      }
      assert.deepEqual(
        await readSession(admin, sessionId),
        saved,
        'Parent restores exact original session for unchanged later cases'
      );
      assert.deepEqual(
        await readSession(admin, sentinelId),
        [],
        'Parent removes only its extra live control session'
      );
    }
  );
}
