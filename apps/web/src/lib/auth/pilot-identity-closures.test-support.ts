import { sql } from '@interdomestik/database';
import { changePilotSwitch, type PilotSwitchKey } from '@interdomestik/database/pilot-switch';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { resolveTenantClassificationCore } from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  cleanupContractRows,
  sqlClient,
  uniqueEmail,
} from './better-auth-email-otp.contract-test-support';
import { stageReplacement } from './different-email-recovery-store.contract-test-support';
import { confirmReplacementProof, discardProof } from './different-email-recovery-store';
import {
  requireMatchingLocalContractDatabase,
  type ContractDatabaseIdentity,
} from './pilot-contract-database.test-support';
import { insertDoorAccount, pilotAuth } from './pilot-identity.contract-test-support';

const wiring = vi.hoisted(() => ({
  handler: vi.fn(),
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  sendSignInOtpEmail: vi.fn(() => Promise.resolve({ success: true })),
  sendPasswordResetEmail: vi.fn<(email: string, link: string) => Promise<void>>(),
  after: [] as Array<() => Promise<unknown> | void>,
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    handler: wiring.handler,
    api: { getSession: wiring.getSession, revokeSession: wiring.revokeSession },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: () => Promise.resolve(null) }));
vi.mock('@/lib/rate-limit-otp', () => ({ enforceOtpRateLimits: () => Promise.resolve(null) }));
vi.mock('@/lib/audit.core', () => ({ extractRequestMetadata: () => ({}) }));
vi.mock('next/server', () => ({
  after: (callback: () => Promise<unknown> | void) => {
    wiring.after.push(callback);
  },
}));
vi.mock('@/lib/email', () => ({
  normalizeSignInOtpLocale: () => 'en',
  sendSignInOtpEmail: wiring.sendSignInOtpEmail,
  sendPasswordResetEmail: wiring.sendPasswordResetEmail,
}));

const session = {
  user: { id: 'pilot-contract-admin', role: 'tenant_admin', tenantId: 'tenant_ks' },
};
const authority = mintTestTenantAuthority('tenant_ks', {
  userId: session.user.id,
  role: session.user.role,
});
const settingIds = { public_intake: randomUUID(), new_sales: randomUUID() };
const previous = new Map<PilotSwitchKey, unknown>();
const touched = new Set<PilotSwitchKey>();

async function setSwitch(key: PilotSwitchKey, enabled: boolean) {
  await sqlClient`
    insert into tenant_settings (id, tenant_id, category, key, value)
    values (${settingIds[key]}, 'tenant_ks', 'pilot', ${key},
      ${JSON.stringify({ enabled, revision: 1 })}::jsonb)
    on conflict (tenant_id, category, key) do update set value = excluded.value
  `;
  touched.add(key);
}

function useAuth(auth = pilotAuth()) {
  wiring.handler.mockImplementation(auth.handler);
  wiring.getSession.mockImplementation(auth.api.getSession);
  wiring.revokeSession.mockImplementation(auth.api.revokeSession);
  return auth;
}

function confirm(userId: string) {
  return resolveTenantClassificationCore({
    session,
    authority,
    userId,
    currentTenantId: 'tenant_ks',
  });
}

