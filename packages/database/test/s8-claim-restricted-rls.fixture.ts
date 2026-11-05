import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { claimMessages, claims, claimThreads, user } from '../src/schema';
import {
  applyRlsTestConnectionEnv,
  quoteIdentifier,
  quoteSqlLiteral,
  requireRlsPreconditions,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';

type AdminDb = ReturnType<typeof drizzle>;

export const KS_TENANT_ID = 'tenant_ks';
export const MK_TENANT_ID = 'tenant_mk';
export const S8_CLAIM_TABLES = ['claim', 'claim_threads', 'claim_messages'] as const;

const uniqueId = (prefix: string): string => `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;

export type TenantRows = { userId: string; claimId: string; threadId: string; messageId: string };
export type S8ClaimFixture = {
  ks: TenantRows;
  mk: TenantRows;
  /** A KS-owned claim delegated to MK through access_tenant_id. */
  delegatedClaimId: string;
  /** Ids written by the restricted role during cases; cleaned up with the fixture. */
  extraMessageIds: string[];
  extraThreadIds: string[];
  newId(prefix: string): string;
};

/** A restricted LOGIN role (no BYPASSRLS, no superuser) with DML on the S8 claim tables only. */
export async function provisionRestrictedRole(adminDb: AdminDb): Promise<void> {
  const role = quoteIdentifier(TEST_DB_ROLE);
  const password = quoteSqlLiteral(TEST_DB_PASSWORD);
  await adminDb.execute(
    sql.raw(`
      do $$
      begin
        create role ${role} login password ${password};
      exception
        when duplicate_object or unique_violation then
          alter role ${role} with login password ${password};
      end
      $$;
    `)
  );
  await grantRlsTestRole(adminDb, S8_CLAIM_TABLES);
  await adminDb.execute(sql.raw(`grant update on table "claim" to ${role}`));
  await adminDb.execute(
    sql.raw(`grant insert, update, delete on table "claim_threads", "claim_messages" to ${role}`)
  );
}

function tenantRows(tenant: string): TenantRows {
  return {
    userId: uniqueId(`s8rls_user_${tenant}`),
    claimId: uniqueId(`s8rls_claim_${tenant}`),
    threadId: uniqueId(`s8rls_thread_${tenant}`),
    messageId: uniqueId(`s8rls_message_${tenant}`),
  };
}

/** Ids only; cleanup by id is safe whether or not seeding completed. */
export function createS8ClaimFixture(): S8ClaimFixture {
  return {
    ks: tenantRows('ks'),
    mk: tenantRows('mk'),
    delegatedClaimId: uniqueId('s8rls_claim_delegated'),
    extraMessageIds: [],
    extraThreadIds: [],
    newId: uniqueId,
  };
}

export async function seedS8ClaimFixture(adminDb: AdminDb, fixture: S8ClaimFixture): Promise<void> {
  const now = new Date();
  const tenants = [
    [KS_TENANT_ID, fixture.ks],
    [MK_TENANT_ID, fixture.mk],
  ] as const;
  await adminDb.insert(user).values(
    tenants.map(([tenantId, rows]) => ({
      id: rows.userId,
      tenantId,
      name: `S8 RLS ${tenantId}`,
      email: `${rows.userId}@example.test`,
      emailVerified: true,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    }))
  );
  const claim = (id: string, tenantId: string, userId: string, accessTenantId?: string) => ({
    id,
    tenantId,
    accessTenantId: accessTenantId ?? null,
    userId,
    title: 'S8 restricted RLS proof',
    description: 'restricted-login isolation fixture',
    category: 'retail',
    companyName: 'S8 RLS Co',
    ...claimLifecycleFieldsForStatus('draft'),
    origin: 'portal' as const,
  });
  await adminDb
    .insert(claims)
    .values([
      ...tenants.map(([tenantId, rows]) => claim(rows.claimId, tenantId, rows.userId)),
      claim(fixture.delegatedClaimId, KS_TENANT_ID, fixture.ks.userId, MK_TENANT_ID),
    ]);
  await adminDb.insert(claimThreads).values(
    tenants.map(([tenantId, rows]) => ({
      id: rows.threadId,
      tenantId,
      claimId: rows.claimId,
      subject: 'S8 RLS thread',
      createdBy: rows.userId,
    }))
  );
  await adminDb.insert(claimMessages).values(
    tenants.map(([tenantId, rows]) => ({
      id: rows.messageId,
      tenantId,
      claimId: rows.claimId,
      senderId: rows.userId,
      content: `original ${tenantId}`,
    }))
  );
}

export async function cleanupS8ClaimFixture(
  adminDb: AdminDb,
  fixture: S8ClaimFixture
): Promise<void> {
  const { ks, mk } = fixture;
  const messageIds = [ks.messageId, mk.messageId, ...fixture.extraMessageIds];
  const threadIds = [ks.threadId, mk.threadId, ...fixture.extraThreadIds];
  await adminDb.delete(claimMessages).where(inArray(claimMessages.id, messageIds));
  await adminDb.delete(claimThreads).where(inArray(claimThreads.id, threadIds));
  await adminDb
    .delete(claims)
    .where(inArray(claims.id, [ks.claimId, mk.claimId, fixture.delegatedClaimId]));
  await adminDb.delete(user).where(inArray(user.id, [ks.userId, mk.userId]));
}

export type S8RestrictedSession = {
  adminDb: AdminDb;
  fixture: S8ClaimFixture;
  dbRls: (typeof import('../src/db'))['dbRls'];
  withTenantContext: (typeof import('../src/tenant'))['withTenantContext'];
  close(): Promise<void>;
};

/**
 * Seeds the S8 fixture and connects the RLS client as the restricted role. Returns null when the
 * test was skipped; cleanup is registered before the first write so partial setup cannot leak.
 */
export async function openS8RestrictedSession(
  t: TestContext,
  extraEnv: Record<string, string> = {}
): Promise<S8RestrictedSession | null> {
  const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (requireIntegration) assert.fail('S8 RLS test requires DATABASE_URL.');
    t.skip('DATABASE_URL is required for the S8 restricted RLS test');
    return null;
  }
  const adminSql = postgres(databaseUrl, { max: 1 });
  const adminDb = drizzle(adminSql);
  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t, S8_CLAIM_TABLES);
  if (t.signal.aborted) return null;

  await provisionRestrictedRole(adminDb);
  const fixture = createS8ClaimFixture();
  const env = applyRlsTestConnectionEnv(databaseUrl);
  const previous = Object.entries(extraEnv).map(([key]) => [key, process.env[key]] as const);
  Object.assign(process.env, extraEnv);
  type OwnedPool = { end(options: { timeout: number }): Promise<void> };
  let appPools: OwnedPool[] = [];
  // Closing always ends every client this session owns, even when row cleanup fails.
  const close = async (): Promise<void> => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    env.restore();
    try {
      await cleanupS8ClaimFixture(adminDb, fixture);
    } finally {
      await Promise.allSettled([adminSql, ...appPools].map(client => client.end({ timeout: 1 })));
    }
  };
  try {
    await seedS8ClaimFixture(adminDb, fixture);
    const [{ dbRls, dbAdmin }, { withTenantContext }] = await Promise.all([
      import('../src/db'),
      import('../src/tenant'),
    ]);
    // Pools come from drizzle's session: the asserted RLS proxy binds `$client`, dropping `.end`.
    appPools = [dbRls, dbAdmin].map(client => {
      const pool = (client as unknown as { session?: { client?: Partial<OwnedPool> } }).session
        ?.client;
      assert.equal(typeof pool?.end, 'function', 'the app database pool can be closed');
      return pool as OwnedPool;
    });
    return { adminDb, fixture, dbRls, withTenantContext, close };
  } catch (error) {
    await close();
    throw error;
  }
}
