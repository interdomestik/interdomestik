import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { installPurposeGrants, quote } from './db-access-m4-runtime-fixture-grants.mjs';
export const code = error => error?.cause?.code ?? error?.code;

// Trusted parent capabilities remain local. The child receives only the config in make().
export async function provisionM4Fixture({
  postgres,
  serializeSignedCookie,
  adminURL,
  client,
  profiles,
  record,
  run,
}) {
  const target = new URL(adminURL),
    suffix = randomUUID(),
    roleSuffix = randomBytes(8).toString('hex');
  const home = 'ctrl_home_' + suffix,
    foreign = 'ctrl_foreign_' + suffix;
  const actor = 'ctrl_actor_' + suffix,
    staff = 'ctrl_staff_' + suffix,
    secondStaff = 'ctrl_staff2_' + suffix;
  const secondActor = 'ctrl_actor2_' + suffix,
    foreignStaff = 'ctrl_foreign_staff_' + suffix,
    nonStaff = 'ctrl_member_' + suffix;
  const branchA = 'branch_a_' + suffix,
    branchB = 'branch_b_' + suffix,
    sessionId = 'ctrl_session_' + suffix;
  const identityRole = 'm4_ctrl_identity_' + roleSuffix,
    dataRole = 'm4_ctrl_data_' + roleSuffix,
    notificationRole = 'm4_notify_' + roleSuffix;
  const token = randomBytes(24).toString('hex'),
    secret = randomBytes(32).toString('hex');
  const admin = postgres(target.href, { max: 1, ssl: false }),
    blocker = postgres(target.href, { max: 1, ssl: false });
  const policies = [],
    roles = [],
    runtimes = [];
  const roleCredentials = [
    [identityRole, randomBytes(32).toString('hex')],
    [dataRole, randomBytes(32).toString('hex')],
    ...(profiles ? [[notificationRole, randomBytes(32).toString('hex')]] : []),
  ];
  const identityUrl = new URL(target),
    dataUrl = new URL(target),
    notificationUrl = new URL(target);
  [identityUrl.username, identityUrl.password] = roleCredentials[0];
  [dataUrl.username, dataUrl.password] = roleCredentials[1];
  if (profiles) [notificationUrl.username, notificationUrl.password] = roleCredentials[2];
  const config = {
    identityDatabaseURL: identityUrl.href,
    dataDatabaseURL: dataUrl.href,
    issuerBaseURL: 'https://app.interdomestik.test',
    issuerSecret: secret,
    operationDeadlineMs: 10000,
    ...(profiles
      ? {
          notificationDatabaseURL: notificationUrl.href,
          notificationDatabaseDeadlineMs: 10000,
        }
      : {}),
  };
  const make = (deadline = 10000, notificationDeadline = 10000) => {
    const captured = {
      ...config,
      operationDeadlineMs: deadline,
      ...(profiles ? { notificationDatabaseDeadlineMs: notificationDeadline } : {}),
    };
    const owner = profiles ? client.createProfiles(captured) : client.createOps(captured);
    runtimes.push(owner);
    return owner;
  };
  async function sessions() {
    return await admin`select pid,usename,state,pg_blocking_pids(pid) as blockers from pg_stat_activity where usename in (${identityRole},${dataRole},${notificationRole})`;
  }
  async function noOwnedSessions() {
    const until = performance.now() + 2000;
    let rows;
    do {
      rows = await sessions();
      if (!rows.length) return;
      await new Promise(r => setTimeout(r, 10));
    } while (performance.now() < until);
    assert.equal(rows.length, 0, 'Owned runtime purpose sessions remain');
  }
  async function seedClaim(id, tenant = home) {
    await admin`insert into claim (id,"userId",tenant_id,category,"companyName",description,origin,title,case_lifecycle_state,recovery_lifecycle_state)
    values (${id},${actor},${tenant},'retail','Synthetic controller','Owned controller proof','portal','Synthetic case','evaluation','not_started')`;
  }
  async function state(id) {
    return {
      claim: Array.from(await admin`select * from claim where id=${id}`),
      audit: Array.from(await admin`select * from audit_log where entity_id=${id} order by id`),
      result: Array.from(
        await admin`select * from operation_results where claim_id=${id} order by operation_id`
      ),
    };
  }
  async function holdClaim(id) {
    let release, ready;
    const released = new Promise(r => (release = r)),
      acquired = new Promise(r => (ready = r));
    const pending = blocker.begin(async tx => {
      await tx`select id from claim where id=${id} for update`;
      ready();
      await released;
    });
    await acquired;
    return {
      async release() {
        release();
        await pending;
      },
    };
  }
  async function waitDataBlocked(count = 1) {
    const until = performance.now() + 5000;
    do {
      const rows = await sessions();
      if (rows.filter(r => r.usename === dataRole && r.blockers.length > 0).length >= count)
        return rows;
      await new Promise(r => setTimeout(r, 10));
    } while (performance.now() < until);
    throw Error('Expected actual blocked private operation backend');
  }
  async function cleanup() {
    const errors = [];
    let remaining = 0,
      forced = false;
    const attempt = async action => {
      try {
        await action();
      } catch (error) {
        errors.push({
          name: error?.name ?? 'Error',
          code: code(error) ?? null,
        });
      }
    };
    for (const owner of runtimes) await attempt(() => owner.close());
    await attempt(() => blocker.end({ timeout: 0 }));
    await attempt(noOwnedSessions);
    await attempt(async () => {
      const rows = await sessions();
      if (rows.length) {
        forced = true;
        for (const row of rows) await admin`select pg_terminate_backend(${row.pid})`;
      }
    });
    // Remove only this fixture's synthetic rows and policy/role names; never reset the database.
    await attempt(async () => {
      await admin`delete from notifications where tenant_id in (${home},${foreign})`;
      await admin`delete from operation_results where tenant_id in (${home},${foreign})`;
      await admin`delete from audit_log where tenant_id in (${home},${foreign})`;
      await admin`delete from claim where tenant_id in (${home},${foreign})`;
      await admin`delete from session where "userId" in (select id from "user" where tenant_id in (${home},${foreign}))`;
      await admin`delete from "user" where tenant_id in (${home},${foreign})`;
      await admin`delete from branches where tenant_id in (${home},${foreign})`;
      await admin`delete from tenants where id in (${home},${foreign})`;
    });
    for (const { table, name } of policies.reverse())
      await attempt(() =>
        admin.unsafe(`DROP POLICY IF EXISTS ${quote(name)} ON public.${quote(table)}`)
      );
    for (const role of roles)
      await attempt(async () => {
        await admin.unsafe(`DROP OWNED BY ${quote(role)}; DROP ROLE ${quote(role)}`);
      });
    await attempt(async () => {
      remaining = (await sessions()).length;
      assert.equal(remaining, 0);
    });
    await attempt(() => admin.end({ timeout: 0 }));
    return {
      complete: errors.length === 0 && !forced,
      remainingOwnedSessions: remaining,
      forcedTermination: forced,
      errors,
    };
  }
  try {
    await admin`insert into tenants(id,name,legal_name,country_code) values(${home},'Controller home','Controller home','XK'),(${foreign},'Controller foreign','Controller foreign','MK')`;
    for (const [id, role, tenant] of [
      [actor, 'admin', home],
      [secondActor, 'admin', home],
      [staff, 'staff', home],
      [secondStaff, 'staff', home],
      [foreignStaff, 'staff', foreign],
      [nonStaff, 'member', home],
    ])
      await admin`insert into "user"(id,tenant_id,name,email,"emailVerified",role,"createdAt","updatedAt") values(${id},${tenant},'Synthetic controller',${id + '@example.test'},${!profiles},${role},now(),now())`;
    await admin`insert into session(id,token,"userId","expiresAt","createdAt","updatedAt") values(${sessionId},${token},${actor},now()+interval '1 hour',now(),now())`;
    for (const [role, password] of roleCredentials) {
      await admin.unsafe(
        `CREATE ROLE ${quote(role)} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`
      );
      roles.push(role);
      await admin.unsafe(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`);
    }
    await installPurposeGrants({
      admin,
      identityRole,
      dataRole,
      notificationRole,
      profiles,
      policies,
    });
    if (profiles)
      await admin`insert into branches(id,tenant_id,name,slug) values(${branchA},${home},'A',${branchA}),(${branchB},${home},'B',${branchB})`;
    const runtime = make(),
      cookie = (
        await serializeSignedCookie('__Secure-better-auth.session_token', token, secret, {
          path: '/',
          secure: true,
        })
      ).split(';', 1)[0];
    const request = (claimId, staffId = staff, operationId = randomUUID()) => ({
      version: 1,
      command: 'm4.ops.assign-owner',
      operationId,
      claimId,
      staffId,
    });
    const invoke = (r, presented = cookie, owner = runtime) =>
      owner.execute(presented, JSON.stringify(r));
    return {
      admin,
      adminURL: target.href,
      blocker,
      postgres,
      client,
      profiles,
      record,
      run,
      seedClaim,
      state,
      sessions,
      noOwnedSessions,
      holdClaim,
      waitDataBlocked,
      runtime,
      make,
      invoke,
      config,
      cookie,
      request,
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
      sessionId,
      token,
      notificationUrl,
      dataUrl,
      identityUrl,
      notificationRole,
      dataRole,
      identityRole,
      quote,
      code,
      cleanup,
    };
  } catch (error) {
    const teardown = await cleanup();
    throw Object.assign(Error('Trusted fixture setup failed'), {
      code: code(error),
      teardown,
    });
  }
}
