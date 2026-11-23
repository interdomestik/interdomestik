import { sql } from '@interdomestik/database';
import type { PilotSwitchKey } from '@interdomestik/database/pilot-switch';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-guard';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { resolveTenantClassificationCore } from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import { cleanupContractRows, sqlClient } from './better-auth-email-otp.contract-test-support';
import { pilotAuth } from './pilot-identity.contract-test-support';

const wiring = vi.hoisted(() => ({
  handler: vi.fn(),
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  sendSignInOtpEmail: vi.fn(async () => ({ success: true })),
  sendPasswordResetEmail: vi.fn<(email: string, link: string) => Promise<void>>(),
  after: [] as Array<() => Promise<unknown> | void>,
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    handler: wiring.handler,
    api: { getSession: wiring.getSession, revokeSession: wiring.revokeSession },
  },
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null }));
vi.mock('@/lib/rate-limit-otp', () => ({ enforceOtpRateLimits: async () => null }));
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
    if (
      readDisposableTargetClass(process.env) !== 'local' ||
      (process.env.BETTER_AUTH_CONTRACT_DATABASE_URL &&
        process.env.BETTER_AUTH_CONTRACT_DATABASE_URL !== process.env.DATABASE_URL)
    ) {
      throw new Error('Pilot identity contract requires matching isolated local database targets');
    }
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    const [library] = await sqlClient<{ pid: number }[]>`select pg_backend_pid() as pid`;
    const [classification] = await withTenantAuthority(authority, tx =>
      tx.execute<{ pid: number; restricted: boolean }>(sql`
        select pg_backend_pid() as pid, not rolsuper and not rolbypassrls as restricted
        from pg_roles where rolname = current_user
      `)
    );
    expect(classification?.restricted).toBe(true);
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

export { confirm, setSwitch, useAuth, wiring };
