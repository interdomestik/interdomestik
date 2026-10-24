import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect } from 'vitest';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from '../types';
import { runReplyPreparationWorkers } from './public-reply-concurrency.runtime-fixture';

const suffix = randomUUID();
export const homeTenantId = `message_home_${suffix}`;
export const otherTenantId = `message_other_${suffix}`;
const fixtureRole = `message_rls_${suffix.replaceAll('-', '')}`;
const fixturePassword = randomUUID().replaceAll('-', '');
let fixtureRoleCreated = false;
const previousDbRole = process.env.DB_RLS_ROLE;
const previousClients = {
  queryClientRls: (globalThis as { queryClientRls?: unknown }).queryClientRls,
  queryClientAdmin: (globalThis as { queryClientAdmin?: unknown }).queryClientAdmin,
};
export const ids = {
  member: `message_member_${suffix}`,
  otherMember: `message_other_${suffix}`,
  staff: `message_staff_${suffix}`,
  agent: `message_agent_${suffix}`,
  claim: `message_claim_${suffix}`,
  agentBranch: `message_agent_branch_${suffix}`,
  otherBranch: `message_other_branch_${suffix}`,
  link: `message_link_${suffix}`,
  public: `message_public_${suffix}`,
  internal: `message_internal_${suffix}`,
};
let database: typeof import('@interdomestik/database');
let get: (typeof import('./get'))['getMessagesForClaimCore'];
let markRead: (typeof import('./mark-read'))['markMessagesAsReadCore'];
let send: (typeof import('./send'))['sendMessageDbCore'];
let rlsClient: ReturnType<typeof postgres>;
let adminClient: ReturnType<typeof postgres>;
export const fixture = {
  get database() {
    return database;
  },
  get get() {
    return get;
  },
  get markRead() {
    return markRead;
  },
  get send() {
    return send;
  },
  get rlsClient() {
    return rlsClient;
  },
  get roleName() {
    return fixtureRole;
  },
  async setNotificationInsertAllowed(allowed: boolean) {
    await adminClient.unsafe(
      `${allowed ? 'grant insert on' : 'revoke insert on'} notifications ${allowed ? 'to' : 'from'} "${fixtureRole}"`
    );
  },
  async concurrentReplies(params: Parameters<typeof runReplyPreparationWorkers>[2]) {
    const target = new URL(process.env.DATABASE_URL!);
    target.username = fixtureRole;
    target.password = fixturePassword;
    target.search = '';
    return runReplyPreparationWorkers(target.toString(), fixtureRole, params);
  },
};
export const session = (
  id: string,
  role: string,
  tenantId = homeTenantId,
  branchId: string | null = null
) => ({ user: { id, role, tenantId, branchId } }) as NonNullable<Session>;

export function assertSyntheticMessageDatabaseUrl(value: string): void {
  const endpoint = new URL(value);
  const isTestDatabase = endpoint.pathname === '/interdomestik_test';
  const isDefaultLocalSupabase = endpoint.port === '54322' && endpoint.pathname === '/postgres';
  if (
    !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    (!isTestDatabase && !isDefaultLocalSupabase) ||
    [...endpoint.searchParams.keys()].some(key =>
      ['host', 'hostaddr', 'port', 'dbname', 'service', 'options'].includes(key.toLowerCase())
    )
  ) {
    throw new Error('Message fixtures require a loopback test DB or the default local Supabase DB');
  }
}