export function installIdentityContractHooks() {
  beforeAll(async () => {
    // The app opens the configured admin and RLS pools. The pinned library gets its own
    // connection to the same local database through the existing OTP contract harness.
    const library = await requireMatchingLocalContractDatabase(
      sqlClient,
      process.env.BETTER_AUTH_CONTRACT_DATABASE_URL ?? process.env.DATABASE_URL
    );
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    const [classification] = await withTenantAuthority(authority, tx =>
      tx.execute<ContractDatabaseIdentity & { restricted: boolean }>(sql`
        select current_database() as database,
          extract(epoch from pg_postmaster_start_time())::text as started,
          pg_backend_pid() as pid, not rolsuper and not rolbypassrls as restricted
        from pg_roles where rolname = current_user
      `)
    );
    expect(classification?.restricted).toBe(true);
    expect(classification?.database).toBe(library?.database);
    expect(classification?.started).toBe(library?.started);
    expect(classification?.pid).not.toBe(library?.pid);
    const stored = await sqlClient<{ key: PilotSwitchKey; value: unknown }[]>`
      select key, value from tenant_settings where tenant_id = 'tenant_ks' and category = 'pilot'
        and key in ('public_intake', 'new_sales')
    `;
    for (const row of stored) previous.set(row.key, row.value);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    wiring.after.length = 0;
    await setSwitch('public_intake', false);
    useAuth();
  });

  afterEach(cleanupContractRows);
  afterAll(async () => {
    try {
      for (const key of touched) {
        if (previous.has(key)) {
          await sqlClient`
            update tenant_settings set value = ${JSON.stringify(previous.get(key))}::jsonb
            where tenant_id = 'tenant_ks' and category = 'pilot' and key = ${key}
          `;
        } else {
          await sqlClient`delete from tenant_settings where id = ${settingIds[key]}`;
        }
      }
    } finally {
      vi.unstubAllEnvs();
      await sqlClient.end();
    }
  });
}

async function waitForBlockedQuery(
  observer: typeof sqlClient | TransactionSql,
  blocker: number,
  queryFragment: string
) {
  let pid = 0;
  await expect
    .poll(
      async () => {
        await observer`select pg_stat_clear_snapshot()`;
        const [waiting] = await observer<{ pid: number }[]>`
      select pid from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
        and position(${queryFragment} in query) > 0 and ${blocker} = any(pg_blocking_pids(pid))
    `;
        pid = waiting?.pid ?? 0;
        return pid;
      },
      { timeout: 5_000 }
    )
    .toBeGreaterThan(0);
  return pid;
}

async function withPendingRecovery(
  run: (fixture: {
    id: string;
    email: string;
    replacement: string;
    recover: () => ReturnType<typeof confirmReplacementProof>;
    close: (beforeClose?: (pid: number) => void, holdCommit?: () => Promise<void>) => Promise<void>;
  }) => Promise<void>
) {
  const tenant = 'tenant_ks';
  const email = uniqueEmail('pilot-recovery-original');
  const replacement = uniqueEmail('pilot-recovery-replacement');
  const id = await insertDoorAccount(email, { verified: true });
  const actorId = await insertDoorAccount(uniqueEmail('pilot-recovery-admin'), { verified: true });
  await sqlClient`update "user" set role = 'tenant_admin' where id = ${actorId}`;
  const authority = mintTestTenantAuthority(tenant, { userId: actorId, role: 'tenant_admin' });
  await setSwitch('public_intake', true);
  const nonce = await stageReplacement(id, email, replacement, 'pilot-recovery');
  try {
    await run({
      id,
      email,
      replacement,
      recover: () => confirmReplacementProof(id, tenant, () => 'pilot-recovery-r', new Date(0)),
      close: (beforeClose, holdCommit) =>
        withTenantAuthority(authority, async tx => {
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          beforeClose?.(backend!.pid);
          expect(
            await changePilotSwitch(tx, authority, {
              key: 'public_intake',
              enabled: false,
              expectedRevision: 1,
              reason: 'Pilot recovery contract closure',
            })
          ).toEqual({ ok: true, switch: { state: 'closed', revision: 2, wellFormed: true } });
          await holdCommit?.();
        }),
    });
    const [row] = await sqlClient<{ value: unknown }[]>`
      select value from tenant_settings
      where tenant_id = ${tenant} and category = 'pilot' and key = 'public_intake'
    `;
    expect(row?.value).toEqual({ enabled: false, revision: 2 });
  } finally {
    await discardProof(id, 'replacement', nonce);
    await sqlClient`delete from audit_log where actor_id = ${actorId} and action = 'pilot_switch.changed'`;
  }
}

export { confirm, setSwitch, useAuth, waitForBlockedQuery, wiring, withPendingRecovery };
