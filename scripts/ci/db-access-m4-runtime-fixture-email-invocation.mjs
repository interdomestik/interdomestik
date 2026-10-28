import assert from 'node:assert/strict';
import {
  holdM4ObserverNotice,
  waitM4ObserverNoticeConflict,
} from './db-access-m4-email-notice-conflict.mjs';

async function awaitNotice(f, operationId) {
  const id = 'ntf_m4_assignment_' + operationId;
  const until = performance.now() + 3000;
  do {
    const rows = await f.admin`select id from notifications where id=${id} and tenant_id=${f.home}`;
    if (rows.length) return Array.from(rows);
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (performance.now() < until);
  throw Error('M4 observer notice absent');
}

export async function runEmailInvocationCase({ run, openObserverFixture }) {
  await run(
    'verified-email invokes fixed provider refusal once with replay and unverified controls',
    async () => {
      const owned = await openObserverFixture();
      let heldNotice;
      try {
        const f = owned.fixture;
        const observation = JSON.stringify({
          ip: '192.0.2.10',
          userAgent: 'Synthetic M4 email invocation proof',
        });
        assert.equal(
          owned.emailUnavailableCount(),
          0,
          'Dedicated child starts with zero email markers'
        );
        const initial =
          await f.admin`select "emailVerified" from "user" where id=${f.staff} and tenant_id=${f.home}`;
        assert.equal(initial[0].emailVerified, false, 'Synthetic target begins unverified');
        await f.admin`update "user" set "emailVerified"=true where id=${f.staff} and tenant_id=${f.home}`;
        const verified =
          await f.admin`select "emailVerified",email from "user" where id=${f.staff} and tenant_id=${f.home}`;
        assert.equal(verified[0].emailVerified, true, 'Current synthetic target is verified');
        assert.equal(
          verified[0].email,
          f.staff + '@example.test',
          'Verified recipient remains synthetic'
        );
        const positiveId = 'email_verified_' + f.suffix;
        await f.seedClaim(positiveId);
        const positiveRequest = {
          ...f.request(positiveId),
          command: 'm4.legacy.assign-claim',
        };
        const positive = await f.runtime.executeLegacyAdmin(
          f.cookie,
          JSON.stringify(positiveRequest),
          observation
        );
        assert.equal(
          positive.status,
          'completed',
          'Verified assignment completed through real facade'
        );
        assert.equal(positive.result.success, true, 'Verified assignment domain result succeeded');
        assert.equal(positive.replayed, false, 'Verified assignment is a new operation');
        const positiveNotice = await awaitNotice(f, positiveRequest.operationId);
        assert.equal(positiveNotice.length, 1, 'Verified assignment committed one notice');
        assert.equal(
          await owned.waitForEmailUnavailableCount(1),
          1,
          'Actual unmodified email helper reached fixed missing-provider warning'
        );
        const positiveState = await f.state(positiveId);
        assert.equal(
          positiveState.claim[0].staffId,
          f.staff,
          'Verified assignment changed the requested staff'
        );
        assert.equal(positiveState.audit.length, 1, 'Verified assignment committed one audit');
        assert.equal(positiveState.result.length, 1, 'Verified assignment committed one result');
        const replay = await f.runtime.executeLegacyAdmin(
          f.cookie,
          JSON.stringify(positiveRequest),
          observation
        );
        assert.equal(
          replay.replayed,
          true,
          'Same operation is replayed without another notifier launch'
        );
        assert.deepEqual(
          await f.state(positiveId),
          positiveState,
          'Replay preserves claim audit and result state'
        );
        await f.admin`update "user" set "emailVerified"=false where id=${f.staff} and tenant_id=${f.home}`;
        const unverifiedTarget =
          await f.admin`select "emailVerified" from "user" where id=${f.staff} and tenant_id=${f.home}`;
        assert.equal(
          unverifiedTarget[0].emailVerified,
          false,
          'Unverified control reads back current false verification'
        );
        const unverifiedId = 'email_unverified_' + f.suffix;
        await f.seedClaim(unverifiedId);
        const unverifiedRequest = {
          ...f.request(unverifiedId),
          command: 'm4.legacy.assign-claim',
        };
        const unverified = await f.runtime.executeLegacyAdmin(
          f.cookie,
          JSON.stringify(unverifiedRequest),
          observation
        );
        assert.equal(
          unverified.status,
          'completed',
          'Unverified control still completes assignment'
        );
        assert.equal(unverified.result.success, true, 'Unverified control domain result succeeded');
        const unverifiedNotice = await awaitNotice(f, unverifiedRequest.operationId);
        assert.equal(unverifiedNotice.length, 1, 'Unverified control still commits its notice');
        await f.noOwnedSessions();
        await f.admin`update "user" set "emailVerified"=true where id=${f.staff} and tenant_id=${f.home}`;
        const restored =
          await f.admin`select "emailVerified",email from "user" where id=${f.staff} and tenant_id=${f.home}`;
        assert.equal(restored[0].emailVerified, true, 'Conflict target is currently verified');
        assert.equal(
          restored[0].email,
          f.staff + '@example.test',
          'Conflict target retains the same synthetic address'
        );
        const conflictId = 'email_conflict_' + f.suffix;
        await f.seedClaim(conflictId);
        const conflictRequest = { ...f.request(conflictId), command: 'm4.legacy.assign-claim' };
        heldNotice = await holdM4ObserverNotice(f, conflictRequest);
        assert.equal(
          heldNotice.notice.length,
          1,
          'Parent inserted exactly the owned deterministic notice'
        );
        assert.equal(
          heldNotice.notice[0].id,
          'ntf_m4_assignment_' + conflictRequest.operationId,
          'Parent holds the exact operation notice key'
        );
        assert.equal(
          heldNotice.notice[0].tenant_id,
          f.home,
          'Parent notice belongs to this fixture tenant'
        );
        assert.equal(
          heldNotice.notice[0].user_id,
          f.staff,
          'Parent notice belongs to the verified target'
        );
        const beforeCommit =
          await f.admin`select * from notifications where id=${heldNotice.notice[0].id}`;
        assert.equal(
          beforeCommit.length,
          0,
          'Uncommitted parent notice is absent from another connection snapshot'
        );
        const conflict = await f.runtime.executeLegacyAdmin(
          f.cookie,
          JSON.stringify(conflictRequest),
          observation
        );
        assert.equal(
          conflict.status,
          'completed',
          'Conflict setup still commits the real assignment'
        );
        assert.equal(conflict.result.success, true, 'Conflict assignment domain result succeeded');
        assert.equal(
          conflict.changed,
          true,
          'Conflict assignment is a changed operation eligible for notification'
        );
        assert.equal(
          conflict.replayed,
          false,
          'Conflict UUID is fresh rather than replay suppression'
        );
        const waiters = await waitM4ObserverNoticeConflict(f, heldNotice);
        assert.equal(
          waiters.length,
          1,
          'One restricted notification backend waits on the held unique key transaction'
        );
        assert.equal(
          Number.isSafeInteger(waiters[0].waiter_pid) && waiters[0].waiter_pid > 0,
          true,
          'Conflict witness names an actual backend PID'
        );
        assert.deepEqual(
          waiters[0],
          {
            waiter_pid: waiters[0].waiter_pid,
            waiter_role: f.notificationRole,
            wait_event_type: 'Lock',
            wait_event: 'transactionid',
            locktype: 'transactionid',
            mode: 'ShareLock',
            granted: false,
            transaction_id: heldNotice.transactionId,
            blocker_pid: heldNotice.parentPid,
            blocker_mode: 'ExclusiveLock',
            blocker_granted: true,
            blockers: [heldNotice.parentPid],
          },
          'Exact notification role waits on the exact parent transaction lock and PID'
        );
        await heldNotice.commit();
        await f.noOwnedSessions();
        const preservedNotice =
          await f.admin`select * from notifications where id=${heldNotice.notice[0].id}`;
        assert.deepEqual(
          Array.from(preservedNotice),
          heldNotice.notice,
          'ON CONFLICT preserves every preexisting notification column'
        );
        const conflictState = await f.state(conflictId);
        assert.equal(
          conflictState.claim[0].staffId,
          f.staff,
          'Conflict notice does not roll back assignment'
        );
        assert.equal(
          conflictState.audit.length,
          1,
          'Conflict notice does not roll back assignment audit'
        );
        assert.equal(
          conflictState.result.length,
          1,
          'Conflict notice retains its durable assignment result'
        );
        const retired = await owned.finish();
        assert.equal(
          retired.cleanup.complete,
          true,
          'Dedicated fixture removed all owned database resources'
        );
        assert.equal(
          retired.cleanup.remainingOwnedSessions,
          0,
          'Dedicated fixture leaves no restricted sessions'
        );
        assert.equal(
          retired.cleanup.forcedTermination,
          false,
          'Dedicated fixture requires no database termination'
        );
        assert.deepEqual(
          retired.child,
          {
            emailUnavailableCalls: 1,
            exitCode: 0,
            exitMode: 'explicit-after-output-fence',
            outputFenceAcknowledged: true,
            forcedTermination: false,
            stdoutEnded: true,
            stderrEnded: true,
          },
          'Final fenced EOF count proves one provider invocation with no additional replay unverified or conflict invocation'
        );
      } finally {
        try {
          await heldNotice?.releaseIfHeld();
        } finally {
          await owned.finish();
        }
      }
    }
  );
}