export function registerMessageRlsFixture(): void {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('MESSAGE_RLS_INTEGRATION requires DATABASE_URL');
    assertSyntheticMessageDatabaseUrl(process.env.DATABASE_URL);
    adminClient = postgres(process.env.DATABASE_URL, { max: 1 });
    const tables = await adminClient`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in
        ('claim','claim_messages','agent_clients','user','notifications',
         'user_notification_preferences','push_subscriptions','audit_log')
    `;
    expect(tables).toHaveLength(8);
    expect(tables.every(table => table.relrowsecurity === true)).toBe(true);
    // This owned LOGIN authenticates directly; SET ROLE on an admin session is not restricted.
    await adminClient.unsafe(
      `create role "${fixtureRole}" login nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication password '${fixturePassword}'`
    );
    fixtureRoleCreated = true;
    await adminClient.unsafe(`grant usage on schema public to "${fixtureRole}"`);
    await adminClient.unsafe(
      `grant select on table "user", claim, claim_messages, agent_clients, notifications, user_notification_preferences, push_subscriptions, audit_log to "${fixtureRole}"`
    );
    await adminClient.unsafe(`grant insert, update on table claim_messages to "${fixtureRole}"`);
    // A least-privilege subset of scripts/ci/export-e2e-rls.sh, never a production grant claim.
    await adminClient.unsafe(`grant insert on table notifications, audit_log to "${fixtureRole}"`);
    await adminClient.unsafe(`grant delete on table push_subscriptions to "${fixtureRole}"`);
    process.env.DB_RLS_ROLE = fixtureRole;
    const restrictedUrl = new URL(process.env.DATABASE_URL);
    restrictedUrl.username = fixtureRole;
    restrictedUrl.password = fixturePassword;
    // Do not inherit credential or session overrides from the administrative URL.
    restrictedUrl.search = '';
    rlsClient = postgres(restrictedUrl.toString(), { max: 1 });
    Object.assign(globalThis, { queryClientRls: rlsClient, queryClientAdmin: adminClient });
    database = await import('@interdomestik/database');
    ({ getMessagesForClaimCore: get } = await import('./get'));
    ({ markMessagesAsReadCore: markRead } = await import('./mark-read'));
    ({ sendMessageDbCore: send } = await import('./send'));
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const [posture] = await rlsClient`
      select session_user as "sessionUser", current_user as "currentUser",
        s.rolsuper as "sessionSuper", s.rolbypassrls as "sessionBypass",
        c.rolsuper as "currentSuper", c.rolbypassrls as "currentBypass"
      from pg_roles s, pg_roles c
      where s.rolname=session_user and c.rolname=current_user
    `;
    expect(posture).toEqual({
      sessionUser: fixtureRole,
      currentUser: fixtureRole,
      sessionSuper: false,
      sessionBypass: false,
      currentSuper: false,
      currentBypass: false,
    });
    await database.dbAdmin.insert(database.tenants).values([
      {
        id: homeTenantId,
        name: 'Synthetic message home',
        legalName: 'Synthetic message home',
        countryCode: 'XK',
      },
      {
        id: otherTenantId,
        name: 'Synthetic message other',
        legalName: 'Synthetic message other',
        countryCode: 'MK',
      },
    ]);
    await database.dbAdmin.insert(database.branches).values([
      {
        id: ids.agentBranch,
        tenantId: homeTenantId,
        name: 'Message agent branch',
        slug: ids.agentBranch,
      },
      {
        id: ids.otherBranch,
        tenantId: homeTenantId,
        name: 'Message other branch',
        slug: ids.otherBranch,
      },
    ]);
    const now = new Date();
    await database.dbAdmin.insert(database.user).values(
      [
        [ids.member, 'member'],
        [ids.otherMember, 'member'],
        [ids.staff, 'staff'],
        [ids.agent, 'agent'],
      ].map(([id, role]) => ({
        id,
        role,
        tenantId: homeTenantId,
        email: `${id}@example.test`,
        emailVerified: true,
        name: role === 'staff' ? 'Synthetic Staff Sender' : 'Synthetic Member',
        branchId: id === ids.agent ? ids.agentBranch : null,
        createdAt: now,
        updatedAt: now,
      }))
    );
    await database.dbAdmin.insert(database.claims).values({
      id: ids.claim,
      userId: ids.member,
      tenantId: homeTenantId,
      staffId: ids.staff,
      category: 'retail',
      companyName: 'Synthetic Co',
      description: 'Isolated message tenant-context regression',
      origin: 'portal',
      title: 'Synthetic message case',
    });
    await database.dbAdmin.insert(database.agentClients).values({
      id: ids.link,
      tenantId: homeTenantId,
      agentId: ids.agent,
      memberId: ids.member,
      status: 'active',
    });
    await database.dbAdmin.insert(database.claimMessages).values([
      {
        id: ids.public,
        tenantId: homeTenantId,
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Public test update',
        isInternal: false,
      },
      {
        id: ids.internal,
        tenantId: homeTenantId,
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Private test note',
        isInternal: true,
      },
    ]);
  });

  afterAll(async () => {
    try {
      if (database) {
        await database.dbAdmin
          .delete(database.auditLog)
          .where(eq(database.auditLog.entityId, ids.claim));
        await database.dbAdmin
          .delete(database.notifications)
          .where(eq(database.notifications.tenantId, homeTenantId));
        await database.dbAdmin
          .delete(database.pushSubscriptions)
          .where(inArray(database.pushSubscriptions.tenantId, [homeTenantId, otherTenantId]));
        await database.dbAdmin
          .delete(database.userNotificationPreferences)
          .where(eq(database.userNotificationPreferences.tenantId, homeTenantId));
        await database.dbAdmin
          .delete(database.claimMessages)
          .where(eq(database.claimMessages.claimId, ids.claim));
        await database.dbAdmin
          .delete(database.agentClients)
          .where(eq(database.agentClients.id, ids.link));
        await database.dbAdmin.delete(database.claims).where(eq(database.claims.id, ids.claim));
        await database.dbAdmin
          .delete(database.user)
          .where(inArray(database.user.id, [ids.member, ids.otherMember, ids.staff, ids.agent]));
        await database.dbAdmin
          .delete(database.branches)
          .where(inArray(database.branches.id, [ids.agentBranch, ids.otherBranch]));
        await database.dbAdmin
          .delete(database.tenants)
          .where(inArray(database.tenants.id, [homeTenantId, otherTenantId]));
      }
    } finally {
      await rlsClient?.end({ timeout: 2 });
      try {
        if (fixtureRoleCreated) {
          // The generated role owns no schema objects; DROP OWNED revokes only its fixture grants.
          await adminClient.unsafe(`drop owned by "${fixtureRole}"`);
          await adminClient.unsafe(`drop role "${fixtureRole}"`);
        }
      } finally {
        await adminClient?.end({ timeout: 2 });
        if (previousDbRole === undefined) delete process.env.DB_RLS_ROLE;
        else process.env.DB_RLS_ROLE = previousDbRole;
        if (previousClients.queryClientRls === undefined)
          delete (globalThis as { queryClientRls?: unknown }).queryClientRls;
        else
          (globalThis as { queryClientRls?: unknown }).queryClientRls =
            previousClients.queryClientRls;
        if (previousClients.queryClientAdmin === undefined)
          delete (globalThis as { queryClientAdmin?: unknown }).queryClientAdmin;
        else
          (globalThis as { queryClientAdmin?: unknown }).queryClientAdmin =
            previousClients.queryClientAdmin;
      }
    }
  });
}
