import 'server-only';

import { authorizeSessionUserTenant } from '@/lib/tenant-authority.server';
import { PILOT_SWITCH_KEYS, readPilotSwitch } from '@interdomestik/database/pilot-switch';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import * as Sentry from '@sentry/nextjs';

export async function loadPilotSwitches(userId: string) {
  try {
    const authority = await authorizeSessionUserTenant(userId);
    if (!authority) return null;
    const { accessTenantId } = readTenantAuthority(authority);
    return await withTenantAuthority(authority, async tx => {
      const switches = [];
      for (const key of PILOT_SWITCH_KEYS) {
        switches.push({ key, ...(await readPilotSwitch(tx, accessTenantId, key)) });
      }
      return switches;
    });
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}
