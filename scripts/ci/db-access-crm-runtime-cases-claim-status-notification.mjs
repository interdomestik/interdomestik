import assert from 'node:assert/strict';
import { settleStatusNotification } from './db-access-crm-runtime-notification-settlement.mjs';
import { snapshotStatusDenialState } from './db-access-crm-runtime-notification-state.mjs';
import { assertContextClear } from './db-access-crm-runtime-context.mjs';

export const STATUS_NOTIFICATION_ASSERTIONS = [
  'actual status core rejects missing session, non-staff and foreign staff scope before mutation; committed status precedes fresh notification transactions',
  'restricted LOGIN recipient lookup returns only same-tenant user; foreign or absent user, empty email and forced lookup SQL failure produce no send; schema rejects null email',
  'actual notification store checks tenant and user, inserts only tenant-owned notification, denies foreign recipient and rolls back forced insert failure',
  'public result and notification callback carry only expected data; tenant context is clear after settlement; verified-recipient email and push preserve best-effort behavior without external delivery',
];

export async function runCrmClaimStatusNotificationCases() {
  const r = await import('./crm-runtime.cjs');
  const { eq, sql } = await import('drizzle-orm');
  const { dbAdmin, user, claims, notifications } = r;
  await r.assertRlsConnectionRoleReady();
  const role = process.env.DB_RLS_ROLE;
  assert.match(role, /^s8_crm_app_[a-f0-9]+$/);
  const tenantId = 'tenant_ks',
    foreignTenantId = 'tenant_mk';
  const prefix = 'owned-status-notification-';
  const ids = Object.fromEntries(
    ['staff', 'other-staff', 'member', 'unverified', 'empty', 'foreign'].map(k => [k, prefix + k])
  );
  for (const [kind, id] of Object.entries(ids)) {
    await dbAdmin.insert(user).values({
      id,
      tenantId: kind === 'foreign' ? foreignTenantId : tenantId,
      name: id,
      email: kind === 'empty' ? '' : id + '@example.invalid',
      emailVerified: kind === 'member',
      role: kind.includes('staff') ? 'staff' : 'member',
      createdAt: new Date('2026-10-24T00:00:00Z'),
      updatedAt: new Date('2026-10-24T00:00:00Z'),
    });
  }
  const claimId = prefix + 'claim';
  for (const [suffix, scopeTenant, staffId, userId] of [
    ['', tenantId, ids.staff, ids.member],
    ['-other-staff', tenantId, ids['other-staff'], ids.member],
    ['-foreign', foreignTenantId, ids.foreign, ids.foreign],
  ])
    await dbAdmin.insert(claims).values({
      id: claimId + suffix,
      tenantId: scopeTenant,
      staffId,
      userId,
      title: 'Owned status notification',
      category: 'vehicle',
      companyName: 'Owned fixture',
      caseLifecycleState: 'submitted',
      recoveryLifecycleState: 'not_started',
    });
  const currentClaim = id => dbAdmin.query.claims.findFirst({ where: (c, { eq }) => eq(c.id, id) });
  const ownedNotifications = () =>
    dbAdmin.query.notifications.findMany({
      where: (n, { inArray }) => inArray(n.userId, Object.values(ids)),
    });
  const containsCode = (error, code) =>
    error?.code === code || Boolean(error?.cause && containsCode(error.cause, code));
  await assert.rejects(
    dbAdmin.update(user).set({ email: null }).where(eq(user.id, ids.empty)),
    error => containsCode(error, '23502')
  );

  const savedAutomated = process.env.INTERDOMESTIK_AUTOMATED;
  const savedLog = console.log,
    savedError = console.error;
  const emailLogs = [],
    errors = [],
    pushes = [];
  process.env.INTERDOMESTIK_AUTOMATED = '1';
  console.log = (...args) => {
    if (String(args[0]).startsWith('[MockEmail]')) emailLogs.push(args[0]);
    else savedLog(...args);
  };
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    const push = async (...args) => {
      pushes.push(args);
    };
    const session = {
      user: { id: ids.staff, tenantId, role: 'staff', branchId: null },
    };
    let unexpectedEffects = 0;
    const deniedDeps = {
      projectClaimStatusAuditProjection: () => {
        unexpectedEffects++;
      },
      notifyStatusChanged: () => {
        unexpectedEffects++;
      },
    };
    for (const denied of [
      { claimId, session: null },
      { claimId, session: { user: { ...session.user, role: 'member' } } },
      { claimId: claimId + '-other-staff', session },
      { claimId: claimId + '-foreign', session },
    ]) {
      const before = await snapshotStatusDenialState(r, claimId);
      const result = await r.updateClaimStatusCore(
        { ...denied, newStatus: 'verification' },
        deniedDeps
      );
      assert.equal(result.success, false);
      assert.deepEqual(await snapshotStatusDenialState(r, claimId), before);
    }
    assert.equal(unexpectedEffects, 0);
    assert.equal(errors.length, 0);
    assert.deepEqual(await ownedNotifications(), []);

    const delivered = Promise.withResolvers();
    const order = [];
    const deps = {
      projectClaimStatusAuditProjection: async args => {
        assert.deepEqual(args, { limit: 10, tenantId });
        assert.equal((await currentClaim(claimId)).caseLifecycleState, 'verification');
        await assertContextClear(r);
        order.push('committed-audit');
      },
      notifyStatusChanged: async (...args) => {
        try {
          assert.deepEqual(args, [
            ids.member,
            ids.member + '@example.invalid',
            { id: claimId, title: 'Owned status notification' },
            'submitted',
            'verification',
            { tenantId },
          ]);
          assert.deepEqual(order, ['committed-audit']);
          assert.equal((await currentClaim(claimId)).caseLifecycleState, 'verification');
          await assertContextClear(r);
          order.push('fresh-notification');
          const result = await r.notifyStatusChanged(...args.slice(0, 5), {
            ...args[5],
            sendPushToUser: push,
          });
          delivered.resolve(result);
          return result;
        } catch (error) {
          delivered.reject(error);
          throw error;
        }
      },
    };
    const [result, notification] = await Promise.all([
      r.updateClaimStatusCore({ claimId, newStatus: 'verification', session }, deps).then(value => {
        assert.deepEqual(value, { success: true, error: undefined });
        return value;
      }),
      delivered.promise,
    ]);
    assert.deepEqual(result, { success: true, error: undefined });
    assert.deepEqual(notification, { success: true });
    assert.deepEqual(order, ['committed-audit', 'fresh-notification']);
    assert.equal(errors.length, 0);
    let rows = await ownedNotifications();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tenantId, tenantId);
    assert.equal(rows[0].userId, ids.member);
    assert.equal(rows[0].actionUrl, '/member/claims/' + claimId);
    assert.equal(rows[0].type, 'claim_status_changed');
    assert.equal(emailLogs.length, 1);
    assert.ok(emailLogs[0].includes(ids.member + '@example.invalid'));
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0][0], ids.member);
    await assertContextClear(r);

    const lookups = [];
    const lookup = {
      claimId,
      claimTitle: 'Owned status notification',
      tenantId,
      userId: ids.member,
      oldStatus: 'submitted',
      newStatus: 'verification',
      deps: {
        notifyStatusChanged: async (...args) => {
          lookups.push(args);
        },
      },
    };
    await settleStatusNotification(r.scheduleStatusChangeNotification, lookup);
    assert.deepEqual(lookups, [
      [
        ids.member,
        ids.member + '@example.invalid',
        { id: claimId, title: lookup.claimTitle },
        'submitted',
        'verification',
        { tenantId },
      ],
    ]);
    for (const change of [
      ...[ids.foreign, prefix + 'absent', ids.empty].map(userId => ({ userId })),
      { tenantId: foreignTenantId },
    ]) {
      await settleStatusNotification(r.scheduleStatusChangeNotification, {
        ...lookup,
        ...change,
      });
      assert.equal(lookups.length, 1);
      await assertContextClear(r);
    }
    for (const change of [{ oldStatus: null }, { oldStatus: 'verification' }, { deps: {} }]) {
      await settleStatusNotification(r.scheduleStatusChangeNotification, {
        ...lookup,
        ...change,
      });
      assert.equal(lookups.length, 1);
    }
    const errorsBeforeLookup = errors.length;
    await dbAdmin.execute(sql.raw('REVOKE SELECT ON "user" FROM "' + role + '"'));
    try {
      await settleStatusNotification(r.scheduleStatusChangeNotification, lookup);
      assert.equal(lookups.length, 1);
      assert.equal(errors.length, errorsBeforeLookup + 1);
      assert.ok(containsCode(errors.at(-1)[1], '42501'));
    } finally {
      await dbAdmin.execute(sql.raw('GRANT SELECT ON "user" TO "' + role + '"'));
    }
    await assertContextClear(r);

    const callNotify = (userId, options = {}) =>
      r.notifyStatusChanged(
        userId,
        'untrusted@example.invalid',
        { id: claimId, title: 'Owned status notification' },
        'submitted',
        'verification',
        { tenantId, sendPushToUser: push, ...options }
      );
    const beforeDenied = await ownedNotifications();
    for (const [userId, options] of [
      [ids.foreign, {}],
      [prefix + 'absent', {}],
      [ids.member, { tenantId: '' }],
      [ids.member, { tenantId: foreignTenantId }],
    ]) {
      assert.equal((await callNotify(userId, options)).success, false);
      assert.deepEqual(await ownedNotifications(), beforeDenied);
    }
    assert.equal(pushes.length, 1);
    assert.equal(emailLogs.length, 1);
    const errorsBeforeUnverified = errors.length;
    assert.deepEqual(await callNotify(ids.unverified), { success: true });
    assert.equal(errors.length, errorsBeforeUnverified);
    assert.equal(pushes.length, 2);
    assert.equal(emailLogs.length, 1, 'unverified recipient gets no email');
    rows = await ownedNotifications();
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.tenantId === tenantId));

    const beforeInsertFailure = await ownedNotifications();
    const errorsBeforeInsert = errors.length;
    await dbAdmin.execute(sql.raw('REVOKE INSERT ON notifications FROM "' + role + '"'));
    try {
      assert.equal((await callNotify(ids.member)).success, false);
      assert.deepEqual(await ownedNotifications(), beforeInsertFailure);
      assert.equal(errors.length, errorsBeforeInsert + 1);
      assert.ok(containsCode(errors.at(-1)[1], '42501'));
      assert.equal(pushes.length, 2);
      assert.equal(emailLogs.length, 1);
    } finally {
      await dbAdmin.execute(sql.raw('GRANT INSERT ON notifications TO "' + role + '"'));
    }
    await assertContextClear(r);

    const errorsBeforePush = errors.length;
    assert.deepEqual(
      await callNotify(ids.member, {
        sendPushToUser: async () => {
          throw new Error('owned push failure');
        },
      }),
      { success: true }
    );
    assert.equal((await ownedNotifications()).length, 3);
    assert.equal(emailLogs.length, 2);
    assert.ok(
      emailLogs.every(
        log => log.includes(ids.member + '@example.invalid') && !log.includes('untrusted@')
      )
    );
    assert.equal(errors.length, errorsBeforePush + 1);
    assert.equal(errors.at(-1)[0], 'Failed to send status change push:');
    await assertContextClear(r);
    return [...STATUS_NOTIFICATION_ASSERTIONS];
  } finally {
    console.log = savedLog;
    console.error = savedError;
    if (savedAutomated === undefined) delete process.env.INTERDOMESTIK_AUTOMATED;
    else process.env.INTERDOMESTIK_AUTOMATED = savedAutomated;
  }
}
