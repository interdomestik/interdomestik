import { E2E_USERS, and, eq, inArray, tenantSettings } from '@interdomestik/database';
import {
  PILOT_SWITCH_CATEGORY,
  PILOT_SWITCH_KEYS,
  readPilotSwitch,
} from '@interdomestik/database/pilot-switch';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { expect } from '@playwright/test';

const tenantId = E2E_USERS.KS_MEMBER.tenantId;
const authority = mintTestTenantAuthority(tenantId);
const switchScope = and(
  eq(tenantSettings.tenantId, tenantId),
  eq(tenantSettings.category, PILOT_SWITCH_CATEGORY),
  inArray(tenantSettings.key, PILOT_SWITCH_KEYS)
);

export async function assertClosedServices() {
  await withTenantAuthority(authority, async tx => {
    for (const key of PILOT_SWITCH_KEYS) {
      expect(await readPilotSwitch(tx, tenantId, key), key).toMatchObject({
        state: 'closed',
        wellFormed: true,
      });
    }
  });
}

function byName(left: string, right: string): number {
  return left.localeCompare(right);
}

export default async function closeServicesForMacRun() {
  const previous = await withTenantAuthority(authority, async tx => {
    const rows = await tx.select().from(tenantSettings).where(switchScope).for('update');
    expect(rows.map(row => row.key).sort(byName)).toEqual([...PILOT_SWITCH_KEYS].sort(byName));
    for (const key of PILOT_SWITCH_KEYS) {
      const current = await readPilotSwitch(tx, tenantId, key);
      expect(current, `seeded ${key}`).toMatchObject({ state: 'open', wellFormed: true });
      await tx
        .update(tenantSettings)
        .set({ value: { enabled: false, revision: current.revision + 1 } })
        .where(and(switchScope, eq(tenantSettings.key, key)));
    }
    return rows;
  });

  async function restore() {
    await withTenantAuthority(authority, async tx => {
      for (const { id, value, updatedAt } of previous) {
        await tx
          .update(tenantSettings)
          .set({ value, updatedAt })
          .where(and(switchScope, eq(tenantSettings.id, id)));
      }
    });
  }

  try {
    await assertClosedServices();
  } catch (error) {
    await restore();
    throw error;
  }
  return restore;
}
