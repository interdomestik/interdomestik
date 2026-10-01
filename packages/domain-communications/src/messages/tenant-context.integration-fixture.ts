import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect } from 'vitest';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from '../types';

const suffix = randomUUID();
export const homeTenantId = `message_home_${suffix}`;
export const otherTenantId = `message_other_${suffix}`;
const fixtureRole = `message_rls_${suffix.replaceAll('-', '')}`;
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
  link: `message_link_${suffix}`,
  public: `message_public_${suffix}`,
  internal: `message_internal_${suffix}`,
};
export let database: typeof import('@interdomestik/database');
export let get: (typeof import('./get'))['getMessagesForClaimCore'];
export let markRead: (typeof import('./mark-read'))['markMessagesAsReadCore'];
export let send: (typeof import('./send'))['sendMessageDbCore'];
export let rlsClient: ReturnType<typeof postgres>;
let adminClient: ReturnType<typeof postgres>;
export const session = (id: string, role: string, tenantId = homeTenantId) =>
  ({ user: { id, role, tenantId, branchId: null } }) as NonNullable<Session>;

export function assertSyntheticMessageDatabaseUrl(value: string): void {
  const endpoint = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(endpoint.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
    endpoint.pathname !== '/interdomestik_test' ||
    [...endpoint.searchParams.keys()].some(key =>
      ['host', 'hostaddr', 'port', 'dbname', 'service', 'options'].includes(key.toLowerCase())
    )
  ) {
    throw new Error('Message integration fixtures require a loopback interdomestik_test database');
  }
}

export function registerMessageRlsFixture(): void {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('MESSAGE_RLS_INTEGRATION requires DATABASE_URL');
    assertSyntheticMessageDatabaseUrl(process.env.DATABASE_URL);
    adminClient = postgres(process.env.DATABASE_URL, { max: 1 });
    const tables = await adminClient`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('claim','claim_messages','agent_clients','user')
    `;
    expect(tables).toHaveLength(4);
    expect(tables.every(table => table.relrowsecurity === true)).toBe(true);
    // This isolated NOLOGIN role exists only for this synthetic fixture. Never alter a shared role.
    await adminClient.unsafe(`create role "${fixtureRole}" nologin nosuperuser nobypassrls`);
    fixtureRoleCreated = true;
    await adminClient.unsafe(`grant usage on schema public to "${fixtureRole}"`);
    await adminClient.unsafe(
      `grant select on table "user", claim, claim_messages, agent_clients to "${fixtureRole}"`
    );
    await adminClient.unsafe(`grant insert, update on table claim_messages to "${fixtureRole}"`);
    const [{ currentUser }] = await adminClient`select current_user as "currentUser"`;
    await adminClient.unsafe(
      `grant "${fixtureRole}" to "${String(currentUser).replaceAll('"', '""')}"`
    );
    process.env.DB_RLS_ROLE = fixtureRole;
    rlsClient = postgres(process.env.DATABASE_URL, {
      max: 1,
      connection: { options: `-c role=${fixtureRole}` },
    });
    Object.assign(globalThis, { queryClientRls: rlsClient, queryClientAdmin: adminClient });
    database = await import('@interdomestik/database');
    ({ getMessagesForClaimCore: get } = await import('./get'));
    ({ markMessagesAsReadCore: markRead } = await import('./mark-read'));
    ({ sendMessageDbCore: send } = await import('./send'));
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const [posture] =
      await rlsClient`select rolsuper, rolbypassrls from pg_roles where rolname=current_user`;
    expect(posture).toEqual({ rolsuper: false, rolbypassrls: false });
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
