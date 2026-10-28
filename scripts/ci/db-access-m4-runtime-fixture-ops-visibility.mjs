// Parent-only altered-RLS visibility fault; not ordinary production reachability.
import assert from 'node:assert/strict';

const literal = value => "'" + value.replaceAll("'", "''") + "'";
async function posture(admin, role) {
  return {
    roles: Array.from(
      await admin`select rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
      rolinherit,rolreplication,rolcanlogin from pg_roles where rolname=${role}`
    ),
    tables: Array.from(
      await admin`select table_schema,table_name,privilege_type,is_grantable
      from information_schema.table_privileges where grantee=${role}
      order by table_schema,table_name,privilege_type,is_grantable`
    ),
    columns: Array.from(
      await admin`select table_schema,table_name,column_name,privilege_type,is_grantable
      from information_schema.column_privileges where grantee=${role}
      order by table_schema,table_name,column_name,privilege_type,is_grantable`
    ),
  };
}

export async function runOpsVisibilityCase(f) {
  const {
    admin,
    blocker,
    run,
    seedClaim,
    state,
    request,
    invoke,
    make,
    cookie,
    actor,
    staff,
    secondStaff,
    home,
    dataRole,
    suffix,
    quote,
    waitDataBlocked,
    noOwnedSessions,
    record,
  } = f;
  await run(
    'ops restrictive visibility fault reaches missing-claim denial after controller admission',
    async () => {
      const id = 'ops_visibility_claim_' + suffix,
        gateId = 'ops_visibility_gate_' + suffix,
        policyName = dataRole + '_visibility';
      await seedClaim(id);
      const before = await state(id),
        r = request(id, staff),
        owner = make();
      const roleBefore = await posture(admin, dataRole);
      let gateCreated = false,
        policyCreated = false,
        hold,
        pending;
      let release = () => {};
      try {
        assert.equal([actor, staff, secondStaff].includes(gateId), false);
        assert.equal(before.claim.length, 1);
        assert.equal(before.audit.length, 0);
        assert.equal(before.result.length, 0);
        await admin`insert into "user"(id,tenant_id,name,email,"emailVerified",role,"createdAt","updatedAt")
        values(${gateId},${home},'Owned visibility gate',${gateId + '@example.test'},false,'staff',now(),now())`;
        gateCreated = true;
        const [gateBefore] = await admin`select id,tenant_id,role from "user" where id=${gateId}`;
        assert.deepEqual(gateBefore, { id: gateId, tenant_id: home, role: 'staff' });
        await admin.unsafe(`CREATE POLICY ${quote(policyName)} ON public.claim AS RESTRICTIVE
        FOR SELECT TO ${quote(dataRole)} USING (claim.id <> ${literal(id)} OR
          (current_setting('transaction_isolation') = 'read committed' AND EXISTS (
            SELECT 1 FROM public."user" AS fault_gate WHERE fault_gate.id = ${literal(gateId)}
              AND fault_gate.tenant_id = ${literal(home)} AND fault_gate.role = 'staff')))`);
        policyCreated = true;
        const policyRows = Array.from(
          await admin`select schemaname,tablename,policyname,permissive,
        roles,cmd,qual,with_check from pg_policies where schemaname='public'
        and tablename='claim' and policyname=${policyName}`
        );
        assert.equal(policyRows.length, 1);
        const { qual, ...policyMetadata } = policyRows[0];
        assert.deepEqual(policyMetadata, {
          schemaname: 'public',
          tablename: 'claim',
          policyname: policyName,
          permissive: 'RESTRICTIVE',
          roles: [dataRole],
          cmd: 'SELECT',
          with_check: null,
        });
        const [server] = await admin`select current_setting('server_version_num') as version`;
        let ready;
        const released = new Promise(resolve => (release = resolve)),
          acquired = new Promise(resolve => (ready = resolve));
        hold = blocker.begin(async tx => {
          const [{ pid }] = await tx`select pg_backend_pid() as pid`;
          await tx`select pg_advisory_xact_lock(hashtextextended(${r.operationId},0))`;
          const locks = Array.from(
            await tx`select locktype,mode,granted,database::text as database_id,
          classid::text as classid,objid::text as objid,objsubid from pg_locks
          where pid=${pid} and locktype='advisory'`
          );
          ready({ pid, locks });
          await released;
        });
        const held = await Promise.race([acquired, hold]);
        const blockerPid = held.pid;
        assert.equal(Number.isInteger(blockerPid), true);
        assert.equal(held.locks.length, 1);
        const { database_id, classid, objid, objsubid } = held.locks[0];
        const tag = { database_id, classid, objid, objsubid };
        assert.deepEqual(held.locks[0], {
          locktype: 'advisory',
          mode: 'ExclusiveLock',
          granted: true,
          ...tag,
        });
        pending = invoke(r, cookie, owner);
        await waitDataBlocked();
        const waits = Array.from(
          await admin`select a.pid,a.usename,a.wait_event_type,
        w.locktype,w.mode,w.granted,w.database::text as database_id,
        w.classid::text as classid,w.objid::text as objid,w.objsubid,
        h.pid as holder_pid,h.granted as holder_granted
        from pg_stat_activity a join pg_locks w on w.pid=a.pid
        join pg_locks h on h.locktype=w.locktype
          and h.database is not distinct from w.database and h.classid=w.classid
          and h.objid=w.objid and h.objsubid=w.objsubid
        where a.usename=${dataRole} and w.locktype='advisory' and not w.granted
          and h.pid=${blockerPid} and h.granted
          and ${blockerPid}=any(pg_blocking_pids(a.pid))`
        );
        assert.equal(waits.length, 1);
        const backendPid = waits[0].pid;
        assert.equal(Number.isInteger(backendPid), true);
        assert.equal(backendPid === blockerPid, false);
        assert.deepEqual(waits[0], {
          pid: backendPid,
          usename: dataRole,
          wait_event_type: 'Lock',
          locktype: 'advisory',
          mode: 'ExclusiveLock',
          granted: false,
          ...tag,
          holder_pid: blockerPid,
          holder_granted: true,
        });
        const changedGate = Array.from(
          await admin`update "user" set role='member'
        where id=${gateId} and tenant_id=${home} returning id,tenant_id,role`
        );
        assert.deepEqual(changedGate, [{ id: gateId, tenant_id: home, role: 'member' }]);
        const [committedGate] =
          await admin`select id,tenant_id,role from "user" where id=${gateId}`;
        assert.deepEqual(committedGate, { id: gateId, tenant_id: home, role: 'member' });
        release();
        await hold;
        const response = await pending;
        assert.deepEqual(response, {
          status: 'completed',
          operationId: r.operationId,
          replayed: false,
          result: { success: false, error: 'Claim not found or access denied' },
        });
        const after = await state(id);
        assert.deepEqual(after.claim, before.claim);
        assert.deepEqual(after.audit, before.audit);
        assert.equal(after.result.length, 1);
        assert.equal(after.result[0].operation_id, r.operationId);
        assert.deepEqual(after.result[0].response, response.result);
        const notices = Array.from(
          await admin`select id from notifications where id=${'ntf_m4_assignment_' + r.operationId}`
        );
        assert.deepEqual(notices, []);
        await noOwnedSessions();
        assert.deepEqual(await state(id), after);
        // Controller resource authorization precedes replay: restore visibility first.
        const restoredGate = Array.from(
          await admin`update "user" set role='staff'
        where id=${gateId} and tenant_id=${home} returning id,tenant_id,role`
        );
        assert.deepEqual(restoredGate, [{ id: gateId, tenant_id: home, role: 'staff' }]);
        const replay = await invoke(r, cookie, owner);
        assert.deepEqual(replay, { ...response, replayed: true });
        await noOwnedSessions();
        const replayedState = await state(id);
        assert.deepEqual(replayedState, after);
        const replayNotices = Array.from(
          await admin`select id from notifications where id=${'ntf_m4_assignment_' + r.operationId}`
        );
        assert.deepEqual(replayNotices, []);
        const roleAfter = await posture(admin, dataRole);
        assert.deepEqual(roleAfter, roleBefore);
        record.opsVisibilityFault = {
          context: 'database-visibility-fault',
          ordinaryProductionPath: false,
          serverVersionNum: server.version,
          operationIsolationRequiredByPolicy: 'read committed',
          policy: policyRows[0],
          backendPid,
          blockerPid,
          lockTag: tag,
          unchangedRoleAndGrants: true,
        };
      } finally {
        release();
        try {
          if (hold) await hold;
        } finally {
          try {
            await owner.close();
          } finally {
            try {
              if (pending) await pending;
            } finally {
              try {
                await noOwnedSessions();
              } finally {
                try {
                  if (policyCreated)
                    await admin.unsafe(`DROP POLICY ${quote(policyName)} ON public.claim`);
                } finally {
                  if (gateCreated)
                    await admin`delete from "user" where id=${gateId} and tenant_id=${home}`;
                }
              }
            }
          }
        }
      }
      const remainingPolicy = Array.from(
        await admin`select policyname from pg_policies
      where schemaname='public' and tablename='claim' and policyname=${policyName}`
      );
      assert.deepEqual(remainingPolicy, []);
      const remainingGate = Array.from(await admin`select id from "user" where id=${gateId}`);
      assert.deepEqual(remainingGate, []);
    }
  );
}
