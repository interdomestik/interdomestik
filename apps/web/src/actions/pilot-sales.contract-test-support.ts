import { changePilotSwitch, PILOT_SWITCH_CATEGORY } from '@interdomestik/database/pilot-switch';
import {
  auditLog,
  branches,
  leadPaymentAttempts,
  memberLeads,
  membershipCards,
  membershipPlans,
  sponsorMailOutbox,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
  tenants,
  tenantSettings,
  user,
} from '@interdomestik/database/schema';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { TenantTransaction } from '@interdomestik/database/tenant';
import { inArray, sql } from 'drizzle-orm';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, vi } from 'vitest';

type AdminDb = typeof import('@interdomestik/database/db').dbAdmin;

export const pilotSalesContractEnabled = process.env.REQUIRE_PILOT_SALES_CONTRACT === '1';

export async function openPilotSalesContract() {
  const DATABASE_URL = process.env.PILOT_SALES_CONTRACT_DATABASE_URL;
  const DATABASE_URL_RLS = process.env.PILOT_SALES_CONTRACT_DATABASE_URL_RLS;
  if (
    !DATABASE_URL ||
    !DATABASE_URL_RLS ||
    readDisposableTargetClass({ ...process.env, DATABASE_URL, DATABASE_URL_RLS }) !== 'local'
  ) {
    throw new Error('The pilot sales contract requires disposable loopback database URLs.');
  }
  const owner = new URL(DATABASE_URL);
  const runtime = new URL(DATABASE_URL_RLS);
  if (
    owner.username === runtime.username ||
    owner.hostname !== runtime.hostname ||
    owner.port !== runtime.port ||
    owner.pathname !== runtime.pathname
  ) {
    throw new Error('Use separate owner and restricted runtime roles for the same database.');
  }
  vi.stubEnv('DATABASE_URL', DATABASE_URL);
  vi.stubEnv('DATABASE_URL_RLS', DATABASE_URL_RLS);
  vi.stubEnv('DB_MAX_CONNECTIONS', '2');
  vi.stubEnv('REQUIRE_RLS_INTEGRATION', '1');
  const { dbAdmin, dbRls, assertRlsConnectionRoleReady } =
    await import('@interdomestik/database/db');
  const ownerPool = dbAdmin.$client;
  let runtimePool: typeof dbRls.$client | undefined;
  const close = async () => {
    try {
      await Promise.all([ownerPool.end(), runtimePool?.end()]);
    } finally {
      vi.unstubAllEnvs();
    }
  };
  try {
    runtimePool = dbRls.$client;
    await assertRlsConnectionRoleReady();
    const posture = await dbRls.execute<{ role: string; bypass: boolean; superuser: boolean }>(sql`
      select current_user as role, rolbypassrls as bypass, rolsuper as superuser
      from pg_roles where rolname = current_user
    `);
    expect(posture[0]).toEqual({ role: runtime.username, bypass: false, superuser: false });
    return { dbAdmin, dbRls, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function seedPilotSalesTenant(dbAdmin: AdminDb, tenantId: string, enabled: boolean) {
  const { mintTestTenantAuthority } =
    await import('@interdomestik/database/testing/tenant-authority');
  const branchId = `${tenantId}-branch`;
  const agentId = `${tenantId}-agent`;
  const staffId = `${tenantId}-staff`;
  const operatorId = `${tenantId}-operator`;
  const planKey = `${tenantId}-plan`;
  const now = new Date();
  await dbAdmin.insert(tenants).values({
    id: tenantId,
    name: 'Pilot sales contract',
    legalName: 'Pilot sales contract',
    countryCode: 'XK',
  });
  await dbAdmin.insert(branches).values({ id: branchId, tenantId, name: 'Branch', slug: 'branch' });
  await dbAdmin.insert(user).values(
    [
      { id: agentId, role: 'agent' as const },
      { id: staffId, role: 'staff' as const },
      { id: operatorId, role: 'super_admin' as const },
    ].map(actor => ({
      ...actor,
      tenantId,
      branchId,
      email: `${actor.id}@example.test`,
      name: 'Pilot sales contract actor',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await dbAdmin.insert(membershipPlans).values({
    id: planKey,
    tenantId,
    name: 'Standard',
    tier: 'standard',
    price: '20.00',
    updatedAt: now,
  });
  await dbAdmin.insert(tenantSettings).values({
    id: `${tenantId}-new-sales`,
    tenantId,
    category: PILOT_SWITCH_CATEGORY,
    key: 'new_sales',
    value: { enabled, revision: 1 },
  });
  return {
    tenantId,
    branchId,
    agentId,
    staffId,
    operatorId,
    planKey,
    agentAuthority: mintTestTenantAuthority(tenantId, { userId: agentId, role: 'agent' }),
    staffAuthority: mintTestTenantAuthority(tenantId, { userId: staffId, role: 'staff' }),
    workAuthority: mintTestTenantAuthority(tenantId),
    operatorAuthority: mintTestTenantAuthority(tenantId, {
      userId: operatorId,
      role: 'super_admin',
    }),
  };
}

export async function cleanupPilotSalesTenants(dbAdmin: AdminDb, tenantIds: string[]) {
  await dbAdmin.delete(auditLog).where(inArray(auditLog.tenantId, tenantIds));
  await dbAdmin.delete(sponsorMailOutbox).where(inArray(sponsorMailOutbox.tenantId, tenantIds));
  await dbAdmin
    .delete(sponsorRosterEntries)
    .where(inArray(sponsorRosterEntries.tenantId, tenantIds));
  await dbAdmin
    .delete(sponsorRevisionDecisions)
    .where(inArray(sponsorRevisionDecisions.tenantId, tenantIds));
  await dbAdmin
    .delete(sponsorTermRevisions)
    .where(inArray(sponsorTermRevisions.tenantId, tenantIds));
  await dbAdmin.delete(sponsorTerms).where(inArray(sponsorTerms.tenantId, tenantIds));
  await dbAdmin.delete(sponsors).where(inArray(sponsors.tenantId, tenantIds));
  await dbAdmin.delete(membershipCards).where(inArray(membershipCards.tenantId, tenantIds));
  await dbAdmin.delete(subscriptions).where(inArray(subscriptions.tenantId, tenantIds));
  await dbAdmin.delete(leadPaymentAttempts).where(inArray(leadPaymentAttempts.tenantId, tenantIds));
  await dbAdmin.delete(memberLeads).where(inArray(memberLeads.tenantId, tenantIds));
  await dbAdmin.delete(user).where(inArray(user.tenantId, tenantIds));
  await dbAdmin.delete(branches).where(inArray(branches.tenantId, tenantIds));
  await dbAdmin.delete(membershipPlans).where(inArray(membershipPlans.tenantId, tenantIds));
  await dbAdmin.delete(tenantSettings).where(inArray(tenantSettings.tenantId, tenantIds));
  await dbAdmin.delete(tenants).where(inArray(tenants.id, tenantIds));
}

export async function flipPilotSales(
  authority: TenantAuthority,
  enabled: boolean,
  expectedRevision: number,
  onBackend?: (pid: number) => void
) {
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  const result = await withTenantAuthority(authority, async tx => {
    if (onBackend) onBackend(await backendPid(tx));
    return changePilotSwitch(tx, authority, {
      key: 'new_sales',
      enabled,
      expectedRevision,
      reason: 'Pilot sales contract fixture',
      ...(enabled ? { approvalReference: 'Fixture restart' } : {}),
    });
  });
  expect(result).toMatchObject({ ok: true, switch: { revision: expectedRevision + 1 } });
}

async function backendPid(tx: TenantTransaction) {
  const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return row.pid;
}

async function waitForPilotFlip(dbAdmin: AdminDb, salePid: number, flipPid: number) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const [waiting] = await dbAdmin.execute<{ blocked: boolean }>(
      sql`select ${salePid}::integer = any(pg_blocking_pids(${flipPid}::integer)) as blocked`
    );
    if (waiting.blocked) return;
    if (Date.now() >= deadline) throw new Error('The flip did not wait on the sale transaction.');
    await delay(20);
  }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

export async function finishSaleDuringPilotFlip<Result>(params: {
  dbAdmin: AdminDb;
  operatorAuthority: TenantAuthority;
  expectedRevision: number;
  intercept: (hold: ((tx: TenantTransaction) => Promise<void>) | undefined) => void;
  sell: () => Promise<Result>;
}) {
  const entered = deferred<number>();
  const released = deferred<void>();
  const flipBackend = deferred<number>();
  params.intercept(async tx => {
    entered.resolve(await backendPid(tx));
    await released.promise;
  });
  const sale = Promise.resolve().then(params.sell);
  let flip: Promise<void> | undefined;
  try {
    const salePid = await Promise.race([
      entered.promise,
      sale.then(() => {
        throw new Error('The sale finished without reaching the admission lock.');
      }),
    ]);
    flip = flipPilotSales(
      params.operatorAuthority,
      false,
      params.expectedRevision,
      flipBackend.resolve
    );
    await Promise.race([
      flipBackend.promise.then(flipPid => waitForPilotFlip(params.dbAdmin, salePid, flipPid)),
      flip.then(() => {
        throw new Error('The flip finished before the sale released the admission lock.');
      }),
    ]);
  } finally {
    released.resolve();
    params.intercept(undefined);
    await Promise.allSettled([sale, flip]);
  }
  await flip;
  return sale;
}
