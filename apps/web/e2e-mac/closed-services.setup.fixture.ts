import { E2E_USERS, sql } from '@interdomestik/database';
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
const switchScope = sql`
  tenant_id = ${tenantId}
  and category = ${PILOT_SWITCH_CATEGORY}
  and key in (${sql.join(
    PILOT_SWITCH_KEYS.map(key => sql`${key}`),
    sql`, `
  )})
`;

type SwitchSnapshot = { id: string; key: string; value: string; updatedAt: string };

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
    const rows = await tx.execute<SwitchSnapshot>(sql`
      select id, key, value::text as value, updated_at::text as "updatedAt"
      from tenant_settings where ${switchScope} for update
    `);
    expect(rows.map(row => row.key).sort(byName)).toEqual([...PILOT_SWITCH_KEYS].sort(byName));
    for (const key of PILOT_SWITCH_KEYS) {
      const current = await readPilotSwitch(tx, tenantId, key);
      expect(current, `seeded ${key}`).toMatchObject({ state: 'open', wellFormed: true });
      const value = JSON.stringify({ enabled: false, revision: current.revision + 1 });
      await tx.execute(sql`
        update tenant_settings set value = ${value}::jsonb, updated_at = ${new Date().toISOString()}::timestamp
        where ${switchScope} and key = ${key}
      `);
    }
    return rows;
  });

  async function restore() {
    await withTenantAuthority(authority, async tx => {
      for (const { id, value, updatedAt } of previous) {
        await tx.execute(sql`
          update tenant_settings set value = ${value}::jsonb, updated_at = ${updatedAt}::timestamp
          where ${switchScope} and id = ${id}
        `);
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
