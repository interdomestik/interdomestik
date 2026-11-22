import 'server-only';

import { authorizePublicSiteTenant } from '@interdomestik/database';
import { readPilotSwitch } from '@interdomestik/database/pilot-switch';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import * as Sentry from '@sentry/nextjs';

import type { TenantId } from './tenant-hosts';

export async function authorizeOpenPublicIntake(
  tenantId: TenantId | null
): Promise<TenantAuthority | null> {
  if (!tenantId) return null;

  try {
    const authority = await authorizePublicSiteTenant(tenantId);
    if (!authority) return null;

    return (await readOpenSwitch(authority, 'public_intake')) ? authority : null;
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'pilot.publicIntakeAdmission' } });
    return null;
  }
}

function readOpenSwitch(authority: TenantAuthority, key: 'public_intake' | 'new_sales') {
  const { accessTenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    return (await readPilotSwitch(tx, accessTenantId, key)).state === 'open';
  });
}

export async function isPublicCheckoutOpen(authority: TenantAuthority): Promise<boolean> {
  try {
    return await readOpenSwitch(authority, 'new_sales');
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'pilot.publicCheckoutAdmission' } });
    return false;
  }
}

export async function isPublicIntakeOpenForTenant(tenantId: TenantId): Promise<boolean> {
  return (await authorizeOpenPublicIntake(tenantId)) !== null;
}
