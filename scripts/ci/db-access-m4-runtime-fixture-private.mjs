// Trusted parent oracle. Two fixed diagnostic calls execute inside restricted child.
import assert from 'node:assert/strict';
export async function runPrivateCases(f) {
  const {
    admin,
    blocker,
    runtime,
    run,
    seedClaim,
    state,
    noOwnedSessions,
    holdClaim,
    waitDataBlocked,
    sessions,
    cookie,
    request,
    actor,
    staff,
    secondStaff,
    home,
    suffix,
    sessionId,
    token,
    dataRole,
    identityRole,
    dataUrl,
    config,
    make,
    invoke,
    quote,
    record,
    client,
  } = f;
  await run(
    'invalid requests refuse before pool construction and expose only execute and close',
    async () => {
      assert.deepEqual(Object.keys(runtime).sort(), ['close', 'execute']);
      assert(Object.isFrozen(runtime));
      assert.deepEqual(await runtime.execute(cookie, '{}'), {
        status: 'denied',
        reason: 'INVALID_REQUEST',
      });
      await noOwnedSessions();
      assert.deepEqual(await client.probeInvalidConfigurations(config), {
        rejected: 4,
      });
      await noOwnedSessions();
    }
  );
  const successId = 'runtime_success_' + suffix,
    successRequest = request(successId);
  await run(
    'literal private bootstrap binds actual current-store verifier controller and distinct purpose pools',
    async () => {
      await seedClaim(successId);
      const response = await invoke(successRequest);
      assert.equal(response.status, 'completed');
      assert.equal(response.result.success, true);
      assert.equal(response.replayed, false);
      const rows = await state(successId);
      assert.equal(rows.claim[0].staffId, staff);
      assert.equal(rows.audit.length, 1);
      assert.equal(rows.result.length, 1);
      assert.deepEqual(rows.result[0].response, response.result);
      await noOwnedSessions();
    }
  );
  await run(
    'fresh operation pools reconcile same identity and reject changed payload without duplicate effect',
    async () => {
      const before = await state(successId),
        replay = await invoke(successRequest);
      assert.equal(replay.status, 'completed');
      assert.equal(replay.replayed, true);
      assert.deepEqual(await invoke({ ...successRequest, staffId: secondStaff }), {
        status: 'denied',
        reason: 'OPERATION_CONFLICT',
      });
      assert.deepEqual(await state(successId), before);
      await noOwnedSessions();
    }
  );
  await run(
    'live session deletion denies next private operation despite earlier success',
    async () => {
      await admin`delete from session where id=${sessionId}`;
      assert.deepEqual(await invoke(successRequest), {
        status: 'denied',
        reason: 'UNAUTHORIZED',
      });
      await admin`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt") values(${sessionId},${token},${actor},now()+interval '1 hour',now(),now())`;
      await noOwnedSessions();
    }
  );
  await run(
    'session revoked during actual startup queue is reread before business admission',
    async () => {
      const id = 'runtime_queued_' + suffix;
      await seedClaim(id);
      const r = request(id),
        before = await state(id);
      let release, ready;
      const released = new Promise(resolve => (release = resolve)),
        acquired = new Promise(resolve => (ready = resolve));
      const held = blocker.begin(async tx => {
        await tx`lock table pg_catalog.pg_type in access exclusive mode`;
        ready();
        await released;
      });
      let pending;
      try {
        await acquired;
        pending = invoke(r);
        await waitDataBlocked();
        await admin`delete from session where id=${sessionId}`;
        release();
        await held;
        assert.deepEqual(await pending, {
          status: 'denied',
          reason: 'UNAUTHORIZED',
        });
        assert.deepEqual(await state(id), before);
        await noOwnedSessions();
        record.sessionRevokedWhileStartupBlocked = true;
      } finally {
        release();
        await held;
        if (pending) await pending;
      }
      await admin`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt") values(${sessionId},${token},${actor},now()+interval '1 hour',now(),now())`;
    }
  );
  await run(
    'per-operation deadline terminates its own blocked pools with original identity and no automatic retry',
    async () => {
      const id = 'runtime_timeout_' + suffix;
      await seedClaim(id);
      const r = request(id),
        before = await state(id),
        owner = make(750),
        lock = await holdClaim(id);
      try {
        const started = performance.now(),
          pending = invoke(r, cookie, owner);
        await waitDataBlocked();
        assert.deepEqual(await pending, {
          status: 'indeterminate',
          operationId: r.operationId,
        });
        const elapsed = performance.now() - started;
        assert(elapsed < 3000);
        record.deadlineObservedMs = elapsed;
        await noOwnedSessions();
        assert.deepEqual(await state(id), before);
      } finally {
        await lock.release();
        await owner.close();
      }
      const reconciled = await invoke(r);
      assert.equal(reconciled.status, 'completed');
      assert.equal(reconciled.replayed, false);
      await noOwnedSessions();
    }
  );
  await run(
    'deadline of blocked operation leaves independent successful operation intact',
    async () => {
      const blocked = 'runtime_isolated_' + suffix,
        free = 'runtime_free_' + suffix;
      await seedClaim(blocked);
      await seedClaim(free);
      const owner = make(1000),
        lock = await holdClaim(blocked),
        a = request(blocked),
        b = request(free);
      try {
        const waiting = invoke(a, cookie, owner);
        await waitDataBlocked();
        const completed = await invoke(b, cookie, owner);
        assert.equal(completed.status, 'completed');
        assert.equal(completed.result.success, true);
        assert.deepEqual(await waiting, {
          status: 'indeterminate',
          operationId: a.operationId,
        });
        assert.equal((await state(free)).audit.length, 1);
        assert.equal((await state(blocked)).audit.length, 0);
        await noOwnedSessions();
      } finally {
        await lock.release();
        await owner.close();
      }
    }
  );
  await run(
    'four-operation capacity rejects fifth before additional purpose pools and close drains owned work',
    async () => {
      const id = 'runtime_capacity_' + suffix;
      await seedClaim(id);
      const owner = make(),
        lock = await holdClaim(id);
      const requests = Array.from({ length: 4 }, () => request(id));
      let pending;
      try {
        pending = Promise.all(requests.map(r => invoke(r, cookie, owner)));
        const observed = await waitDataBlocked(4);
        assert.equal(observed.filter(r => r.usename === dataRole).length, 4);
        assert.equal(observed.filter(r => r.usename === identityRole).length, 4);
        const fifth = request(id);
        assert.deepEqual(await invoke(fifth, cookie, owner), {
          status: 'indeterminate',
          operationId: fifth.operationId,
        });
        assert.equal((await sessions()).length, 8);
        await owner.close();
        assert.deepEqual(
          await pending,
          requests.map(r => ({
            status: 'indeterminate',
            operationId: r.operationId,
          }))
        );
        await noOwnedSessions();
        assert.equal((await state(id)).audit.length, 0);
        const after = request(id);
        assert.deepEqual(await invoke(after, cookie, owner), {
          status: 'indeterminate',
          operationId: after.operationId,
        });
        await noOwnedSessions();
      } finally {
        await lock.release();
        await owner.close();
        if (pending) await pending;
      }
    }
  );
  await run(
    'server enforced posture rejects elevated purpose role before business dispatch',
    async () => {
      const id = 'runtime_posture_' + suffix;
      await seedClaim(id);
      const r = request(id),
        before = await state(id);
      await admin.unsafe(`ALTER ROLE ${quote(dataRole)} CREATEDB`);
      try {
        assert.deepEqual(await invoke(r), {
          status: 'indeterminate',
          operationId: r.operationId,
        });
        await noOwnedSessions();
        assert.deepEqual(await state(id), before);
      } finally {
        await admin.unsafe(`ALTER ROLE ${quote(dataRole)} NOCREATEDB`);
      }
      const success = await invoke(r);
      assert.equal(success.status, 'completed');
      assert.equal(success.result.success, true);
      await noOwnedSessions();
    }
  );
  await run(
    'actual server disconnect setting is observed and posture refuses disabled polling',
    async () => {
      const observed = await client.probePosture(dataUrl.href);
      assert.equal(observed.polling, '100ms');
      assert.equal(observed.disabledRejected, true);
      record.observedServerDisconnectCheck = observed.polling;
      await noOwnedSessions();
    }
  );
}
