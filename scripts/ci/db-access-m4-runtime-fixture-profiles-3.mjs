import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
export async function runProfileGroup3(context) {
  const {
    f,
    admin,
    runtime,
    run,
    seedClaim,
    state,
    noOwnedSessions,
    cookie,
    actor,
    staff,
    secondStaff,
    nonStaff,
    foreignStaff,
    home,
    foreign,
    branchA,
    branchB,
    suffix,
    postgres,
    dataUrl,
    notificationUrl,
    notificationRole,
    dataRole,
    quote,
    code,
    observation,
    req,
    invoke,
    noticeId,
    notification,
    effects,
    denialLedger,
    awaitNotice,
    drain,
    actorRole,
    targetRole,
    success,
    successRequest,
  } = context;
  await run(
    'notification role has no business write authority and business role cannot write notifications',
    async () => {
      const notify = postgres(notificationUrl.href, { max: 1, ssl: false }),
        data = postgres(dataUrl.href, { max: 1, ssl: false });
      try {
        for (const [table, column, id] of [
          ['claim', 'id', success],
          ['user', 'id', staff],
          ['operation_results', 'operation_id', successRequest.operationId],
        ]) {
          await assert.rejects(
            notify.begin(async tx => {
              await tx`select set_config('app.current_tenant_id',${home},true),set_config('app.current_access_tenant_id',${home},true)`;
              const visible = await tx.unsafe(
                `select ${quote(column)} from ${quote(table)} where ${quote(column)}=$1`,
                [id]
              );
              assert.equal(visible.length, 1, 'Positive readable row before no-write control');
              await tx.unsafe(
                `update ${quote(table)} set ${quote(column)}=${quote(column)} where ${quote(column)}=$1`,
                [id]
              );
            }),
            e => code(e) === '42501'
          );
        }
        await assert.rejects(
          notify.begin(async tx => {
            await tx`select set_config('app.current_tenant_id',${home},true),set_config('app.current_access_tenant_id',${home},true)`;
            await tx`update claim set "staffId"=${secondStaff} where id=${success}`;
          }),
          e => code(e) === '42501'
        );
        await assert.rejects(
          data`insert into notifications(id,tenant_id,user_id,type,title,content) values(${randomUUID()},${home},${staff},'claim_assigned','forbidden','forbidden')`,
          e => code(e) === '42501'
        );
        const [grants] =
          await admin`select has_table_privilege(${notificationRole},'claim','INSERT') as insert_claim,has_table_privilege(${notificationRole},'operation_results','INSERT') as insert_ledger,has_table_privilege(${dataRole},'notifications','INSERT') as insert_notice`;
        assert.deepEqual(grants, {
          insert_claim: false,
          insert_ledger: false,
          insert_notice: false,
        });
      } finally {
        await notify.end({ timeout: 0 });
        await data.end({ timeout: 0 });
      }
      await drain();
    }
  );
  await run(
    'observed notification store failure leaves committed assignment successful without automatic retry',
    async () => {
      const id = 'profile_notice_fail_' + suffix;
      await seedClaim(id);
      const r = req(id),
        owner = f.make();
      const seq = 'm4_notice_probe_' + suffix.replaceAll('-', ''),
        fn = seq + '_fn',
        tr = seq + '_tr';
      // Sequence increment survives the failed transaction and proves the notifier reached
      // this exact INSERT. Supplemental fixture grant is not a production privilege claim.
      await admin.unsafe(
        `CREATE SEQUENCE ${quote(seq)}; GRANT USAGE ON SEQUENCE ${quote(seq)} TO ${quote(notificationRole)}; CREATE FUNCTION ${quote(fn)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${noticeId(r)}' THEN PERFORM nextval('${seq}'); RAISE EXCEPTION 'owned notification fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${quote(tr)} BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION ${quote(fn)}()`
      );
      try {
        const result = await owner.executeLegacyAdmin(cookie, JSON.stringify(r), observation);
        assert.equal(result.status, 'completed');
        assert.equal(result.result.success, true);
        const until = performance.now() + 3000;
        let observed = false;
        do {
          const [row] = await admin.unsafe(`select is_called from ${quote(seq)}`);
          if (row.is_called) {
            observed = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        } while (performance.now() < until);
        assert(observed, 'Actual notifier must reach the faulted INSERT before cleanup');
        await owner.close();
        // close() settles the owning notifier; the live fault/sequence still observes every attempt.
        const [attempts] = await admin.unsafe(
          `select last_value::int as last_value,is_called from ${quote(seq)}`
        );
        assert.deepEqual(
          attempts,
          { last_value: 1, is_called: true },
          'Exactly one INSERT attempt after owning runtime closes'
        );
        await drain();
        assert.equal((await notification(r)).length, 0);
        assert.equal((await state(id)).audit.length, 1);
      } finally {
        await owner.close();
        await admin.unsafe(
          `DROP TRIGGER ${quote(tr)} ON notifications; DROP FUNCTION ${quote(fn)}(); DROP SEQUENCE ${quote(seq)}`
        );
      }
      const replay = await invoke('executeLegacyAdmin', r);
      assert.equal(replay.replayed, true);
      await drain();
      assert.equal((await notification(r)).length, 0);
      const later = req(id);
      assert.equal((await invoke('executeLegacyAgent', later)).result.success, true);
      await awaitNotice(later);
      await drain();
    }
  );
  await run('concurrent same UUID executes assignment audit and notification once', async () => {
    const id = 'profile_concurrent_' + suffix;
    await seedClaim(id);
    const r = req(id);
    const results = await Promise.all([
      invoke('executeLegacyAdmin', r),
      invoke('executeLegacyAdmin', r),
    ]);
    assert(results.every(x => x.status === 'completed' && x.result.success));
    assert.deepEqual(results.map(x => x.replayed).sort(), [false, true]);
    const rows = await state(id);
    assert.equal(rows.audit.length, 1);
    assert.equal(rows.result.length, 1);
    await awaitNotice(r);
    await drain();
    assert.equal((await notification(r)).length, 1);
  });
  await run('queued target role mutation is reread under the current target lock', async () => {
    const id = 'profile_target_race_' + suffix;
    await seedClaim(id);
    const r = req(id, secondStaff),
      before = await state(id);
    // Dedicated provisioning observer belongs to this fixture, never the tested runtime.
    const observer = postgres(f.adminURL, { max: 1, ssl: false });
    let release, ready;
    const released = new Promise(resolve => (release = resolve)),
      acquired = new Promise(resolve => (ready = resolve));
    const hold = admin.begin(async tx => {
      await tx`update "user" set role='member' where id=${secondStaff}`;
      ready();
      await released;
    });
    await acquired;
    const pending = invoke('executeLegacyAdmin', r);
    try {
      const until = performance.now() + 3000;
      let blocked = false;
      do {
        const rows =
          await observer`select pid from pg_stat_activity where usename=${dataRole} and cardinality(pg_blocking_pids(pid))>0`;
        if (rows.length) {
          blocked = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      } while (performance.now() < until);
      assert(blocked, 'Actual runtime must wait for target row mutation');
      release();
      await hold;
      const result = await pending;
      assert.equal(result.status, 'completed');
      assert.equal(result.result.success, false);
      assert.deepEqual((await state(id)).claim, before.claim);
      assert.equal((await state(id)).audit.length, 0);
      await drain();
    } finally {
      release();
      await hold;
      await targetRole(secondStaff, 'staff');
      await pending;
      await observer.end({ timeout: 0 });
    }
  });
  await run(
    'blocked notification deadline retires its database while assignment remains committed',
    async () => {
      const owner = f.make(10000, 750),
        observer = postgres(f.adminURL, { max: 1, ssl: false });
      const id = 'profile_notice_timeout_' + suffix;
      await seedClaim(id);
      const r = req(id);
      let release, ready;
      const released = new Promise(resolve => (release = resolve)),
        acquired = new Promise(resolve => (ready = resolve));
      const hold = admin.begin(async tx => {
        await tx`lock table notifications in access exclusive mode`;
        ready();
        await released;
      });
      await acquired;
      try {
        const result = await owner.executeLegacyAdmin(cookie, JSON.stringify(r), observation);
        assert.equal(result.status, 'completed');
        assert.equal(result.result.success, true);
        const until = performance.now() + 2000;
        let blocked = false;
        do {
          const rows =
            await observer`select pid from pg_stat_activity where usename=${notificationRole} and cardinality(pg_blocking_pids(pid))>0`;
          if (rows.length) {
            blocked = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 10));
        } while (performance.now() < until);
        assert(blocked, 'Notifier must reach actual blocked INSERT');
        const retired = performance.now() + 2500;
        let remaining = 1;
        do {
          const rows =
            await observer`select pid from pg_stat_activity where usename=${notificationRole}`;
          remaining = rows.length;
          if (!remaining) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        } while (performance.now() < retired);
        assert.equal(remaining, 0, 'Only owned notifier deadline retires blocked backend');
        release();
        await hold;
        await owner.close();
        assert.equal((await state(id)).audit.length, 1);
        assert.equal((await state(id)).claim[0].staffId, staff);
        assert.equal((await notification(r)).length, 0);
        assert.equal((await invoke('executeLegacyAdmin', r)).replayed, true);
        await drain();
        assert.equal((await notification(r)).length, 0);
      } finally {
        release();
        await hold;
        await owner.close();
        await observer.end({ timeout: 0 });
      }
    }
  );
  await run(
    'legacy crossbranch assignment retains assignment notice without claiming staff detail visibility',
    async () => {
      const id = 'profile_legacy_crossbranch_' + suffix;
      await seedClaim(id);
      await admin`update claim set branch_id=${branchA} where id=${id}`;
      await targetRole(secondStaff, 'staff', branchB);
      try {
        const r = req(id, secondStaff),
          result = await invoke('executeLegacyAdmin', r);
        assert.equal(result.status, 'completed');
        assert.equal(result.result.success, true);
        const rows = await awaitNotice(r);
        assert.equal(rows[0].user_id, secondStaff);
        assert.equal(rows[0].content, 'Update on: Synthetic case');
        assert.equal((await state(id)).claim[0].staffId, secondStaff);
        await drain();
      } finally {
        await targetRole(secondStaff, 'staff');
      }
    }
  );
}
