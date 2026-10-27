// Fixed parent-only SQL schedule: no runtime code replacement or new restricted privileges.
export async function holdM4ObserverNotice(f, request) {
  let ready, rejectReady, release, finishing;
  const prepared = new Promise((resolve, reject) => {
    ready = resolve;
    rejectReady = reject;
  });
  const released = new Promise(resolve => {
    release = resolve;
  });
  const transaction = f.blocker.begin(async tx => {
    const rows = await tx`insert into notifications
      (id,tenant_id,user_id,type,title,content,action_url,is_read)
      values (${'ntf_m4_assignment_' + request.operationId},${f.home},${f.staff},
        'claim_assigned','Owned preexisting notice','Owned conflict sentinel',
        ${'/staff/claims/' + request.claimId},false) returning *`;
    const owners = await tx`select pid,transactionid::text as transaction_id
      from pg_locks where pid=pg_backend_pid() and locktype='transactionid'
      and mode='ExclusiveLock' and granted`;
    if (rows.length !== 1 || owners.length !== 1) throw Error('M4 notice owner witness refused');
    ready({
      notice: Array.from(rows),
      parentPid: owners[0].pid,
      transactionId: owners[0].transaction_id,
    });
    if (!(await released)) throw Error('M4 notice fixture rollback');
  });
  // Observe setup/transaction failure immediately, without manufacturing a successful commit.
  const settled = transaction.then(
    () => ({ committed: true }),
    error => {
      rejectReady(error);
      return { committed: false, error };
    }
  );
  const evidence = await prepared;
  return Object.freeze({
    ...evidence,
    async commit() {
      if (finishing) throw Error('M4 notice release repeated');
      finishing = true;
      release(true);
      const outcome = await settled;
      if (!outcome.committed) throw outcome.error;
    },
    async releaseIfHeld() {
      if (!finishing) {
        finishing = true;
        release(false);
      }
      await settled;
    },
  });
}

export async function waitM4ObserverNoticeConflict(f, owner) {
  const until = performance.now() + 5000;
  do {
    const rows = await f.admin`select a.pid as waiter_pid,a.usename as waiter_role,
      a.wait_event_type,a.wait_event,w.locktype,w.mode,w.granted,
      w.transactionid::text as transaction_id,h.pid as blocker_pid,
      h.mode as blocker_mode,h.granted as blocker_granted,
      pg_blocking_pids(a.pid) as blockers
      from pg_stat_activity a join pg_locks w on w.pid=a.pid
      join pg_locks h on h.locktype=w.locktype and h.transactionid=w.transactionid
      where a.wait_event_type='Lock' and a.wait_event='transactionid' and a.usename=${f.notificationRole} and w.locktype='transactionid'
      and w.transactionid::text=${owner.transactionId}
      and not w.granted and w.mode='ShareLock'
      and h.pid=${owner.parentPid} and h.granted and h.mode='ExclusiveLock'`;
    if (rows.length) return Array.from(rows);
    await new Promise(resolve => setTimeout(resolve, 10));
  } while (performance.now() < until);
  throw Error('M4 exact notification transaction wait absent');
}
